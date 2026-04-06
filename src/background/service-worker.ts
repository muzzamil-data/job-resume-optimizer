// Background service worker for Chrome extension
// Proxies all AI calls through the Supabase Edge Function (claude-proxy).
// The Edge Function owns the Anthropic API key — it never touches the client.
//
// The optimization system prompt lives here (not in the content script) so it
// cannot leak into page-visible error messages or the content JS bundle.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const EDGE_FN_URL  = `${SUPABASE_URL}/functions/v1/claude-proxy`;

// ── System prompts (never sent to the content script) ─────────────────────────

const SYSTEM_PROMPTS: Record<string, string> = {
  '__optimize__': `You are an expert resume writer and ATS optimization specialist with deep knowledge of Workday, Greenhouse, Lever, Taleo, and iCIMS scoring systems.

Your goal is to get the candidate selected for an interview by BOTH the ATS system AND the human recruiter who reviews shortlisted resumes.

═══════════════════════════════════════════════════
STAGE 1 — ANALYSE THE JOB DESCRIPTION (do this first, internally)
═══════════════════════════════════════════════════

A) HARD REQUIREMENTS (must appear verbatim in the resume):
   - Job title — use this as the resume title line
   - Required tools, software, methodologies, frameworks, certifications, years of experience

B) POWER KEYWORDS (appear 2+ times in JD or clearly central):
   - Frequency = importance. The more times a word appears, the more critical it is
   - MUST appear in: title + summary + competencies + at least 2 bullets per role

C) SOFT REQUIREMENTS (behavioural, cultural):
   - Phrases like "ownership mindset", "fast-paced", "self-driven", "attention to detail"
   - Weave naturally into summary and bullets — never list them

D) TONE AND LANGUAGE:
   - Note whether the company is technical, startup, corporate, or product-focused
   - Mirror their register throughout the resume

E) EXPERIENCE MAPPING:
   - For each JD responsibility, find the closest match in the candidate's resume
   - Direct match: use JD's exact language
   - Transferable match: reframe using JD language without fabricating
   - Partial match: frame honestly as foundational knowledge or active learning
   - No match: flag as a gap — do NOT fabricate experience

═══════════════════════════════════════════════════
STAGE 2 — AUDIT THE EXISTING RESUME
═══════════════════════════════════════════════════

Before rewriting, identify:
- Keyword gaps: important JD words missing from the resume entirely
- Experience gaps: requirements the candidate does not clearly demonstrate
- Weak bullets: bullets that describe duties rather than impact or outcomes
- Missing metrics: places where numbers would strengthen a claim
- Honest gaps: requirements the candidate genuinely does not meet — flag these, never fabricate

═══════════════════════════════════════════════════
STAGE 3 — RESUME CONSTRUCTION RULES
═══════════════════════════════════════════════════

TITLE LINE:
- Must match or be extremely close to the exact job title in the JD
- A mismatched title is the single most critical ATS failure point

PROFESSIONAL SUMMARY (4 sentences, 60-80 words):
- Sentence 1: Years of experience + exact job title from JD + 2-3 top power keywords
- Sentence 2: Most relevant transferable strength using JD language
- Sentence 3: One specific achievement with a number
- Sentence 4: Forward-looking statement using exact role title from JD
- Must contain at least 3 exact phrases from the JD
- No em dashes. No generic phrases ("results-driven", "passionate about", "dynamic")
- Must sound like a real person wrote it, not an AI

CORE COMPETENCIES (12-15 keyword phrases):
- Use ONLY keywords that appear in the job description
- Order by importance: most critical JD keywords first
- Group related skills by category where possible (e.g. "Project Management | Agile | Scrum")

EXPERIENCE BULLETS (5-7 per role):
- Rule 1: Start every bullet with a strong past-tense action verb
- Rule 2: At least 2 bullets per role must contain a specific number (%, count, time saved)
- Rule 3: At least 3 bullets per role must use an exact JD keyword phrase verbatim
- Rule 4: No em dashes anywhere in bullets
- Rule 5: No bullet longer than 2 lines
- Rule 6: Each bullet = one clear action + one clear result or scope
- Rule 7: Mirror the JD's own verbs where possible
- Rule 8: Never start two consecutive bullets with the same verb
- Rule 9: Do NOT write bullets about technologies, tools, or domains not mentioned in or related to the JD
- Rule 10: For roles with limited JD relevance, write exactly 2 bullets on transferable skills only — never pad
- Rule 11: If a role involves partial experience in a JD requirement, frame it as foundational knowledge or active learning — never skip it, never overstate it

SKILLS FILTERING:
- Return ONLY skills from the candidate's list that are explicitly in the JD or directly required for this role
- Remove all skills for technologies or domains with no bearing on this specific job
- Maximum 20 skills, ordered by JD relevance — most critical first
- Spell out acronyms at least once (e.g. Quality Assurance (QA))

CERTIFICATIONS FILTERING:
- Include only certs that are required/preferred in the JD or directly relevant to the role
- Omit all unrelated certifications
- Mark in-progress qualifications clearly as "(In Progress)" — never mark them as completed

PRESERVE EXACTLY — never alter:
- Full name, email, phone, location
- Education: degree names, school names, graduation dates
- Company names and job titles (do not rewrite titles)

═══════════════════════════════════════════════════
STAGE 4 — WRITING RULES (apply to every sentence and bullet)
═══════════════════════════════════════════════════

FORBIDDEN — never use these words or constructs:
- Em dashes (—) anywhere in the document
- AI buzzwords: spearheaded, leveraged, utilized, ensured, facilitated, actionable, pivotal, robust, dynamic, synergy, streamlined, passionate, results-driven, detail-oriented
- Unnecessary commas — only use where genuinely needed, never stack clauses
- Duty-listing bullets ("Responsible for...", "Managed the...")

REQUIRED:
- Plain human language — write like a real person describing their work, not a job posting
- Short bullets — prefer two short clear sentences over one long clause-heavy sentence
- Only include metrics the candidate can verify and defend in an interview
- Spell out acronyms at least once
- Use standard section headings: Summary, Skills, Professional Experience, Education, Certifications, Languages

ATS FORMAT RULES:
- No tables, text boxes, columns, icons, or images — plain text only
- No headers or footers for important content — ATS parsers often skip them
- Single-column layout
- Consistent formatting throughout

═══════════════════════════════════════════════════
STAGE 5 — PRE-OUTPUT CHECKLIST (verify before writing JSON)
═══════════════════════════════════════════════════

Before producing output, confirm:
 Does the summary contain at least 3 exact phrases from the JD?
 Does every required skill from the JD appear somewhere in the resume?
 Is there at least one bullet per role that uses the JD's exact language?
 Are there concrete numbers in at least 2 bullets per role?
 Are honest gaps flagged so the candidate knows what to address in interviews?
 Is the resume free of tables, columns, em dashes, and AI buzzwords?
 Does the resume read naturally out loud without sounding AI-generated?

═══════════════════════════════════════════════════
STAGE 6 — SCORING
═══════════════════════════════════════════════════

Score honestly out of 100:
- atsKeywords (30 pts): % of JD power keywords present in the resume
- titleMatch (20 pts): how closely resume title matches JD title
- experienceRelevance (25 pts): how well experience maps to JD responsibilities
- achievements (15 pts): bullets with real, specific, verifiable metrics
- educationCerts (10 pts): meets stated education and certification requirements

Sum for the total. Be honest — do not inflate.
If total is below 70, the gaps array must explain exactly what would raise it above 80.

═══════════════════════════════════════════════════
NEVER DO ANY OF THE FOLLOWING
═══════════════════════════════════════════════════

- Never invent experience, projects, metrics, or skills the candidate did not mention
- Never use em dashes anywhere in the document
- Never copy large blocks of text from the JD directly into the resume
- Never mark in-progress qualifications as completed
- Never remove real metrics the candidate provided
- Never make the resume sound more senior than the candidate's actual experience
- Never use tables for layout

═══════════════════════════════════════════════════
OUTPUT — return this exact JSON (no markdown, no text outside the JSON)
═══════════════════════════════════════════════════
{
  "targetTitle": "exact job title from JD",
  "summary": "4-sentence summary — no em dashes, sounds human, 60-80 words, contains 3 exact JD phrases",
  "coreCompetencies": ["Keyword One", "Keyword Two", "...12-15 JD keywords ordered by importance"],
  "experience": [
    {
      "title": "original job title — never change",
      "company": "original company — never change",
      "dates": "start date - end date or Present",
      "location": "City, Country",
      "bullets": ["Action verb + JD keyword + result with number where possible — 5-7 bullets"]
    }
  ],
  "skills": ["JD-relevant skill 1", "JD-relevant skill 2"],
  "certifications": ["JD-relevant cert 1 (In Progress if applicable)"],
  "coverLetter": "3-paragraph cover letter under 220 words — human tone, no em dashes, no buzzwords",
  "scoring": {
    "total": 85,
    "breakdown": {
      "atsKeywords": 24,
      "titleMatch": 18,
      "experienceRelevance": 22,
      "achievements": 13,
      "educationCerts": 8
    }
  },
  "gaps": ["Specific gap — missing cert or tool that cannot be reframed"],
  "quickWins": [
    "Led quality audit reviews after each sprint, surfacing 3+ recurring trends per cycle and presenting improvement recommendations to project leads in a structured report.",
    "Maintained Excel-based defect trend trackers and PowerPoint dashboards using Microsoft Office Suite to support weekly stakeholder reporting across 2 active projects."
  ]
}

QUICK WINS RULES — read before generating quickWins:
- Each item must be a complete, paste-ready resume bullet. Write it exactly as it should appear on the resume.
- Format: action verb (past tense) + specific activity using JD keywords verbatim + concrete result or deliverable.
- Never write instructions, explanations, pattern labels, or meta-text. Only the bullet text itself.
- Include a specific number, frequency, or timeframe in every bullet (e.g. "weekly", "each sprint", "3+ items", "2 active projects"). Never fabricate — only use what the candidate can reasonably defend based on their existing experience.
- Every bullet must use at least one keyword or phrase taken verbatim from the JD.
- Never produce a bullet that already appears or is thematically similar to any bullet in the candidate's original OR optimized experience. Check every bullet in the resume — if the topic, activity, or skill is already covered anywhere, skip that quick win entirely. Check intent, not just exact words.
- Maximum 3 items. If the candidate has zero experience entries, return an empty array [].`,
};

const TEST_CREDITS = 100;

function resetCredits() {
  chrome.storage.local.set({
    creditBalance: {
      total: TEST_CREDITS,
      used: 0,
      remaining: TEST_CREDITS,
      transactions: [
        {
          id: crypto.randomUUID(),
          type: 'bonus',
          amount: TEST_CREDITS,
          description: `${TEST_CREDITS} test credits`,
          timestamp: new Date().toISOString(),
        },
      ],
    },
  });
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    resetCredits();
    chrome.storage.local.set({
      userSettings: {
        defaultTone: 'professional',
        autoDetectJob: true,
        showATSScore: true,
      },
    });
  } else if (details.reason === 'update') {
    // Do NOT reset credits on update — users would lose purchased credits.
    // resetCredits() is intentionally omitted here.
  }
});

// Strip < and > from user-supplied text so it cannot escape XML tag boundaries in prompts.
function sanitizeUserContent(text: string): string {
  return text.replace(/</g, '(').replace(/>/g, ')');
}

// Sanitize error messages before sending to the content script.
// Prevents system prompts, API keys, or internal details from leaking to the UI.
const SAFE_ERROR_PATTERNS = [
  'no credits remaining',
  'session expired',
  'not logged in',
  'please sign in',
  'extension was reloaded',
  'checkout error',
  'rate limit',
  'please wait',
  'not configured',
  'optimization failed',
];

// Patterns that indicate internal/sensitive content that must NEVER reach the UI
const BLOCKED_PATTERNS = [
  /sk[-_]ant[-_]/i,             // Anthropic API key prefix
  /sk[-_](live|test)[-_]/i,     // Stripe key prefix
  /eyJ[A-Za-z0-9_-]{10,}/,     // JWT / base64 tokens
  /supabase\.co/i,              // Supabase URLs
  /anthropic\.com/i,            // Anthropic URLs
  /api[_-]?key/i,               // API key references
  /STAGE\s+\d/,                 // System prompt stage markers
  /═/,                          // System prompt formatting
  /service[_-]?role/i,          // Service role references
  /Bearer\s+\S/i,              // Auth tokens
  /function\s*\(/,              // Stack traces
  /at\s+\w+\s*\(/,             // Stack trace frames
  /https?:\/\/[^\s]{20,}/,     // Long URLs (internal endpoints)
];

function sanitizeErrorMessage(message: string): string {
  const lower = message.toLowerCase();
  // Check for blocked patterns first — these ALWAYS get suppressed
  if (BLOCKED_PATTERNS.some(p => p.test(message))) {
    console.error('[service-worker] Blocked sensitive error (length=%d)', message.length);
    return 'Something went wrong. Please try again.';
  }
  // Allow known safe/user-friendly messages through as-is
  if (SAFE_ERROR_PATTERNS.some(p => lower.includes(p))) return message;
  // Short, clean messages are safe to pass through
  if (message.length < 150) return message;
  // Everything else gets suppressed
  console.error('[service-worker] Suppressed long error (length=%d)', message.length);
  return 'Something went wrong. Please try again.';
}

// Retrieve the Supabase access token stored by the auth flow in the content script.
async function getAccessToken(): Promise<string | null> {
  return new Promise(resolve => {
    chrome.storage.local.get('sb_access_token', result => {
      resolve(result.sb_access_token ?? null);
    });
  });
}

// Proxy a request to the Supabase Edge Function.
// Handles 429/529 retries on the client side as a belt-and-suspenders measure
// (the Edge Function also retries, but network-level timeouts may surface here).
async function callEdgeFunction(
  action: string,
  payload: Record<string, any>,
  deductCredit = false,
  attempt = 1
): Promise<any> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('You are not logged in. Please sign in to use the optimizer.');
  }

  const response = await fetch(EDGE_FN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ action, payload, deductCredit }),
  });

  if (!response.ok) {
    const status = response.status;
    const err = await response.json().catch(() => ({}));

    if ((status === 429 || status === 529) && attempt < 3) {
      const delay = attempt * 3000;
      await new Promise(r => setTimeout(r, delay));
      return callEdgeFunction(action, payload, deductCredit, attempt + 1);
    }

    if (status === 402) {
      throw new Error(err?.error || 'No credits remaining. Please purchase more credits.');
    }
    if (status === 401) {
      throw new Error('Session expired. Please sign in again.');
    }
    throw new Error(err?.error || `Edge Function error ${status}`);
  }

  return response.json();
}

// Extract PII from raw text locally — Claude (via Edge Function) receives no PII
function extractLocalPII(rawText: string): {
  name: string; email: string; phone: string; redacted: string;
} {
  const emailMatch = rawText.match(/[\w.+\-]+@[\w\-]+\.[\w.]+/);
  const email = emailMatch ? emailMatch[0] : '';

  const phoneMatch = rawText.match(
    /(\+?(\d[\s.-]?)?(\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]\d{4}))|(\+\d{1,3}[\s\-]\d{2,4}[\s\-]\d{3,4}[\s\-]\d{3,4})/
  );
  const phone = phoneMatch ? phoneMatch[0] : '';

  const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const nameLine = lines.find(
    l =>
      !l.includes('@') &&
      !/^\+?[\d\s\-().]{7,}$/.test(l) &&
      !/^https?:/.test(l) &&
      l.length < 60 &&
      /^[A-Z]/.test(l)
  );
  const name = nameLine || '';

  let redacted = rawText;
  if (email) redacted = redacted.replace(new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '[EMAIL]');
  if (phone) redacted = redacted.replace(new RegExp(phone.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '[PHONE]');
  if (name)  redacted = redacted.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '[CANDIDATE]');

  redacted = redacted.replace(/[\w.+\-]+@[\w\-]+\.[\w.]+/g, '[EMAIL]');
  redacted = redacted.replace(/(\+?(\d[\s.-]?)?(\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]\d{4}))/g, '[PHONE]');
  redacted = redacted.replace(/\+\d{1,3}[\s\-]\d{2,4}[\s\-]\d{3,4}[\s\-]\d{3,4}/g, '[PHONE]');

  return { name, email, phone, redacted };
}

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Only accept messages from this extension's own scripts
  if (sender.id !== chrome.runtime.id) return;

  if (request.action === 'scrapeJobWithAI') {
    const { pageText } = request.payload;
    callEdgeFunction('scrapeJobWithAI', { pageText: sanitizeUserContent(pageText.slice(0, 5000)) })
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: sanitizeErrorMessage(err.message) }));
    return true;
  }

  if (request.action === 'parseResume') {
    const { rawText } = request.payload;
    const localPII = extractLocalPII(rawText);
    callEdgeFunction('parseResume', { rawText: sanitizeUserContent(localPII.redacted) })
      .then(data => {
        // Restore PII from local extraction — overwrite anything the AI may have guessed
        if (localPII.name)  data.name  = localPII.name;
        if (localPII.email) data.email = localPII.email;
        if (localPII.phone) data.phone = localPII.phone;
        sendResponse({ success: true, data });
      })
      .catch(err => sendResponse({ success: false, error: sanitizeErrorMessage(err.message) }));
    return true;
  }

  if (request.action === 'callClaude') {
    const { messages, maxTokens, model, system } = request.payload;
    // Resolve system prompt ID → actual prompt (keeps prompt out of content script)
    const resolvedSystem = (system && SYSTEM_PROMPTS[system]) || system;
    // Always deduct a credit for callClaude — the service worker decides,
    // not the content script, so injected code cannot bypass the charge.
    callEdgeFunction('callClaude', { messages, maxTokens, model, system: resolvedSystem }, true)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(err => sendResponse({ success: false, error: sanitizeErrorMessage(err.message) }));
    return true;
  }

  if (request.action === 'callClaudeFree') {
    // Free-tier actions (cover letters) — no credit deduction.
    const { messages, maxTokens, model, system } = request.payload;
    const resolvedSystem = (system && SYSTEM_PROMPTS[system]) || system;
    callEdgeFunction('callClaude', { messages, maxTokens, model, system: resolvedSystem }, false)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(err => sendResponse({ success: false, error: sanitizeErrorMessage(err.message) }));
    return true;
  }
});

export {};
