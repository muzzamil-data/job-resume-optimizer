import React from 'react';
import { X, AlertTriangle, Clock, RefreshCw } from 'lucide-react';
import logoUrl from '../../icons/logo48.png?inline';

import { SidebarProvider, useSidebar } from './context';
import {
  ErrorBoundary,
  MainView,
  UploadView,
  OptimizeView,
  SettingsView,
  PasteJobView,
  HistoryView,
} from './views';

interface SidebarProps {
  onClose: () => void;
}

const EXTENSION_VERSION = chrome.runtime.getManifest().version;

const SidebarContent: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { view, setView, isLoading, loadingMessage, error, setError, optimizedResume } = useSidebar();

  return (
    <div className="flex flex-col w-full h-full bg-white shadow-xl overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-white sticky top-0 z-10 shrink-0">
        <div className="flex items-center gap-2.5">
          <img src={logoUrl} alt="TailorCV logo" className="w-9 h-9 rounded-lg shrink-0" />
          <h2 className="text-slate-900 text-base font-bold tracking-tight">TailorCV</h2>
        </div>
        <button
          onClick={onClose}
          aria-label="Close sidebar"
          className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-slate-100 text-slate-500 transition-colors"
        >
          <X size={20} />
        </button>
      </header>

      {/* Error banner */}
      {error && error.includes('refresh this page') ? (
        <div role="alert" className="mx-4 mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 shrink-0">
          <RefreshCw size={14} className="text-amber-500 mt-0.5 shrink-0" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-sm text-amber-700 leading-snug">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-1.5 text-xs font-semibold text-amber-700 underline hover:text-amber-900"
            >
              Refresh now
            </button>
          </div>
        </div>
      ) : error ? (
        <div role="alert" className="mx-4 mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 shrink-0">
          <AlertTriangle size={14} className="text-red-500 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-sm text-red-700 leading-snug">{error}</p>
          <button
            onClick={() => setError('')}
            aria-label="Dismiss error"
            className="ml-auto shrink-0 text-red-400 hover:text-red-600"
          >
            <X size={14} />
          </button>
        </div>
      ) : null}

      {/* Main content */}
      <main className="flex-1 overflow-y-auto p-5 space-y-5">
        {isLoading && (
          <div aria-live="polite" role="status" className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" aria-hidden="true" />
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-700">{loadingMessage || 'Loading...'}</p>
              {loadingMessage === 'Optimizing your resume...' && (
                <p className="text-sm text-slate-400 mt-1">This takes 15-30 seconds</p>
              )}
            </div>
          </div>
        )}
        <ErrorBoundary>
          {!isLoading && view === 'main' && <MainView />}
          {view === 'upload' && <UploadView />}
          {view === 'optimize' && optimizedResume && <OptimizeView />}
          {view === 'optimize' && !optimizedResume && (
            <div className="text-center py-12 text-slate-400">
              <Clock size={40} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">No optimization yet. Go back and optimize first.</p>
              <button onClick={() => setView('main')} className="mt-4 text-primary text-sm font-medium hover:underline">
                &larr; Back
              </button>
            </div>
          )}
          {view === 'settings' && <SettingsView />}
          {view === 'history' && <HistoryView />}
          {view === 'paste-job' && <PasteJobView />}
        </ErrorBoundary>
      </main>

      {/* Status bar */}
      <footer className="px-5 py-3 border-t border-slate-100 flex justify-between items-center text-sm text-slate-400 uppercase tracking-widest font-medium shrink-0">
        <span>v{EXTENSION_VERSION} &middot; AI-Powered</span>
        <div role="status" className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
          System Ready
        </div>
      </footer>
    </div>
  );
};

const Sidebar: React.FC<SidebarProps> = ({ onClose }) => (
  <SidebarProvider>
    <SidebarContent onClose={onClose} />
  </SidebarProvider>
);

export default Sidebar;
