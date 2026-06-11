// Shared JSON extraction for AI responses.
// Used by both the content-script AI service and the background service worker,
// so it must stay dependency-free (no chrome.*, no UI libs).

// Extract the first balanced JSON object from a response string.
// Handles markdown fences, leading text, and multiple JSON blocks (picks first).
export function extractAndParseJSON(response: string): any {
  // Strip markdown code fences wrapping the JSON
  const text = response
    .replace(/^```(?:json)?\s*/im, '')
    .replace(/```\s*$/im, '')
    .trim();

  // Find the first '{' and extract via balanced brace counting
  const start = text.indexOf('{');
  if (start === -1) {
    throw new Error('AI response contained no JSON object. Please try again.');
  }

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        const jsonStr = text.slice(start, i + 1);
        try {
          return JSON.parse(jsonStr);
        } catch {
          throw new Error('AI returned malformed JSON. Please try again.');
        }
      }
    }
  }

  throw new Error('AI returned incomplete JSON (unbalanced braces). Please try again.');
}
