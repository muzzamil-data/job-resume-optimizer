/**
 * PDF parsing tests — verifies the pdfjs + base64 wire-format fix in the service worker.
 *
 * Two root causes were found and fixed:
 * 1. pdfjs in an MV3 service worker: new Worker() and dynamic import() are both
 *    unavailable. Fix: use pdfjs-dist/legacy build + set globalThis.pdfjsWorker
 *    so pdfjs uses its LoopbackPort fake-worker without spawning a real worker.
 * 2. chrome.runtime.sendMessage uses JSON serialization — ArrayBuffer becomes {}.
 *    Fix: encode bytes as base64 in the sender (resume-parser.ts) and decode in
 *    the service worker. Tests use the same base64 wire format.
 *
 * The tests send chrome.runtime.sendMessage() from the extension popup page,
 * which runs in the extension context and has full chrome.* access. This
 * exercises the real service-worker message handler end-to-end without needing
 * a UI file-picker or a real user session.
 */
import { test, expect } from '../fixtures/extension';
import type { Page } from '@playwright/test';

// ── PDF / DOCX fixture factories ──────────────────────────────────────────────

/**
 * Build a structurally valid minimal PDF (one empty page, no content stream)
 * entirely in memory. Byte offsets in the xref table are computed dynamically
 * so the document is well-formed and pdfjs will accept it without error.
 *
 * Returns a plain number[] so the array can cross the Playwright evaluate()
 * serialisation boundary (which uses JSON, not structured clone).
 */
function buildMinimalPdfBytes(): number[] {
  const header = '%PDF-1.4\n';
  const obj1   = '1 0 obj\n<</Type/Catalog/Pages 2 0 R>>\nendobj\n';
  const obj2   = '2 0 obj\n<</Type/Pages/Kids[3 0 R]/Count 1>>\nendobj\n';
  const obj3   = '3 0 obj\n<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>\nendobj\n';

  const off1    = header.length;
  const off2    = off1 + obj1.length;
  const off3    = off2 + obj2.length;
  const xrefOff = off3 + obj3.length;

  // Each xref entry must be exactly 20 bytes: offset(10) SP gen(5) SP type SP EOL
  // Using "space + LF" as the two-byte EOL, which satisfies the PDF spec.
  const pad = (n: number) => n.toString().padStart(10, '0');
  const xref =
    'xref\n0 4\n' +
    `0000000000 65535 f \n` +
    `${pad(off1)} 00000 n \n` +
    `${pad(off2)} 00000 n \n` +
    `${pad(off3)} 00000 n \n` +
    `trailer\n<</Size 4/Root 1 0 R>>\nstartxref\n${xrefOff}\n%%EOF\n`;

  return Array.from(Buffer.from(header + obj1 + obj2 + obj3 + xref, 'ascii'));
}

/**
 * Build a PDF with a simple text content stream so pdfjs has actual text to
 * extract. Uses the standard Type1 Helvetica font (built into all PDF viewers).
 * Returns a plain number[].
 */
function buildTextPdfBytes(): number[] {
  const stream   = 'BT /F1 12 Tf 100 700 Td (Hello PDF Parser) Tj ET\n';
  const streamObj =
    `4 0 obj\n<</Length ${stream.length}>>\nstream\n${stream}endstream\nendobj\n`;
  const fontObj  =
    '5 0 obj\n<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>\nendobj\n';

  const header = '%PDF-1.4\n';
  const obj1   = '1 0 obj\n<</Type/Catalog/Pages 2 0 R>>\nendobj\n';
  const obj2   = '2 0 obj\n<</Type/Pages/Kids[3 0 R]/Count 1>>\nendobj\n';
  const obj3   =
    '3 0 obj\n<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]' +
    '/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>\nendobj\n';

  const off1    = header.length;
  const off2    = off1 + obj1.length;
  const off3    = off2 + obj2.length;
  const off4    = off3 + obj3.length;
  const off5    = off4 + streamObj.length;
  const xrefOff = off5 + fontObj.length;

  const pad = (n: number) => n.toString().padStart(10, '0');
  const xref =
    'xref\n0 6\n' +
    `0000000000 65535 f \n` +
    `${pad(off1)} 00000 n \n` +
    `${pad(off2)} 00000 n \n` +
    `${pad(off3)} 00000 n \n` +
    `${pad(off4)} 00000 n \n` +
    `${pad(off5)} 00000 n \n` +
    `trailer\n<</Size 6/Root 1 0 R>>\nstartxref\n${xrefOff}\n%%EOF\n`;

  return Array.from(
    Buffer.from(header + obj1 + obj2 + obj3 + streamObj + fontObj + xref, 'ascii'),
  );
}

/**
 * Build a PDF whose content stream shows two separate text runs on the SAME
 * line ("Senior" then "Engineer" at the same Y, different X). PDF extraction
 * must join same-line runs with a space — without it the words concatenate
 * into "SeniorEngineer" and downstream AI parsing degrades badly.
 */
function buildTwoRunPdfBytes(): number[] {
  const stream   = 'BT /F1 12 Tf 100 700 Td (Senior) Tj 50 0 Td (Engineer) Tj ET\n';
  const streamObj =
    `4 0 obj\n<</Length ${stream.length}>>\nstream\n${stream}endstream\nendobj\n`;
  const fontObj  =
    '5 0 obj\n<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>\nendobj\n';

  const header = '%PDF-1.4\n';
  const obj1   = '1 0 obj\n<</Type/Catalog/Pages 2 0 R>>\nendobj\n';
  const obj2   = '2 0 obj\n<</Type/Pages/Kids[3 0 R]/Count 1>>\nendobj\n';
  const obj3   =
    '3 0 obj\n<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]' +
    '/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>\nendobj\n';

  const off1    = header.length;
  const off2    = off1 + obj1.length;
  const off3    = off2 + obj2.length;
  const off4    = off3 + obj3.length;
  const off5    = off4 + streamObj.length;
  const xrefOff = off5 + fontObj.length;

  const pad = (n: number) => n.toString().padStart(10, '0');
  const xref =
    'xref\n0 6\n' +
    `0000000000 65535 f \n` +
    `${pad(off1)} 00000 n \n` +
    `${pad(off2)} 00000 n \n` +
    `${pad(off3)} 00000 n \n` +
    `${pad(off4)} 00000 n \n` +
    `${pad(off5)} 00000 n \n` +
    `trailer\n<</Size 6/Root 1 0 R>>\nstartxref\n${xrefOff}\n%%EOF\n`;

  return Array.from(
    Buffer.from(header + obj1 + obj2 + obj3 + streamObj + fontObj + xref, 'ascii'),
  );
}

/** 64 sequential bytes — not a valid PDF or DOCX. */
function buildGarbageBytes(): number[] {
  return Array.from({ length: 64 }, (_, i) => i);
}

// ── Shared helper ─────────────────────────────────────────────────────────────

type ParseFileResult = { success: boolean; rawText?: string; error?: string };

/**
 * Send a parseFile message to the service worker from within the extension
 * popup page (which has full chrome.* access) and return the response.
 *
 * bytes is a plain number[] (JSON-safe across the Playwright evaluate boundary).
 * We encode to base64 inside evaluate before sending — chrome.runtime.sendMessage
 * uses JSON serialization which drops ArrayBuffer, so base64 is the correct wire
 * format (matching what resume-parser.ts sends in production).
 */
async function sendParseFile(
  page: Page,
  bytes: number[],
  fileType: 'pdf' | 'docx',
): Promise<ParseFileResult> {
  return page.evaluate(
    async ([byteArr, ft]: [number[], string]): Promise<ParseFileResult> => {
      const uint8 = new Uint8Array(byteArr);
      let binary = '';
      for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
      const base64 = btoa(binary);
      return new Promise<ParseFileResult>(resolve => {
        chrome.runtime.sendMessage(
          { action: 'parseFile', payload: { buffer: base64, fileType: ft } },
          (response: ParseFileResult) =>
            resolve(response ?? { success: false, error: 'No response from service worker' }),
        );
      });
    },
    [bytes, fileType] as [number[], string],
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('parseFile — PDF module-worker fix', () => {
  let popupPage: Page;

  // Open the extension popup once per test. The popup page runs in the extension
  // context so chrome.runtime.sendMessage() is fully available there.
  test.beforeEach(async ({ extensionContext, extensionId, extensionWorker: _sw }) => {
    // _sw is not used directly but requesting the fixture ensures the service
    // worker is active before any test sends a message.
    popupPage = await extensionContext.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
  });

  test.afterEach(async () => {
    await popupPage?.close();
  });

  // ── Happy-path PDF tests ───────────────────────────────────────────────────

  test('valid minimal PDF (no content) — succeeds and rawText is a string', async () => {
    const result = await sendParseFile(popupPage, buildMinimalPdfBytes(), 'pdf');

    expect(result.success).toBe(true);
    expect(typeof result.rawText).toBe('string');
    // A page with no content stream yields empty text — correct behaviour
  });

  test('PDF with text content — succeeds and rawText contains extracted text', async () => {
    const result = await sendParseFile(popupPage, buildTextPdfBytes(), 'pdf');

    expect(result.success).toBe(true);
    expect(typeof result.rawText).toBe('string');
    // pdfjs should extract the "Hello PDF Parser" string from the content stream
    expect(result.rawText).toContain('Hello PDF Parser');
  });

  test('two text runs on the same line — joined with a space, not concatenated', async () => {
    const result = await sendParseFile(popupPage, buildTwoRunPdfBytes(), 'pdf');

    expect(result.success).toBe(true);
    expect(result.rawText).toContain('Senior Engineer');
    expect(result.rawText).not.toContain('SeniorEngineer');
  });

  // ── Error message quality (the original bug) ──────────────────────────────

  test('garbage bytes as PDF — returns user-friendly error, not a raw pdfjs stack trace', async () => {
    const result = await sendParseFile(popupPage, buildGarbageBytes(), 'pdf');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Could not read the PDF file');
    // Must NOT leak pdfjs internals: stack frames, class names, or raw messages
    expect(result.error).not.toMatch(/SyntaxError|TypeError|RangeError/);
    expect(result.error).not.toMatch(/at\s+\w+\s*\(/);   // stack frame pattern
    expect(result.error).not.toMatch(/UnknownError|InvalidPDF/i);
  });

  test('garbage bytes as DOCX — returns user-friendly DOCX error, not a mammoth stack trace', async () => {
    const result = await sendParseFile(popupPage, buildGarbageBytes(), 'docx');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Could not read the DOCX file');
    expect(result.error).not.toMatch(/SyntaxError|TypeError/);
    expect(result.error).not.toMatch(/at\s+\w+\s*\(/);
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────

  test('missing buffer in payload — returns an error without crashing', async () => {
    const result = await popupPage.evaluate(
      async (): Promise<ParseFileResult> =>
        new Promise(resolve => {
          chrome.runtime.sendMessage(
            { action: 'parseFile', payload: { fileType: 'pdf' } },
            (r: ParseFileResult) =>
              resolve(r ?? { success: false, error: 'No response' }),
          );
        }),
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error!.length).toBeGreaterThan(0);
  });

  test('empty payload object — returns an error without crashing', async () => {
    const result = await popupPage.evaluate(
      async (): Promise<ParseFileResult> =>
        new Promise(resolve => {
          chrome.runtime.sendMessage(
            { action: 'parseFile', payload: {} },
            (r: ParseFileResult) =>
              resolve(r ?? { success: false, error: 'No response' }),
          );
        }),
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  test('zero-length buffer as PDF — returns the user-friendly PDF error', async () => {
    const result = await sendParseFile(popupPage, [], 'pdf');

    // Empty Uint8Array is not a valid PDF — pdfjs will reject it
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    // Should be a safe message, not a crash
    expect(result.error).not.toMatch(/at\s+\w+\s*\(/);
  });
});
