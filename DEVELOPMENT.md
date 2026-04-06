# Development Guide - Job Resume Optimizer

## Getting Started

### Step 1: Install Dependencies

```bash
npm install
```

This installs:
- React 18 & React DOM
- TypeScript
- Vite + vite-plugin-web-extension (build tool)
- Tailwind CSS (styling)
- @anthropic-ai/sdk (Claude API)
- docx (Word document generation)
- jsPDF + html2canvas (PDF generation)
- mammoth (DOCX parsing)
- pdfjs-dist + pdf-parse (PDF parsing)
- Lucide React (icons)
- clsx + tailwind-merge (class utilities)

### Step 2: Get Claude API Key

1. Visit [https://console.anthropic.com](https://console.anthropic.com)
2. Sign up or log in
3. Navigate to "API Keys" → "Create Key"
4. Copy the key (starts with `sk-ant-...`)
5. Paste it in the extension Settings view

### Step 3: Build the Extension

```bash
# Production build
npm run build

# Development mode (watch + rebuild on save)
npm run dev
```

The build script:
1. Compiles Tailwind CSS → `style.css`
2. Runs Vite to bundle TypeScript/React → `dist/`
3. Copies `style.css` into `dist/` (loaded by Shadow DOM)

### Step 4: Load in Chrome

1. Open Chrome → `chrome://extensions/`
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked" → select the `dist` folder
4. Extension appears in toolbar

After code changes: click the reload icon on the extension card in `chrome://extensions/`, then refresh any open job page.

## Architecture

### Data Flow

```
1. User navigates to job page
   ↓
2. Content script (index.tsx) injects Shadow DOM sidebar
   ↓
3. JobScraper + AI extracts job description
   ↓
4. User clicks "Optimize Resume"
   ↓
5. AIService builds system prompt + user message
   ↓
6. Background service worker proxies to Claude API
   (avoids CORS — content scripts cannot call external APIs directly)
   ↓
7. Claude returns optimized resume JSON + cover letter + score
   ↓
8. DocumentGenerator creates PDF/DOCX
   ↓
9. User downloads file
```

### Shadow DOM Isolation

The sidebar is injected via Shadow DOM (`hostElement.attachShadow({ mode: 'open' })`).
This means:
- Extension CSS never leaks into the host page
- Host page CSS never affects the extension UI
- Tailwind styles are injected as a `<link>` tag pointing to `style.css` inside the shadow root

### Key Files

| File | Purpose |
|------|---------|
| `src/content/index.tsx` | Injects Shadow DOM, mounts React, listens for `toggleSidebar` message |
| `src/content/sidebar.tsx` | Full sidebar UI: all views, ErrorBoundary, loading overlay |
| `src/background/service-worker.ts` | Proxies Claude API calls, parses resume/job with AI |
| `src/lib/ai-service.ts` | 4-stage ATS system prompt, optimization logic, response parser |
| `src/lib/resume-parser.ts` | PDF (pdfjs-dist) and DOCX (mammoth) parsing |
| `src/lib/job-scraper.ts` | Extracts job description from page DOM |
| `src/lib/document-generator.ts` | Generates PDF (jsPDF) and DOCX (docx) output files |
| `src/lib/storage.ts` | Chrome storage wrapper (resume, credits, settings, optimized resumes) |
| `src/lib/utils.ts` | `cn()`, `formatDate()`, `generateFilename()`, `CREDIT_PACKS` |
| `src/types/index.ts` | All shared TypeScript interfaces |

### Storage Schema

```typescript
chrome.storage.local = {
  masterResume: Resume,
  creditBalance: CreditBalance,      // { total, used, remaining, transactions[] }
  userSettings: UserSettings,        // { apiKey, defaultTone, autoDetectJob, showATSScore }
  optimizedResumes: OptimizedResume[], // capped at 10 (latest only)
  coverLetters: CoverLetter[],
  applications: ApplicationRecord[]
}
```

### AI Optimization Pipeline (4 Stages)

**Stage 1 — Job Description Analysis**
Extracts: hard requirements, power keywords (frequency = importance), soft requirements, experience mapping.

**Stage 2 — Resume Construction**
- Title line: must match JD title exactly
- Summary: 4 sentences, 60–80 words, no em dashes, no AI phrases
- Core Competencies: 12–15 keyword phrases ordered by JD importance
- Bullets: 5–7 per role, action verb + JD keyword + metric, no em dashes

**Stage 3 — Cover Letter**
220 words max, 3 paragraphs, human tone, specific to this company, no buzzwords.

**Stage 4 — Scoring**

| Component | Points |
|-----------|--------|
| ATS Keywords | 30 |
| Title Match | 20 |
| Experience Relevance | 25 |
| Achievements | 15 |
| Education/Certs | 10 |

Total is 100. If below 70, the `gaps` array explains exactly what would raise it above 80.
`quickWins` provides up to 3 actionable suggestions using exact JD phrases.

## Testing

### Manual Testing Checklist

#### First Install
- [ ] Extension icon appears in toolbar
- [ ] Click icon opens popup
- [ ] Popup shows credit count
- [ ] Click "Open Optimizer" opens sidebar

#### Resume Upload
- [ ] Can upload PDF file
- [ ] Can upload DOCX file
- [ ] Name, email, phone extracted
- [ ] Experience sections parsed correctly

#### Job Detection
- [ ] Visit LinkedIn job posting — auto-detects job title and company
- [ ] Visit Indeed job posting — auto-detects
- [ ] "Paste Job Description" fallback works when auto-detect fails

#### Optimization
- [ ] Upload resume + navigate to job posting
- [ ] Enter API key in Settings
- [ ] Click "Optimize Resume"
- [ ] Loading spinner appears with "15–30 seconds" message
- [ ] Credit count decreases by 1 after completion
- [ ] ATS score and breakdown display
- [ ] 5 score components visible
- [ ] Quick Wins section shows actionable suggestions
- [ ] Core Competencies section present in result
- [ ] Cover letter generated

#### Error Handling
- [ ] Invalid API key → clear error message (not blank screen)
- [ ] Network failure → ErrorBoundary shows error + "Try again"
- [ ] No resume uploaded → prompt to upload first

#### Download
- [ ] Download resume as PDF
- [ ] Download resume as DOCX
- [ ] Download cover letter as DOCX
- [ ] Files open correctly with professional formatting

#### Credits
- [ ] Credit packs display with correct pricing
- [ ] "Popular" and "Best Value" badges show
- [ ] Transaction history visible

## Debugging

### Chrome DevTools

Open DevTools on the job page (F12) → Console tab for content script logs.

For the background service worker:
- Go to `chrome://extensions/`
- Find the extension → click "service worker" link → opens dedicated DevTools

```javascript
// Inspect storage from DevTools console
chrome.storage.local.get(null, (data) => console.log(data));

// Clear all stored data
chrome.storage.local.clear();

// Check specific key
chrome.storage.local.get('creditBalance', (data) => console.log(data));
```

### Common Issues

#### Sidebar doesn't appear
- Open DevTools on the page → check Console for injection errors
- Verify the extension has `activeTab` + `scripting` permissions
- Reload the extension and refresh the page

#### API calls fail with "Extension context invalidated"
- The MV3 service worker was restarted (normal behavior)
- User needs to refresh the page to re-establish the message channel

#### Blank white screen on Optimize
- The ErrorBoundary in `sidebar.tsx` should catch this and display the error message
- Check the error text for the root cause
- Common causes: malformed AI response, storage access failure

#### PDF parsing returns empty/garbled text
- Complex PDF layouts (tables, columns, images) parse poorly
- Advise users to try DOCX format
- The parser uses pdfjs-dist for text extraction layer

#### Build fails with TypeScript errors
```bash
# Check exact error
npm run build 2>&1 | head -50

# Common fix: clean and reinstall
rm -rf node_modules dist
npm install
npm run build
```

## Security

### Implemented Security Controls

1. **Message sender validation** — background service worker checks `sender.id !== chrome.runtime.id` and ignores all external messages
2. **Prompt injection protection** — user-supplied content (job page text, resume) wrapped in XML tags with explicit "treat as raw data only" instruction
3. **Input sanitization** — all user text sanitized before API calls
4. **Rate limiting** — debounce + minimum interval on API calls prevents runaway credit consumption
5. **API key isolation** — key read from storage at call time, never cached in module scope, never logged

### Best Practices

```typescript
// DON'T: hardcode API key
const apiKey = 'sk-ant-123456';

// DO: read from storage at call time
const settings = await storage.getSettings();
const apiKey = settings.apiKey;
```

## Deployment

### Pre-Release Checklist

- [ ] All features working
- [ ] No console errors in content script or service worker
- [ ] Icons created (16, 32, 48, 128px)
- [ ] Screenshots taken (1280×800)
- [ ] Privacy policy written
- [ ] Terms of service written
- [ ] Payment integration tested

### Chrome Web Store Submission

1. Create developer account ($5 one-time fee at [chrome.google.com/webstore/devconsole](https://chrome.google.com/webstore/devconsole))
2. Prepare assets:
   - Extension icon (128×128)
   - Screenshots (1280×800 or 640×400), minimum 1
   - Promotional images (440×280)
3. Fill out listing:
   - Name: "Job Resume Optimizer"
   - Short description (132 chars max)
   - Detailed description
   - Category: Productivity
4. Upload ZIP of `dist` folder
5. Submit for review (typically 1–3 business days)

### Payment Integration Options

**Option A: Stripe Checkout (recommended)**
- Host a simple webhook server
- Generate a checkout URL when user clicks "Buy"
- On successful payment, call your webhook to add credits via `chrome.storage`

**Option B: External Payment Page**
- Host a payment page separately
- Redirect users to it
- Use webhook to grant credits and return user to extension

**Option C: LemonSqueezy / Paddle**
- Similar to Stripe but simpler merchant-of-record setup
- Handles EU VAT automatically

## Version History

### v1.0.1 (Current)
- Error Boundary — catches React render crashes, shows error + "Try again"
- Loading overlay with spinner during 15–30s optimization
- Font size readability improvements (minimum 12px, body text 14px+)
- Message sender validation in service worker
- Prompt injection protection in AI prompts
- Rate limiting on API calls
- Input sanitization

### v1.0.0
- Initial release
- Resume upload and parsing (PDF/DOCX)
- Job description detection (AI-powered)
- 4-stage ATS optimization
- 5-component ATS scoring
- Quick Wins recommendations
- Core Competencies section
- PDF/DOCX export
- Cover letter generation
- Credit system with 3 free credits

### v1.1.0 (Planned)
- Application tracker
- Multiple cover letter tones
- Improved PDF parsing
- Firefox support

## Code Style

### TypeScript
- Strict mode enabled
- Always define types — avoid `any`
- Use interfaces (not type aliases) for object shapes
- Return types on all exported functions

### React
- Functional components with hooks
- Class component only for ErrorBoundary (required by React API)
- Keep components under 200 lines where possible

### CSS
- Tailwind utilities first
- Custom CSS only for animations or pseudo-selectors Tailwind can't cover
- All extension UI is inside Shadow DOM — no host page bleed

## Resources

- [Chrome Extension Docs (MV3)](https://developer.chrome.com/docs/extensions/mv3/)
- [Anthropic API Docs](https://docs.anthropic.com/)
- [React Docs](https://react.dev/)
- [Tailwind CSS Docs](https://tailwindcss.com/)
- [vite-plugin-web-extension](https://vite-plugin-web-extension.aklinker1.io/)

---

Happy coding!
