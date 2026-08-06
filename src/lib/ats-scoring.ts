import type { ATSScoring, ExperienceItem, JobDescription, KeywordMatch, ParsedResume } from '../types';

// --- Local ATS Scoring Engine ---
// All scoring is computed locally from ParsedResume + JobDescription.
// Claude's self-reported score is never used — local scoring is deterministic
// and can be recomputed instantly on every quick-win apply.

const ATS_STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'are', 'will', 'you',
  'have', 'has', 'been', 'from', 'your', 'our', 'their', 'they', 'but',
  'not', 'can', 'all', 'more', 'able', 'work', 'role', 'team', 'must',
  'also', 'both', 'each', 'than', 'into', 'who', 'may', 'should', 'would',
  'other', 'about', 'any', 'such', 'its', 'use', 'new', 'how', 'what',
  'when', 'where', 'which', 'while', 'well', 'time', 'experience',
  'strong', 'good', 'great', 'ability', 'knowledge', 'understanding',
  'required', 'preferred', 'including', 'related', 'plus', 'years',
]);

const STRONG_ACTION_VERBS = new Set([
  'led', 'managed', 'built', 'designed', 'developed', 'implemented', 'created',
  'increased', 'decreased', 'reduced', 'improved', 'optimized', 'delivered',
  'launched', 'deployed', 'architected', 'spearheaded', 'transformed', 'streamlined',
  'established', 'generated', 'achieved', 'exceeded', 'drove', 'accelerated',
  'coordinated', 'mentored', 'trained', 'scaled', 'migrated', 'automated',
  'introduced', 'initiated', 'oversaw', 'directed', 'pioneered', 'revamped',
  'negotiated', 'secured', 'executed', 'produced', 'released', 'shipped',
  'reengineered', 'consolidated', 'restructured', 'integrated', 'resolved',
]);

const EDUCATION_LEVELS = ['phd', 'doctorate', 'master', 'mba', 'bachelor', 'associate', 'degree'];

interface WeightedKw { kw: string; weight: number }

// Build a weighted keyword set from the JD.
// Weights: job title words + explicit keywords = 3, requirement words = 2,
// high-frequency description words = 2, other description words = 1.
function buildWeightedJobKeywords(job: JobDescription): WeightedKw[] {
  const scores = new Map<string, number>();

  function add(text: string, weight: number) {
    for (const w of (text.toLowerCase().match(/\b[a-z][a-z0-9+#.\-]{2,}\b/g) || [])) {
      if (!ATS_STOP_WORDS.has(w) && w.length > 3) {
        scores.set(w, Math.max(scores.get(w) ?? 0, weight));
      }
    }
  }

  add(job.title, 3);
  for (const kw of job.keywords) {
    const k = kw.toLowerCase().trim();
    if (k.length > 3) scores.set(k, Math.max(scores.get(k) ?? 0, 3));
  }
  for (const req of job.requirements) add(req, 2);

  // Description: frequency-weighted, capped at 2
  const descWords = (job.description.toLowerCase().match(/\b[a-z][a-z0-9+#.\-]{2,}\b/g) || [])
    .filter(w => !ATS_STOP_WORDS.has(w) && w.length > 3);
  const freq = new Map<string, number>();
  for (const w of descWords) freq.set(w, (freq.get(w) ?? 0) + 1);
  for (const [w, f] of freq) scores.set(w, Math.max(scores.get(w) ?? 0, f >= 3 ? 2 : 1));

  return Array.from(scores.entries()).map(([kw, weight]) => ({ kw, weight }));
}

function buildResumeFullText(resume: ParsedResume): string {
  return [
    resume.summary ?? '',
    ...(resume.coreCompetencies ?? []),
    ...resume.experience.flatMap(e => [e.title, e.company, ...e.bullets]),
    ...resume.skills,
    ...(resume.certifications ?? []),
    ...resume.education.map(e => `${e.degree} ${e.school}`),
  ].join(' ').toLowerCase();
}

export function calculateKeywordMatches(
  resume: ParsedResume,
  job: JobDescription,
): KeywordMatch[] {
  const resumeText = buildResumeFullText(resume);
  return buildWeightedJobKeywords(job).map(({ kw, weight }) => ({
    keyword: kw,
    inResume: resumeText.includes(kw),
    importance: weight >= 3 ? 'high' : weight >= 2 ? 'medium' : 'low',
  }));
}

// Returns 0.0–1.0 representing how consistently date strings are formatted.
// Mixed formats ("Jan 2020", "2020-01", "January '19") cause ATS systems to
// miscalculate total years of experience — penalize inconsistency.
function dateFormatConsistency(experience: ExperienceItem[]): number {
  const dates = experience
    .flatMap(e => [e.startDate, e.endDate])
    .filter((d): d is string => typeof d === 'string' && d.trim().length > 0 && !/present|current/i.test(d));
  if (dates.length < 2) return 1.0;
  const patterns = [
    /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{4}/i, // "Jan 2020" / "January 2020" — most reliable
    /^\d{4}-\d{2}/,     // ISO "2020-01"
    /^\d{2}\/\d{4}/,    // "01/2020"
    /^\d{4}$/,          // year-only "2020"
  ];
  const counts = patterns.map(p => dates.filter(d => p.test(d.trim())).length);
  const dominated = Math.max(...counts);
  const total = counts.reduce((a, b) => a + b, 0);
  return total === 0 ? 0.5 : dominated / total;
}

// Compute all 5 breakdown dimensions + total from local data only.
// This is the single source of truth for ATS scoring — never ask Claude.
export function calculateATSScoreWithBreakdown(
  resume: ParsedResume,
  job: JobDescription
): ATSScoring {
  const resumeText = buildResumeFullText(resume);
  const weightedKws = buildWeightedJobKeywords(job);

  // 1. ATS Keywords (0–30)
  // Weighted coverage ratio + sweet-spot multiplier (research: 25–35 unique matched
  // keywords is optimal; below 20 = under-optimized; very high density = stuffing risk).
  let totalW = 0, matchedW = 0;
  for (const { kw, weight } of weightedKws) {
    totalW += weight;
    if (resumeText.includes(kw)) matchedW += weight;
  }
  const matchedUniqueCount = weightedKws.filter(k => resumeText.includes(k.kw)).length;
  const rawRatioScore = totalW > 0 ? Math.round((matchedW / totalW) * 30) : 15;

  // Sweet-spot modifier: ramp up from 0.75 at 0 matched → 1.0 at 20+.
  // Stuffing check: if >40 matched AND keyword density is very high → slight penalty.
  let sweetSpot = matchedUniqueCount < 20
    ? 0.75 + (matchedUniqueCount / 20) * 0.25
    : 1.0;
  if (matchedUniqueCount > 40) {
    const wordCount = resumeText.split(/\s+/).length;
    if (matchedUniqueCount / wordCount > 0.14) sweetSpot = 0.9; // likely keyword-stuffed
  }
  const atsKeywords = Math.min(Math.round(rawRatioScore * sweetSpot), 30);

  // 2. Title Match → formatting field (0–20)
  // Research: resumes with the EXACT job title in their header/summary got callbacks
  // at 10.6× the rate of those with synonyms or creative variations. Exact phrase
  // match is scored separately and takes priority over word-overlap math.
  const jobTitleLower = job.title.toLowerCase();
  const titleWords = (jobTitleLower.match(/\b[a-z]{3,}\b/g) ?? [])
    .filter(w => !ATS_STOP_WORDS.has(w));

  const resumeTitles = resume.experience.map(e => e.title.toLowerCase()).join(' ');
  const summaryText = (resume.summary ?? '').toLowerCase();
  const compText = (resume.coreCompetencies ?? []).join(' ').toLowerCase();

  // Exact phrase match: highest signal
  const exactInTitles = resume.experience.some(e =>
    e.title.toLowerCase().includes(jobTitleLower) || jobTitleLower.includes(e.title.toLowerCase().trim())
  );
  const exactInSummary = summaryText.includes(jobTitleLower);
  const exactInComps = (resume.coreCompetencies ?? []).some(c => c.toLowerCase().includes(jobTitleLower));
  const exactPhraseScore = exactInTitles ? 20 : exactInSummary ? 15 : exactInComps ? 12 : 0;

  // Word-overlap fallback (graceful degradation for near-matches)
  let wordOverlapScore = 0;
  if (titleWords.length > 0) {
    const inTitles = titleWords.filter(w => resumeTitles.includes(w)).length / titleWords.length;
    const inSummary = titleWords.filter(w => summaryText.includes(w)).length / titleWords.length;
    const inComps = titleWords.filter(w => compText.includes(w)).length / titleWords.length;
    wordOverlapScore = Math.round((inTitles * 0.65 + inSummary * 0.25 + inComps * 0.10) * 20);
  }

  // Also give a small structural bonus: key sections parsed = contact info likely in body (not headers)
  const structureBonus = (resume.summary ? 1 : 0) + (resume.skills.length > 0 ? 1 : 0)
    + (resume.experience.length > 0 ? 1 : 0) + (resume.education.length > 0 ? 1 : 0);
  // max +4 from structure, but we keep formatting capped at 20
  const formatting = Math.min(Math.max(exactPhraseScore, wordOverlapScore) + Math.floor(structureBonus / 2), 20);

  // 3. Experience Relevance (0–25): JD keyword density across experience entries,
  // weighted so the most recent role counts more.
  // Date format consistency multiplier: mixed formats (e.g. "Jan 2020" vs "2020-01")
  // cause ATS to miscalculate total years — penalize inconsistency.
  const highValueKws = weightedKws.filter(k => k.weight >= 2).map(k => k.kw);
  const entryDecay = [1.0, 0.85, 0.70, 0.60, 0.50];
  let relSum = 0, relWeightTotal = 0;
  const expEntries = resume.experience.slice(0, 5);
  for (let i = 0; i < expEntries.length; i++) {
    const e = expEntries[i];
    const entryText = [e.title, e.company, ...e.bullets].join(' ').toLowerCase();
    const density = highValueKws.length === 0
      ? 0.4
      : highValueKws.filter(kw => entryText.includes(kw)).length / Math.min(highValueKws.length, 25);
    relSum += entryDecay[i] * density;
    relWeightTotal += entryDecay[i];
  }
  const dateConsistency = dateFormatConsistency(resume.experience);
  const rawRelScore = expEntries.length === 0
    ? 0
    : Math.round((relSum / relWeightTotal) * 25 * 1.6);
  // dateConsistency: 1.0 = all dates same format, 0.5 = mixed/unrecognized
  // Scale penalty: 1.0→no change, 0.5→−10%
  const experienceRelevance = Math.min(Math.round(rawRelScore * (0.9 + dateConsistency * 0.1)), 25);

  // 4. Achievements (0–15): quantified bullets with strong action verbs
  const allBullets = resume.experience.flatMap(e => e.bullets);
  let achievements = 0;
  if (allBullets.length > 0) {
    let both = 0, onlyMetric = 0, onlyVerb = 0;
    for (const b of allBullets) {
      const hasMetric = /\d|%|\$|revenue|growth/.test(b);
      const firstWord = b.toLowerCase().split(/\s+/)[0]?.replace(/[^a-z]/g, '') ?? '';
      const hasVerb = STRONG_ACTION_VERBS.has(firstWord);
      if (hasMetric && hasVerb) both++;
      else if (hasMetric) onlyMetric++;
      else if (hasVerb) onlyVerb++;
    }
    const raw = (both * 1.0 + onlyMetric * 0.7 + onlyVerb * 0.4) / allBullets.length;
    achievements = Math.min(Math.round(raw / 0.55 * 15), 15);
    // 0.55 = "full score" threshold so ~55% weighted bullets → 15/15
  }

  // 5. Education & Certs (0–10)
  let educationCerts = 0;
  const jdBodyText = (job.description + ' ' + job.requirements.join(' ')).toLowerCase();
  const eduText = resume.education.map(e => `${e.degree} ${e.school}`).join(' ').toLowerCase();

  // Education (0–5)
  const requiredLevel = EDUCATION_LEVELS.find(l => jdBodyText.includes(l));
  if (!requiredLevel) {
    educationCerts += resume.education.length > 0 ? 4 : 3; // no explicit requirement
  } else {
    const levelIdx = EDUCATION_LEVELS.indexOf(requiredLevel);
    const meets = EDUCATION_LEVELS.slice(0, levelIdx + 1).some(l => eduText.includes(l));
    educationCerts += meets ? 5 : 1;
  }

  // Certifications (0–5)
  const certs = (resume.certifications ?? []);
  if (certs.length === 0) {
    const jdNeedsCert = /\bcertif|\baws\b|\bpmp\b|\bcpa\b|\bcfa\b|\bcisco\b|\bazure\b|\bgcp\b/i.test(jdBodyText);
    educationCerts += jdNeedsCert ? 0 : 2;
  } else {
    educationCerts += 2; // has certs
    const certText = certs.join(' ').toLowerCase();
    const jdKwText = [...job.keywords, ...job.requirements].join(' ').toLowerCase();
    const hasMatch = certs.some(c =>
      c.toLowerCase().split(/\s+/).some(w => w.length > 3 && jdKwText.includes(w))
    );
    if (hasMatch) educationCerts += 3;
    else if (certText.split(/\s+/).some(w => w.length > 3 && jdBodyText.includes(w))) educationCerts += 1;
  }
  educationCerts = Math.min(educationCerts, 10);

  const total = Math.min(
    Math.max(atsKeywords + formatting + experienceRelevance + achievements + educationCerts, 10),
    100,
  );

  return { atsKeywords, formatting, experienceRelevance, achievements, educationCerts, total };
}

