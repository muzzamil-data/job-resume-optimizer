import React from 'react';
import { FileText } from 'lucide-react';
import { useSidebar } from '../context';

export const UploadView: React.FC = () => {
  const { isLoading, handleResumeUpload, setView } = useSidebar();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleResumeUpload(file);
  };

  return (
    <div className="space-y-4">
      <button onClick={() => setView('main')} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        &larr; Back
      </button>

      <div>
        <h3 className="text-base font-bold text-slate-900 mb-1">Upload Resume</h3>
        <p className="text-sm text-slate-500">
          Upload your master resume in PDF or DOCX. We'll optimise it for each job you apply to.
        </p>
      </div>

      <label
        className="flex flex-col items-center justify-center w-full border-2 border-dashed border-slate-200 rounded-xl p-10 text-center cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors group"
        tabIndex={0}
        role="button"
        aria-label="Upload resume file — PDF or DOCX, max 10 MB"
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (e.currentTarget.querySelector('input') as HTMLInputElement)?.click(); } }}
      >
        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-slate-100 group-hover:bg-primary/10 text-slate-400 group-hover:text-primary transition-colors mb-3">
          <FileText size={24} aria-hidden="true" />
        </div>
        <span className="text-sm font-semibold text-slate-700">Click to upload or drag & drop</span>
        <span className="text-sm text-slate-400 mt-1">PDF or DOCX &middot; max 10 MB</span>
        <input
          type="file"
          accept=".pdf,.docx"
          onChange={handleFileChange}
          className="hidden"
          disabled={isLoading}
          aria-label="Choose resume file"
        />
      </label>

      {isLoading && (
        <div role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-primary">
          <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" aria-hidden="true" />
          Parsing resume...
        </div>
      )}
    </div>
  );
};
