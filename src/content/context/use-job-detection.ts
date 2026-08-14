import { useCallback, useEffect, useRef, useState } from 'react';
import { JobScraper, type JobScanMode } from '../../lib/job-scraper';
import type { JobDescription } from '../../types';

const AUTOMATIC_SCAN_DEBOUNCE_MS = 15_000;
const SPA_RESCAN_DELAY_MS = 1_500;
const URL_POLL_INTERVAL_MS = 750;

type UseJobDetectionOptions = {
  onContextInvalidated(): void;
  onScanError(message: string): void;
  onClearError(): void;
};

export function useJobDetection({
  onContextInvalidated,
  onScanError,
  onClearError,
}: UseJobDetectionOptions) {
  const [jobDescription, setJobDescription] = useState<JobDescription | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const lastAutomaticScanRef = useRef<{ url: string; timestamp: number } | null>(null);
  const scanGenerationRef = useRef(0);
  const activeScanRef = useRef<{ url: string; mode: JobScanMode } | null>(null);

  const detectJobDescription = useCallback(async (mode: JobScanMode = 'manual') => {
    const url = window.location.href;
    const now = Date.now();
    const lastAutomaticScan = lastAutomaticScanRef.current;
    if (
      mode === 'automatic' &&
      lastAutomaticScan?.url === url &&
      now - lastAutomaticScan.timestamp < AUTOMATIC_SCAN_DEBOUNCE_MS
    ) return;
    if (activeScanRef.current?.url === url && activeScanRef.current.mode === mode) return;

    if (mode === 'automatic') lastAutomaticScanRef.current = { url, timestamp: now };
    const generation = ++scanGenerationRef.current;
    activeScanRef.current = { url, mode };
    setIsDetecting(true);
    if (mode === 'manual') {
      setJobDescription(null);
      onClearError();
    }
    try {
      const job = await new JobScraper().scrapeCurrentPage(mode);
      if (generation !== scanGenerationRef.current || window.location.href !== url) return;
      if (job) {
        setJobDescription(job);
      } else if (mode === 'manual') {
        setJobDescription(null);
        onScanError('No recognizable job description was found. Try Paste JD to add it manually.');
      }
    } catch (error) {
      if (generation !== scanGenerationRef.current || window.location.href !== url) return;
      try {
        if (!chrome.runtime?.id) {
          onContextInvalidated();
          return;
        }
      } catch {
        onContextInvalidated();
        return;
      }
      const message = error instanceof Error ? error.message : 'Job scanning failed. Please try again.';
      onScanError(message);
      console.error('Job detection failed.');
    } finally {
      if (generation === scanGenerationRef.current) {
        activeScanRef.current = null;
        setIsDetecting(false);
      }
    }
  }, [onClearError, onContextInvalidated, onScanError]);

  useEffect(() => {
    let lastUrl = window.location.href;
    let rescanTimeout: ReturnType<typeof setTimeout> | undefined;
    const checkUrl = () => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        scanGenerationRef.current += 1;
        activeScanRef.current = null;
        setIsDetecting(false);
        setJobDescription(null);
        onClearError();
        if (rescanTimeout) clearTimeout(rescanTimeout);
        rescanTimeout = setTimeout(() => detectJobDescription('automatic'), SPA_RESCAN_DELAY_MS);
      }
    };

    const titleElement = document.querySelector('title');
    const observer = new MutationObserver(checkUrl);
    if (titleElement) {
      observer.observe(titleElement, { subtree: true, childList: true, characterData: true });
    }
    window.addEventListener('popstate', checkUrl);
    const urlPoll = setInterval(checkUrl, URL_POLL_INTERVAL_MS);
    return () => {
      observer.disconnect();
      window.removeEventListener('popstate', checkUrl);
      clearInterval(urlPoll);
      if (rescanTimeout) clearTimeout(rescanTimeout);
    };
  }, [detectJobDescription, onClearError]);

  return {
    jobDescription,
    setJobDescription,
    isDetecting,
    detectJobDescription,
  };
}
