import React, { useEffect, useState } from 'react';
import { KeyRound, CheckCircle2, Loader2 } from 'lucide-react';
import { useSidebar } from '../context';
import { storage } from '../../lib/storage';
import type { ApiConfig } from '../../types';
import type { BackgroundRequest } from '../../types/runtime-messages';

// Common provider endpoints, offered as one-click base-URL and model presets.
const PRESETS: Array<{ label: string; baseUrl: string; modelHint: string }> = [
  { label: 'Claude', baseUrl: 'https://api.anthropic.com/v1', modelHint: 'claude-sonnet-4-6' },
  { label: 'ChatGPT', baseUrl: 'https://api.openai.com/v1', modelHint: 'gpt-4o' },
  { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com', modelHint: 'deepseek-v4-flash' },
  { label: 'Qwen', baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', modelHint: 'qwen3.7-plus' },
  { label: 'Grok', baseUrl: 'https://api.x.ai/v1', modelHint: 'grok-4.5' },
  { label: 'Kimi', baseUrl: 'https://api.moonshot.ai/v1', modelHint: 'kimi-k2.5' },
];

type TestState = { status: 'idle' | 'testing' | 'ok' | 'error'; message?: string };

export const SettingsView: React.FC = () => {
  const { handleClearData, setView, refreshConfig, reloadStoredData } = useSidebar();
  const [confirmClear, setConfirmClear] = useState(false);
  const [config, setConfig] = useState<ApiConfig>({ baseUrl: '', apiKey: '', model: '' });
  const [hasStoredApiKey, setHasStoredApiKey] = useState(false);
  const [rememberApiKey, setRememberApiKey] = useState(true);
  const [saved, setSaved] = useState(false);
  const [test, setTest] = useState<TestState>({ status: 'idle' });
  const [backupMessage, setBackupMessage] = useState('');

  useEffect(() => {
    Promise.all([storage.getApiConfig(), storage.getSettings()]).then(([stored, settings]) => {
      setHasStoredApiKey(!!stored.apiKey);
      setConfig({ ...stored, apiKey: '' });
      setRememberApiKey(settings.rememberApiKey !== false);
    });
  }, []);

  const update = (patch: Partial<ApiConfig>) => {
    setConfig(prev => ({ ...prev, ...patch }));
    setSaved(false);
    setTest({ status: 'idle' });
  };

  const save = async () => {
    const stored = await storage.getApiConfig();
    const enteredApiKey = config.apiKey.trim();
    const trimmed: ApiConfig = {
      baseUrl: config.baseUrl.trim(),
      apiKey: enteredApiKey || stored.apiKey,
      model: config.model.trim(),
    };
    await storage.saveApiConfig(trimmed, { rememberApiKey });
    await storage.updateSettings({ rememberApiKey });
    setHasStoredApiKey(!!trimmed.apiKey);
    setConfig({ ...trimmed, apiKey: '' });
    await refreshConfig();
    setSaved(true);
  };

  const removeApiKey = async () => {
    await storage.saveApiConfig({ apiKey: '' }, { rememberApiKey });
    setHasStoredApiKey(false);
    setConfig(prev => ({ ...prev, apiKey: '' }));
    setSaved(false);
    setTest({ status: 'idle' });
    await refreshConfig();
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
        setView('main');
      } else {
        setTest({ status: 'error', message: res?.error || 'Request failed.' });
      }
    } catch {
      setTest({ status: 'error', message: 'Could not reach the extension. Refresh the page and retry.' });
    }
  };

  const exportBackup = async () => {
    const backup = await storage.createBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `tailorcv-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setBackupMessage('Backup exported. API keys are never included.');
  };

  const importBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      await storage.restoreBackup(JSON.parse(await file.text()));
      await reloadStoredData();
      setBackupMessage('Backup restored. Your existing API key was preserved.');
    } catch (error) {
      setBackupMessage(error instanceof Error ? error.message : 'Could not restore this backup.');
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
          Bring your own key from Anthropic or any OpenAI-compatible provider. Your key is stored only in this
          browser and sent directly to the endpoint below — never to us.
        </p>

        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map(p => (
            <button
              key={p.label}
              onClick={() => update({ baseUrl: p.baseUrl, model: p.modelHint })}
              className={`px-2.5 py-1 rounded-lg border text-sm font-medium transition-colors ${
                config.baseUrl === p.baseUrl && config.model === p.modelHint
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

        <label className="flex items-start gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3">
          <input
            type="checkbox"
            checked={rememberApiKey}
            onChange={event => { setRememberApiKey(event.target.checked); setSaved(false); }}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
          />
          <span>
            <span className="block text-sm font-medium text-slate-700">Remember API key on this device</span>
            <span className="block text-xs leading-relaxed text-slate-500">
              Turn this off to keep the key only until Chrome closes.
            </span>
          </span>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-600">API Key</span>
          <input
            type="password"
            value={config.apiKey}
            onChange={e => update({ apiKey: e.target.value })}
            placeholder={hasStoredApiKey ? 'API key saved — enter a new key to replace it' : 'sk-...'}
            autoComplete="new-password"
            spellCheck={false}
            autoCapitalize="off"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
          {hasStoredApiKey && (
            <span className="mt-1 flex items-center justify-between gap-2 text-xs text-emerald-600">
              <span>Saved key is not shown on this page.</span>
              <button type="button" onClick={removeApiKey} className="font-semibold text-red-500 hover:text-red-700">
                Remove key
              </button>
            </span>
          )}
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
          {config.baseUrl === 'https://api.anthropic.com/v1' && (
            <span className="mt-1 block text-xs text-slate-400">
              Claude Sonnet 4.6 via Anthropic. Use your Claude Console API key.
            </span>
          )}
          {config.baseUrl.includes('dashscope') && (
            <span className="mt-1 block text-xs text-slate-400">
              Qwen endpoints and API keys are region-specific. Replace this URL with the endpoint shown in your Model Studio workspace if needed.
            </span>
          )}
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
            disabled={test.status === 'testing' || (!config.apiKey.trim() && !hasStoredApiKey) || !config.model.trim()}
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
        <p>Your resume and history are stored only in this browser. There is no TailorCV server or analytics.</p>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          <li>Optimize sends your redacted resume and the selected job description.</li>
          <li>Cover letters send resume content and the selected job description.</li>
          <li>Manual AI scanning may send up to 5,000 characters of visible page text; automatic scanning stays local.</li>
          <li>Requests go directly to the provider endpoint configured above.</li>
        </ul>
      </div>

      <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm space-y-3">
        <div>
          <p className="text-sm font-semibold text-slate-700">Local Backup</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-500">
            Export or restore your resume, optimization history, and settings. API keys are never included.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportBackup} className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            Export backup
          </button>
          <label className="flex-1 cursor-pointer rounded-lg border border-slate-200 py-2 text-center text-sm font-semibold text-slate-600 hover:bg-slate-50">
            Restore backup
            <input type="file" accept="application/json,.json" onChange={importBackup} className="hidden" aria-label="Choose TailorCV backup file" />
          </label>
        </div>
        {backupMessage && <p role="status" className="text-xs text-slate-500">{backupMessage}</p>}
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
