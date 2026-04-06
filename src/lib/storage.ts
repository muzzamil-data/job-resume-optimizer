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
  total: 100,
  used: 0,
  remaining: 100,
  transactions: [
    {
      id: crypto.randomUUID(),
      type: 'bonus',
      amount: 100,
      description: '100 test credits',
      timestamp: new Date(),
    },
  ],
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

    // Legacy: unencrypted data saved before this version
    if (!stored.encryptedData) return stored as unknown as Resume;

    const decrypted = await decryptText(stored.encryptedData);
    const { content, parsedData } = JSON.parse(decrypted);
    return { id: stored.id, fileName: stored.fileName, fileType: stored.fileType, uploadedAt: stored.uploadedAt, content, parsedData };
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

  async deleteResume(): Promise<void> {
    await chrome.storage.local.remove(STORAGE_KEYS.RESUME);
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
    return result[STORAGE_KEYS.OPTIMIZED_RESUMES] || [];
  },

  async saveOptimizedResume(resume: OptimizedResume): Promise<void> {
    const resumes = await this.getOptimizedResumes();
    const capped = [...resumes, resume].slice(-10); // keep latest 10 only
    await chrome.storage.local.set({
      [STORAGE_KEYS.OPTIMIZED_RESUMES]: capped,
    });
  },

  // Cover Letters
  async getCoverLetters(): Promise<CoverLetter[]> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.COVER_LETTERS);
    return result[STORAGE_KEYS.COVER_LETTERS] || [];
  },

  async saveCoverLetter(letter: CoverLetter): Promise<void> {
    const letters = await this.getCoverLetters();
    const capped = [...letters, letter].slice(-50); // keep latest 50 only
    await chrome.storage.local.set({
      [STORAGE_KEYS.COVER_LETTERS]: capped,
    });
  },

  // Applications
  async getApplications(): Promise<ApplicationRecord[]> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.APPLICATIONS);
    return result[STORAGE_KEYS.APPLICATIONS] || [];
  },

  async saveApplication(application: ApplicationRecord): Promise<void> {
    const applications = await this.getApplications();
    const exists = applications.findIndex(a => a.id === application.id);
    const updated = exists >= 0
      ? applications.map(a => a.id === application.id ? application : a)
      : [...applications, application].slice(-50); // keep latest 50 only
    await chrome.storage.local.set({
      [STORAGE_KEYS.APPLICATIONS]: updated,
    });
  },

  // Clear all data
  async clearAll(): Promise<void> {
    await chrome.storage.local.clear();
  },
};
