import { useCallback, useEffect, useRef, useState } from 'react';
import { JobScraper } from '../../lib/job-scraper';
import type { JobDescription } from '../../types';

const URL_SCAN_DEBOUNCE_MS = 15_000;

type UseJobDetectionOptions = {
  onContextInvalidated(): void;
};

export function useJobDetection({ onContextInvalidated }: UseJobDetectionOptions) {
  const [jobDescription, setJobDescription] = useState<JobDescription | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const lastScanRef = useRef(0);

  const detectJobDescription = useCallback(async (useAI = true) => {
    const now = Date.now();
    if (now - lastScanRef.current < URL_SCAN_DEBOUNCE_MS) return;
    lastScanRef.current = now;
    setIsDetecting(true);
    try {
      const job = await new JobScraper().scrapeCurrentPage(useAI);
      if (job) setJobDescription(job);
    } catch (error) {
      try {
        if (!chrome.runtime?.id) {
          onContextInvalidated();
          return;
        }
      } catch {
        onContextInvalidated();
        return;
      }
      console.error('Failed to detect job:', error);
    } finally {
      setIsDetecting(false);
    }
  }, [onContextInvalidated]);

  useEffect(() => {
    let lastUrl = window.location.href;
    const checkUrl = () => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        setJobDescription(null);
      }
    };

    const titleElement = document.querySelector('title');
    const observer = new MutationObserver(checkUrl);
    if (titleElement) {
      observer.observe(titleElement, { subtree: true, childList: true, characterData: true });
    }
    window.addEventListener('popstate', checkUrl);
    return () => {
      observer.disconnect();
      window.removeEventListener('popstate', checkUrl);
    };
  }, []);

  return {
    jobDescription,
    setJobDescription,
    isDetecting,
    detectJobDescription,
  };
}
