import type { ContentBlock } from '@/lib/ai';
import type { ExtractedResult } from '@/lib/ai';

/** The sample report's collection date: two weeks before today. */
function reportDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 14);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** What the demo "scan" returns: a sample report. */
export function demoScan(): { results: ExtractedResult[]; notes: string } {
  const date = reportDate();
  const results: ExtractedResult[] = [
    { test_key: 'c3', name_on_report: 'Complement C3', date, value: 88, unit: 'mg/dL', ref_low: 90, ref_high: 180 },
    { test_key: 'c4', name_on_report: 'Complement C4', date, value: 12, unit: 'mg/dL', ref_low: 10, ref_high: 40 },
    { test_key: 'dsdna', name_on_report: 'dsDNA Ab', date, value: 81, unit: 'IU/mL', ref_low: null, ref_high: 30 },
    { test_key: 'wbc', name_on_report: 'WBC', date, value: 4.4, unit: 'K/uL', ref_low: 4.5, ref_high: 11 },
    { test_key: 'other', name_on_report: 'Lymphocytes %', date, value: 19, unit: '%', ref_low: 20, ref_high: 40 },
  ];
  return {
    results,
    notes: 'ANA titer "Positive (1:320)" was skipped because it isn\u2019t a single number. (Demo: this is a sample report.)',
  };
}

type DemoAnswer = { text: string; sources?: { url: string; title: string }[] };

const ANSWERS: Record<string, DemoAnswer> = {
  'What tends to come before my flares?': {
    text: `Your most recent flare started about three weeks ago, and the five days before it looked different from your usual pattern:
- Sleep dropped to about 5 to 5.5 hours a night, versus your usual 7 or so.
- Stress was logged as moderate every day.
- UV was higher than most days (around 4 to 5), and on one of those days you noted a long day outside without reapplying sunscreen.
- You ate out more, with fried and salty food tagged.

Your flare log also lists sun, poor sleep, and stress as suspected triggers. With only one flare tracked in detail, this could be coincidence, but it's a pattern worth watching and worth mentioning to your rheumatologist.`,
  },
  'How is my sleep affecting how I feel?': {
    text: `On nights under 7 hours, your fatigue the next evening averaged noticeably higher than after 7+ hours. The clearest example is the week before your last flare, when short nights lined up with moderate-to-severe fatigue.

Over the last two weeks your sleep has mostly been back around 7 hours and fatigue has been mild or none. That's encouraging, though a few more weeks of check-ins will make the comparison more reliable.`,
  },
  'How are my labs trending?': {
    text: `Overall the trend since your first report is moving in a good direction:
- Anti-dsDNA: 210, then 140, 95, and 88 most recently. Still above range, but your doctor noted it's coming down slowly and that this level is OK for now.
- C3: 74 up to 91, then 86 on your latest test, just under the normal range (90 to 180). Worth keeping an eye on.
- C4: back in range at 11.
- Vitamin D: up from 18 to 33, now in range.
- Urine protein/creatinine: 0.19, just under the 0.2 cutoff.

A question for your next visit: whether the small dip in C3 matters, given it followed your recent flare.`,
  },
  'Summarize the last 3 months for my rheumatologist': {
    text: `Summary of the last 3 months:
- Flares: one moderate flare about three weeks ago, lasting 4 days (joint pain and swelling, rash, fatigue). Treated with a short prednisone taper. Suspected triggers: sun, short sleep, stress.
- Medications: Plaquenil 400 mg daily and CellCept twice daily. About 92% of doses logged.
- Symptoms: mostly none or mild fatigue outside the flare. Raynaud's episodes on several cold mornings.
- Sleep: usually around 7 hours, down to 5 to 5.5 in the week before the flare.
- Labs (latest, 1 month ago): anti-dsDNA 88 (trending down; doctor says OK), C3 86 (slightly low), C4 11, WBC 4.3 (slightly low), vitamin D 33, UPCR 0.19.

Questions to bring:
- Is the C3 dip after the flare expected?
- Should I keep the same CellCept dose given the recent flare?
- Any changes to sun protection on high-UV days?`,
  },
  'What should I ask at my next appointment?': {
    text: `Based on your recent history, a few questions to bring:
- My C3 dropped from 91 to 86 after my last flare. Is that expected, or something to recheck sooner?
- My white blood cell count is slightly low (4.3). Is that from CellCept, and should we watch it?
- My last flare followed short sleep and a sunny weekend. Are there steps you'd recommend for days like that?
- I have Raynaud's on cold mornings. Is there anything that helps beyond keeping warm?`,
  },
  'What foods are generally recommended for lupus?': {
    text: `There's no single "lupus diet," and the research is limited, but reputable sources point to a few general ideas:
- A balanced, Mediterranean-style diet with plenty of vegetables, fruit, whole grains, and omega-3 fats (like fish) is commonly recommended.
- Alfalfa sprouts are often advised against, because of a compound that may stimulate the immune system.
- Calcium and vitamin D matter, especially if you've taken steroids.
- Limiting very salty and processed food helps with blood pressure and kidney health.

Connecting it to your logs: you've been eating mostly home-cooked meals lately, and the week before your last flare was heavier on eating out and fried food. Your doctor or a dietitian can tailor advice to you.`,
    sources: [
      { url: 'https://www.lupus.org/resources/diet-and-nutrition-with-lupus', title: 'Diet and nutrition with lupus | Lupus Foundation of America' },
      { url: 'https://www.hopkinslupus.org/lupus-info/lifestyle-additional-information/lupus-diet/', title: 'Lupus Diet | Johns Hopkins Lupus Center' },
    ],
  },
};

const FALLBACK: DemoAnswer = {
  text: `This is the demo, so answers are pre-written examples rather than live responses. Try one of the suggested questions to see how the assistant works.

In the full app, Claude answers any question using your own logged history (symptoms, sleep, meals, flares, medications, labs, and UV), and can search reputable medical sources for general questions.`,
};

/** A pre-written answer, shaped like an API response (text plus citations for sources). */
export function demoAnswer(question: string): ContentBlock[] {
  const a = ANSWERS[question.trim()] ?? FALLBACK;
  const blocks: ContentBlock[] = [{ type: 'text', text: a.text }];
  if (a.sources?.length) {
    blocks.push({
      type: 'text',
      text: '',
      citations: a.sources.map((s) => ({ type: 'web_search_result_location', url: s.url, title: s.title })),
    });
  }
  return blocks;
}
