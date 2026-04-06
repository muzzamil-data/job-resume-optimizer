# Job Resume Optimizer - Chrome Extension

AI-powered resume optimizer and cover letter generator for job applications. Apply to 5x more jobs in the same time!

## Features

- **One-Click Resume Optimization** - Automatically tailors your resume to any job posting
- **ATS-Friendly Formatting** - Ensures your resume passes Applicant Tracking Systems
- **JD-Aligned Content Filtering** - Removes irrelevant skills, bullets, and certifications; keeps only what matches the role
- **Cover Letter Generation** - Creates personalized cover letters with 4 tone options (Professional, Enthusiastic, Technical, Creative)
- **Cover Letter Export** - Download cover letters as PDF or DOCX
- **Core Competencies Section** - Auto-generates 12–15 JD-matched keyword phrases after your summary
- **Multi-Platform Support** - Works on LinkedIn, Indeed, Greenhouse, Lever, and more
- **Shadow DOM Isolation** - Extension UI never conflicts with host page styles
- **Error Boundary** - Catches rendering errors and shows a recovery screen instead of blank white
- **Auto-Retry on API Overload** - Automatically retries on 529/429 errors (up to 3 attempts)
- **Encrypted Local Storage** - Resume data encrypted with AES-GCM-256 at rest
- **Credit-Based Pricing** - Pay only for what you use, credits never expire
- **PDF & DOCX Export** - Download optimized resumes in both formats

## Pricing

| Pack | Price | Credits | Bonus | Total |
|------|-------|---------|-------|-------|
| Free | $0 | 3 | 0 | 3 |
| Basic | $4.99 | 10 | 2 | 12 |
| Pro | $9.99 | 25 | 5 | 30 |
| Power | $19.99 | 60 | 15 | 75 |

**1 Credit = 1 Optimized Resume + 1 Cover Letter + Downloads**

> **Development mode:** The extension starts with **100 test credits** so you can test without purchasing.

## Development Setup

### Prerequisites

- Node.js 18+ and npm
- Claude API key from [console.anthropic.com](https://console.anthropic.com)

### Installation

```bash
# Clone the repository
cd job-resume-optimizer

# Install dependencies
npm install

# Build the extension
npm run build

# For development with hot reload
npm run dev
```

### Loading in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `dist` folder from the project

## Usage

### First-Time Setup

1. Click the extension icon in your Chrome toolbar
2. Upload your master resume (PDF or DOCX)
3. Enter your Claude API key in Settings
4. You're ready to go!

### Optimizing a Resume

1. Navigate to any job posting page
2. Click the extension icon or the floating notification
3. Review the auto-detected job description
4. Click "Optimize Resume" (uses 1 credit)
5. Wait 15–30 seconds for AI optimization
6. Download as PDF or DOCX

### API Key Setup

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create an account or sign in
3. Navigate to API Keys
4. Create a new API key
5. Copy and paste into extension Settings

## Project Structure

```
job-resume-optimizer/
├── src/
│   ├── background/          # Service worker
│   │   └── service-worker.ts
│   ├── content/             # Content scripts
│   │   ├── index.tsx        # Sidebar injection (Shadow DOM)
│   │   └── sidebar.tsx      # Main UI component + ErrorBoundary
│   ├── lib/                 # Core logic
│   │   ├── ai-service.ts    # Claude API integration
│   │   ├── resume-parser.ts # PDF/DOCX parsing
│   │   ├── job-scraper.ts   # Job description extraction
│   │   ├── document-generator.ts # PDF/DOCX generation
│   │   ├── storage.ts       # Chrome storage wrapper
│   │   └── utils.ts         # Utility functions + credit packs
│   ├── types/               # TypeScript types
│   │   └── index.ts
│   └── styles/              # CSS
│       ├── globals.css
│       └── content.css
├── manifest.json            # Extension manifest (v1.0.1)
├── package.json
└── README.md
```

## Tech Stack

- **Frontend**: React 18 + TypeScript
- **Build Tool**: Vite + vite-plugin-web-extension
- **Styling**: Tailwind CSS (Shadow DOM isolated)
- **AI**: Anthropic Claude API (claude-haiku-4-5-20251001)
- **Document Generation**: docx, jsPDF
- **Resume Parsing**: mammoth (DOCX), pdfjs-dist + pdf-parse (PDF)

## How It Works

1. **Job Detection**: Scrapes job title, company, and description from the current page using AI
2. **Resume Parsing**: Extracts structured data from uploaded resume (PDF or DOCX)
3. **AI Optimization**: Sends resume + job description to Claude API with expert ATS prompt
4. **ATS Scoring**: 5-component score — keywords (30 pts), title match (20 pts), experience relevance (25 pts), achievements (15 pts), education/certs (10 pts)
5. **Core Competencies**: Generates 12–15 keyword phrases ordered by JD importance
6. **Quick Wins**: Suggests the highest-impact fixes to raise ATS score further
7. **Document Generation**: Creates professionally formatted PDF/DOCX files

## Privacy & Security

- Your resume data is stored **locally** in your browser
- API calls are made directly to Anthropic (no third-party servers)
- Your API key is stored in Chrome's local storage
- No data is collected or sent to our servers
- Message sender validation prevents cross-extension injection
- Input sanitization prevents prompt injection attacks

## API Costs

Using Claude Haiku (claude-haiku-4-5-20251001):
- Input: $0.25 per million tokens
- Output: $1.25 per million tokens
- **Average cost per optimization: $0.001 – $0.003**

Example: At $9.99 for 30 credits, your actual API cost is ~$0.09, leaving $9.90 profit margin (99% margin!)

## Roadmap

- [ ] **v1.1**: Application tracker with follow-up reminders
- [ ] **v1.2**: Browser extension for other browsers (Firefox, Safari)
- [ ] **v1.3**: LinkedIn integration (auto-fill applications)
- [ ] **v1.4**: Interview preparation based on resume + job description
- [ ] **v2.0**: Team features for career coaches and recruiters

## Known Issues

- PDF parsing may not work perfectly on complex layouts (use DOCX for best results)
- Some job sites have anti-scraping measures (use manual paste fallback)

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see LICENSE file for details

## Acknowledgments

- Built with [Claude](https://www.anthropic.com) by Anthropic
- Icons from [Lucide](https://lucide.dev)
- Inspired by the pain of tailoring resumes for every job application

## Support

- GitHub Issues: [Report a bug](https://github.com/yourusername/job-resume-optimizer/issues)

---

Made with love for job seekers everywhere
