# Quick Start Guide

Get your Job Resume Optimizer extension running in 5 minutes!

## Prerequisites

- Node.js 18+ installed ([download here](https://nodejs.org/))
- Google Chrome browser
- Claude API key ([get one here](https://console.anthropic.com))

## Installation (5 steps)

### 1. Install Dependencies

```bash
cd job-resume-optimizer
npm install
```

### 2. Build the Extension

```bash
npm run build
```

The build command compiles TypeScript, processes Tailwind CSS, and outputs everything to `dist/`.

### 3. Load in Chrome

1. Open Chrome
2. Go to `chrome://extensions/`
3. Toggle "Developer mode" ON (top right)
4. Click "Load unpacked"
5. Select the `dist` folder
6. Done!

### 4. Get API Key

1. Visit [console.anthropic.com](https://console.anthropic.com)
2. Create account (free tier available)
3. Click "Get API Keys"
4. Create new key
5. Copy the key (starts with `sk-ant-...`)

### 5. Test It Out

1. Visit any job posting (try [LinkedIn Jobs](https://www.linkedin.com/jobs/))
2. Click the extension icon in Chrome toolbar
3. Click "Open Optimizer"
4. Upload a test resume (PDF or DOCX)
5. Enter your API key in Settings
6. Click "Optimize Resume"
7. Wait 15–30 seconds — the AI is doing deep ATS analysis

> **Note:** In development mode the extension starts with **100 test credits** so you can test freely without purchasing.

## First-Time Setup

### Upload Your Master Resume

Your "master resume" is your complete, unoptimized resume with all your experience. The extension will tailor it for each job.

**Best practices:**
- Include ALL your experience and skills
- Use bullet points with numbers/metrics where possible
- Keep formatting simple (no tables, images, text boxes)
- DOCX files parse more reliably than PDF

### Set Your API Key

1. Click extension icon
2. Click "Open Optimizer"
3. Click the Settings gear icon
4. Paste your API key
5. Click "Save"

**Your API key is stored locally in Chrome storage — we never see it.**

## Usage Flow

```
1. Find a job posting
   ↓
2. Click extension icon → "Open Optimizer"
   ↓
3. Review auto-detected job info
   (or use "Paste Job Description" if auto-detect fails)
   ↓
4. Click "Optimize Resume"
   ↓
5. Wait 15–30 seconds (loading spinner shows progress)
   ↓
6. Review: ATS score breakdown, keyword matches, Quick Wins
   ↓
7. Download PDF or DOCX
   ↓
8. Apply to job!
```

## Understanding the Results

### ATS Score (0–100)

The score is broken into 5 components:

| Component | Max | What it measures |
|-----------|-----|-----------------|
| ATS Keywords | 30 | % of JD power keywords in resume |
| Title Match | 20 | How closely resume title matches JD title |
| Experience Relevance | 25 | How well experience maps to JD responsibilities |
| Achievements | 15 | Bullets with specific metrics |
| Education/Certs | 10 | Meets stated education/cert requirements |

### Quick Wins

Below the score you'll see up to 3 "Quick Wins" — specific, actionable phrases to add to your resume to close keyword gaps. Each one names exact words lifted from the job description.

### Core Competencies

The optimized resume includes a Core Competencies section with 12–15 keyword phrases taken directly from the JD, ordered by importance.

## Troubleshooting

### Extension won't load
Make sure you built the extension first (`npm run build`) and selected the `dist` folder, not the project root.

### Sidebar doesn't appear
Refresh the page and try again. If on a login-walled page, the extension cannot inject.

### Blank white screen after clicking Optimize
The Error Boundary will catch the issue and display an error message with a "Try again" button. If it persists, check your API key in Settings.

### API calls fail
1. Check API key is correct (starts with `sk-ant-...`)
2. Verify you have API credits at [console.anthropic.com](https://console.anthropic.com)
3. Open Chrome DevTools → Console for the exact error

### Job detection doesn't work
Click "Paste Job Description" and paste the job description text manually.

### Resume parsing issues
1. Try DOCX instead of PDF
2. Simplify resume formatting (remove tables/images)
3. Keep file size under 10 MB

## Development Mode

```bash
# Run in dev mode (auto-reload on changes)
npm run dev

# Make changes to files in src/

# Reload extension in chrome://extensions/
# (Click reload icon on extension card)
```

## Credits

### Development / Test Mode
You start with **100 test credits** — no setup required. These reset on every extension update.

### Production Packs
| Pack | Price | Credits |
|------|-------|---------|
| Basic | $4.99 | 12 |
| Pro | $9.99 | 30 (most popular) |
| Power | $19.99 | 75 (best value) |

Credits never expire.

## Tips for Best Results

### Resume Tips
- Include numbers and metrics in bullet points
- Use action verbs
- List all relevant skills, tools, and certifications
- Avoid tables, text boxes, and uncommon fonts

### Job Detection Tips
- Works best on: LinkedIn, Indeed, Greenhouse, Lever
- Let the page fully load before opening the extension
- Use "Paste Job Description" on unknown or gated sites

### Optimization Tips
- Review the Quick Wins section and apply the suggestions manually to raise your score further
- Check that experience bullets weren't fabricated — the AI only rewrites, never invents
- Use the cover letter as a starting point, personalize before sending

## Support

- Email: support@resumeoptimizer.com
- Discord: [Join community](https://discord.gg/resumeoptimizer)
- Bug reports: [GitHub Issues](https://github.com/yourusername/job-resume-optimizer/issues)

---

**That's it! You're ready to apply to jobs 5x faster.**

Good luck with your job search!
