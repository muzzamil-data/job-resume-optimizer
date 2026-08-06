import type { ParsedResume } from '../types';
import { DocxDocumentGenerator } from './document-generator-docx';
import { PdfDocumentGenerator } from './document-generator-pdf';

export class DocumentGenerator {
  private readonly docx = new DocxDocumentGenerator();
  private readonly pdf = new PdfDocumentGenerator();

  generateDOCX(resume: ParsedResume, jobTitle: string): Promise<Blob> {
    return this.docx.generateDOCX(resume, jobTitle);
  }

  generatePDF(resume: ParsedResume, jobTitle: string): Promise<Blob> {
    return this.pdf.generatePDF(resume, jobTitle);
  }

  generateCoverLetterDOCX(
    coverLetter: string,
    candidateName?: string,
    email?: string,
    phone?: string,
    location?: string,
  ): Promise<Blob> {
    return this.docx.generateCoverLetterDOCX(coverLetter, candidateName, email, phone, location);
  }

  generateCoverLetterPDF(
    coverLetter: string,
    candidateName?: string,
    email?: string,
    phone?: string,
    location?: string,
  ): Promise<Blob> {
    return this.pdf.generateCoverLetterPDF(coverLetter, candidateName, email, phone, location);
  }

  downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }
}
