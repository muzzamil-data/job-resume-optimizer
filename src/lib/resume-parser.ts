import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
import type { ParsedResume, Resume } from '../types';

type PdfTextItem = { str: string; transform: number[] };
type ParsedResumeResponse = { success: boolean; data?: Partial<ParsedResume>; error?: string };

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

// Point worker to Chrome extension resource
pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.min.mjs');

async function readMagicBytes(file: File, count: number): Promise<Uint8Array> {
  const slice = file.slice(0, count);
  return new Uint8Array(await slice.arrayBuffer());
}

function isPDF(bytes: Uint8Array): boolean {
  // %PDF magic bytes: 0x25 0x50 0x44 0x46
  return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

function isDOCX(bytes: Uint8Array): boolean {
  // PK zip header: 0x50 0x4B 0x03 0x04
  return bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04;
}

export class ResumeParser {
  async parseFile(file: File): Promise<Resume> {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new Error('File is too large. Please upload a resume under 10 MB.');
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      throw new Error('Unsupported file type. Please upload a PDF or DOCX file.');
    }

    const magic = await readMagicBytes(file, 4);
    const isPdf = file.type === 'application/pdf';
    if (isPdf && !isPDF(magic)) {
      throw new Error('File does not appear to be a valid PDF.');
    }
    if (!isPdf && !isDOCX(magic)) {
      throw new Error('File does not appear to be a valid DOCX.');
    }

    const fileType = isPdf ? 'pdf' : 'docx';
    let rawText: string;

    if (fileType === 'docx') {
      rawText = await this.parseDOCX(file);
    } else {
      rawText = await this.parsePDF(file);
    }

    if (!rawText || rawText.trim().length < 50) {
      throw new Error('Could not extract text from this file. Please try a different format.');
    }

    // Always try AI parsing first for best quality, local as fallback
    const parsedData = await this.extractWithAI(rawText);

    return {
      id: crypto.randomUUID(),
      fileName: file.name,
      fileType,
      content: rawText,
      parsedData,
      uploadedAt: new Date(),
    };
  }

  private async parseDOCX(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  }

  private async parsePDF(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pages: string[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      // Preserve line breaks using transform y-position
      let lastY: number | null = null;
      const lineChunks: string[] = [];
      for (const item of content.items as PdfTextItem[]) {
        if (lastY !== null && Math.abs(item.transform[5] - lastY) > 2) {
          lineChunks.push('\n');
        }
        lineChunks.push(item.str);
        lastY = item.transform[5];
      }
      pages.push(lineChunks.join(''));
    }

    return pages.join('\n');
  }

  private async extractWithAI(rawText: string): Promise<ParsedResume> {
    // Try AI parsing first — it handles all resume formats correctly
    try {
      const truncated = rawText.slice(0, 6000);
      const response: ParsedResumeResponse =
        await chrome.runtime.sendMessage({
          action: 'parseResume',
          payload: { rawText: truncated },
        });

      if (response.success && response.data) {
        const data = response.data;
        return {
          name: data.name,
          email: data.email,
          phone: data.phone,
          location: data.location,
          summary: data.summary,
          experience: Array.isArray(data.experience) ? data.experience : [],
          education: Array.isArray(data.education) ? data.education : [],
          skills: Array.isArray(data.skills) ? data.skills : [],
          certifications: Array.isArray(data.certifications) ? data.certifications : [],
          raw: rawText,
        };
      }
    } catch (e) {
      console.warn('AI resume parsing failed, using local extraction:', e);
    }

    return this.extractLocally(rawText);
  }

  private extractLocally(text: string): ParsedResume {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);

    return {
      name: this.extractName(lines),
      email: this.extractEmail(text),
      phone: this.extractPhone(text),
      location: this.extractLocation(text),
      summary: this.extractSummary(lines),
      experience: this.extractExperience(text),
      education: this.extractEducation(text),
      skills: this.extractSkills(text),
      certifications: this.extractCertifications(text),
      raw: text,
    };
  }

  private extractName(lines: string[]): string | undefined {
    for (const line of lines.slice(0, 5)) {
      if (
        line.length > 2 &&
        line.length < 60 &&
        !line.includes('@') &&
        !/\d{3}/.test(line) &&
        !/http|www|linkedin/i.test(line) &&
        !/\|/.test(line)
      ) {
        return line;
      }
    }
    return lines[0];
  }

  private extractEmail(text: string): string | undefined {
    const match = text.match(/[\w.+-]+@[\w.-]+\.\w{2,}/);
    return match?.[0];
  }

  private extractPhone(text: string): string | undefined {
    const match = text.match(/(\+?\d{1,3}[\s-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
    return match?.[0];
  }

  private extractLocation(text: string): string | undefined {
    // Look in the first 5 lines for a city/country pattern after pipe separators
    const lines = text.split('\n').slice(0, 8).map(l => l.trim());
    for (const line of lines) {
      // Pattern: contains pipe separators and a location-like token (City, Country)
      if (line.includes('|')) {
        const parts = line.split('|').map(p => p.trim());
        for (const part of parts) {
          // Skip if it looks like email, phone, URL
          if (
            part.includes('@') ||
            /^\+?\d/.test(part) ||
            /http|www|linkedin/i.test(part)
          ) continue;
          // Location: text with comma (City, Country) or just a city name (no @, no numbers)
          if (/^[A-Za-z\s]+,\s*[A-Za-z\s]+$/.test(part) || /^[A-Za-z]{3,}/.test(part)) {
            return part;
          }
        }
      }
    }
    return undefined;
  }

  private extractSummary(lines: string[]): string | undefined {
    const idx = lines.findIndex(l =>
      /^(summary|professional summary|profile|objective|about me)/i.test(l)
    );
    if (idx !== -1) {
      // Collect lines until the next section header
      const summaryLines: string[] = [];
      for (let i = idx + 1; i < Math.min(idx + 10, lines.length); i++) {
        if (/^(experience|education|skills|certifications|work|employment|projects)/i.test(lines[i])) break;
        summaryLines.push(lines[i]);
      }
      return summaryLines.join(' ').trim() || undefined;
    }
    return undefined;
  }

  private extractExperience(text: string): ParsedResume['experience'] {
    const section = this.extractSection(
      text,
      /^(experience|work experience|professional experience|work history|employment)/im
    );
    if (!section) return [];

    const experiences: ParsedResume['experience'] = [];
    const lines = section.split('\n').map(l => l.trim()).filter(l => l);

    let current: ParsedResume['experience'][0] | null = null;

    // Detect pipe-separated header lines like: "Title  |  Company  |  2023 – 2024  |  Location"
    const pipeLine = /^(.+?)\s*\|\s*(.+?)\s*\|\s*(\d{4}.+?)(?:\s*\|\s*(.+))?$/;

    for (const line of lines) {
      const pipeMatch = line.match(pipeLine);

      if (pipeMatch) {
        // Flush previous entry
        if (current) experiences.push(current);
        const [, title, company, dates, location] = pipeMatch;
        const dateRange = dates.match(/(\d{4}[\s\–\-]+(?:\d{4}|present))/i)?.[0];
        current = {
          title: title.trim(),
          company: company.trim(),
          location: location?.trim(),
          startDate: dateRange?.split(/[\–\-]+/)[0]?.trim(),
          endDate: dateRange?.split(/[\–\-]+/)[1]?.trim() || 'Present',
          bullets: [],
        };
        continue;
      }

      const isDateLine =
        /^\d{4}\s*[\–\-]\s*(\d{4}|present)/i.test(line) ||
        /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{4}/i.test(line);

      // Paragraph-style bullets: long lines starting with a capital letter or bullet char
      const isBullet =
        /^[•\-\*▪]/.test(line) ||
        (line.length > 50 && /^[A-Z]/.test(line) && current !== null);

      // Short non-date, non-bullet lines = potential title or company
      const isHeader = !isDateLine && !isBullet && line.length < 100 && line.length > 3;

      if (isHeader && !isBullet && !current) {
        current = { title: line, company: '', bullets: [] };
      } else if (current && !current.company && isHeader && !isBullet) {
        current.company = line;
      } else if (current && isBullet) {
        const bullet = line.replace(/^[•\-\*▪]\s*/, '').trim();
        if (bullet.length > 15) current.bullets.push(bullet);
      }
    }

    if (current) experiences.push(current);
    return experiences.filter(e => e.title && (e.company || e.bullets.length > 0));
  }

  private extractEducation(text: string): ParsedResume['education'] {
    const section = this.extractSection(text, /^(education|academic background)/im);
    if (!section) return [];

    const education: ParsedResume['education'] = [];
    const lines = section.split('\n').map(l => l.trim()).filter(l => l);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Pipe-separated: "Degree  |  School  |  Year"
      const pipeMatch = line.match(/^(.+?)\s*\|\s*(.+?)(?:\s*\|\s*(.+))?$/);
      if (pipeMatch) {
        education.push({
          degree: pipeMatch[1].trim(),
          school: pipeMatch[2].trim(),
          graduationDate: pipeMatch[3]?.trim(),
        });
        continue;
      }

      if (
        /bachelor|master|mba|phd|b\.s\.|m\.s\.|b\.a\.|m\.a\.|associate|diploma|degree|msc|bsc/i.test(line)
      ) {
        education.push({
          degree: line,
          school: lines[i + 1] || '',
          graduationDate: lines[i + 2]?.match(/\d{4}/)?.[0],
        });
        i++; // skip the school line
      }
    }

    return education;
  }

  private extractSkills(text: string): string[] {
    const section = this.extractSection(
      text,
      /^(skills|technical skills|core competencies|technologies|key skills)/im
    );
    if (!section) return [];

    return section
      .split(/[,•·|\n\/]/)
      .map(s => s.trim().replace(/^[\-\*]\s*/, ''))
      .filter(s => s.length > 1 && s.length < 60)
      .slice(0, 50);
  }

  private extractCertifications(text: string): string[] {
    const section = this.extractSection(
      text,
      /^(certifications?|certificates?|licenses?|credentials)/im
    );
    if (!section) return [];

    return section
      .split(/[•\n]/)
      .map(s => s.trim().replace(/^[\-\*]\s*/, ''))
      .filter(s => s.length > 3 && s.length < 120)
      .slice(0, 15);
  }

  private extractSection(text: string, pattern: RegExp): string | null {
    const lines = text.split('\n');
    const start = lines.findIndex(l => pattern.test(l.trim()));
    if (start === -1) return null;

    const sectionHeaders =
      /^(experience|education|skills|projects|certifications?|summary|profile|work|employment|technical|languages|awards|publications|core competencies)/i;

    const end = lines.findIndex((l, i) => i > start && sectionHeaders.test(l.trim()));
    return lines.slice(start + 1, end === -1 ? undefined : end).join('\n');
  }
}
