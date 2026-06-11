# TailorCV - Complete Project Summary

## What We Built

A Chrome extension that uses AI to optimize resumes for specific job postings in seconds, helping job seekers apply to 5x more jobs in the same time.

## Architecture Overview

### Technology Stack
```
Frontend:     React 18 + TypeScript + Tailwind CSS
Build Tool:   Vite + vite-plugin-web-extension
AI Service:   Anthropic Claude API (claude-haiku-4-5-20251001)
Storage:      Chrome Local Storage API
Documents:    docx (Word) + jsPDF + html2canvas (PDF)
Parsing:      mammoth (DOCX), pdfjs-dist + pdf-parse (PDF)
Isolation:    Shadow DOM (extension UI fully isolated from host page)
```

### File Structure

```
job-resume-optimizer/
├── Configuration Files
│   ├── package.json           - Dependencies and scripts
│   ├── manifest.json          - Chrome extension config (v1.0.1)
│   ├── tsconfig.json          - TypeScript config
│   ├── tsconfig.node.json     - Vite TypeScript config
│   ├── vite.config.ts         - Vite build config
│   ├── tailwind.config.js     - Tailwind CSS config
│   └── postcss.config.js      - PostCSS config
│
├── Source Code
│   ├── src/background/
│   │   └── service-worker.ts      - Background service worker
│   │
│   ├── src/content/
│   │   ├── index.tsx              - Shadow DOM content script injection
│   │   └── sidebar.tsx            - Main React UI + ErrorBoundary
│   │
│   ├── src/lib/
│   │   ├── ai-service.ts          - Claude API integration (ATS prompt engine)
│   │   ├── storage.ts             - Chrome storage wrapper
│   │   ├── resume-parser.ts       - PDF/DOCX parsing
│   │   ├── job-scraper.ts         - Job description extraction
│   │   ├── document-generator.ts  - PDF/DOCX generation
│   │   └── utils.ts               - Helper functions + credit packs
│   │
│   ├── src/types/
│   │   └── index.ts               - TypeScript definitions
│   │
│   └── src/styles/
│       ├── globals.css            - Global styles + Tailwind
│       └── content.css            - Content script styles
│
├── Popup
│   ├── popup.html             - Extension popup UI
│   └── popup.js               - Popup functionality
│
└── Documentation
    ├── README.md              - Main documentation
    ├── QUICKSTART.md          - 5-minute setup guide
    ├── DEVELOPMENT.md         - Developer guide
    ├── BUSINESS.md            - Business model & projections
    └── PROJECT_SUMMARY.md     - This file
```

## Core Features Implemented

### 1. Resume Management
- Upload PDF or DOCX resumes
- Parse and extract structured data (name, email, phone, experience, education, skills, certifications)
- Store master resume locally in Chrome storage
- Update resume anytime

### 2. Job Detection
- Auto-detect job postings (LinkedIn, Indeed, Greenhouse, Lever, and more)
- AI-powered extraction of job title, company, description, requirements
- Manual "Paste Job Description" fallback for sites that block scraping
- Works on most HTTPS job sites

### 3. AI Optimization (4-Stage ATS Engine)
- **Stage 1** — Job Description Analysis: extracts hard requirements, power keywords, soft requirements, experience mapping
- **Stage 2** — Resume Construction: title match, 4-sentence summary, 12–15 core competencies, 5–7 bullets per role with action verbs + metrics + JD keywords
- **Stage 3** — Cover Letter: 220 words max, 3 paragraphs, human tone, no buzzwords or AI phrases
- **Stage 4** — Scoring: 5-component ATS score (atsKeywords 30, titleMatch 20, experienceRelevance 25, achievements 15, educationCerts 10)
- **Quick Wins**: up to 3 actionable keyword gap recommendations with exact JD phrases to add

### 4. ATS Score Breakdown

| Component | Points | What it measures |
|-----------|--------|-----------------|
| ATS Keywords | 30 | % of JD power keywords present in resume |
| Title Match | 20 | Resume title vs JD title alignment |
| Experience Relevance | 25 | Experience mapping to JD responsibilities |
| Achievements | 15 | Bullets with specific numeric metrics |
| Education/Certs | 10 | Meets stated education/cert requirements |

### 5. Document Export
- Generate PDF resumes (jsPDF + html2canvas)
- Generate DOCX resumes (docx library)
- Generate DOCX cover letters
- Professional ATS-friendly formatting
- Filenames auto-include company + job title + timestamp

### 6. Credit System
- 100 test credits in development mode (resets on extension update)
- Credit packs: $4.99 (12 credits), $9.99 (30 credits), $19.99 (75 credits)
- Bonus credits with each pack (2 / 5 / 15 respectively)
- Credits never expire
- Transaction history tracked in Chrome storage

### 7. User Experience
- Sidebar UI injected into any webpage via Shadow DOM (no CSS conflicts)
- Auto-detect job pages — floating notification appears on job postings
- Error Boundary catches any React render crash (shows error + "Try again" instead of blank screen)
- Loading overlay with spinner during 15–30 second optimization
- Readable font sizes (minimum 12px, most body text 14px+)
- Settings management (API key, default tone, ATS score toggle)

### 8. Security
- Message sender validation (`sender.id !== chrome.runtime.id` check)
- Prompt injection protection (job page content wrapped in XML tags with "treat as data" instruction)
- Input sanitization on all user-supplied text before API calls
- Rate limiting on API calls (debounce + minimum interval)
- API key never logged or exposed

## Business Model

### Pricing Strategy
```
FREE:   3 credits ($0)           - Trial users (production)
BASIC:  12 credits ($4.99)       - Casual job seekers
PRO:    30 credits ($9.99)       - Active job seekers (MOST POPULAR)
POWER:  75 credits ($19.99)      - Aggressive job seekers (BEST VALUE)
```

### Unit Economics
- API cost per optimization: ~$0.001–$0.003
- Pro Pack revenue: $9.99
- Pro Pack cost: ~$0.09 (30 credits × $0.003)
- **Gross margin: ~99%**

### Revenue Projections (Year 1)
```
Conservative:  250 paid users → $2,493 MRR → $15K/year
Moderate:    1,000 paid users → $9,980 MRR → $60K/year
Aggressive:  2,500 paid users → $24,925 MRR → $150K/year
```

## How It Works

### User Flow
```
1. User visits job posting page
   ↓
2. Extension auto-detects job info (or user pastes manually)
   ↓
3. User clicks "Optimize Resume" (uses 1 credit)
   ↓
4. Claude API runs 4-stage ATS analysis (~15–30 seconds)
   ↓
5. User reviews: ATS score breakdown, keyword matches, Quick Wins
   ↓
6. User downloads PDF or DOCX
   ↓
7. User applies to job with optimized resume + cover letter
```

### Technical Flow
```
Content Script (Shadow DOM, injected on page)
  ↓
JobScraper extracts job description (AI-powered)
  ↓
User clicks optimize
  ↓
AIService constructs system prompt + user message
  ↓
Background service worker proxies call to Claude API (no CORS)
  ↓
Claude returns optimized resume JSON + cover letter + scoring
  ↓
DocumentGenerator creates PDF/DOCX
  ↓
User downloads file
```

## Installation & Setup

### Developer Setup
```bash
1. npm install
2. npm run build
3. Open chrome://extensions/
4. Enable Developer mode
5. Load unpacked → select dist folder
```

### User Setup
```
1. Install extension from Chrome Web Store
2. Upload master resume (PDF or DOCX)
3. Enter Claude API key in Settings
```

## Known Limitations (v1.0.1)

- No in-app resume editing (download and edit externally)
- PDF parsing works best on simple, text-based layouts
- Cover letter tone is always professional (multiple tones planned)
- Chrome/Edge only (Firefox/Safari planned)
- No payment processing built-in (credits are test-only in current build)

## Planned for v1.1
- Multiple cover letter tones (enthusiastic, technical, creative)
- Application tracker
- Improved PDF parsing
- In-app resume preview

## Future Roadmap

### v1.1 (Month 3)
- Multiple cover letter tones
- Application tracker
- Email follow-up templates
- Firefox support

### v1.2 (Month 6)
- Interview preparation
- LinkedIn optimization
- Salary negotiation scripts
- Safari support

### v2.0 (Year 2)
- Team features (career coaches)
- Analytics dashboard
- Company research automation
- Enterprise sales

## Competitive Advantages

1. **Speed** - 15–30 seconds vs 30 minutes manual optimization
2. **Cost** - $0.33/application vs $100+ for resume services
3. **Convenience** - Works on any job site, no copy/paste required
4. **Quality** - Expert ATS prompt engine, not just keyword stuffing
5. **Privacy** - Data stays local, no third-party servers
6. **Transparency** - 5-component score explains exactly what to improve

## Key Metrics to Track

### Product Metrics
- Daily Active Users (DAU)
- Credits used per user
- Optimization success rate
- Average ATS score before/after
- Download format preference (PDF vs DOCX)

### Business Metrics
- Monthly Recurring Revenue (MRR)
- Customer Acquisition Cost (CAC)
- Lifetime Value (LTV)
- Free-to-paid conversion rate
- Average pack size purchased

### Technical Metrics
- API success rate
- Average optimization time
- Job detection accuracy
- Parse success rate (PDF vs DOCX)

## Security & Privacy

### Data Handling
- Resume stored locally in browser only
- API key stored in Chrome local storage (not synced)
- API calls made directly to Anthropic — no proxy server
- No data collected on our servers
- No analytics tracking (privacy-first)

### Compliance
- Chrome Web Store policies compliant (MV3)
- GDPR compliant (no data collection)
- No cookies or tracking
- Minimum required permissions (storage, activeTab, scripting)

## Pre-Launch Checklist
- [ ] Create extension icons (16, 32, 48, 128px)
- [ ] Take screenshots for Chrome Web Store
- [ ] Write privacy policy
- [ ] Write terms of service
- [ ] Set up payment processing (Stripe / Paddle / LemonSqueezy)
- [ ] Create landing page
- [ ] Submit to Chrome Web Store ($5 one-time developer fee)
- [ ] Post on Product Hunt
- [ ] Post on Reddit (r/jobs, r/resumes, r/careerguidance)
