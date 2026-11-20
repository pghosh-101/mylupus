import { DEMO } from '@/lib/demo';
import { LAB_TESTS } from '@/lib/labs';

/**
 * Claude API key, read from the local .env.local file (never committed to GitHub).
 * It is bundled into the app on your phone, so keep a spending limit on the key.
 */
// The public demo never uses a key (and is built without .env files).
const API_KEY = DEMO ? undefined : process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;
export const hasAiKey = Boolean(API_KEY);

/**
 * Reading numbers off a report is a simple transcription task, and every result is reviewed
 * before saving, so it uses the cheapest current model.
 */
export const SCAN_MODEL = 'claude-haiku-5-5';

/** An error response from the Claude API. */
export class ClaudeApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** A content block from a response, kept as-is so it can be sent back unchanged. */
export type ContentBlock = { type: string; text?: string; [key: string]: unknown };
export type MessageResponse = { content: ContentBlock[]; stop_reason: string | null };

/**
 * POST /v1/messages over plain HTTPS. (The official TypeScript SDK doesn't load in the
 * React Native development runtime, so the app calls the REST API directly.)
 */
export async function createMessage(
  body: Record<string, unknown>,
  { timeoutMs = 120_000, betas = [] }: { timeoutMs?: number; betas?: string[] } = {},
): Promise<MessageResponse> {
  if (!API_KEY) throw new Error('No Claude API key set. Add EXPO_PUBLIC_ANTHROPIC_API_KEY to .env.local.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2026-10-21',
        // Needed only for the web version (browsers enforce CORS); ignored on the phone.
        'anthropic-dangerous-direct-browser-access': 'true',
        ...(betas.length ? { 'anthropic-beta': betas.join(',') } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    if (controller.signal.aborted) throw new Error('Claude took too long to respond. Try again.');
    throw new Error("Couldn't reach Claude. Check your internet connection.", { cause: e });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let message = res.statusText;
    try {
      const err: { error?: { message?: string } } = await res.json();
      message = err.error?.message ?? message;
    } catch {
      // Keep the status text.
    }
    throw new ClaudeApiError(res.status, message);
  }
  return (await res.json()) as MessageResponse;
}

/** Turns API errors into short, readable messages. */
export function aiErrorMessage(e: unknown): string {
  if (e instanceof ClaudeApiError) {
    if (e.status === 401) return 'The Claude API key was rejected. Check the key in .env.local.';
    if (e.status === 403) return "This API key isn't allowed to make that request.";
    if (e.status === 429) return 'Too many requests right now. Wait a minute and try again.';
    if (e.status === 400 && /credit|balance|billing/i.test(e.message)) {
      return 'Your Claude API credit has run out. Add credit in the Claude Console.';
    }
    if (e.status === 400) return `The request was rejected: ${e.message}`;
    if (e.status === 529 || e.status >= 500) return 'Claude is busy or having trouble right now. Try again in a minute.';
    return `Claude returned an error (${e.status}). Try again.`;
  }
  return e instanceof Error ? e.message : 'Something went wrong.';
}

// ---------------------------------------------------------------------------
// Reading lab reports from photos
// ---------------------------------------------------------------------------

export type ReportImage = { base64: string; mediaType: 'image/jpeg' | 'image/png' };

export type ExtractedResult = {
  /** A LAB_TESTS key, or "other". */
  test_key: string;
  name_on_report: string;
  /** "YYYY-MM-DD", or "" when the report doesn't show a date for it. */
  date: string;
  value: number;
  unit: string;
  ref_low: number | null;
  ref_high: number | null;
};

const nullableNumber = { anyOf: [{ type: 'number' }, { type: 'null' }] };

const EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['results', 'notes'],
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['test_key', 'name_on_report', 'date', 'value', 'unit', 'ref_low', 'ref_high'],
        properties: {
          test_key: { type: 'string', enum: [...LAB_TESTS.map((t) => t.key), 'other'] },
          name_on_report: { type: 'string' },
          date: { type: 'string' },
          value: { type: 'number' },
          unit: { type: 'string' },
          ref_low: nullableNumber,
          ref_high: nullableNumber,
        },
      },
    },
    notes: { type: 'string' },
  },
};

const EXTRACTION_PROMPT = `You read photos and screenshots of lab reports for a person with lupus and transcribe the numeric results exactly.

Map each result to one of these test keys when it clearly matches, otherwise use "other":
${LAB_TESTS.map((t) => `- ${t.key}: ${t.name} (${t.unit})`).join('\n')}

Matching notes: "Complement C3/C4" -> c3/c4. "dsDNA Ab", "Anti-double stranded DNA" -> dsdna. "Sed rate", "Westergren" -> esr. "C-reactive protein" (not high-sensitivity cardiac CRP unless that's the only one) -> crp. "WBC" -> wbc. Use lymph only for the ABSOLUTE lymphocyte count, not the percentage (a percentage is "other"). "HGB" -> hgb. "PLT" -> plt. "Protein/Creatinine Ratio, Urine", "UPCR" -> upcr. Serum creatinine -> creat (urine creatinine is "other"). "eGFR" -> egfr; if eGFR is shown as ">60" or ">90", use that number. "Vitamin D, 25-Hydroxy" -> vitd.

Rules:
- Transcribe only what is printed. Never guess a value you can't read; leave it out and mention it in notes.
- Only numeric results. Skip qualitative results like "Negative" or "Positive" (mention them in notes).
- For results shown as "<5" or ">60", use the number and mention it in notes.
- One entry per test per date. If the report shows several blood draws (for example a table with one column per date), give each its own entry with its own date.
- date: the collection date as YYYY-MM-DD, or "" if none is shown.
- unit: exactly as printed (e.g. "mg/dL", "K/uL", "IU/mL").
- ref_low / ref_high: from the reference range printed for that result ("<30" means ref_low null, ref_high 30). Use null when no range is printed.
- notes: a short plain-language note about anything skipped or uncertain, or "" if nothing.`;

export async function readLabReport(images: ReportImage[]): Promise<{ results: ExtractedResult[]; notes: string }> {
  const response = await createMessage({
    model: SCAN_MODEL,
    max_tokens: 16000,
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: EXTRACTION_SCHEMA },
    },
    system: EXTRACTION_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          ...images.map((img) => ({
            type: 'image',
            source: { type: 'base64', media_type: img.mediaType, data: img.base64 },
          })),
          {
            type: 'text',
            text: images.length > 1 ? `These ${images.length} images are pages of lab reports.` : 'Here is a lab report.',
          },
        ],
      },
    ],
  });

  if (response.stop_reason === 'refusal') throw new Error("Claude couldn't read this report. Try a clearer photo.");
  if (response.stop_reason === 'max_tokens') throw new Error('The report was too long to read in one go. Try fewer pages at a time.');

  const text = response.content.find((b) => b.type === 'text' && typeof b.text === 'string');
  if (!text?.text) throw new Error('No results came back. Try again.');
  let parsed: { results?: ExtractedResult[]; notes?: string };
  try {
    parsed = JSON.parse(text.text);
  } catch {
    throw new Error("Couldn't understand the reply. Try again.");
  }
  const results = (parsed.results ?? []).filter(
    (r) => typeof r.value === 'number' && Number.isFinite(r.value) && typeof r.test_key === 'string',
  );
  return { results, notes: parsed.notes ?? '' };
}
