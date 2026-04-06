import React from 'react';
import {
  FileText, Sparkles, Settings, PlusCircle, History,
  CheckCircle2, RefreshCw, Pencil, AlertTriangle,
} from 'lucide-react';
import { useSidebar } from '../context';

export const MainView: React.FC = () => {
  const {
    resume, jobDescription, credits, isLoading, isDetecting,
    setView, handleOptimize, detectJobDescription,
  } = useSidebar();

  const [showPreview, setShowPreview] = React.useState(false);

  const descFull = jobDescription?.description ?? '';
  const descCharCount = descFull.length;
  const descQuality = descCharCount === 0 ? 'none'
    : descCharCount < 300 ? 'low'
    : descCharCount < 800 ? 'medium'
    : 'good';

  const canOptimize = !!(resume && jobDescription && credits && credits.remaining > 0 && !isLoading);

  return (
    <>
      {/* Credits card */}
      <div className="relative overflow-hidden p-4 rounded-xl border border-primary/10 bg-gradient-to-br from-primary/5 to-transparent flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-sm font-semibold uppercase tracking-wider text-primary/70 mb-0.5">
            Premium Balance
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-slate-900">
              {credits?.remaining ?? 0}
            </span>
            <span className="text-sm font-medium text-slate-600">Credits</span>
          </div>
        </div>
        <button
          onClick={() => setView('credits')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-all shadow-sm"
        >
          Buy More
          <PlusCircle size={13} />
        </button>
      </div>

      {/* Resume section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400">
            Current Resume
          </h3>
        </div>

        {resume ? (
          <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-white shadow-sm text-slate-500 shrink-0">
              <FileText size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate">{resume.fileName}</p>
              <p className="text-sm text-slate-500">
                {resume.parsedData.name || 'Ready to optimize'}
              </p>
            </div>
            <button
              onClick={() => setView('upload')}
              className="text-sm font-bold text-primary hover:underline px-2 py-1 shrink-0"
            >
              Update
            </button>
          </div>
        ) : (
          <button
            onClick={() => setView('upload')}
            className="w-full flex items-center gap-3 bg-slate-50 p-3 rounded-xl border-2 border-dashed border-slate-200 hover:border-primary/40 hover:bg-primary/5 transition-colors group"
          >
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-white shadow-sm text-slate-300 group-hover:text-primary/60 shrink-0 transition-colors">
              <FileText size={20} />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-slate-500 group-hover:text-slate-700">
                Upload Resume
              </p>
              <p className="text-sm text-slate-400">PDF or DOCX</p>
            </div>
          </button>
        )}
      </div>

      {/* Job Target section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400">
            Job Target
          </h3>
        </div>

        {isDetecting ? (
          <div aria-live="polite" role="status" className="p-4 rounded-xl border border-slate-100 bg-white shadow-sm">
            <div className="flex items-center gap-2 text-slate-500">
              <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin shrink-0" aria-hidden="true" />
              <span className="text-sm font-medium">Scanning page for job description...</span>
            </div>
            <p className="text-sm text-slate-400 mt-1 ml-6">Trying DOM selectors + AI fallback</p>
          </div>
        ) : jobDescription ? (
          <div className="p-4 rounded-xl border border-slate-100 bg-white shadow-sm">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-1.5 text-emerald-600">
                <CheckCircle2 size={15} />
                <span className="text-sm font-bold tracking-tight">Job Detected</span>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={detectJobDescription}
                  aria-label="Re-scan page for job description"
                  className="p-1.5 rounded hover:bg-slate-100 text-slate-400 transition-colors"
                  title="Re-scan page"
                >
                  <RefreshCw size={15} />
                </button>
                <button
                  onClick={() => setView('paste-job')}
                  aria-label="Edit job description"
                  className="p-1.5 rounded hover:bg-slate-100 text-slate-400 transition-colors"
                  title="Change job"
                >
                  <Pencil size={15} />
                </button>
              </div>
            </div>

            <div className="mb-3">
              <p className="text-base font-bold text-slate-900 leading-tight truncate">
                {jobDescription.title}
              </p>
              <p className="text-sm text-slate-500 truncate">{jobDescription.company}</p>
            </div>

            {descQuality === 'low' && (
              <div className="flex items-start gap-1.5 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 mb-3">
                <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                Description looks short — verify before optimizing
              </div>
            )}

            <button
              onClick={() => setShowPreview(v => !v)}
              className="text-sm text-primary/80 hover:text-primary font-medium"
            >
              {showPreview ? '\u25B2 Hide preview' : '\u25BC Preview captured description'}
            </button>

            {showPreview && (
              <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50 p-2.5">
                <p className="text-sm text-slate-400 mb-1">
                  {descCharCount.toLocaleString()} characters
                </p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {descFull}
                </p>
                {jobDescription.requirements.length > 0 && (
                  <div className="mt-2 border-t border-slate-200 pt-2">
                    <p className="text-sm font-semibold text-slate-500 mb-1">
                      Requirements extracted:
                    </p>
                    <ul className="space-y-0.5">
                      {jobDescription.requirements.slice(0, 5).map((r, i) => (
                        <li key={i} className="text-sm text-slate-600">&bull; {r}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="p-4 rounded-xl border border-amber-100 bg-amber-50">
            <p className="text-sm font-semibold text-amber-800 mb-1">No job detected</p>
            <p className="text-sm text-amber-700 mb-3 leading-relaxed">
              Navigate to a job posting on LinkedIn, Indeed, or any job site. Or paste the job description manually.
            </p>
            <div className="flex gap-2">
              <button
                onClick={detectJobDescription}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-amber-200 bg-white text-amber-800 text-sm font-semibold hover:bg-amber-50 transition-colors"
              >
                <RefreshCw size={13} /> Scan Page
              </button>
              <button
                onClick={() => setView('paste-job')}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                <Pencil size={13} /> Paste JD
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="pt-1 space-y-3">
        <button
          onClick={handleOptimize}
          disabled={!canOptimize}
          className="w-full py-4 rounded-xl bg-primary text-white font-bold text-sm shadow-lg shadow-primary/25 hover:shadow-primary/40 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
        >
          {isLoading ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />
              Optimizing...
            </>
          ) : (
            <>
              <Sparkles size={18} />
              Optimize Resume
              <span className="px-1.5 py-0.5 rounded-md bg-white/20 text-sm ml-1">
                1 CREDIT
              </span>
            </>
          )}
        </button>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setView('settings')}
            className="flex items-center justify-center gap-2 py-3 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-colors"
          >
            <Settings size={15} />
            Settings
          </button>
          <button
            onClick={() => setView('history')}
            className="flex items-center justify-center gap-2 py-3 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-colors"
          >
            <History size={15} />
            History
          </button>
        </div>
      </div>
    </>
  );
};
