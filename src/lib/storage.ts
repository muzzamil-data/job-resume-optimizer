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
  RESUME: 'masterResume',
  SETTINGS: 'userSettings',
  API_CONFIG: 'apiConfig',
  OPTIMIZED_RESUMES: 'optimizedResumes',
  APPLICATIONS: 'applications',
} as const;

const DEFAULT_SETTINGS: UserSettings = {
  defaultTone: 'professional',
  autoDetectJob: true,
  showATSScore: true,
};

const DEFAULT_API_CONFIG: ApiConfig = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: '',
};

// Storage utilities
export const storage = {
  // Resume
  async getResume(): Promise<Resume | null> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.RESUME);
    return (result[STORAGE_KEYS.RESUME] as Resume) ?? null;
  },

  async saveResume(resume: Resume): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEYS.RESUME]: resume });
  },

  // Provider (bring-your-own-key) configuration
  async getApiConfig(): Promise<ApiConfig> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.API_CONFIG);
    return { ...DEFAULT_API_CONFIG, ...(result[STORAGE_KEYS.API_CONFIG] || {}) };
  },

  async saveApiConfig(config: Partial<ApiConfig>): Promise<void> {
    const current = await this.getApiConfig();
    await chrome.storage.local.set({
      [STORAGE_KEYS.API_CONFIG]: { ...current, ...config },
    });
  },

  // Settings
  async getSettings(): Promise<UserSettings> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
    return result[STORAGE_KEYS.SETTINGS] || DEFAULT_SETTINGS;
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
    return (result[STORAGE_KEYS.OPTIMIZED_RESUMES] as OptimizedResume[]) || [];
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
    return (result[STORAGE_KEYS.APPLICATIONS] as ApplicationRecord[]) || [];
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
