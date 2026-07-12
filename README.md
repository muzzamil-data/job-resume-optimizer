# TailorCV

An open-source Chrome extension that tailors your resume to any job posting and drafts a matching cover letter — using **your own AI API key**, running **entirely in your browser**.

There is no account, no backend, and no subscription. You download the extension, load it, paste an API key from any OpenAI-compatible provider, and everything runs locally against your key.

## Features

- **One-click resume optimization** for the job posting on the page (LinkedIn, Indeed, Greenhouse, Lever, Workday, and more).
- **ATS scoring** computed locally — keyword coverage, title match, experience relevance, achievements, education/certs.
- **Cover letter generation** in four tones.
- **PDF & DOCX export** of the optimized resume and cover letter.
- **Bring your own key** — works with any OpenAI-compatible endpoint (OpenAI, OpenRouter, Groq, local models via Ollama/LM Studio, etc.).
- **Fully local** — your resume, history, and key live only in `chrome.storage.local`. Resume text is sent only to the AI endpoint you configure.

## Install (load unpacked)

1. Clone this repo and build it (see [Development](#development)), or download a packaged `dist/` folder.
2. Open `chrome://extensions` in Chrome (or any Chromium browser).
3. Toggle **Developer mode** on (top right).
4. Click **Load unpacked** and select the `dist/` folder.
5. Pin the TailorCV icon to your toolbar.

## Configure your API key

1. Open a job posting, click the TailorCV icon (or the floating button) to open the sidebar.
2. Go to **Settings**.
3. Pick a provider preset (or type a custom **Base URL**), paste your **API key**, and enter a **Model** name.
4. Click **Test connection**, then **Save**.

Common setups:

| Provider | Base URL | Example model |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| OpenRouter | `https://openrouter.ai/api/v1` | `anthropic/claude-haiku-4.5` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| Ollama (local) | `http://localhost:11434/v1` | `llama3.1` |

Any endpoint that implements the OpenAI `POST /chat/completions` API will work.

## Usage

1. Navigate to a job posting.
2. Open the sidebar. TailorCV auto-detects the job description (or paste it manually).
3. Upload your resume (PDF or DOCX) once — it is parsed and stored locally.
4. Click **Optimize Resume**. Review the ATS score, gaps, and quick wins.
5. Optionally generate a cover letter, then export either as PDF or DOCX.

## Development

Requirements: Node.js 18+.

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
- **Service worker** ([`src/background/service-worker.ts`](src/background/service-worker.ts)) is the AI client: it reads your provider config from `chrome.storage.local`, builds the prompts, and calls your endpoint's `/chat/completions`. It also parses PDF/DOCX locally (pdfjs, mammoth).
- **Library** ([`src/lib`](src/lib)) holds the ATS scoring engine, resume parser, job scrapers, and document generators.
- The resume-optimization system prompt lives in the service worker and is shipped in the bundle — it is open source, not a secret.

### Privacy

See [PRIVACY.md](PRIVACY.md). In short: everything is local except the resume and job text that go directly to the AI provider you choose. This project operates no servers and receives none of your data.
