import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

import { storage } from '../../lib/storage';
import { ResumeParser } from '../../lib/resume-parser';
import type { Resume, JobDescription, OptimizedResume, ApplicationRecord } from '../../types';
import {
  applyQuickWin,
  exportDocument,
  generateCoverLetter,
  optimizeForJob,
  type CoverLetterTone,
  type ExportFormat,
  type ExportType,
} from './sidebar-workflows';
import { useJobDetection } from './use-job-detection';

/**
 * Returns true if the extension context has been invalidated
 * (e.g. extension was reloaded/updated while a page is still open).
 */
function isContextInvalidated(): boolean {
  try {
    // chrome.runtime.id is undefined when the context is invalidated
    return !chrome.runtime?.id;
  } catch {
    return true;
  }
}

/** Error message shown when the extension context is no longer valid. */
const CONTEXT_INVALIDATED_MSG =
  'Extension was updated or reloaded. Please refresh this page to continue.';

export type View = 'main' | 'upload' | 'optimize' | 'settings' | 'paste-job' | 'history';

export interface SidebarContextValue {
  // State
  view: View;
  isConfigured: boolean;
  resume: Resume | null;
  jobDescription: JobDescription | null;
  optimizedResume: OptimizedResume | null;
  coverLetter: string;
  applications: ApplicationRecord[];
  isLoading: boolean;
  loadingMessage: string;
  isDetecting: boolean;
  isCoverLetterLoading: boolean;
  error: string;

  // Navigation
  setView: (view: View) => void;

  // State setters exposed to views
  setError: (error: string) => void;
  setJobDescription: (jd: JobDescription | null) => void;

  // Actions
  handleResumeUpload: (file: File) => Promise<void>;
  handleOptimize: () => Promise<void>;
  handleGenerateCoverLetter: (tone: CoverLetterTone) => Promise<void>;
  handleDownload: (format: ExportFormat, type: ExportType) => Promise<void>;
  handleApplyQuickWin: (text: string, expIndex: number) => void;
  handleClearData: () => Promise<void>;
  detectJobDescription: () => Promise<void>;
  handleUpdateApplicationStatus: (id: string, status: ApplicationRecord['status']) => Promise<void>;
  refreshConfig: () => Promise<void>;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error('useSidebar must be used within SidebarProvider');
  return ctx;
}

export const SidebarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [view, setView] = useState<View>('main');
  const [isConfigured, setIsConfigured] = useState(false);
  const [resume, setResume] = useState<Resume | null>(null);
  const [optimizedResume, setOptimizedResume] = useState<OptimizedResume | null>(null);
  const [coverLetter, setCoverLetter] = useState<string>('');
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [isCoverLetterLoading, setIsCoverLetterLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const isOptimizingRef = useRef(false);
  const handleContextInvalidated = useCallback(() => setError(CONTEXT_INVALIDATED_MSG), []);
  const {
    jobDescription,
    setJobDescription,
    isDetecting,
    detectJobDescription,
  } = useJobDetection({ onContextInvalidated: handleContextInvalidated });

  const loadData = useCallback(async () => {
    try {
      if (isContextInvalidated()) { setError(CONTEXT_INVALIDATED_MSG); return; }

      const [apiConfig, resumeData, appsData, optimizedResumesData, settings] = await Promise.all([
        storage.getApiConfig(),
        storage.getResume(),
        storage.getApplications(),
        storage.getOptimizedResumes(),
        storage.getSettings(),
      ]);
      setIsConfigured(!!apiConfig.apiKey && !!apiConfig.model);
      setResume(resumeData);
      setApplications(appsData);
      if (optimizedResumesData.length > 0) {
        setOptimizedResume(optimizedResumesData[optimizedResumesData.length - 1]);
      }
      // Automatic detection runs DOM scrapers only — never an AI call on load.
      // The user can trigger the AI fallback explicitly via "Scan Page".
      if (settings.autoDetectJob) detectJobDescription(false);
    } catch (err: any) {
      if (isContextInvalidated()) { setError(CONTEXT_INVALIDATED_MSG); return; }
      setError('Failed to load data');
      console.error(err);
    }
  }, [detectJobDescription]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const refreshConfig = useCallback(async () => {
    const apiConfig = await storage.getApiConfig();
    setIsConfigured(!!apiConfig.apiKey && !!apiConfig.model);
  }, []);

  const handleResumeUpload = useCallback(async (file: File) => {
    setIsLoading(true);
    setLoadingMessage('Reading your resume...');
    setError('');
    try {
      const parser = new ResumeParser();
      const parsedResume = await parser.parseFile(file);
      await storage.saveResume(parsedResume);
      setResume(parsedResume);
      setView('main');
    } catch (err: any) {
      if (isContextInvalidated()) { setError(CONTEXT_INVALIDATED_MSG); return; }
      setError(err.message || 'Failed to upload resume');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleOptimize = useCallback(async () => {
    if (isOptimizingRef.current) return;
    if (!resume || !jobDescription) {
      setError('Upload a resume and detect a job first.');
      return;
    }
    if (!isConfigured) {
      setError('Add your API key and model in Settings first.');
      setView('settings');
      return;
    }

    isOptimizingRef.current = true;
    setIsLoading(true);
    setLoadingMessage('Optimizing your resume...');
    setError('');

    try {
      const { optimized, application } = await optimizeForJob(resume, jobDescription, applications);

      await storage.saveOptimizedResume(optimized);
      setOptimizedResume(optimized);
      setCoverLetter('');

      await storage.saveApplication(application);
      setApplications(prev =>
        prev.some(item => item.id === application.id)
          ? prev.map(item => item.id === application.id ? application : item)
          : [...prev, application]
      );

      setView('optimize');
    } catch (err: any) {
      if (isContextInvalidated()) { setError(CONTEXT_INVALIDATED_MSG); return; }
      setError(err.message || 'Optimization failed');
    } finally {
      isOptimizingRef.current = false;
      setIsLoading(false);
    }
  }, [resume, jobDescription, isConfigured, applications]);

  const handleGenerateCoverLetter = useCallback(async (
    tone: CoverLetterTone
  ) => {
    if (!resume || !jobDescription) return;
    if (!isConfigured) {
      setError('Add your API key and model in Settings first.');
      setView('settings');
      return;
    }
    setIsCoverLetterLoading(true);
    setError('');
    try {
      const letter = await generateCoverLetter(
        optimizedResume?.optimizedContent ?? resume.parsedData,
        jobDescription,
        tone
      );
      setCoverLetter(letter);
    } catch (err: any) {
      if (isContextInvalidated()) { setError(CONTEXT_INVALIDATED_MSG); return; }
      setError(err.message || 'Cover letter generation failed');
    } finally {
      setIsCoverLetterLoading(false);
    }
  }, [resume, jobDescription, isConfigured, optimizedResume]);

  const handleDownload = useCallback(async (
    format: ExportFormat,
    type: ExportType
  ) => {
    if (!optimizedResume || !jobDescription) return;
    try {
      await exportDocument(format, type, optimizedResume, jobDescription, coverLetter);
    } catch (err) {
      if (isContextInvalidated()) { setError(CONTEXT_INVALIDATED_MSG); return; }
      setError('Download failed');
      console.error(err);
    }
  }, [optimizedResume, jobDescription, coverLetter]);

  const handleApplyQuickWin = useCallback((text: string, expIndex: number) => {
    if (!optimizedResume || !jobDescription) return;
    const updated = applyQuickWin(optimizedResume, jobDescription, text, expIndex);
    if (!updated) return;
    setOptimizedResume(updated);
    storage.saveOptimizedResume(updated).catch(err => console.error('Failed to persist quick win:', err));
  }, [optimizedResume, jobDescription]);

  const handleClearData = useCallback(async () => {
    await storage.clearAll();
    setResume(null);
    setJobDescription(null);
    setOptimizedResume(null);
    setCoverLetter('');
    setApplications([]);
    setView('main');
  }, []);

  const handleUpdateApplicationStatus = useCallback(async (
    id: string,
    status: ApplicationRecord['status']
  ) => {
    const updated = applications.map(a => a.id === id ? { ...a, status } : a);
    setApplications(updated);
    const changed = updated.find(a => a.id === id);
    if (changed) await storage.saveApplication(changed);
  }, [applications]);

  const value: SidebarContextValue = {
    view, isConfigured, resume, jobDescription, optimizedResume,
    coverLetter, applications, isLoading, loadingMessage, isDetecting, isCoverLetterLoading, error,
    setView, setError, setJobDescription,
    handleResumeUpload, handleOptimize, handleGenerateCoverLetter,
    handleDownload, handleApplyQuickWin, handleClearData,
    detectJobDescription, handleUpdateApplicationStatus, refreshConfig,
  };

  return (
    <SidebarContext.Provider value={value}>
      {children}
    </SidebarContext.Provider>
  );
};
