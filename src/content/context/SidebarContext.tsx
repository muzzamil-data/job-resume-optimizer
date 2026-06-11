import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

const URL_SCAN_DEBOUNCE_MS = 15_000;

import { storage } from '../../lib/storage';
import { AIService, calculateATSScoreWithBreakdown } from '../../lib/ai-service';
import { JobScraper } from '../../lib/job-scraper';
import { ResumeParser } from '../../lib/resume-parser';
import { DocumentGenerator } from '../../lib/document-generator';
import { signOut, getSession, type User } from '../../lib/supabase-client';
import type { Resume, JobDescription, OptimizedResume, CreditBalance, ApplicationRecord } from '../../types';
import { generateFilename } from '../../lib/utils';

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

export type View = 'main' | 'upload' | 'optimize' | 'credits' | 'settings' | 'paste-job' | 'auth' | 'history';

export interface SidebarContextValue {
  // State
  view: View;
  user: User | null;
  credits: CreditBalance | null;
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
  handleGenerateCoverLetter: (tone: 'professional' | 'enthusiastic' | 'technical' | 'creative') => Promise<void>;
  handleDownload: (format: 'pdf' | 'docx', type: 'resume' | 'cover-letter') => Promise<void>;
  handleApplyQuickWin: (text: string, expIndex: number) => void;
  handleClearData: () => Promise<void>;
  handleSignOut: () => Promise<void>;
  detectJobDescription: () => Promise<void>;
  handleAuth: (user: User) => Promise<void>;
  handleUpdateApplicationStatus: (id: string, status: ApplicationRecord['status']) => Promise<void>;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error('useSidebar must be used within SidebarProvider');
  return ctx;
}

export const SidebarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [view, setView] = useState<View>('main');
  const [user, setUser] = useState<User | null>(null);
  const [credits, setCredits] = useState<CreditBalance | null>(null);
  const [resume, setResume] = useState<Resume | null>(null);
  const [jobDescription, setJobDescription] = useState<JobDescription | null>(null);
  const [optimizedResume, setOptimizedResume] = useState<OptimizedResume | null>(null);
  const [coverLetter, setCoverLetter] = useState<string>('');
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [isDetecting, setIsDetecting] = useState(false);
  const [isCoverLetterLoading, setIsCoverLetterLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const lastScanRef = useRef<number>(0);
  const isOptimizingRef = useRef(false);

  useEffect(() => {
    loadData();
  }, []);

  // Auto-rescan when URL changes (handles LinkedIn / Indeed SPA navigation)
  useEffect(() => {
    let lastUrl = window.location.href;

    const checkUrl = () => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        setJobDescription(null);
      }
    };

    const titleEl = document.querySelector('title');
    const titleObserver = new MutationObserver(checkUrl);
    if (titleEl) {
      titleObserver.observe(titleEl, { subtree: true, childList: true, characterData: true });
    }

    window.addEventListener('popstate', checkUrl);

    return () => {
      titleObserver.disconnect();
      window.removeEventListener('popstate', checkUrl);
    };
  }, []);

  const loadData = async () => {
    try {
      if (isContextInvalidated()) { setError(CONTEXT_INVALIDATED_MSG); return; }

      const session = await getSession();
      const currentUser = session?.user ?? null;
      setUser(currentUser);

      if (!currentUser) {
        setView('auth');
        return;
      }

      const [creditsData, resumeData, appsData, optimizedResumesData] = await Promise.all([
        storage.getCredits(currentUser.id),
        storage.getResume(),
        storage.getApplications(),
        storage.getOptimizedResumes(),
      ]);
      setCredits(creditsData);
      setResume(resumeData);
      setApplications(appsData);
      if (optimizedResumesData.length > 0) {
        setOptimizedResume(optimizedResumesData[optimizedResumesData.length - 1]);
      }
    } catch (err: any) {
      if (isContextInvalidated()) { setError(CONTEXT_INVALIDATED_MSG); return; }
      setError('Failed to load data');
      console.error(err);
    }
  };

  const refreshCredits = async () => {
    if (!user) return;
    const updated = await storage.getCredits(user.id);
    setCredits(updated);
  };

  const detectJobDescription = useCallback(async () => {
    const now = Date.now();
    if (now - lastScanRef.current < URL_SCAN_DEBOUNCE_MS) return;
    lastScanRef.current = now;
    setIsDetecting(true);
    try {
      const scraper = new JobScraper();
      const job = await scraper.scrapeCurrentPage();
      if (job) {
        setJobDescription(job as JobDescription);
      }
    } catch (err) {
      if (isContextInvalidated()) { setError(CONTEXT_INVALIDATED_MSG); return; }
      console.error('Failed to detect job:', err);
    } finally {
      setIsDetecting(false);
    }
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
    if (!resume || !jobDescription || !credits || credits.remaining <= 0) {
      setError('Missing requirements or no credits');
      return;
    }

    if (!user) {
      setView('auth');
      return;
    }

    isOptimizingRef.current = true;
    setIsLoading(true);
    setLoadingMessage('Optimizing your resume...');
    setError('');

    try {
      const aiService = new AIService();
      const result = await aiService.optimizeResume(resume.parsedData, jobDescription);

      const optimized: OptimizedResume = {
        id: crypto.randomUUID(),
        originalResumeId: resume.id,
        jobDescriptionUrl: jobDescription.url,
        optimizedContent: result.optimized,
        atsScore: result.atsScore,
        keywordMatches: result.keywords,
        scoring: result.scoring,
        gaps: result.gaps,
        recommendations: result.recommendations,
        createdAt: new Date(),
      };

      await storage.saveOptimizedResume(optimized);
      setOptimizedResume(optimized);
      setCoverLetter('');

      const existingApp = applications.find(a => a.url === jobDescription.url);
      const appRecord: ApplicationRecord = existingApp
        ? { ...existingApp, resumeId: optimized.id, appliedAt: new Date() }
        : {
            id: crypto.randomUUID(),
            jobTitle: jobDescription.title,
            company: jobDescription.company,
            url: jobDescription.url,
            appliedAt: new Date(),
            resumeId: optimized.id,
            status: 'applied',
          };
      await storage.saveApplication(appRecord);
      setApplications(prev =>
        existingApp
          ? prev.map(a => a.id === existingApp.id ? appRecord : a)
          : [...prev, appRecord]
      );

      await refreshCredits();
      setView('optimize');
    } catch (err: any) {
      if (isContextInvalidated()) { setError(CONTEXT_INVALIDATED_MSG); return; }
      setError(err.message || 'Optimization failed');
    } finally {
      isOptimizingRef.current = false;
      setIsLoading(false);
    }
  }, [resume, jobDescription, credits, user, applications]);

  const handleGenerateCoverLetter = useCallback(async (
    tone: 'professional' | 'enthusiastic' | 'technical' | 'creative'
  ) => {
    if (!resume || !jobDescription || !user) return;
    setIsCoverLetterLoading(true);
    setError('');
    try {
      const aiService = new AIService();
      const letter = await aiService.generateCoverLetter(
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
  }, [resume, jobDescription, user, optimizedResume]);

  const handleDownload = useCallback(async (
    format: 'pdf' | 'docx',
    type: 'resume' | 'cover-letter'
  ) => {
    if (!optimizedResume || !jobDescription) return;
    try {
      const generator = new DocumentGenerator();
      const filename = generateFilename(type, jobDescription.title, jobDescription.company);
      if (type === 'resume') {
        const blob = format === 'pdf'
          ? await generator.generatePDF(optimizedResume.optimizedContent, jobDescription.title)
          : await generator.generateDOCX(optimizedResume.optimizedContent, jobDescription.title);
        generator.downloadBlob(blob, `${filename}.${format}`);
      } else {
        const blob = format === 'pdf'
          ? await generator.generateCoverLetterPDF(
              coverLetter,
              optimizedResume.optimizedContent.name,
              optimizedResume.optimizedContent.email,
              optimizedResume.optimizedContent.phone,
              optimizedResume.optimizedContent.location
            )
          : await generator.generateCoverLetterDOCX(
              coverLetter,
              optimizedResume.optimizedContent.name,
              optimizedResume.optimizedContent.email,
              optimizedResume.optimizedContent.phone,
              optimizedResume.optimizedContent.location
            );
        generator.downloadBlob(blob, `${filename}.${format}`);
      }
    } catch (err) {
      if (isContextInvalidated()) { setError(CONTEXT_INVALIDATED_MSG); return; }
      setError('Download failed');
      console.error(err);
    }
  }, [optimizedResume, jobDescription, coverLetter]);

  const handleApplyQuickWin = useCallback((text: string, expIndex: number) => {
    if (!optimizedResume || !jobDescription) return;
    const exp = [...optimizedResume.optimizedContent.experience];
    if (!exp[expIndex]) return;
    exp[expIndex] = { ...exp[expIndex], bullets: [...exp[expIndex].bullets, text] };
    const updatedContent = { ...optimizedResume.optimizedContent, experience: exp };

    const newScoring = calculateATSScoreWithBreakdown(updatedContent, jobDescription);

    const updated: OptimizedResume = {
      ...optimizedResume,
      optimizedContent: updatedContent,
      atsScore: newScoring.total,
      scoring: newScoring,
    };
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
    // Re-sync credits from server — local cache was just cleared
    if (user) {
      const updated = await storage.getCredits(user.id);
      setCredits(updated);
    } else {
      setCredits(null);
    }
    setView('main');
  }, [user]);

  const handleSignOut = useCallback(async () => {
    await signOut();
    setUser(null);
    setCredits(null);
    setView('auth');
  }, []);

  const handleAuth = useCallback(async (loggedInUser: User) => {
    setUser(loggedInUser);
    const [creditsData, resumeData, appsData, optimizedResumesData, settings] = await Promise.all([
      storage.getCredits(loggedInUser.id),
      storage.getResume(),
      storage.getApplications(),
      storage.getOptimizedResumes(),
      storage.getSettings(),
    ]);
    setCredits(creditsData);
    setResume(resumeData);
    setApplications(appsData);
    if (optimizedResumesData.length > 0) {
      setOptimizedResume(optimizedResumesData[optimizedResumesData.length - 1]);
    }
    setView('main');
    if (settings.autoDetectJob) detectJobDescription();
  }, [detectJobDescription]);

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
    view, user, credits, resume, jobDescription, optimizedResume,
    coverLetter, applications, isLoading, loadingMessage, isDetecting, isCoverLetterLoading, error,
    setView, setError, setJobDescription,
    handleResumeUpload, handleOptimize, handleGenerateCoverLetter,
    handleDownload, handleApplyQuickWin, handleClearData, handleSignOut,
    detectJobDescription, handleAuth, handleUpdateApplicationStatus,
  };

  return (
    <SidebarContext.Provider value={value}>
      {children}
    </SidebarContext.Provider>
  );
};
