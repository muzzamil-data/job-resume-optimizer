import React from 'react';
import { History } from 'lucide-react';
import { useSidebar } from '../context';

const STATUS_OPTIONS: { value: 'applied' | 'interviewing' | 'accepted' | 'rejected'; label: string; color: string }[] = [
  { value: 'applied',      label: 'Applied',      color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { value: 'interviewing', label: 'Interviewing',  color: 'bg-amber-100 text-amber-700 border-amber-200' },
  { value: 'accepted',     label: 'Accepted',      color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  { value: 'rejected',     label: 'Rejected',      color: 'bg-red-100 text-red-700 border-red-200' },
];

function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export const HistoryView: React.FC = () => {
  const { applications, handleUpdateApplicationStatus, setView } = useSidebar();
  const [updating, setUpdating] = React.useState<string | null>(null);

  const sorted = [...applications].sort(
    (a, b) => new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime()
  );

  const handleStatus = async (id: string, status: 'applied' | 'interviewing' | 'accepted' | 'rejected') => {
    setUpdating(id);
    await handleUpdateApplicationStatus(id, status);
    setUpdating(null);
  };

  return (
    <div className="space-y-4">
      <button onClick={() => setView('main')} className="text-sm text-slate-500 hover:text-slate-700">
        &larr; Back
      </button>

      <div>
        <h3 className="text-base font-bold text-slate-900 mb-0.5">Application History</h3>
        <p className="text-sm text-slate-500">{sorted.length} application{sorted.length !== 1 ? 's' : ''} tracked</p>
      </div>

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <History size={36} className="text-slate-300" />
          <p className="text-sm font-semibold text-slate-500">No applications yet</p>
          <p className="text-sm text-slate-400">After you optimize a resume and apply, it will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map(app => (
            <div key={app.id} className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">{app.jobTitle}</p>
                  <p className="text-sm text-slate-500 truncate">{app.company}</p>
                </div>
                <span className="text-xs text-slate-400 shrink-0 pt-0.5">{formatDate(app.appliedAt)}</span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {STATUS_OPTIONS.map(opt => {
                  const active = app.status === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => handleStatus(app.id, opt.value)}
                      disabled={updating === app.id}
                      aria-pressed={active}
                      className={`px-2.5 py-1 rounded-full border text-xs font-semibold transition-all ${
                        active ? opt.color : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                      } disabled:opacity-50`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              {app.url && app.url.startsWith('https://') && (
                <a
                  href={app.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline truncate block"
                >
                  View job posting &rarr;
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
