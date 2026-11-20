import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Demo mode: the public web version. It's built with EXPO_PUBLIC_DEMO=1 and no .env files,
 * so it contains no API keys. It fills the app with sample data for a fictional user and uses
 * pre-written examples instead of calling Claude.
 */
export const DEMO = process.env.EXPO_PUBLIC_DEMO === '1';

const SEEDED_KEY = 'mylupus.demoSeeded';

// Small deterministic random generator, so the sample data looks the same on every visit.
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};
const at = (d: Date, hour: number, minute = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, minute).getTime();

/** Fill storage with realistic sample data the first time the demo opens. */
export async function seedDemoData() {
  if (!DEMO) return;
  try {
    if (await AsyncStorage.getItem(SEEDED_KEY)) return;
  } catch {
    return;
  }
  const rand = rng(42);
  const DAYS = 60;
  // A flare 18 to 21 days ago, preceded by short sleep, stress, and higher UV.
  const flareStart = 21;
  const flareLen = 4;
  const inFlare = (n: number) => n <= flareStart && n > flareStart - flareLen;
  const lead = (n: number) => n > flareStart && n <= flareStart + 5;

  const sleep: Record<string, unknown> = {};
  const evening: Record<string, unknown> = {};
  const weather: Record<string, unknown> = {};
  const doseLog: { key: string; status: string; at: number }[] = [];
  const sunscreen: { type: string; at: number }[] = [];
  const raynaud: { at: number; tempF: number | null }[] = [];
  const routineLog: { key: string; status: string; at: number }[] = [];

  for (let n = DAYS; n >= 0; n--) {
    const d = daysAgo(n);
    const date = iso(d);
    const uvMax = Math.round((lead(n) ? 4.2 + rand() : 2 + rand() * 2.2) * 10) / 10;
    const tempMax = Math.round(58 + rand() * 12 - (n < 14 ? 6 : 0));
    const tempMin = tempMax - 12 - Math.round(rand() * 5);
    weather[date] = {
      date,
      uvMax,
      tempMinF: tempMin,
      tempMaxF: tempMax,
      humidity: Math.round(45 + rand() * 30),
      pressureMb: Math.round(1008 + rand() * 14),
      conditions: uvMax > 3.5 ? 'Sunny' : rand() > 0.5 ? 'Partly cloudy' : 'Cloudy',
    };
    if (n === 0) {
      // Today: doses and meals earlier than now are already done, so the demo looks like a normal day.
      // Check-ins are left for the visitor to try.
      const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
      const todays: [string, number, number][] = [
        ['plaquenil', 0, 8 * 60 + 35],
        ['cellcept', 0, 11 * 60 + 40],
        ['cellcept', 1, 23 * 60 + 30],
      ];
      for (const [id, i, m] of todays) {
        if (m < nowMin) doseLog.push({ key: `${date}|${id}|${i}`, status: 'taken', at: at(d, Math.floor(m / 60), m % 60) });
      }
      const meals: [string, number][] = [
        ['wake', 7 * 60 + 25],
        ['breakfast', 8 * 60 + 30],
        ['lunch', 12 * 60 + 45],
        ['dinner', 21 * 60],
      ];
      for (const [event, m] of meals) {
        if (m < nowMin) routineLog.push({ key: `${date}|${event}`, status: 'done', at: at(d, Math.floor(m / 60), m % 60) });
      }
      continue;
    }

    const hours = inFlare(n) ? 6 + Math.round(rand() * 2) / 2 : lead(n) ? 5 + Math.round(rand() * 2) / 2 : 6.5 + Math.round(rand() * 4) / 2;
    sleep[date] = { date, hours, quality: hours < 6 ? 'poor' : hours < 7.5 ? 'ok' : 'good' };

    const base = inFlare(n) ? 3 : lead(n) ? 2 : rand() > 0.8 ? 1 : 0;
    const symptoms: Record<string, number> = { Fatigue: base, 'Joint pain': Math.max(0, base - (rand() > 0.5 ? 0 : 1)) };
    if (inFlare(n)) {
      symptoms.Rash = 2;
      symptoms['Joint swelling'] = 2;
    }
    const outMeals = lead(n) ? 2 : rand() > 0.75 ? 1 : 0;
    evening[date] = {
      date,
      symptoms,
      stress: inFlare(n) || lead(n) ? 2 : rand() > 0.7 ? 1 : 0,
      diet: outMeals > 1 ? 'so-so' : 'well',
      dietTags: outMeals > 1 ? ['Fried / greasy', 'Salty'] : rand() > 0.6 ? ['Lots of veggies'] : [],
      homeMeals: 3 - outMeals,
      outMeals,
      notes: n === flareStart + 2 ? 'Long day outside at a friend’s graduation, forgot to reapply sunscreen.' : n === 3 ? 'Made a big pot of veggie soup for the week.' : '',
    };

    // Doses: ~92% logged on time.
    const doses: [string, number, number, number][] = [
      ['plaquenil', 0, 8, 35],
      ['cellcept', 0, 11, 35],
      ['cellcept', 1, 23, 30],
    ];
    for (const [id, i, h, m] of doses) {
      if (rand() < 0.92) doseLog.push({ key: `${date}|${id}|${i}`, status: 'taken', at: at(d, h, m + Math.round(rand() * 20)) });
    }
    if (uvMax > 2 && rand() > (lead(n) ? 0.8 : 0.3)) sunscreen.push({ type: 'applied', at: at(d, 10, 15) });
    if (tempMin < 45 && rand() > 0.5) raynaud.push({ at: at(d, 7, 50), tempF: tempMin + 2 });
  }

  const labs: unknown[] = [];
  const draws: [number, Record<string, number>][] = [
    [300, { c3: 74, c4: 8, dsdna: 210, wbc: 3.8, upcr: 0.32, vitd: 18 }],
    [210, { c3: 82, c4: 10, dsdna: 140, wbc: 4.1, upcr: 0.24, vitd: 24 }],
    [120, { c3: 91, c4: 13, dsdna: 95, wbc: 4.6, upcr: 0.18, vitd: 31 }],
    [30, { c3: 86, c4: 11, dsdna: 88, wbc: 4.3, upcr: 0.19, vitd: 33 }],
  ];
  const ranges: Record<string, [number | null, number | null, string]> = {
    c3: [90, 180, 'mg/dL'],
    c4: [10, 40, 'mg/dL'],
    dsdna: [null, 30, 'IU/mL'],
    wbc: [4.5, 11, 'K/µL'],
    upcr: [null, 0.2, 'g/g'],
    vitd: [30, 100, 'ng/mL'],
  };
  draws.forEach(([ago, values], k) => {
    for (const [test, value] of Object.entries(values)) {
      const [low, high, unit] = ranges[test];
      labs.push({ id: `demo-${k}-${test}`, test, date: iso(daysAgo(ago)), value, unit, low, high, note: '' });
    }
  });

  const entries: [string, unknown][] = [
    ['mylupus.settings', { name: 'Alex', uvThreshold: 2, morningAlert: { hour: 8, minute: 0 }, onboarded: false }],
    ['mylupus.place', { latitude: 35.2828, longitude: -120.6596, name: 'San Luis Obispo', source: 'city' }],
    [
      'mylupus.meds',
      [
        {
          id: 'plaquenil',
          name: 'Plaquenil (hydroxychloroquine)',
          pillsPerDose: 2,
          doseTimes: [8 * 60 + 30],
          foodRule: 'with_food',
          instructions: 'Taking with food or milk helps prevent an upset stomach.',
          sideEffects: 'Yearly eye exam',
          supply: { quantity: 60, asOf: iso(daysAgo(25)) },
          spacingHours: 2,
        },
        {
          id: 'cellcept',
          name: 'CellCept (mycophenolate mofetil)',
          pillsPerDose: 2,
          doseTimes: [11 * 60 + 30, 23 * 60 + 30],
          foodRule: 'empty_stomach',
          instructions: 'Take on an empty stomach. Keep antacids with magnesium or aluminum a few hours apart.',
          sideEffects: 'Nausea, stomach upset',
          supply: null,
        },
      ],
    ],
    ['mylupus.routine', { wake: 7 * 60 + 30, breakfast: 8 * 60 + 30, lunch: 12 * 60 + 30, dinner: 21 * 60, bed: 30 }],
    ['mylupus.doseLog', doseLog],
    ['mylupus.routineLog', routineLog],
    ['mylupus.sleep', sleep],
    ['mylupus.evening', evening],
    ['mylupus.weatherLog', weather],
    ['mylupus.sunscreenLog', sunscreen],
    ['mylupus.raynaud', raynaud],
    [
      'mylupus.flares',
      [
        {
          id: 'demo-f1',
          start: iso(daysAgo(flareStart)),
          durationDays: flareLen,
          ongoing: false,
          severity: 2,
          symptoms: ['Joint pain', 'Fatigue', 'Rash', 'Joint swelling'],
          triggers: ['Sun / UV', 'Poor sleep', 'Stress'],
          treatment: 'Short prednisone taper',
          notes: 'Started after a long weekend outdoors.',
        },
        {
          id: 'demo-f2',
          start: iso(daysAgo(240)).slice(0, 7),
          durationDays: 10,
          ongoing: false,
          severity: 3,
          symptoms: ['Joint pain', 'Fever', 'Fatigue'],
          triggers: ['Illness / infection'],
          treatment: 'Started CellCept',
          notes: '',
        },
      ],
    ],
    [
      'mylupus.history',
      {
        diagnosed: iso(daysAgo(400)).slice(0, 7),
        pastMeds: 'Prednisone at diagnosis, tapered off over 4 months.',
        otherConditions: "Raynaud's",
        allergies: 'None known',
        notes: 'Yearly eye exam for Plaquenil.',
      },
    ],
    ['mylupus.labs', labs],
    [
      'mylupus.labNotes',
      {
        dsdna: {
          note: 'Very high at diagnosis and coming down slowly. Doctor says this level is OK for now.',
          okForMe: true,
          updated: iso(daysAgo(30)),
        },
      },
    ],
  ];

  try {
    await AsyncStorage.multiSet(entries.map(([k, v]) => [k, JSON.stringify(v)]));
    await AsyncStorage.setItem(SEEDED_KEY, '1');
  } catch {
    // Storage blocked (private browsing): the demo just starts empty.
  }
}
