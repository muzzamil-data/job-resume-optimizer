import {
  AlignmentType,
  BorderStyle,
  Document,
  LevelFormat,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';
import type { ParsedResume } from '../types';

function stripClosing(text: string): string {
  const lines = text.split('\n');
  const index = lines.findIndex(line =>
    /^(best regards|sincerely|regards|warm regards)/i.test(line.trim())
  );
  return index === -1 ? text : lines.slice(0, index).join('\n').trimEnd();
}

const BLUE = '1B3F6B';
const BODY = '1A1A1A';
const GRAY = '555555';

export class DocxDocumentGenerator {
  async generateDOCX(resume: ParsedResume, jobTitle: string): Promise<Blob> {
    const targetTitle = resume.jobTitle || jobTitle;

    /** Section heading: bold uppercase, blue, 11 pt, with blue bottom border */
    const sectionHead = (text: string) =>
      new Paragraph({
        spacing: { before: 180, after: 80, line: 240 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: BLUE, space: 1 } },
        children: [
          new TextRun({
            text: text.toUpperCase(),
            bold: true,
            size: 22,       // 11 pt
            color: BLUE,
            font: 'Arial',
          }),
        ],
      });

    const run = (
      text: string,
      opts: { bold?: boolean; italic?: boolean; color?: string; size?: number } = {}
    ) =>
      new TextRun({
        text,
        bold:    opts.bold,
        italics: opts.italic,
        color:   opts.color ?? BODY,
        size:    opts.size  ?? 20,  // 10 pt
        font:    'Arial',
      });

    const doc = new Document({
      numbering: {
        config: [{
          reference: 'bullets',
          levels: [{
            level: 0,
            format: LevelFormat.BULLET,
            text: '\u2022',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 520, hanging: 260 } } },
          }],
        }],
      },
      styles: {
        default: {
          document: {
            run: { font: 'Arial', size: 20 },
            // Reset Word's built-in Normal style: kills default 8pt after-spacing and 1.15× line height
            paragraph: { spacing: { after: 0, line: 240 } },
          },
        },
      },
      sections: [
        {
          properties: {
            page: {
              size: { width: 12240, height: 15840 }, // US Letter
              margin: { top: 900, right: 1080, bottom: 900, left: 1080 },
            },
          },
          children: [
            // ── FULL NAME (centred, blue, 26 pt bold) ──────────────────────
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 0, after: 60, line: 240 },
              children: [
                new TextRun({
                  text: (resume.name || 'Your Name').toUpperCase(),
                  bold: true,
                  size: 52,     // 26 pt
                  color: BLUE,
                  font: 'Arial',
                }),
              ],
            }),

            // ── TARGET JOB TITLE (centred, gray, 11 pt) ───────────────────
            ...(targetTitle
              ? [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 0, after: 60, line: 240 },
                    children: [
                      new TextRun({
                        text: targetTitle,
                        size: 22,
                        color: GRAY,
                        font: 'Arial',
                      }),
                    ],
                  }),
                ]
              : []),

            // ── CONTACT LINE (centred, gray, 10 pt) ───────────────────────
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 0, after: 160, line: 240 },
              children: [
                run(
                  [resume.email, resume.phone, resume.location]
                    .filter(Boolean)
                    .join('  |  '),
                  { color: GRAY, size: 20 }
                ),
              ],
            }),

            // ── PROFESSIONAL SUMMARY ──────────────────────────────────────
            ...(resume.summary
              ? [
                  sectionHead('Professional Summary'),
                  new Paragraph({
                    spacing: { before: 80, after: 60, line: 276 },
                    children: [run(resume.summary)],
                  }),
                ]
              : []),

            // ── CORE COMPETENCIES ─────────────────────────────────────────
            ...((resume.coreCompetencies || []).length > 0
              ? [
                  sectionHead('Core Competencies'),
                  new Paragraph({
                    spacing: { before: 80, after: 60, line: 276 },
                    children: [
                      run((resume.coreCompetencies || []).join('  •  ')),
                    ],
                  }),
                ]
              : []),

            // ── PROFESSIONAL EXPERIENCE ───────────────────────────────────
            sectionHead('Professional Experience'),

            ...resume.experience.flatMap(exp => {
              const dates = [exp.startDate, exp.endDate || 'Present']
                .filter(Boolean).join(' – ');
              return [
                // Single-line: Title  |  Company (blue bold)  |  dates  |  location
                new Paragraph({
                  spacing: { before: 180, after: 60, line: 240 },
                  children: [
                    new TextRun({ text: exp.title, bold: true, size: 22, color: BODY, font: 'Arial' }),
                    new TextRun({ text: '  |  ', size: 20, color: GRAY, font: 'Arial' }),
                    new TextRun({ text: exp.company, size: 20, color: BLUE, bold: true, font: 'Arial' }),
                    new TextRun({
                      text: [
                        dates ? '  |  ' + dates : '',
                        exp.location ? '  |  ' + exp.location : '',
                      ].join(''),
                      size: 20,
                      color: GRAY,
                      font: 'Arial',
                    }),
                  ],
                }),
                // Native bullets
                ...exp.bullets.map(b =>
                  new Paragraph({
                    numbering: { reference: 'bullets', level: 0 },
                    spacing: { before: 40, after: 40, line: 276 },
                    children: [run(b)],
                  })
                ),
              ];
            }),

            // ── EDUCATION ────────────────────────────────────────────────
            ...(resume.education.length > 0
              ? [
                  sectionHead('Education'),
                  ...resume.education.map(edu =>
                    new Paragraph({
                      spacing: { before: 80, after: 60, line: 240 },
                      children: [
                        new TextRun({ text: edu.degree, bold: true, size: 22, color: BODY, font: 'Arial' }),
                        new TextRun({
                          text: [
                            edu.school ? '  |  ' + edu.school : '',
                            edu.location ? ', ' + edu.location : '',
                            edu.graduationDate ? '  |  ' + edu.graduationDate : '',
                          ].join(''),
                          size: 20,
                          color: GRAY,
                          font: 'Arial',
                        }),
                      ],
                    })
                  ),
                ]
              : []),

            // ── CERTIFICATIONS ───────────────────────────────────────────
            ...((resume.certifications || []).length > 0
              ? [
                  sectionHead('Certifications'),
                  new Paragraph({
                    spacing: { before: 80, after: 60, line: 276 },
                    children: [run((resume.certifications || []).join('  •  '))],
                  }),
                ]
              : []),

            // ── TECHNICAL SKILLS ─────────────────────────────────────────
            ...(resume.skills.length > 0
              ? [
                  sectionHead('Technical Skills'),
                  new Paragraph({
                    spacing: { before: 80, after: 60, line: 276 },
                    children: [run(resume.skills.join('  •  '))],
                  }),
                ]
              : []),
          ],
        },
      ],
    });

    return Packer.toBlob(doc);
  }

  // ── PDF ────────────────────────────────────────────────────────────────────
  async generateCoverLetterDOCX(
    coverLetter: string,
    candidateName?: string,
    email?: string,
    phone?: string,
    location?: string
  ): Promise<Blob> {
    const contactParts = [email, phone, location].filter(Boolean);
    const contactLine = contactParts.join('  |  ');

    const bodyPara = (text: string) =>
      new Paragraph({
        children: [new TextRun({ text, size: 22, color: BODY, font: 'Georgia' })],
        spacing: { before: 180, after: 0, line: 276 },
        alignment: AlignmentType.LEFT,
      });

    const doc = new Document({
      styles: {
        default: {
          document: {
            run: { font: 'Georgia', size: 22 },
            // Reset Word's default spacing so our explicit values are respected
            paragraph: { spacing: { after: 0, line: 240 } },
          },
        },
      },
      sections: [
        {
          properties: {
            page: {
              size: { width: 12240, height: 15840 },
              margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
            },
          },
          children: [
            // ── NAME ────────────────────────────────────────────────────
            new Paragraph({
              spacing: { before: 0, after: 40, line: 240 },
              children: [
                new TextRun({
                  text: candidateName || 'Your Name',
                  bold: true,
                  size: 56,   // 28 pt — was 28 (= 14 pt, a bug)
                  color: BLUE,
                  font: 'Arial',
                }),
              ],
            }),

            // ── CONTACT LINE ─────────────────────────────────────────────
            ...(contactLine
              ? [
                  new Paragraph({
                    spacing: { before: 0, after: 0, line: 240 },
                    children: [
                      new TextRun({ text: contactLine, size: 20, color: GRAY, font: 'Arial' }),
                    ],
                  }),
                ]
              : []),

            // ── BLUE DIVIDER ─────────────────────────────────────────────
            new Paragraph({
              border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: BLUE, space: 1 } },
              spacing: { before: 120, after: 240, line: 240 },
              children: [new TextRun({ text: ' ', size: 12 })],
            }),

            // ── BODY PARAGRAPHS ──────────────────────────────────────────
            ...stripClosing(coverLetter)
              .split('\n\n')
              .map(para => para.trim())
              .filter(Boolean)
              .map(para => bodyPara(para)),

            // ── CLOSING ──────────────────────────────────────────────────
            new Paragraph({
              spacing: { before: 240, after: 60, line: 240 },
              children: [new TextRun({ text: 'Best regards,', size: 22, color: BODY, font: 'Georgia' })],
            }),
            new Paragraph({
              spacing: { before: 0, after: 0, line: 240 },
              children: [
                new TextRun({
                  text: candidateName || 'Your Name',
                  bold: true,
                  size: 22,
                  color: BLUE,
                  font: 'Georgia',
                }),
              ],
            }),
          ],
        },
      ],
    });

    return Packer.toBlob(doc);
  }

  // ── Cover Letter PDF ───────────────────────────────────────────────────────
}

