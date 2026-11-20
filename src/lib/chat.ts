import AsyncStorage from '@react-native-async-storage/async-storage';

import { createMessage, type ContentBlock } from '@/lib/ai';
import {
  lastDates,
  LEVEL_LABEL,
  loadEvening,
  loadFlares,
  loadHistory,
  loadRaynaud,
  loadSleep,
  loadWeatherLog,
  weeklyInsights,
} from '@/lib/daily';
import {
  byTest,
  flagFor,
  formatValue,
  labName,
  loadLabNames,
  loadLabs,
  loadTestNotes,
} from '@/lib/labs';
import {
  FOOD_RULE_HINT,
  formatMinutes,
  loadDoseLog,
  loadMeds,
  loadRoutine,
  supplyInfo,
  todayString,
} from '@/lib/meds';
import { Settings } from '@/lib/settings';
import { loadSunscreenLog } from '@/lib/sunscreen';

/**
 * The chat assistant answers questions that need reasoning over the user's history,
 * so it uses the mid-priced current model rather than the cheapest.
 */
export const CHAT_MODEL = 'claude-sonnet-5-5';

/** How many days of daily logs and weather go into each chat. */
const LOG_DAYS = 90;

export type ChatMessage =
  | { role: 'user'; content: string; at: number }
  /** Assistant turns keep the API's content blocks exactly as returned, so they can be sent back unchanged. */
  | { role: 'assistant'; content: ContentBlock[]; at: number };

export type Conversation = {
  id: string;
  startedAt: number;
  /** Snapshot of the user's data, taken when the chat started and never changed afterwards. */
  context: string;
  messages: ChatMessage[];
  /**
   * The exact system prompt this chat started with. Re-sent unchanged on every turn, so app
   * updates that change the prompt never edit an ongoing chat's history.
   */
  systemPrompt?: string;
  /**
   * Whether this chat can search the web. Fixed when the chat starts, because changing the
   * tools mid-conversation would edit its history.
   */
  webSearch?: boolean;
};

/** Claude's server-side web search tool. Searches only happen when a question needs them. */
const WEB_SEARCH_TOOL = { type: 'web_search_20260209', name: 'web_search', max_uses: 3 };

const KEY = 'mylupus.chat';

export async function loadConversation(): Promise<Conversation | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Conversation) : null;
  } catch {
    return null;
  }
}

async function saveConversation(c: Conversation | null) {
  try {
    if (c) await AsyncStorage.setItem(KEY, JSON.stringify(c));
    else await AsyncStorage.removeItem(KEY);
  } catch {
    // Not fatal.
  }
}

export const clearConversation = () => saveConversation(null);

/** The visible text of an assistant turn. */
export function textOf(m: ChatMessage): string {
  if (m.role === 'user') return m.content;
  return m.content
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    // Citations split a paragraph into several text blocks, so join them without extra breaks.
    .join('')
    .trim();
}

export type Source = { url: string; title: string };

/** Web pages an assistant turn cited, deduplicated. */
export function sourcesOf(m: ChatMessage): Source[] {
  if (m.role === 'user') return [];
  const seen = new Map<string, Source>();
  for (const b of m.content) {
    const citations = (b.citations as { url?: string; title?: string }[] | undefined) ?? [];
    for (const c of citations) {
      if (c.url && !seen.has(c.url)) seen.set(c.url, { url: c.url, title: c.title || c.url });
    }
  }
  return [...seen.values()];
}

// ---------------------------------------------------------------------------
// The data snapshot
// ---------------------------------------------------------------------------

const fmtDate = (d: string) => d; // ISO dates are unambiguous for the model.
const fmtTime = (t: number) => new Date(t).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

/** Everything MyLupus knows, as compact plain text for the model. */
export async function buildContext(): Promise<string> {
  const [history, meds, routine, doseLog, sleep, evening, flares, raynaud, weather, labs, notes, sunscreen, insights] =
    await Promise.all([
      loadHistory(),
      loadMeds(),
      loadRoutine(),
      loadDoseLog(),
      loadSleep(),
      loadEvening(),
      loadFlares(),
      loadRaynaud(),
      loadWeatherLog(),
      loadLabs(),
      loadTestNotes(),
      loadSunscreenLog(),
      weeklyInsights(),
    ]);
  await loadLabNames();

  const days = lastDates(LOG_DAYS);
  const since = days[0];
  const out: string[] = [];
  const section = (title: string) => out.push('', `## ${title}`);

  out.push(`Snapshot taken ${fmtTime(Date.now())} (today is ${todayString()}).`);
  out.push(`Name: ${Settings.name || 'not given'}. Condition: lupus (SLE). UV limit: protects from sun when UV is above ${Settings.uvThreshold}.`);

  section('Medical history (entered by the user)');
  out.push(`Diagnosed: ${history.diagnosed || 'not entered'}`);
  if (history.pastMeds) out.push(`Past medications: ${history.pastMeds}`);
  if (history.otherConditions) out.push(`Other conditions: ${history.otherConditions}`);
  if (history.allergies) out.push(`Allergies: ${history.allergies}`);
  if (history.notes) out.push(`Notes: ${history.notes}`);

  section('Current medications');
  if (!meds.length) out.push('None entered.');
  for (const m of meds) {
    const supply = supplyInfo(m);
    out.push(
      `- ${m.name}: ${m.pillsPerDose} pill(s) at ${m.doseTimes.map(formatMinutes).join(', ')}; ${FOOD_RULE_HINT[m.foodRule]}` +
        (m.spacingHours ? `; keep ${m.spacingHours}h from other meds` : '') +
        (m.instructions ? `; instructions: ${m.instructions}` : '') +
        (m.sideEffects ? `; side effects to watch: ${m.sideEffects}` : '') +
        (supply ? `; about ${supply.pillsLeft} pills left, runs out around ${todayString(supply.runOut)}` : ''),
    );
  }
  out.push(
    `Daily routine: wake ${formatMinutes(routine.wake)}, breakfast ${formatMinutes(routine.breakfast)}, lunch ${formatMinutes(routine.lunch)}, dinner ${formatMinutes(routine.dinner)}, bed ${formatMinutes(routine.bed)}.`,
  );

  section(`Medication log since ${since} (date: taken/skipped doses)`);
  const byDay = new Map<string, { taken: string[]; skipped: number }>();
  for (const e of doseLog) {
    const [date, medId] = e.key.split('|');
    if (date < since) continue;
    const day = byDay.get(date) ?? { taken: [], skipped: 0 };
    const med = meds.find((m) => m.id === medId);
    if (e.status === 'taken') day.taken.push(`${med ? med.name.split(' (')[0] : 'med'} ${new Date(e.at).toTimeString().slice(0, 5)}`);
    else day.skipped++;
    byDay.set(date, day);
  }
  const scheduledPerDay = meds.reduce((n, m) => n + m.doseTimes.length, 0);
  out.push(`${scheduledPerDay} doses scheduled per day. Days with nothing logged may mean doses weren't recorded, not necessarily missed.`);
  for (const d of days) {
    const day = byDay.get(d);
    if (day) out.push(`${d}: taken ${day.taken.length}/${scheduledPerDay} (${day.taken.join(', ')})${day.skipped ? `, skipped ${day.skipped}` : ''}`);
  }

  section(`Daily check-ins since ${since}`);
  out.push('Symptoms are rated mild/moderate/severe; only symptoms above none are listed.');
  let anyDay = false;
  for (const d of days) {
    const s = sleep[d];
    const e = evening[d];
    const w = weather[d];
    if (!s && !e) continue;
    anyDay = true;
    const parts: string[] = [];
    if (s) parts.push(`sleep ${s.hours}h (${s.quality})`);
    if (e) {
      const symptoms = Object.entries(e.symptoms)
        .filter(([, v]) => (v ?? 0) > 0)
        .map(([k, v]) => `${k} ${LEVEL_LABEL[v!].toLowerCase()}`);
      parts.push(symptoms.length ? `symptoms: ${symptoms.join(', ')}` : 'no symptoms');
      parts.push(`stress ${LEVEL_LABEL[e.stress].toLowerCase()}`);
      if (e.diet) parts.push(`ate ${e.diet}`);
      parts.push(`meals ${e.homeMeals} home-cooked / ${e.outMeals} eaten out`);
      if (e.dietTags.length) parts.push(`food: ${e.dietTags.join(', ')}`);
      if (e.notes) parts.push(`notes: "${e.notes}"`);
    }
    if (w?.uvMax != null) parts.push(`max UV ${w.uvMax}`);
    out.push(`${fmtDate(d)}: ${parts.join('; ')}`);
  }
  if (!anyDay) out.push('No check-ins yet.');

  section('Flares (all, including past ones the user added)');
  if (!flares.length) out.push('None logged.');
  for (const f of [...flares].sort((a, b) => a.start.localeCompare(b.start))) {
    out.push(
      `- Started ${f.start}${f.start.length === 7 ? ' (month only)' : ''}; ${['', 'mild', 'moderate', 'severe'][f.severity]}; ` +
        (f.ongoing ? 'ongoing' : f.durationDays ? `lasted ${f.durationDays} days` : 'ended') +
        (f.symptoms.length ? `; symptoms: ${f.symptoms.join(', ')}` : '') +
        (f.triggers.length ? `; suspected triggers: ${f.triggers.join(', ')}` : '') +
        (f.treatment ? `; treatment: ${f.treatment}` : '') +
        (f.notes ? `; notes: ${f.notes}` : ''),
    );
  }

  section('Lab results (all, oldest to newest per test)');
  const grouped = byTest(labs);
  if (!grouped.size) out.push('None entered.');
  for (const [test, results] of grouped) {
    const latest = results[results.length - 1];
    const range =
      latest.low !== null && latest.high !== null
        ? `${latest.low}-${latest.high}`
        : latest.high !== null
          ? `<${latest.high}`
          : latest.low !== null
            ? `>${latest.low}`
            : 'no range';
    out.push(
      `- ${labName(test)} (${latest.unit}, normal ${range}): ` +
        results
          .map((r) => {
            const flag = flagFor(r);
            return `${r.date} ${formatValue(r.value)}${flag === 'low' || flag === 'high' ? ` ${flag}` : ''}${r.note ? ` [note: ${r.note}]` : ''}`;
          })
          .join('; '),
    );
    const n = notes[test];
    if (n) out.push(`  Doctor's note: ${n.okForMe ? "Doctor says this level is OK for the user. " : ''}${n.note}`);
  }

  section(`Sun and weather since ${since}`);
  const applied = sunscreen.filter((e) => e.type === 'applied' && todayString(new Date(e.at)) >= since);
  out.push(`Sunscreen logged ${applied.length} times.`);
  const highUvDays = days.filter((d) => (weather[d]?.uvMax ?? 0) > Settings.uvThreshold);
  out.push(`Days with max UV above ${Settings.uvThreshold}: ${highUvDays.length ? highUvDays.join(', ') : 'none recorded'}.`);
  const weatherDays = days.filter((d) => weather[d]);
  if (weatherDays.length) {
    out.push('Daily weather (max UV; low-high °F; humidity %; pressure mb):');
    for (const d of weatherDays) {
      const w = weather[d];
      out.push(`${d}: UV ${w.uvMax ?? '?'}; ${w.tempMinF ?? '?'}-${w.tempMaxF ?? '?'}°F; ${w.humidity ?? '?'}%; ${w.pressureMb ?? '?'}mb`);
    }
  }
  const recentRaynaud = raynaud.filter((e) => todayString(new Date(e.at)) >= since);
  out.push(
    `Raynaud's episodes: ${
      recentRaynaud.length
        ? recentRaynaud.map((e) => `${fmtTime(e.at)}${e.tempF !== null ? ` (${Math.round(e.tempF)}°F)` : ''}`).join('; ')
        : 'none logged'
    }.`,
  );

  section("This week's automatic pattern report");
  out.push(insights.length ? insights.map((i) => `- ${i.title}: ${i.detail}`).join('\n') : 'Not enough check-ins yet.');

  return out.join('\n');
}

// ---------------------------------------------------------------------------
// Asking
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are the assistant inside MyLupus, a personal app someone uses to track their own lupus: symptoms, sleep, stress, meals, flares, medications, labs, UV and weather. You answer their questions using the data snapshot below.

How to answer:
- Ground answers in their data. Mention the specific dates, numbers, and entries you're relying on, briefly.
- Say plainly when the data is too thin to tell (few check-ins, gaps, one lab result). Don't fill gaps with guesses.
- Describe patterns as correlations, not causes ("flares have followed weeks of short sleep" rather than "short sleep causes your flares"), and note that a few data points can be coincidence.
- Where general lupus knowledge helps, you can add it, clearly separated from what their data shows.
- For general questions (foods, exercise, weather, research, what a test means) use web search when it's available and the answer benefits from current or authoritative information. Prefer reputable medical sources: the Lupus Foundation of America, Lupus Research Alliance, NIH and NIAMS, CDC, Mayo Clinic, Cleveland Clinic, Johns Hopkins Lupus Center, and peer-reviewed research. Avoid blogs, forums, and sites selling products. Say when evidence is limited or mixed (for example, most diet advice for lupus has limited evidence). Where it helps, connect the general answer back to their own data.
- Don't search for questions about their own history; the data below has everything you need for those.
- A doctor's note on a lab (especially "Doctor says this level is OK") reflects their care team's judgment. Respect it and don't raise alarm about that level, but do point out new changes.
- Be warm and direct. Lead with the answer. Keep it short: a few sentences or a short list, unless they ask for a summary or report.

Boundaries:
- Don't diagnose, and don't tell them to start, stop, or change a medication or dose. Suggest questions to bring to their rheumatologist instead.
- If they describe warning signs (chest pain, trouble breathing, a high fever while on immune-suppressing medication, confusion, severe headache, signs of a blood clot, very little urine or swelling), tell them to contact their doctor promptly or seek urgent care, before anything else.
- They see your reply as plain text on a phone. Don't use markdown headings, bold, italics, or tables. Use short paragraphs, and "- " for lists.`;

/**
 * Send a question. Starts a new conversation (with a fresh data snapshot) if there isn't one.
 * The conversation is append-only: the system prompt and snapshot never change within a chat,
 * and earlier turns are sent back exactly as they were.
 */
export async function ask(question: string, existing: Conversation | null): Promise<Conversation> {
  // Chats saved by older versions of the app didn't store their prompt, so they can't be continued
  // safely; the next question starts a fresh chat instead.
  const convo: Conversation = (existing?.systemPrompt ? existing : null) ?? {
    id: `${Date.now()}`,
    startedAt: Date.now(),
    context: await buildContext(),
    messages: [],
    webSearch: true,
    systemPrompt: SYSTEM_PROMPT,
  };
  const withQuestion: Conversation = {
    ...convo,
    messages: [...convo.messages, { role: 'user', content: question.trim(), at: Date.now() }],
  };
  // Save the question right away so it isn't lost if the request fails.
  await saveConversation(withQuestion);

  const request = (messages: { role: string; content: unknown }[]) =>
    createMessage(
      {
        model: CHAT_MODEL,
        max_tokens: 16000,
        output_config: { effort: 'medium' },
        // If a safety classifier declines, let the API retry on a fallback model automatically.
        fallbacks: 'default',
        ...(convo.webSearch ? { tools: [WEB_SEARCH_TOOL] } : {}),
        system: [
          { type: 'text', text: convo.systemPrompt ?? SYSTEM_PROMPT },
          // The snapshot is the same for every turn of this chat, so cache it.
          {
            type: 'text',
            text: `# Their data\n${convo.context}`,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages,
      },
      { betas: ['server-side-fallback-2026-07-01'], timeoutMs: 180_000 },
    );

  const history = withQuestion.messages.map((m) => ({ role: m.role, content: m.content as unknown }));
  let response = await request(history);
  let content = response.content;
  // A long server-side search loop can pause; resume it by sending the partial turn back as-is.
  for (let i = 0; i < 3 && response.stop_reason === 'pause_turn'; i++) {
    response = await request([...history, { role: 'assistant', content }]);
    content = [...content, ...response.content];
  }

  const reply: ChatMessage = { role: 'assistant', content, at: Date.now() };
  if (response.stop_reason === 'refusal' && !textOf(reply)) {
    throw new Error("Claude couldn't answer that one. Try rephrasing the question.");
  }
  const updated: Conversation = { ...withQuestion, messages: [...withQuestion.messages, reply] };
  await saveConversation(updated);
  return updated;
}

/** Remove a trailing unanswered question (after a failed request), keeping history append-only. */
export async function dropUnanswered(convo: Conversation): Promise<Conversation> {
  const msgs = [...convo.messages];
  if (msgs.length && msgs[msgs.length - 1].role === 'user') msgs.pop();
  const updated = { ...convo, messages: msgs };
  await saveConversation(msgs.length ? updated : { ...updated });
  return updated;
}
