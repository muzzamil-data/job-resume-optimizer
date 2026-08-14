# TailorCV

An open-source Chrome extension that tailors your resume to any job posting and drafts a matching cover letter using your own AI provider key.

There is no account, no backend, and no subscription. You download the extension, load it, paste an Anthropic or OpenAI-compatible provider API key, and everything runs locally against your key.

## Features

- **One-click resume optimization** for the job posting on the page (LinkedIn, Indeed, Greenhouse, Lever, Workday, and more).
- **ATS scoring** computed locally — keyword coverage, title match, experience relevance, achievements, education/certs.
- **Cover letter generation** in four tones.
- **PDF & DOCX export** of the optimized resume and cover letter.
- **Direct AI providers** — presets for Claude, ChatGPT, DeepSeek, Qwen, Grok, and Kimi, plus a custom OpenAI-compatible endpoint.
- **Fully local** — your resume and history remain in browser storage. Your key can be remembered locally or kept only for the Chrome session. AI requests go directly to the endpoint you configure.

## Install (load unpacked)

1. Clone this repo and build it (see [Development](#development)), or download the packaged ZIP from [GitHub Releases](https://github.com/muzzamil-data/job-resume-optimizer/releases) and extract it.
2. Open `chrome://extensions` in Chrome (or any Chromium browser).
3. Toggle **Developer mode** on (top right).
4. Click **Load unpacked** and select the `dist/` folder.
5. Pin the TailorCV icon to your toolbar.

## Configure your API key

1. Open a job posting, click the TailorCV icon (or the floating button) to open the sidebar.
2. Go to **Settings**.
3. Pick a provider preset (or type a custom **Base URL**), paste your **API key**, and enter a **Model** name.
4. Click **Test connection**, then **Save**.

Clear **Remember API key on this device** to keep the key only until Chrome closes. Local JSON backups are available in Settings and never include API keys.

Common setups:

| Provider | Base URL | Example model |
|---|---|---|
| Claude | `https://api.anthropic.com/v1` | `claude-sonnet-4-6` |
| ChatGPT | `https://api.openai.com/v1` | `gpt-4o` |
| DeepSeek | `https://api.deepseek.com` | `deepseek-v4-flash` |
| Qwen | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` | `qwen3.7-plus` |
| Grok | `https://api.x.ai/v1` | `grok-4.5` |
| Kimi | `https://api.moonshot.ai/v1` | `kimi-k2.5` |

> Qwen API keys and endpoints are region-specific. If the preset does not match your account, copy the OpenAI-compatible endpoint from your Alibaba Cloud Model Studio workspace.

Any endpoint that implements the OpenAI `POST /chat/completions` API will work.

## Usage

1. Navigate to a job posting.
2. Open the sidebar. TailorCV auto-detects the job description (or paste it manually).
3. Upload your resume (PDF or DOCX) once — it is parsed and stored locally.
4. Click **Optimize Resume**. Review the ATS score, gaps, and quick wins.
5. Optionally generate a cover letter, then export either as PDF or DOCX.

For illustrated installation, provider setup, résumé upload, scanning, and optimization steps, see [GETTING_STARTED.md](GETTING_STARTED.md).

## Development

Requirements: Node.js 20.16+ (Node.js 22 or 24 LTS is also supported).

```bash
npm install
npm run dev      # Vite watch build into dist/
npm run build    # production build into dist/
npm run test:e2e # Playwright end-to-end tests
```

Load the `dist/` folder as an unpacked extension (see [Install](#install-load-unpacked)). `npm run dev` rebuilds on change; reload the extension in `chrome://extensions` to pick up changes.

### Architecture

- **Manifest V3** extension. React 18 + TypeScript, Tailwind CSS, built with Vite.
- **Content script** injects a Shadow-DOM sidebar on supported job boards ([`src/content`](src/content)).
- **Service worker** ([`src/background/service-worker.ts`](src/background/service-worker.ts)) is the AI client: it reads provider configuration from extension storage, builds prompts, and calls only the configured provider endpoint. It also parses PDF/DOCX locally (pdfjs, mammoth).
- **Library** ([`src/lib`](src/lib)) holds the ATS scoring engine, resume parser, job scrapers, and document generators.
- The resume-optimization system prompt lives in the service worker and is shipped in the bundle — it is open source, not a secret.

### Privacy

See [PRIVACY.md](PRIVACY.md) for the exact data sent by each action. This project has no backend, accounts, telemetry, or analytics and receives none of your data.

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## Releases

See [CHANGELOG.md](CHANGELOG.md) for version history and release notes.

## License

[MIT](LICENSE) © TailorCV Contributors
