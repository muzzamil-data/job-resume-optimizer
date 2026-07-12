export const EXTENSION_RELOAD_MSG =
  'The extension was updated or reloaded. Please refresh this page to continue.';

export function isContextInvalidatedError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('extension context invalidated') ||
    msg.includes('could not establish connection') ||
    msg.includes('receiving end does not exist')
  );
}

// Strip XML-special characters so user-supplied text cannot escape tag boundaries.
// Escape & first (before < and >) so &lt; in input doesn't become < after entity decode.
export function sanitizeUserContent(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function generateFilename(type: 'resume' | 'cover-letter', jobTitle: string, company: string): string {
  const sanitize = (str: string) => str.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const prefix = type === 'resume' ? 'resume' : 'cover_letter';
  return `${prefix}_${sanitize(company)}_${sanitize(jobTitle)}_${Date.now()}`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

