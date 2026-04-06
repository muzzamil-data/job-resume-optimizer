import React, { useState } from 'react';
import { useSidebar } from '../context';

export const PasteJobView: React.FC = () => {
  const { setView, setJobDescription } = useSidebar();

  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [description, setDescription] = useState('');

  const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary';

  const handleSave = () => {
    const href = window.location.href;
    setJobDescription({
      title,
      company: company || 'Unknown Company',
      description,
      url: href.startsWith('https://') ? href : '',
      requirements: [],
      keywords: [],
    });
    setView('main');
  };

  return (
    <div className="space-y-4">
      <button onClick={() => setView('main')} className="text-sm text-slate-500 hover:text-slate-700">
        &larr; Back
      </button>

      <div>
        <h3 className="text-base font-bold text-slate-900 mb-1">Paste Job Description</h3>
        <p className="text-sm text-slate-500">Enter the job details manually if auto-detection didn't work.</p>
      </div>

      <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm space-y-3">
        <div>
          <label htmlFor="paste-job-title" className="block text-sm font-semibold text-slate-700 mb-1">Job Title *</label>
          <input
            id="paste-job-title"
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Senior Software Engineer"
            className={inputCls}
            required
          />
        </div>

        <div>
          <label htmlFor="paste-job-company" className="block text-sm font-semibold text-slate-700 mb-1">Company</label>
          <input
            id="paste-job-company"
            type="text"
            value={company}
            onChange={e => setCompany(e.target.value)}
            placeholder="e.g. Google"
            className={inputCls}
          />
        </div>

        <div>
          <label htmlFor="paste-job-description" className="block text-sm font-semibold text-slate-700 mb-1">
            Job Description *
          </label>
          <textarea
            id="paste-job-description"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Paste the full job description here\u2026"
            rows={8}
            className={`${inputCls} resize-none`}
            required
          />
        </div>

        <button
          onClick={handleSave}
          disabled={!title.trim() || !description.trim()}
          className="w-full py-2.5 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Use This Job Description
        </button>
      </div>
    </div>
  );
};
