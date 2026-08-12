/**
 * Dane syntetyczne panelu trenera.
 *
 * Data odniesienia jest stała, żeby demo zachowywało się tak samo niezależnie
 * od dnia uruchomienia. Warsztaty rozłożone są wokół niej celowo: jeden już
 * się odbył, jeden trwa, jeden jest przed startem, jeden odwołany — tak, żeby
 * dało się zobaczyć wszystkie zachowania panelu bez czekania.
 */

import type { DaneOsobowe, Warsztat } from '@longevity/workshops';

export const TERAZ = '2026-09-20T11:00:00.000Z';

export const TRENERZY = [
  { id: 't-kowal', imie: 'Marta Kowal', organizationId: 'zaklad-polnoc' },
  { id: 't-lis', imie: 'Jakub Lis', organizationId: 'zaklad-polnoc' },
] as const;

export const WARSZTATY: readonly Warsztat[] = [
  {
    id: 'w-erg-09',
    notionId: 'notion-w-1',
    temat: 'Ergonomia stanowiska pracy',
    start: '2026-09-18T09:00:00.000Z',
    czasTrwaniaMin: 90,
    organizationId: 'zaklad-polnoc',
    unitId: 'produkcja',
    trenerId: 't-kowal',
    miejsc: 12,
    status: 'zaplanowany',
    dopuscBezZapisu: true,
  },
  {
    id: 'w-sen-09',
    notionId: 'notion-w-2',
    temat: 'Higiena snu przy pracy zmianowej',
    start: '2026-09-20T10:00:00.000Z',
    czasTrwaniaMin: 120,
    organizationId: 'zaklad-polnoc',
    unitId: 'utrzymanie',
    trenerId: 't-kowal',
    miejsc: 8,
    status: 'zaplanowany',
    dopuscBezZapisu: false,
  },
  {
    id: 'w-stres-09',
    notionId: 'notion-w-3',
    temat: 'Regeneracja i praca ze stresem',
    start: '2026-09-25T14:00:00.000Z',
    czasTrwaniaMin: 90,
    organizationId: 'zaklad-polnoc',
    unitId: 'biuro',
    trenerId: 't-kowal',
    miejsc: 10,
    status: 'zaplanowany',
    dopuscBezZapisu: false,
  },
  {
    id: 'w-zyw-09',
    notionId: 'notion-w-4',
    temat: 'Żywienie na zmianie nocnej',
    start: '2026-09-23T09:00:00.000Z',
    czasTrwaniaMin: 90,
    organizationId: 'zaklad-polnoc',
    unitId: 'produkcja',
    trenerId: 't-kowal',
    miejsc: 12,
    status: 'odwolany',
    dopuscBezZapisu: false,
  },
  {
    id: 'w-obcy-09',
    notionId: 'notion-w-5',
    temat: 'Aktywność w ciągu dnia',
    start: '2026-09-22T09:00:00.000Z',
    czasTrwaniaMin: 60,
    organizationId: 'zaklad-polnoc',
    unitId: 'biuro',
    trenerId: 't-lis',
    miejsc: 10,
    status: 'zaplanowany',
    dopuscBezZapisu: false,
  },
];

const IMIONA = ['Anna', 'Piotr', 'Marek', 'Katarzyna', 'Tomasz', 'Anna', 'Paweł', 'Magdalena', 'Anna', 'Krzysztof', 'Ewa', 'Michał'];
const NAZWISKA = ['Kowalska', 'Nowak', 'Wójcik', 'Zielińska', 'Lewandowski', 'Kamińska', 'Szymański', 'Woźniak', 'Dąbrowska', 'Mazur', 'Krawczyk', 'Piotrowski'];

export const OSOBY: readonly DaneOsobowe[] = IMIONA.map((imie, index) => ({
  participantId: `psd-${String(index + 1).padStart(4, '0')}`,
  imie,
  nazwisko: NAZWISKA[index]!,
}));

/** Zapisy: kto na który warsztat, w kolejności zgłoszeń. */
export const ZAPISY_POCZATKOWE: readonly { warsztatId: string; participantId: string }[] = [
  ...OSOBY.slice(0, 9).map((osoba) => ({ warsztatId: 'w-erg-09', participantId: osoba.participantId })),
  // Ośmiu na osiem miejsc plus dwie osoby na liście rezerwowej.
  ...OSOBY.slice(0, 10).map((osoba) => ({ warsztatId: 'w-sen-09', participantId: osoba.participantId })),
  ...OSOBY.slice(2, 8).map((osoba) => ({ warsztatId: 'w-stres-09', participantId: osoba.participantId })),
  ...OSOBY.slice(0, 5).map((osoba) => ({ warsztatId: 'w-zyw-09', participantId: osoba.participantId })),
];

export const STAWKI = {
  zaWarsztatGr: 60_000,
  zaUczestnikaGr: 2_000,
  zaOdwolanyGr: 30_000,
  progOdwolaniaGodz: 24,
};

export const OKRES = '2026-09';

export function trenerPoId(id: string): (typeof TRENERZY)[number] | undefined {
  return TRENERZY.find((trener) => trener.id === id);
}

export function warsztatPoId(id: string): Warsztat | undefined {
  return WARSZTATY.find((warsztat) => warsztat.id === id);
}
