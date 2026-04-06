import React from 'react';
import { useSidebar } from '../context';

export const SettingsView: React.FC = () => {
  const { user, handleSignOut, handleClearData, setView } = useSidebar();

  return (
    <div className="space-y-4">
      <button onClick={() => setView('main')} className="text-sm text-slate-500 hover:text-slate-700">
        &larr; Back
      </button>

      <div>
        <h3 className="text-base font-bold text-slate-900 mb-1">Settings</h3>
      </div>

      {user && (
        <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-700 mb-1">Account</p>
          <p className="text-sm text-slate-500 mb-3 truncate">{user.email}</p>
          <button
            onClick={handleSignOut}
            className="w-full py-2.5 rounded-lg border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors"
          >
            Sign Out
          </button>
        </div>
      )}

      <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-500 leading-relaxed">
        <p className="font-semibold text-slate-600 mb-1">Data &amp; Privacy</p>
        <p>Your resume is stored locally in your browser. Optimization requests are processed via our secure backend — your resume content is never stored on our servers.</p>
      </div>

      <div className="rounded-xl border border-red-100 bg-red-50 p-4">
        <p className="text-sm font-semibold text-red-700 mb-1">Danger Zone</p>
        <p className="text-sm text-red-500 mb-3">Permanently deletes your resume, optimized resumes, cover letters, and all local settings from this browser.</p>
        <button
          onClick={() => { if (window.confirm('Delete all stored data? This cannot be undone.')) handleClearData(); }}
          className="w-full py-2 rounded-lg border border-red-300 text-red-600 text-sm font-semibold hover:bg-red-100 transition-colors"
        >
          Clear All Stored Data
        </button>
      </div>
    </div>
  );
};
