import React, { useEffect, useState } from 'react';
import { KeyRound, CheckCircle2, Loader2 } from 'lucide-react';
import { useSidebar } from '../context';
import { storage } from '../../lib/storage';
import type { ApiConfig } from '../../types';
import type { BackgroundRequest } from '../../types/runtime-messages';

// A few common OpenAI-compatible endpoints, offered as one-click base-URL presets.
const PRESETS: Array<{ label: string; baseUrl: string; modelHint: string }> = [
  { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', modelHint: 'gpt-4o' },
  { label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', modelHint: 'anthropic/claude-haiku-4.5' },
  { label: 'Moonshot (Kimi)', baseUrl: 'https://api.moonshot.ai/v1', modelHint: 'kimi-k2-0711-preview' },
  { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', modelHint: 'deepseek-chat' },
  { label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', modelHint: 'llama-3.3-70b-versatile' },
  { label: 'Together', baseUrl: 'https://api.together.xyz/v1', modelHint: 'meta-llama/Llama-3.3-70B-Instruct-Turbo' },
  { label: 'Ollama (local)', baseUrl: 'http://localhost:11434/v1', modelHint: 'llama3.1' },
];

type TestState = { status: 'idle' | 'testing' | 'ok' | 'error'; message?: string };

export const SettingsView: React.FC = () => {
  const { handleClearData, setView, refreshConfig } = useSidebar();
  const [confirmClear, setConfirmClear] = useState(false);
  const [config, setConfig] = useState<ApiConfig>({ baseUrl: '', apiKey: '', model: '' });
  const [saved, setSaved] = useState(false);
  const [test, setTest] = useState<TestState>({ status: 'idle' });

  useEffect(() => {
    storage.getApiConfig().then(setConfig);
  }, []);

  const update = (patch: Partial<ApiConfig>) => {
    setConfig(prev => ({ ...prev, ...patch }));
    setSaved(false);
    setTest({ status: 'idle' });
  };

  const save = async () => {
    const trimmed: ApiConfig = {
      baseUrl: config.baseUrl.trim(),
      apiKey: config.apiKey.trim(),
      model: config.model.trim(),
    };
    await storage.saveApiConfig(trimmed);
    setConfig(trimmed);
    await refreshConfig();
    setSaved(true);
  };

  const testConnection = async () => {
    await save();
    setTest({ status: 'testing' });
    try {
      const request = {
        action: 'generateTextWithAI',
        payload: {
          messages: [{ role: 'user', content: 'Reply with the single word: OK' }],
          maxTokens: 5,
        },
      } satisfies BackgroundRequest;
      const res = await chrome.runtime.sendMessage(request);
      if (res?.success) {
        setTest({ status: 'ok', message: 'Connection works.' });
      } else {
        setTest({ status: 'error', message: res?.error || 'Request failed.' });
      }
    } catch {
      setTest({ status: 'error', message: 'Could not reach the extension. Refresh the page and retry.' });
    }
  };

  return (
    <div className="space-y-4">
      <button onClick={() => setView('main')} className="text-sm text-slate-500 hover:text-slate-700">
        &larr; Back
      </button>

      <div>
        <h3 className="text-base font-bold text-slate-900 mb-1">Settings</h3>
      </div>

      {/* API configuration */}
      <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <KeyRound size={16} className="text-primary" />
          <p className="text-sm font-semibold text-slate-700">AI Provider</p>
        </div>
        <p className="text-sm text-slate-500 leading-relaxed">
          Bring your own key from any OpenAI-compatible provider. Your key is stored only in this
          browser and sent directly to the endpoint below — never to us.
        </p>

        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map(p => (
            <button
              key={p.label}
              onClick={() => update({ baseUrl: p.baseUrl, model: config.model.trim() || p.modelHint })}
              className={`px-2.5 py-1 rounded-lg border text-sm font-medium transition-colors ${
                config.baseUrl === p.baseUrl
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <label className="block">
          <span className="text-sm font-medium text-slate-600">Base URL</span>
          <input
            type="text"
            value={config.baseUrl}
            onChange={e => update({ baseUrl: e.target.value })}
            placeholder="https://api.openai.com/v1"
            spellCheck={false}
            autoCapitalize="off"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-600">API Key</span>
          <input
            type="password"
            value={config.apiKey}
            onChange={e => update({ apiKey: e.target.value })}
            placeholder="sk-..."
            spellCheck={false}
            autoCapitalize="off"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-600">Model</span>
          <input
            type="text"
            value={config.model}
            onChange={e => update({ model: e.target.value })}
            placeholder="gpt-4o-mini"
            spellCheck={false}
            autoCapitalize="off"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </label>

        <div className="flex gap-2 pt-1">
          <button
            onClick={save}
            className="flex-1 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            {saved ? 'Saved' : 'Save'}
          </button>
          <button
            onClick={testConnection}
            disabled={test.status === 'testing' || !config.apiKey.trim() || !config.model.trim()}
            className="flex-1 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
          >
            {test.status === 'testing' && <Loader2 size={14} className="animate-spin" />}
            Test connection
          </button>
        </div>

        {test.status === 'ok' && (
          <p className="flex items-center gap-1.5 text-sm text-emerald-600">
            <CheckCircle2 size={14} /> {test.message}
          </p>
        )}
        {test.status === 'error' && (
          <p className="text-sm text-red-600">{test.message}</p>
        )}
      </div>

      <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-500 leading-relaxed">
        <p className="font-semibold text-slate-600 mb-1">Data &amp; Privacy</p>
        <p>Your resume, history, and API key are stored only in this browser (chrome.storage.local). Nothing is sent to any server of ours — there is no server. Resume text goes directly to the AI provider you configure above.</p>
      </div>

      <div className="rounded-xl border border-red-100 bg-red-50 p-4">
        <p className="text-sm font-semibold text-red-700 mb-1">Danger Zone</p>
        <p className="text-sm text-red-500 mb-3">Permanently deletes your resume, optimized resumes, cover letters, and application history from this browser. Your API settings are kept.</p>
        {confirmClear ? (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-red-700">Are you sure? This cannot be undone.</p>
            <div className="flex gap-2">
              <button
                onClick={() => { setConfirmClear(false); handleClearData(); }}
                className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors"
              >
                Yes, delete all data
              </button>
              <button
                onClick={() => setConfirmClear(false)}
                className="flex-1 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmClear(true)}
            className="w-full py-2 rounded-lg border border-red-300 text-red-600 text-sm font-semibold hover:bg-red-100 transition-colors"
          >
            Clear All Stored Data
          </button>
        )}
      </div>
    </div>
  );
};
