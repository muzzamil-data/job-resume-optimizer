import type {
  Resume,
  CreditBalance,
  UserSettings,
  OptimizedResume,
  CoverLetter,
  ApplicationRecord,
} from '../types';
import { encryptText, decryptText } from './crypto';
import { fetchCredits } from './supabase-client';

/**
 * Shape written to chrome.storage.local for a resume.
 * The sensitive fields (content, parsedData) are AES-GCM encrypted and
 * stored as a single base64 "iv:ciphertext" string.
 */
interface StoredResume {
  id: string;
  fileName: string;
  fileType: 'pdf' | 'docx';
  uploadedAt: Date;
  encryptedData: string;   // encrypted JSON of { content, parsedData }
}

/**
 * Shape written to chrome.storage.local for an optimized resume.
 * optimizedContent contains the candidate's full PII-rich resume, so it is
 * AES-GCM encrypted the same way as the original resume.
 */
interface StoredOptimizedResume extends Omit<OptimizedResume, 'optimizedContent'> {
  encryptedContent: string;  // encrypted JSON of optimizedContent
}

/**
 * Shape written to chrome.storage.local for a cover letter.
 * content contains PII (candidate name, job details), so it is AES-GCM encrypted.
 */
interface StoredCoverLetter extends Omit<CoverLetter, 'content'> {
  encryptedContent: string;  // encrypted cover letter text
}

/**
 * Shape written to chrome.storage.local for an application record.
 * jobTitle, company, url, and notes are AES-GCM encrypted.
 * id and status are kept plaintext for O(1) lookup and status updates.
 */
interface StoredApplicationRecord extends Omit<ApplicationRecord, 'jobTitle' | 'company' | 'url' | 'notes'> {
  encryptedData: string;  // encrypted JSON of { jobTitle, company, url, notes }
}

const STORAGE_KEYS = {
  RESUME: 'masterResume',
  CREDITS: 'creditBalance',
  SETTINGS: 'userSettings',
  OPTIMIZED_RESUMES: 'optimizedResumes',
  COVER_LETTERS: 'coverLetters',
  APPLICATIONS: 'applications',
} as const;

// Initialize default values
const DEFAULT_CREDITS: CreditBalance = {
  total: 0,
  used: 0,
  remaining: 0,
  transactions: [],
};

const DEFAULT_SETTINGS: UserSettings = {
  defaultTone: 'professional',
  autoDetectJob: true,
  showATSScore: true,
};

// Storage utilities
export const storage = {
  // Resume
  async getResume(): Promise<Resume | null> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.RESUME);
    const stored: StoredResume | null = result[STORAGE_KEYS.RESUME] || null;
    if (!stored) return null;

    // Legacy: unencrypted data saved before this version — migrate on read
    if (!stored.encryptedData) {
      const legacy = stored as unknown as Resume;
      await this.saveResume(legacy);
      return legacy;
    }

    try {
      const decrypted = await decryptText(stored.encryptedData);
      const { content, parsedData } = JSON.parse(decrypted);
      return { id: stored.id, fileName: stored.fileName, fileType: stored.fileType, uploadedAt: stored.uploadedAt, content, parsedData };
    } catch {
      // Session key changed (browser restarted) — stale ciphertext is unreadable; clear it
      await chrome.storage.local.remove(STORAGE_KEYS.RESUME);
      return null;
    }
  },

  async saveResume(resume: Resume): Promise<void> {
    // Encrypt the sensitive fields — content (raw file) and parsedData (PII)
    const encryptedData = await encryptText(
      JSON.stringify({ content: resume.content, parsedData: resume.parsedData })
    );
    const stored: StoredResume = {
      id: resume.id,
      fileName: resume.fileName,
      fileType: resume.fileType,
      uploadedAt: resume.uploadedAt,
      encryptedData,
    };
    await chrome.storage.local.set({ [STORAGE_KEYS.RESUME]: stored });
  },

  // Credits
  // If the user is logged in, fetch live balance from Supabase.
  // Falls back to local storage for offline / unauthenticated scenarios.
  async getCredits(userId?: string): Promise<CreditBalance> {
    if (userId) {
      const remote = await fetchCredits(userId);
      if (remote) {
        const balance: CreditBalance = {
          total: remote.total,
          used: remote.used,
          remaining: remote.remaining,
          transactions: [],
        };
        // Cache back to chrome.storage so the popup can read a fresh value
        // without needing to import the full Supabase client.
        await chrome.storage.local.set({ [STORAGE_KEYS.CREDITS]: balance });
        return balance;
      }
    }
    const result = await chrome.storage.local.get(STORAGE_KEYS.CREDITS);
    return result[STORAGE_KEYS.CREDITS] || DEFAULT_CREDITS;
  },

  // useCredit() and addCredits() removed — credit operations happen atomically
  // server-side via Supabase Edge Functions (use_credit RPC / Stripe webhook).

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

  // Optimized Resumes
  async getOptimizedResumes(): Promise<OptimizedResume[]> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.OPTIMIZED_RESUMES);
    const stored: StoredOptimizedResume[] = result[STORAGE_KEYS.OPTIMIZED_RESUMES] || [];
    const decrypted: OptimizedResume[] = [];
    let needsMigration = false;
    for (const item of stored) {
      // Legacy: unencrypted records saved before this version
      if (!item.encryptedContent) {
        needsMigration = true;
        decrypted.push(item as unknown as OptimizedResume);
        continue;
      }
      try {
        const json = await decryptText(item.encryptedContent);
        const optimizedContent = JSON.parse(json);
        const { encryptedContent: _, ...rest } = item;
        decrypted.push({ ...rest, optimizedContent });
      } catch {
        // Session key changed — skip this stale entry; it will be dropped when re-saved
      }
    }
    if (needsMigration) {
      const reEncrypted = await Promise.all(stored.map(async item => {
        if (item.encryptedContent) return item as StoredOptimizedResume;
        const r = item as unknown as OptimizedResume;
        const encryptedContent = await encryptText(JSON.stringify(r.optimizedContent));
        const { optimizedContent: _, ...rest } = r;
        return { ...rest, encryptedContent };
      }));
      await chrome.storage.local.set({ [STORAGE_KEYS.OPTIMIZED_RESUMES]: reEncrypted });
    }
    return decrypted;
  },

  async saveOptimizedResume(resume: OptimizedResume): Promise<void> {
    const existing = await chrome.storage.local.get(STORAGE_KEYS.OPTIMIZED_RESUMES);
    const stored: StoredOptimizedResume[] = existing[STORAGE_KEYS.OPTIMIZED_RESUMES] || [];
    const encryptedContent = await encryptText(JSON.stringify(resume.optimizedContent));
    const { optimizedContent: _, ...rest } = resume;
    const toStore: StoredOptimizedResume = { ...rest, encryptedContent };
    const existsIdx = stored.findIndex(s => s.id === resume.id);
    const capped = (existsIdx >= 0
      ? stored.map(s => s.id === resume.id ? toStore : s)
      : [...stored, toStore]
    ).slice(-10);
    await chrome.storage.local.set({
      [STORAGE_KEYS.OPTIMIZED_RESUMES]: capped,
    });
  },

  // Cover Letters
  async getCoverLetters(): Promise<CoverLetter[]> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.COVER_LETTERS);
    const stored: (StoredCoverLetter | CoverLetter)[] = result[STORAGE_KEYS.COVER_LETTERS] || [];
    const decrypted: CoverLetter[] = [];
    let needsMigration = false;
    for (const item of stored) {
      // Legacy: unencrypted records saved before this version
      if (!('encryptedContent' in item)) {
        needsMigration = true;
        decrypted.push(item as CoverLetter);
        continue;
      }
      try {
        const content = await decryptText((item as StoredCoverLetter).encryptedContent);
        const { encryptedContent: _, ...rest } = item as StoredCoverLetter;
        decrypted.push({ ...rest, content });
      } catch {
        // Session key changed — skip stale entry
      }
    }
    if (needsMigration) {
      const reEncrypted = await Promise.all(stored.map(async item => {
        if ('encryptedContent' in item) return item as StoredCoverLetter;
        const r = item as CoverLetter;
        const encryptedContent = await encryptText(r.content);
        const { content: _, ...rest } = r;
        return { ...rest, encryptedContent };
      }));
      await chrome.storage.local.set({ [STORAGE_KEYS.COVER_LETTERS]: reEncrypted });
    }
    return decrypted;
  },

  async saveCoverLetter(letter: CoverLetter): Promise<void> {
    // Trigger lazy migration so the stored array is all-encrypted before we cap it.
    await this.getCoverLetters();
    const existing = await chrome.storage.local.get(STORAGE_KEYS.COVER_LETTERS);
    const stored: StoredCoverLetter[] = existing[STORAGE_KEYS.COVER_LETTERS] || [];
    const encryptedContent = await encryptText(letter.content);
    const { content: _, ...rest } = letter;
    const toStore: StoredCoverLetter = { ...rest, encryptedContent };
    const capped = [...stored, toStore].slice(-50); // keep latest 50 only
    await chrome.storage.local.set({
      [STORAGE_KEYS.COVER_LETTERS]: capped,
    });
  },

  // Applications
  async getApplications(): Promise<ApplicationRecord[]> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.APPLICATIONS);
    const stored: (StoredApplicationRecord | ApplicationRecord)[] = result[STORAGE_KEYS.APPLICATIONS] || [];
    const decrypted: ApplicationRecord[] = [];
    let needsMigration = false;
    for (const item of stored) {
      // Legacy: unencrypted records saved before this version
      if (!('encryptedData' in item)) {
        needsMigration = true;
        decrypted.push(item as ApplicationRecord);
        continue;
      }
      try {
        const json = await decryptText((item as StoredApplicationRecord).encryptedData);
        const { jobTitle, company, url, notes } = JSON.parse(json);
        const { encryptedData: _, ...rest } = item as StoredApplicationRecord;
        decrypted.push({ ...rest, jobTitle, company, url, notes });
      } catch {
        // Skip corrupt record; don't abort the entire list
      }
    }
    if (needsMigration) {
      const reEncrypted = await Promise.all(stored.map(async item => {
        if ('encryptedData' in item) return item as StoredApplicationRecord;
        const r = item as ApplicationRecord;
        const encryptedData = await encryptText(JSON.stringify({
          jobTitle: r.jobTitle, company: r.company, url: r.url, notes: r.notes,
        }));
        const { jobTitle: _j, company: _c, url: _u, notes: _n, ...rest } = r;
        return { ...rest, encryptedData };
      }));
      await chrome.storage.local.set({ [STORAGE_KEYS.APPLICATIONS]: reEncrypted });
    }
    return decrypted;
  },

  async saveApplication(application: ApplicationRecord): Promise<void> {
    // Trigger lazy migration so the stored array is all-encrypted before we cap it.
    await this.getApplications();
    const existing = await chrome.storage.local.get(STORAGE_KEYS.APPLICATIONS);
    const stored: StoredApplicationRecord[] = existing[STORAGE_KEYS.APPLICATIONS] || [];
    const encryptedData = await encryptText(JSON.stringify({
      jobTitle: application.jobTitle,
      company: application.company,
      url: application.url,
      notes: application.notes,
    }));
    const { jobTitle: _j, company: _c, url: _u, notes: _n, ...rest } = application;
    const toStore: StoredApplicationRecord = { ...rest, encryptedData };
    const existsIdx = stored.findIndex(s => s.id === application.id);
    const updated = existsIdx >= 0
      ? stored.map(s => s.id === application.id ? toStore : s).slice(-50)
      : [...stored, toStore].slice(-50); // keep latest 50 only
    await chrome.storage.local.set({ [STORAGE_KEYS.APPLICATIONS]: updated });
  },

  // Clear all app data. Preserves sb_access_token so the user stays logged in.
  async clearAll(): Promise<void> {
    await chrome.storage.local.remove(Object.values(STORAGE_KEYS));
  },
};
