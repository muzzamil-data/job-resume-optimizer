import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  BorderStyle,
  LevelFormat,
} from 'docx';
import jsPDF from 'jspdf';
import type { ParsedResume } from '../types';

// Strips the closing block ("Best regards, / Sincerely, / ...") from letter text
// so document generators can render their own styled closing without duplicating it
function stripClosing(text: string): string {
  const lines = text.split('\n');
  const idx = lines.findIndex(l =>
    /^(best regards|sincerely|regards|warm regards)/i.test(l.trim())
  );
  return idx === -1 ? text : lines.slice(0, idx).join('\n').trimEnd();
}

// ── Design tokens ────────────────────────────────────────────────────────────
const BLUE   = '1B3F6B';   // #1B3F6B  dark blue  – name & section headers
const BODY   = '1A1A1A';   // #1A1A1A  near-black – body text
const GRAY   = '555555';   // grey                – dates / muted text
const BLUE_RGB: [number, number, number] = [27, 63, 107];
const BODY_RGB: [number, number, number] = [26, 26, 26];
const GRAY_RGB: [number, number, number] = [85, 85, 85];

export class DocumentGenerator {
  // ── DOCX ───────────────────────────────────────────────────────────────────
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
  async generatePDF(resume: ParsedResume, jobTitle: string): Promise<Blob> {
    // US Letter — matches DOCX page size
    const pdf = new jsPDF({ unit: 'mm', format: 'letter' });
    const PW = pdf.internal.pageSize.getWidth();   // 215.9 mm
    const PH = pdf.internal.pageSize.getHeight();  // 279.4 mm
    const M  = 19;                                 // 0.75 in ≈ 19 mm (matches DOCX 1080 twips)
    const CW = PW - M * 2;
    const BULLET_INDENT = 4;                       // mm — bullet char width + gap
    let y = M;

    const targetTitle = resume.jobTitle || jobTitle;

    // ── Helpers ──────────────────────────────────────────────────────────────
    const checkPage = (needed = 20) => {
      if (y + needed > PH - M) { pdf.addPage(); y = M; }
    };

    const setColor = (rgb: [number, number, number]) =>
      pdf.setTextColor(rgb[0], rgb[1], rgb[2]);

    const setDraw = (rgb: [number, number, number], w: number) => {
      pdf.setDrawColor(rgb[0], rgb[1], rgb[2]);
      pdf.setLineWidth(w);
    };

    // Line height in mm: fontsize (pt) × 0.3528 (pt→mm) × leading multiplier
    // Use 1.15 — matches jsPDF's internal getLineHeightFactor() default so our
    // manual y-tracking stays in sync with what jsPDF actually renders.
    const lh = (pt: number, leading = 1.15) => pt * 0.3528 * leading;

    const hRule = (thickness = 0.5, rgb = BLUE_RGB, gap = 2) => {
      setDraw(rgb, thickness);
      pdf.line(M, y, PW - M, y);
      y += gap;
    };

    const sectionHeader = (title: string) => {
      checkPage(18);
      // 2 mm pre-gap matches DOCX spacing.before: 9 pt ≈ 3.2 mm minus the
      // cap-height already accounted for, giving ~4.3 mm visual white-space
      // between the previous section's last line and this title — same as DOCX.
      y += 2;
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      setColor(BLUE_RGB);
      pdf.text(title.toUpperCase(), M, y);
      // Rule sits tight below the text (like DOCX border space:1).
      // We advance only past the descenders, NOT a full line height,
      // so the rule appears attached to the section title.
      y += 1.2;
      // Gap after rule must exceed the cap height of whatever comes next
      // (2.79 mm for 11 pt, 2.41 mm for 9.5 pt). 3.5 mm clears both safely.
      hRule(0.5, BLUE_RGB, 3.5);
    };

    // Measure text width at current font settings
    const tw = (text: string) => pdf.getTextWidth(text);

    // ── HEADER ───────────────────────────────────────────────────────────────
    // Name: 26 pt bold, centred, BLUE — matches DOCX size: 52 (= 26 pt)
    pdf.setFontSize(26);
    pdf.setFont('helvetica', 'bold');
    setColor(BLUE_RGB);
    pdf.text((resume.name || 'Your Name').toUpperCase(), PW / 2, y, { align: 'center' });
    y += lh(26, 1.05);

    // Target job title: 11 pt italic, centred, GRAY
    if (targetTitle) {
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'italic');
      setColor(GRAY_RGB);
      pdf.text(targetTitle, PW / 2, y, { align: 'center' });
      y += lh(11, 1.1);
    }

    // Contact: 9 pt, centred, GRAY
    const contact = [resume.email, resume.phone, resume.location]
      .filter(Boolean)
      .join('   |   ');
    if (contact) {
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      setColor(GRAY_RGB);
      pdf.text(contact, PW / 2, y, { align: 'center' });
      y += lh(9, 1.1) + 2;
    }

    hRule(0.8, BLUE_RGB, 3.5);

    // ── PROFESSIONAL SUMMARY ─────────────────────────────────────────────────
    if (resume.summary) {
      sectionHeader('Professional Summary');
      pdf.setFontSize(9.5);
      pdf.setFont('helvetica', 'normal');
      setColor(BODY_RGB);
      const lines = pdf.splitTextToSize(resume.summary, CW);
      pdf.text(lines, M, y);
      y += lines.length * lh(9.5) + 2;
    }

    // ── CORE COMPETENCIES ────────────────────────────────────────────────────
    if ((resume.coreCompetencies || []).length > 0) {
      sectionHeader('Core Competencies');
      pdf.setFontSize(9.5);
      pdf.setFont('helvetica', 'normal');
      setColor(BODY_RGB);
      const compText = (resume.coreCompetencies || []).join('   •   ');
      const lines = pdf.splitTextToSize(compText, CW);
      pdf.text(lines, M, y);
      y += lines.length * lh(9.5) + 2;
    }

    // ── PROFESSIONAL EXPERIENCE ───────────────────────────────────────────────
    sectionHeader('Professional Experience');

    for (const exp of resume.experience) {
      checkPage(22);

      // Single-line header: Title (bold 11pt BODY) | Company (bold 10pt BLUE) | dates | location (9.5pt GRAY)
      // — mirrors DOCX single-line TextRun layout exactly
      const dates = [exp.startDate, exp.endDate || 'Present']
        .filter(Boolean)
        .join(' – ');

      let xPos = M;

      // Title: bold 11 pt
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      setColor(BODY_RGB);
      pdf.text(exp.title, xPos, y);
      xPos += tw(exp.title);

      // Pipe separator
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      setColor(GRAY_RGB);
      const pipe = '  |  ';
      pdf.text(pipe, xPos, y);
      xPos += tw(pipe);

      // Company: bold 10 pt BLUE
      pdf.setFont('helvetica', 'bold');
      setColor(BLUE_RGB);
      pdf.text(exp.company, xPos, y);
      xPos += tw(exp.company);

      // dates | location: normal 9.5 pt GRAY — only render what fits
      const tail = [dates, exp.location].filter(Boolean).join('  |  ');
      if (tail) {
        pdf.setFontSize(9.5);
        pdf.setFont('helvetica', 'normal');
        setColor(GRAY_RGB);
        const tailStr = '  |  ' + tail;
        const remaining = PW - M - xPos;
        if (remaining > 8) {
          const clipped = pdf.splitTextToSize(tailStr, remaining)[0];
          pdf.text(clipped, xPos, y);
        }
      }

      y += lh(11, 1.1);

      // Bullets with proper hanging indent: • at M, text at M + BULLET_INDENT
      for (const bullet of exp.bullets) {
        checkPage(8);
        pdf.setFontSize(9.5);
        pdf.setFont('helvetica', 'normal');
        setColor(BODY_RGB);
        const bulletLines = pdf.splitTextToSize(bullet, CW - BULLET_INDENT);
        pdf.text('•', M, y);
        pdf.text(bulletLines, M + BULLET_INDENT, y);
        y += bulletLines.length * lh(9.5);
      }
      y += 2.5;
    }

    // ── EDUCATION ────────────────────────────────────────────────────────────
    if (resume.education.length > 0) {
      sectionHeader('Education');
      for (const edu of resume.education) {
        checkPage(12);

        // Single-line: Degree (bold 11pt) | School, Location | Date (9.5pt GRAY)
        // — mirrors DOCX single-line TextRun layout exactly
        let xPos = M;

        pdf.setFontSize(11);
        pdf.setFont('helvetica', 'bold');
        setColor(BODY_RGB);
        pdf.text(edu.degree, xPos, y);
        xPos += tw(edu.degree);

        const schoolPart = [edu.school, edu.location].filter(Boolean).join(', ');
        const detail = [schoolPart, edu.graduationDate].filter(Boolean).join('  |  ');
        if (detail) {
          pdf.setFontSize(9.5);
          pdf.setFont('helvetica', 'normal');
          setColor(GRAY_RGB);
          const remaining = PW - M - xPos;
          if (remaining > 8) {
            const clipped = pdf.splitTextToSize('  |  ' + detail, remaining)[0];
            pdf.text(clipped, xPos, y);
          }
        }

        y += lh(11, 1.1) + 1;
      }
    }

    // ── CERTIFICATIONS ───────────────────────────────────────────────────────
    // Single bullet-separated paragraph — matches DOCX layout
    if ((resume.certifications || []).length > 0) {
      sectionHeader('Certifications');
      pdf.setFontSize(9.5);
      pdf.setFont('helvetica', 'normal');
      setColor(BODY_RGB);
      const certText = (resume.certifications || []).join('  •  ');
      const lines = pdf.splitTextToSize(certText, CW);
      pdf.text(lines, M, y);
      y += lines.length * lh(9.5) + 2;
    }

    // ── TECHNICAL SKILLS ─────────────────────────────────────────────────────
    if (resume.skills.length > 0) {
      sectionHeader('Technical Skills');
      pdf.setFontSize(9.5);
      pdf.setFont('helvetica', 'normal');
      setColor(BODY_RGB);
      const skillLines = pdf.splitTextToSize(resume.skills.join('  •  '), CW);
      pdf.text(skillLines, M, y);
    }

    return pdf.output('blob');
  }

  // ── Cover Letter DOCX ──────────────────────────────────────────────────────
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
  async generateCoverLetterPDF(
    coverLetter: string,
    candidateName?: string,
    email?: string,
    phone?: string,
    location?: string
  ): Promise<Blob> {
    const pdf = new jsPDF({ unit: 'mm', format: 'letter' });
    const PW = pdf.internal.pageSize.getWidth();
    const PH = pdf.internal.pageSize.getHeight();
    const M  = 25.4;   // 1 in margin — matches cover letter DOCX (1440 twips)
    const CW = PW - M * 2;
    let y = M;

    const lh = (pt: number, leading = 1.15) => pt * 0.3528 * leading;

    const checkPage = (needed = 20) => {
      if (y + needed > PH - M) { pdf.addPage(); y = M; }
    };

    // ── NAME ─────────────────────────────────────────────────────────────────
    pdf.setFontSize(28);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(BLUE_RGB[0], BLUE_RGB[1], BLUE_RGB[2]);
    pdf.text(candidateName || 'Your Name', M, y);
    y += lh(28, 1.05);

    // ── CONTACT LINE ─────────────────────────────────────────────────────────
    const contact = [email, phone, location].filter(Boolean).join('  |  ');
    if (contact) {
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(GRAY_RGB[0], GRAY_RGB[1], GRAY_RGB[2]);
      pdf.text(contact, M, y);
      y += lh(10, 1.1);
    }

    // ── BLUE DIVIDER ─────────────────────────────────────────────────────────
    y += 3;
    pdf.setDrawColor(BLUE_RGB[0], BLUE_RGB[1], BLUE_RGB[2]);
    pdf.setLineWidth(0.5);
    pdf.line(M, y, PW - M, y);
    y += 7;

    // ── BODY PARAGRAPHS ──────────────────────────────────────────────────────
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(BODY_RGB[0], BODY_RGB[1], BODY_RGB[2]);

    const paragraphs = stripClosing(coverLetter)
      .split('\n\n')
      .map((p: string) => p.trim())
      .filter(Boolean);

    for (const para of paragraphs) {
      checkPage(20);
      const lines = pdf.splitTextToSize(para, CW);
      pdf.text(lines, M, y);
      y += lines.length * lh(11) + 5;
    }

    // ── CLOSING ──────────────────────────────────────────────────────────────
    checkPage(20);
    y += 3;
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(BODY_RGB[0], BODY_RGB[1], BODY_RGB[2]);
    pdf.text('Best regards,', M, y);
    y += lh(11, 1.5);

    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(BLUE_RGB[0], BLUE_RGB[1], BLUE_RGB[2]);
    pdf.text(candidateName || 'Your Name', M, y);

    return pdf.output('blob');
  }

  downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
