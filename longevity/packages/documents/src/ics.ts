/**
 * Kalendarz harmonogramu tygodniowego (RFC 5545).
 *
 * Wydarzenia mają czas lokalny bez strefy — dla nawyków to jest poprawne:
 * „trening o 7:00" ma zostać o 7:00 także po zmianie czasu i po podróży.
 * Zapisanie ich w UTC przesunęłoby cały plan o godzinę dwa razy w roku.
 */

import type { Plan, ScheduleItem } from '@longevity/plan';

export interface IcsOptions {
  /** Poniedziałek tygodnia, w którym plan startuje (YYYY-MM-DD). */
  weekStart: string;
  /** Stabilny prefiks UID — ponowny import aktualizuje wydarzenia, nie duplikuje ich. */
  uidPrefix: string;
  defaultDurationMin?: number;
  /** Liczba powtórzeń tygodniowych. Bez limitu wydarzenia ciągną się w nieskończoność. */
  weeks?: number;
}

const PORY: readonly { pattern: RegExp; time: string }[] = [
  { pattern: /rano|poranek|przed\s+prac/iu, time: '0700' },
  { pattern: /obiad|południ/iu, time: '1230' },
  { pattern: /po\s+pracy|popołudni/iu, time: '1800' },
  { pattern: /wieczor|wieczór|przed\s+snem/iu, time: '2000' },
];

/** Zamienia opis pory na godzinę. Jawny zapis „18:30" ma pierwszeństwo. */
export function resolveTime(pora: string): string {
  const explicit = pora.match(/\b(\d{1,2})[:.](\d{2})\b/u);
  if (explicit !== null) {
    const hours = Number(explicit[1]);
    const minutes = Number(explicit[2]);
    if (hours <= 23 && minutes <= 59) {
      return `${String(hours).padStart(2, '0')}${String(minutes).padStart(2, '0')}`;
    }
  }

  for (const { pattern, time } of PORY) {
    if (pattern.test(pora)) return time;
  }

  return '0800';
}

export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/gu, '\\\\')
    .replace(/;/gu, '\\;')
    .replace(/,/gu, '\\,')
    .replace(/\r?\n/gu, '\\n');
}

/** Zawijanie linii na 75 oktetów, kontynuacja od spacji (RFC 5545 §3.1). */
export function foldLine(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;

  const parts: string[] = [];
  let offset = 0;
  let limit = 75;

  while (offset < bytes.length) {
    let end = Math.min(offset + limit, bytes.length);

    // Nie tniemy w środku znaku wielobajtowego — inaczej polskie znaki się rozsypią.
    while (end > offset && end < bytes.length && (bytes[end]! & 0b1100_0000) === 0b1000_0000) {
      end -= 1;
    }

    parts.push(bytes.subarray(offset, end).toString('utf8'));
    offset = end;
    limit = 74;
  }

  return parts.join('\r\n ');
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10).replace(/-/gu, '');
}

function addMinutes(time: string, minutes: number): { time: string; dayOffset: number } {
  const total = Number(time.slice(0, 2)) * 60 + Number(time.slice(2)) + minutes;
  const dayOffset = Math.floor(total / (24 * 60));
  const within = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const hh = String(Math.floor(within / 60)).padStart(2, '0');
  const mm = String(within % 60).padStart(2, '0');
  return { time: `${hh}${mm}`, dayOffset };
}

function eventDuration(plan: Plan, item: ScheduleItem, fallback: number): number {
  const day = plan.trening.mikrocykl.find((entry) => entry.dzien === item.dzien);
  return day !== undefined && day.czasMin > 0 ? day.czasMin : fallback;
}

export function renderIcs(plan: Plan, options: IcsOptions): string {
  const duration = options.defaultDurationMin ?? 30;
  const weeks = options.weeks ?? 12;

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//HCPL//Longevity//PL',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText('Plan Longevity')}`,
  ];

  plan.harmonogram.forEach((item, index) => {
    const startTime = resolveTime(item.pora);
    const minutes = eventDuration(plan, item, duration);
    const end = addMinutes(startTime, minutes);
    const startDate = addDays(options.weekStart, item.dzien - 1);
    const endDate = addDays(options.weekStart, item.dzien - 1 + end.dayOffset);

    lines.push(
      'BEGIN:VEVENT',
      `UID:${options.uidPrefix}-${index}@longevity.hcpl`,
      // DTSTAMP musi być w UTC. Bierzemy początek tygodnia, żeby wynik był
      // powtarzalny — plik wygenerowany dwa razy ma być identyczny.
      `DTSTAMP:${addDays(options.weekStart, 0)}T000000Z`,
      `DTSTART:${startDate}T${startTime}00`,
      `DTEND:${endDate}T${end.time}00`,
      `RRULE:FREQ=WEEKLY;COUNT=${weeks}`,
      `SUMMARY:${escapeIcsText(item.czynnosc)}`,
      `CATEGORIES:${escapeIcsText(item.filar)}`,
      `DESCRIPTION:${escapeIcsText(`${item.filar} — plan Longevity`)}`,
      'END:VEVENT',
    );
  });

  lines.push('END:VCALENDAR');

  return lines.map(foldLine).join('\r\n') + '\r\n';
}
