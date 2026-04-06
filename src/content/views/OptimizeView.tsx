import React from 'react';
import { Download, Sparkles, CheckCircle2, RefreshCw } from 'lucide-react';
import { useSidebar } from '../context';

const ScoreBar: React.FC<{ label: string; score: number; max?: number }> = ({
  label, score, max = 100,
}) => {
  const pct = Math.round((score / max) * 100);
  const color = pct >= 80 ? 'bg-emerald-500' : pct >= 55 ? 'bg-amber-400' : 'bg-red-400';
  return (
    <div className="mb-2.5">
      <div className="flex justify-between text-sm mb-1">
        <span className="text-slate-600">{label}</span>
        <span className="font-semibold text-slate-700">{score}/{max}</span>
      </div>
      <div
        className="w-full bg-slate-100 rounded-full h-1.5"
        role="progressbar"
        aria-label={label}
        aria-valuenow={score}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <div
          className={`${color} h-1.5 rounded-full transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

const TONES = [
  { value: 'professional',  label: 'Professional',  desc: 'Formal & polished' },
  { value: 'enthusiastic',  label: 'Enthusiastic',  desc: 'Energetic & passionate' },
  { value: 'technical',     label: 'Technical',     desc: 'Skills & expertise' },
  { value: 'creative',      label: 'Creative',      desc: 'Unique & memorable' },
] as const;

export const OptimizeView: React.FC = () => {
  const {
    optimizedResume, coverLetter, isCoverLetterLoading,
    handleGenerateCoverLetter, handleDownload, handleApplyQuickWin, setView,
  } = useSidebar();

  const [selectedTone, setSelectedTone] = React.useState<typeof TONES[number]['value']>('professional');
  const [appliedWins, setAppliedWins] = React.useState<Set<number>>(new Set());
  const [targetExpIndex, setTargetExpIndex] = React.useState(0);

  if (!optimizedResume) return null;

  const expEntries = optimizedResume.optimizedContent.experience;
  const sc = optimizedResume.scoring;
  const ats = optimizedResume.atsScore;
  const scoreColor = ats >= 85 ? 'text-emerald-600' : ats >= 65 ? 'text-amber-600' : 'text-red-500';
  const bgColor    = ats >= 85 ? 'bg-emerald-50 border-emerald-100' : ats >= 65 ? 'bg-amber-50 border-amber-100' : 'bg-red-50 border-red-100';

  return (
    <div className="space-y-4">
      <button onClick={() => setView('main')} className="text-sm text-slate-500 hover:text-slate-700">
        &larr; Back
      </button>

      {/* Overall ATS score */}
      <div className={`rounded-xl border p-4 text-center ${bgColor}`}>
        <p className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-1">
          ATS Match Score
        </p>
        <p className={`text-5xl font-bold ${scoreColor}`}>
          {ats}<span className="text-xl text-slate-400">/100</span>
        </p>
        <p className="text-sm text-slate-500 mt-1">
          {ats >= 85 ? 'Excellent \u2014 ready to apply'
           : ats >= 65 ? 'Good \u2014 a few gaps remain'
           : 'Needs improvement'}
        </p>
      </div>

      {/* Score breakdown */}
      {sc && (
        <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
          <h4 className="text-sm font-bold text-slate-800 mb-3">Score Breakdown</h4>
          <ScoreBar label="ATS Keywords"           score={sc.atsKeywords}          max={30} />
          <ScoreBar label="Title Match"            score={sc.formatting}            max={20} />
          <ScoreBar label="Experience Relevance"   score={sc.experienceRelevance}   max={25} />
          <ScoreBar label="Achievements & Metrics" score={sc.achievements}          max={15} />
          <ScoreBar label="Education & Certs"      score={sc.educationCerts}        max={10} />
        </div>
      )}

      {/* Download resume */}
      <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
        <h4 className="text-sm font-bold text-slate-800 mb-3">Download Optimized Resume</h4>
        <div className="flex gap-2">
          <button
            onClick={() => handleDownload('pdf', 'resume')}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors"
          >
            <Download size={13} /> PDF
          </button>
          <button
            onClick={() => handleDownload('docx', 'resume')}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors"
          >
            <Download size={13} /> DOCX
          </button>
        </div>
      </div>

      {/* Cover letter */}
      <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
        <h4 className="text-sm font-bold text-slate-800 mb-3">Cover Letter</h4>

        <p className="text-sm text-slate-500 mb-2">Select tone:</p>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {TONES.map(t => {
            const selected = selectedTone === t.value;
            return (
              <button
                key={t.value}
                onClick={() => setSelectedTone(t.value)}
                aria-pressed={selected}
                className={`text-left p-2.5 rounded-lg border-2 text-sm leading-tight transition-all ${
                  selected
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                <span className="block font-semibold">{t.label}</span>
                <span className={`block text-sm mt-0.5 ${selected ? 'text-primary/70' : 'text-slate-400'}`}>
                  {t.desc}
                </span>
              </button>
            );
          })}
        </div>

        {coverLetter ? (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-sm text-emerald-700 bg-emerald-50 rounded-lg px-2.5 py-2">
              <CheckCircle2 size={13} /> Cover letter ready
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleDownload('pdf', 'cover-letter')}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-primary text-primary text-sm font-bold hover:bg-primary/10 transition-colors"
              >
                <Download size={13} /> PDF
              </button>
              <button
                onClick={() => handleDownload('docx', 'cover-letter')}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors"
              >
                <Download size={13} /> DOCX
              </button>
              <button
                onClick={() => handleGenerateCoverLetter(selectedTone)}
                disabled={isCoverLetterLoading}
                aria-label="Regenerate cover letter"
                className="px-3 py-2.5 rounded-lg border border-slate-200 text-slate-600 text-sm font-bold hover:bg-slate-50 disabled:opacity-50 transition-colors"
                title="Regenerate"
              >
                <RefreshCw size={13} />
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => handleGenerateCoverLetter(selectedTone)}
            disabled={isCoverLetterLoading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {isCoverLetterLoading ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles size={13} /> Generate Cover Letter
              </>
            )}
          </button>
        )}
      </div>

      {/* Gaps */}
      {(optimizedResume.gaps || []).length > 0 && (
        <div className="rounded-xl border-l-4 border-amber-400 border border-amber-100 bg-amber-50 p-4">
          <h4 className="text-sm font-bold text-amber-800 mb-2">Gaps Identified</h4>
          <ul className="space-y-1">
            {(optimizedResume.gaps || []).map((g, i) => (
              <li key={i} className="text-sm text-amber-700">&bull; {g}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Quick wins / recommendations */}
      {(optimizedResume.recommendations || []).length > 0 && (
        <div className="rounded-xl border-l-4 border-primary border border-primary/10 bg-primary/5 p-4">
          <h4 className="text-sm font-bold text-primary mb-2">Quick Wins</h4>

          {expEntries.length > 1 && (
            <div className="mb-3 flex items-center gap-2">
              <span className="text-xs text-slate-500 whitespace-nowrap">Add to:</span>
              <select
                value={targetExpIndex}
                onChange={e => setTargetExpIndex(Number(e.target.value))}
                aria-label="Target experience entry for quick wins"
                className="text-xs border border-slate-200 rounded px-2 py-1 bg-white text-slate-700 flex-1"
              >
                {expEntries.map((e, i) => (
                  <option key={i} value={i}>{e.title} @ {e.company}</option>
                ))}
              </select>
            </div>
          )}

          <ol className="space-y-2">
            {(optimizedResume.recommendations || []).map((r, i) => (
              <li key={i} className="text-sm text-slate-700 flex items-start gap-2">
                <span className="font-bold text-primary shrink-0">{i + 1}.</span>
                <span className="flex-1">{r}</span>
                {appliedWins.has(i) ? (
                  <span className="shrink-0 text-xs font-medium text-emerald-600">&check; Added</span>
                ) : (
                  <button
                    onClick={() => {
                      handleApplyQuickWin(r, expEntries.length > 1 ? targetExpIndex : 0);
                      setAppliedWins(prev => new Set([...prev, i]));
                    }}
                    className="shrink-0 text-xs text-primary border border-primary/40 rounded px-2 py-0.5 hover:bg-primary/10 transition-colors"
                  >
                    + Add
                  </button>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
};
