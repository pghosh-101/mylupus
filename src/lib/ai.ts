import Anthropic from '@anthropic-ai/sdk';

import { LAB_TESTS } from '@/lib/labs';

/**
 * Claude API key, read from the local .env.local file (never committed to GitHub).
 * It is bundled into the app on your phone, so keep a spending limit on the key.
 */
const API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;
export const hasAiKey = Boolean(API_KEY);

export const AI_MODEL = 'claude-opus-5-5';

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!API_KEY) throw new Error('No Claude API key set. Add EXPO_PUBLIC_ANTHROPIC_API_KEY to .env.local.');
  // The app talks to the API directly from the phone (there's no server), which the SDK
  // only allows with this flag.
  client ??= new Anthropic({ apiKey: API_KEY, dangerouslyAllowBrowser: true });
  return client;
}

/** Turns SDK errors into short, readable messages. */
export function aiErrorMessage(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return 'The Claude API key was rejected. Check the key in .env.local.';
  if (e instanceof Anthropic.PermissionDeniedError) return "This API key isn't allowed to make that request.";
  if (e instanceof Anthropic.RateLimitError) return 'Too many requests right now. Wait a minute and try again.';
  if (e instanceof Anthropic.BadRequestError) {
    return /credit|balance|billing/i.test(e.message)
      ? 'Your Claude API credit has run out. Add credit in the Claude Console.'
      : `The request was rejected: ${e.message}`;
  }
  if (e instanceof Anthropic.APIConnectionError) return "Couldn't reach Claude. Check your internet connection.";
  if (e instanceof Anthropic.APIError) return `Claude returned an error (${e.status ?? 'unknown'}). Try again.`;
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
  const response = await getClient().beta.messages.create({
    model: AI_MODEL,
    max_tokens: 16000,
    // If a safety classifier declines, let the API retry on a fallback model automatically.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
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
            type: 'image' as const,
            source: { type: 'base64' as const, media_type: img.mediaType, data: img.base64 },
          })),
          {
            type: 'text' as const,
            text: images.length > 1 ? `These ${images.length} images are pages of lab reports.` : 'Here is a lab report.',
          },
        ],
      },
    ],
  });

  if (response.stop_reason === 'refusal') throw new Error("Claude couldn't read this report. Try a clearer photo.");
  if (response.stop_reason === 'max_tokens') throw new Error('The report was too long to read in one go. Try fewer pages at a time.');

  const text = response.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') throw new Error('No results came back. Try again.');
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
