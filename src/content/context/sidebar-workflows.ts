import { AIService } from '../../lib/ai-service';
import { calculateATSScoreWithBreakdown } from '../../lib/ats-scoring';
import { DocumentGenerator } from '../../lib/document-generator';
import { generateFilename } from '../../lib/utils';
import type {
  ApplicationRecord,
  JobDescription,
  OptimizedResume,
  ParsedResume,
  Resume,
} from '../../types';

export type CoverLetterTone = 'professional' | 'enthusiastic' | 'technical' | 'creative';
export type ExportFormat = 'pdf' | 'docx';
export type ExportType = 'resume' | 'cover-letter';

export async function optimizeForJob(
  resume: Resume,
  job: JobDescription,
  applications: ApplicationRecord[],
): Promise<{ optimized: OptimizedResume; application: ApplicationRecord }> {
  const result = await new AIService().optimizeResume(resume.parsedData, job);
  const optimized: OptimizedResume = {
    id: crypto.randomUUID(),
    originalResumeId: resume.id,
    jobDescriptionUrl: job.url,
    optimizedContent: result.optimized,
    atsScore: result.atsScore,
    keywordMatches: result.keywords,
    scoring: result.scoring,
    gaps: result.gaps,
    recommendations: result.recommendations,
    createdAt: new Date(),
  };

  const existing = applications.find(application => application.url === job.url);
  const application: ApplicationRecord = existing
    ? { ...existing, resumeId: optimized.id, appliedAt: new Date() }
    : {
        id: crypto.randomUUID(),
        jobTitle: job.title,
        company: job.company,
        url: job.url,
        appliedAt: new Date(),
        resumeId: optimized.id,
        status: 'applied',
      };

  return { optimized, application };
}

export function generateCoverLetter(
  resume: ParsedResume,
  job: JobDescription,
  tone: CoverLetterTone,
): Promise<string> {
  return new AIService().generateCoverLetter(resume, job, tone);
}

export function applyQuickWin(
  optimizedResume: OptimizedResume,
  job: JobDescription,
  text: string,
  experienceIndex: number,
): OptimizedResume | null {
  const experience = [...optimizedResume.optimizedContent.experience];
  if (!experience[experienceIndex]) return null;
  experience[experienceIndex] = {
    ...experience[experienceIndex],
    bullets: [...experience[experienceIndex].bullets, text],
  };
  const optimizedContent = { ...optimizedResume.optimizedContent, experience };
  const scoring = calculateATSScoreWithBreakdown(optimizedContent, job);
  return { ...optimizedResume, optimizedContent, atsScore: scoring.total, scoring };
}

export async function exportDocument(
  format: ExportFormat,
  type: ExportType,
  optimizedResume: OptimizedResume,
  job: JobDescription,
  coverLetter: string,
): Promise<void> {
  const generator = new DocumentGenerator();
  const filename = generateFilename(type, job.title, job.company);
  const resume = optimizedResume.optimizedContent;
  let blob: Blob;

  if (type === 'resume') {
    blob = format === 'pdf'
      ? await generator.generatePDF(resume, job.title)
      : await generator.generateDOCX(resume, job.title);
  } else {
    const contact = [coverLetter, resume.name, resume.email, resume.phone, resume.location] as const;
    blob = format === 'pdf'
      ? await generator.generateCoverLetterPDF(...contact)
      : await generator.generateCoverLetterDOCX(...contact);
  }

  generator.downloadBlob(blob, `${filename}.${format}`);
}
