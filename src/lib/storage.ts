import type {
  Resume,
  ApiConfig,
  UserSettings,
  OptimizedResume,
  ApplicationRecord,
} from '../types';

// Everything is stored in plain chrome.storage.local on the user's machine.
// There is no backend and no account — this is a fully local, bring-your-own-key
// tool. The API key lives here too and is sent only to the provider endpoint the
// user configures (see service-worker.ts).

const STORAGE_KEYS = {
  SCHEMA_VERSION: 'storageSchemaVersion',
  RESUME: 'masterResume',
  SETTINGS: 'userSettings',
  API_CONFIG: 'apiConfig',
  SESSION_API_KEY: 'sessionApiKey',
  OPTIMIZED_RESUMES: 'optimizedResumes',
  APPLICATIONS: 'applications',
} as const;

export const CURRENT_STORAGE_SCHEMA_VERSION = 2;

function normalizeStoredDate(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number' && !(value instanceof Date)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

async function migrateDatesToIsoStrings(): Promise<void> {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.RESUME,
    STORAGE_KEYS.OPTIMIZED_RESUMES,
    STORAGE_KEYS.APPLICATIONS,
  ]);
  const updates: Record<string, unknown> = {};

  const resume = result[STORAGE_KEYS.RESUME];
  if (resume && typeof resume === 'object') {
    updates[STORAGE_KEYS.RESUME] = {
      ...resume,
      uploadedAt: normalizeStoredDate((resume as { uploadedAt?: unknown }).uploadedAt),
    };
  }

  const optimized = result[STORAGE_KEYS.OPTIMIZED_RESUMES];
  if (Array.isArray(optimized)) {
    updates[STORAGE_KEYS.OPTIMIZED_RESUMES] = optimized.map(item => (
      item && typeof item === 'object'
        ? { ...item, createdAt: normalizeStoredDate((item as { createdAt?: unknown }).createdAt) }
        : item
    ));
  }

  const applications = result[STORAGE_KEYS.APPLICATIONS];
  if (Array.isArray(applications)) {
    updates[STORAGE_KEYS.APPLICATIONS] = applications.map(item => (
      item && typeof item === 'object'
        ? { ...item, appliedAt: normalizeStoredDate((item as { appliedAt?: unknown }).appliedAt) }
        : item
    ));
  }

  if (Object.keys(updates).length > 0) await chrome.storage.local.set(updates);
}

async function migrateToVersion(version: number): Promise<void> {
  switch (version) {
    case 1:
      // Version 1 establishes the migration marker. Existing keys already use
      // the initial public schema, so no data transformation is required.
      return;
    case 2:
      await migrateDatesToIsoStrings();
      return;
    default:
      throw new Error(`Unsupported storage schema migration: ${version}`);
  }
}

const DEFAULT_SETTINGS: UserSettings = {
  defaultTone: 'professional',
  autoDetectJob: true,
  showATSScore: true,
  onboardingCompleted: false,
  rememberApiKey: true,
};

const DEFAULT_API_CONFIG: ApiConfig = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: '',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isParsedResume(value: unknown): value is Resume['parsedData'] {
  return isRecord(value) && typeof value.raw === 'string' &&
    Array.isArray(value.experience) && Array.isArray(value.education) && Array.isArray(value.skills);
}

function validateResume(value: unknown): Resume | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.fileName !== 'string' ||
      !['pdf', 'docx'].includes(String(value.fileType)) || typeof value.content !== 'string' ||
      !isParsedResume(value.parsedData)) return null;
  return { ...value, uploadedAt: normalizeStoredDate(value.uploadedAt) } as unknown as Resume;
}

function validateOptimizedResume(value: unknown): OptimizedResume | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.originalResumeId !== 'string' ||
      typeof value.jobDescriptionUrl !== 'string' || !isParsedResume(value.optimizedContent) ||
      typeof value.atsScore !== 'number' || !Number.isFinite(value.atsScore) || !Array.isArray(value.keywordMatches)) return null;
  return { ...value, createdAt: normalizeStoredDate(value.createdAt) } as unknown as OptimizedResume;
}

const APPLICATION_STATUSES = new Set(['applied', 'interviewing', 'rejected', 'accepted']);

function validateApplication(value: unknown): ApplicationRecord | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.jobTitle !== 'string' ||
      typeof value.company !== 'string' || typeof value.url !== 'string' || typeof value.resumeId !== 'string' ||
      typeof value.status !== 'string' || !APPLICATION_STATUSES.has(value.status)) return null;
  return { ...value, appliedAt: normalizeStoredDate(value.appliedAt) } as unknown as ApplicationRecord;
}

function validateSettings(value: unknown): UserSettings {
  const record = isRecord(value) ? value : {};
  return {
    defaultTone: ['professional', 'enthusiastic', 'technical', 'creative'].includes(String(record.defaultTone))
      ? record.defaultTone as UserSettings['defaultTone']
      : DEFAULT_SETTINGS.defaultTone,
    autoDetectJob: typeof record.autoDetectJob === 'boolean' ? record.autoDetectJob : DEFAULT_SETTINGS.autoDetectJob,
    showATSScore: typeof record.showATSScore === 'boolean' ? record.showATSScore : DEFAULT_SETTINGS.showATSScore,
    onboardingCompleted: typeof record.onboardingCompleted === 'boolean' ? record.onboardingCompleted : false,
    rememberApiKey: typeof record.rememberApiKey === 'boolean' ? record.rememberApiKey : true,
  };
}

export interface LocalBackup {
  format: 'tailorcv-backup';
  version: 1;
  exportedAt: string;
  data: {
    resume: Resume | null;
    optimizedResumes: OptimizedResume[];
    applications: ApplicationRecord[];
    settings: UserSettings;
    provider: Pick<ApiConfig, 'baseUrl' | 'model'>;
  };
}

// Storage utilities
export const storage = {
  /** Run pending migrations in order without deleting existing user data. */
  async initialize(): Promise<void> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.SCHEMA_VERSION);
    const storedVersion = Number(result[STORAGE_KEYS.SCHEMA_VERSION] ?? 0);

    // A newer extension build may have written this data. Never downgrade it.
    if (Number.isFinite(storedVersion) && storedVersion > CURRENT_STORAGE_SCHEMA_VERSION) return;

    const startingVersion = Number.isInteger(storedVersion) && storedVersion >= 0
      ? storedVersion
      : 0;
    for (let version = startingVersion + 1; version <= CURRENT_STORAGE_SCHEMA_VERSION; version++) {
      await migrateToVersion(version);
      await chrome.storage.local.set({ [STORAGE_KEYS.SCHEMA_VERSION]: version });
    }
  },

  // Resume
  async getResume(): Promise<Resume | null> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.RESUME);
    return validateResume(result[STORAGE_KEYS.RESUME]);
  },

  async saveResume(resume: Resume): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEYS.RESUME]: resume });
  },

  // Provider (bring-your-own-key) configuration
  async getApiConfig(): Promise<ApiConfig> {
    const [localResult, sessionResult] = await Promise.all([
      chrome.storage.local.get(STORAGE_KEYS.API_CONFIG),
      chrome.storage.session.get(STORAGE_KEYS.SESSION_API_KEY),
    ]);
    const localConfig = isRecord(localResult[STORAGE_KEYS.API_CONFIG]) ? localResult[STORAGE_KEYS.API_CONFIG] : {};
    const sessionKey = sessionResult[STORAGE_KEYS.SESSION_API_KEY];
    return {
      ...DEFAULT_API_CONFIG,
      baseUrl: typeof localConfig.baseUrl === 'string' ? localConfig.baseUrl : DEFAULT_API_CONFIG.baseUrl,
      model: typeof localConfig.model === 'string' ? localConfig.model : '',
      apiKey: typeof sessionKey === 'string' && sessionKey
        ? sessionKey
        : typeof localConfig.apiKey === 'string' ? localConfig.apiKey : '',
    };
  },

  async saveApiConfig(config: Partial<ApiConfig>, options: { rememberApiKey?: boolean } = {}): Promise<void> {
    const current = await this.getApiConfig();
    const rememberApiKey = options.rememberApiKey ?? true;
    const next = { ...current, ...config };
    await chrome.storage.local.set({
      [STORAGE_KEYS.API_CONFIG]: { ...next, apiKey: rememberApiKey ? next.apiKey : '' },
    });
    if (rememberApiKey || !next.apiKey) {
      await chrome.storage.session.remove(STORAGE_KEYS.SESSION_API_KEY);
    } else {
      await chrome.storage.session.set({ [STORAGE_KEYS.SESSION_API_KEY]: next.apiKey });
    }
  },

  // Settings
  async getSettings(): Promise<UserSettings> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
    return validateSettings(result[STORAGE_KEYS.SETTINGS]);
  },

  async updateSettings(settings: Partial<UserSettings>): Promise<void> {
    const current = await this.getSettings();
    await chrome.storage.local.set({
      [STORAGE_KEYS.SETTINGS]: { ...current, ...settings },
    });
  },

  // Optimized Resumes (keep the most recent 10)
  async getOptimizedResumes(): Promise<OptimizedResume[]> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.OPTIMIZED_RESUMES);
    const stored = result[STORAGE_KEYS.OPTIMIZED_RESUMES];
    return Array.isArray(stored)
      ? stored.map(validateOptimizedResume).filter((item): item is OptimizedResume => item !== null)
      : [];
  },

  async saveOptimizedResume(resume: OptimizedResume): Promise<void> {
    const stored = await this.getOptimizedResumes();
    const existsIdx = stored.findIndex(s => s.id === resume.id);
    const capped = (existsIdx >= 0
      ? stored.map(s => (s.id === resume.id ? resume : s))
      : [...stored, resume]
    ).slice(-10);
    await chrome.storage.local.set({ [STORAGE_KEYS.OPTIMIZED_RESUMES]: capped });
  },

  // Applications (keep the most recent 50)
  async getApplications(): Promise<ApplicationRecord[]> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.APPLICATIONS);
    const stored = result[STORAGE_KEYS.APPLICATIONS];
    return Array.isArray(stored)
      ? stored.map(validateApplication).filter((item): item is ApplicationRecord => item !== null)
      : [];
  },

  async saveApplication(application: ApplicationRecord): Promise<void> {
    const stored = await this.getApplications();
    const existsIdx = stored.findIndex(s => s.id === application.id);
    const updated = (existsIdx >= 0
      ? stored.map(s => (s.id === application.id ? application : s))
      : [...stored, application]
    ).slice(-50);
    await chrome.storage.local.set({ [STORAGE_KEYS.APPLICATIONS]: updated });
  },

  /** Create a portable local backup. API keys are intentionally excluded. */
  async createBackup(): Promise<LocalBackup> {
    const [resume, optimizedResumes, applications, settings, apiConfig] = await Promise.all([
      this.getResume(), this.getOptimizedResumes(), this.getApplications(), this.getSettings(), this.getApiConfig(),
    ]);
    return {
      format: 'tailorcv-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      data: {
        resume,
        optimizedResumes,
        applications,
        settings,
        provider: { baseUrl: apiConfig.baseUrl, model: apiConfig.model },
      },
    };
  },

  /** Validate a backup completely before replacing local personal data. */
  async restoreBackup(value: unknown): Promise<void> {
    if (!isRecord(value) || value.format !== 'tailorcv-backup' || value.version !== 1 || !isRecord(value.data)) {
      throw new Error('This is not a supported TailorCV backup file.');
    }
    const data = value.data;
    const resume = data.resume === null ? null : validateResume(data.resume);
    if (data.resume !== null && !resume) throw new Error('The backup contains an invalid resume.');
    if (!Array.isArray(data.optimizedResumes) || !Array.isArray(data.applications)) {
      throw new Error('The backup contains invalid history data.');
    }
    const optimizedResumes = data.optimizedResumes.map(validateOptimizedResume);
    const applications = data.applications.map(validateApplication);
    if (optimizedResumes.some(item => item === null) || applications.some(item => item === null)) {
      throw new Error('The backup contains malformed records.');
    }
    if (!isRecord(data.provider) || typeof data.provider.baseUrl !== 'string' || typeof data.provider.model !== 'string') {
      throw new Error('The backup contains invalid provider settings.');
    }

    const currentConfigResult = await chrome.storage.local.get(STORAGE_KEYS.API_CONFIG);
    const currentLocalConfig = isRecord(currentConfigResult[STORAGE_KEYS.API_CONFIG])
      ? currentConfigResult[STORAGE_KEYS.API_CONFIG]
      : {};
    const updates: Record<string, unknown> = {
      [STORAGE_KEYS.OPTIMIZED_RESUMES]: optimizedResumes,
      [STORAGE_KEYS.APPLICATIONS]: applications,
      [STORAGE_KEYS.SETTINGS]: validateSettings(data.settings),
      [STORAGE_KEYS.API_CONFIG]: {
        baseUrl: data.provider.baseUrl,
        model: data.provider.model,
        apiKey: typeof currentLocalConfig.apiKey === 'string' ? currentLocalConfig.apiKey : '',
      },
    };
    if (resume) updates[STORAGE_KEYS.RESUME] = resume;
    await chrome.storage.local.set(updates);
    if (!resume) await chrome.storage.local.remove(STORAGE_KEYS.RESUME);
  },

  // Clear all resume/history data. Preserves the API configuration so the user
  // does not have to re-enter their key after a data reset.
  async clearAll(): Promise<void> {
    await chrome.storage.local.remove([
      STORAGE_KEYS.RESUME,
      STORAGE_KEYS.OPTIMIZED_RESUMES,
      STORAGE_KEYS.APPLICATIONS,
      STORAGE_KEYS.SETTINGS,
    ]);
  },
};
