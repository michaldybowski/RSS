/**
 * Terminarz konsultacji.
 *
 * Cztery reguły, każda z powodem:
 *
 * 1. **Termin pilny jest zarezerwowany dla kategorii CZERWONEJ.** Pula pilna
 *    istnieje po to, żeby ktoś z zatrzymanym planem dostał lekarza w kilka dni.
 *    Gdyby mógł ją zająć zapis planowy, pula znikałaby pierwszego dnia i osoba,
 *    dla której powstała, trafiałaby na koniec kolejki.
 *
 * 2. **Rezerwacja nie jest zgodą na udostępnienie Karty Pacjenta.** To dwie
 *    osobne decyzje: umawiam się na rozmowę, a osobno decyduję, co lekarz
 *    zobaczy przed nią. Pakiet nie wiąże ich ze sobą i panel ma to powiedzieć.
 *
 * 3. **Odwołanie po terminie granicznym jest odnotowane, ale bez sankcji.**
 *    Opłata za późne odwołanie wizyty zdrowotnej zniechęca do odwoływania,
 *    a nie do chorowania — kończy się niestawiennictwem bez uprzedzenia.
 *
 * 4. **Konsultacji nie da się oznaczyć jako odbytej przed jej rozpoczęciem.**
 *    Ta sama zasada co przy obecnościach na warsztatach.
 */

import type { RiskCategory } from '@longevity/core';

import type { Konsultacja, Notatka, StatusKonsultacji, Termin } from './types.ts';

/** Kategorie ryzyka uprawniające do puli pilnej. */
export const KATEGORIE_PILNE: readonly RiskCategory[] = ['CZERWONA'];

/** Ile godzin przed terminem odwołanie jest jeszcze „w oknie". */
export const OKNO_ODWOLANIA_H = 24;

export class TerminZajetyError extends Error {
  constructor(terminId: string) {
    super(`Termin ${terminId} jest już zarezerwowany.`);
    this.name = 'TerminZajetyError';
  }
}

export class TerminMinalError extends Error {
  constructor(terminId: string) {
    super(`Termin ${terminId} już minął.`);
    this.name = 'TerminMinalError';
  }
}

export class TerminPilnyNiedostepnyError extends Error {
  constructor() {
    super(
      'Termin pilny jest zarezerwowany dla osób z czerwoną kategorią ryzyka. ' +
        'Wybierz termin planowy — pula pilna musi zostać wolna dla nagłych przypadków.',
    );
    this.name = 'TerminPilnyNiedostepnyError';
  }
}

export class KonsultacjaNierozpoczetaError extends Error {
  constructor() {
    super('Konsultacji nie można rozliczyć przed jej rozpoczęciem.');
    this.name = 'KonsultacjaNierozpoczetaError';
  }
}

export class ZlyStatusKonsultacjiError extends Error {
  constructor(status: StatusKonsultacji, oczekiwany: StatusKonsultacji) {
    super(`Konsultacja ma status "${status}", a operacja wymaga statusu "${oczekiwany}".`);
    this.name = 'ZlyStatusKonsultacjiError';
  }
}

export function czyPilnyDozwolony(kategoria: RiskCategory): boolean {
  return KATEGORIE_PILNE.includes(kategoria);
}

function zajete(konsultacje: readonly Konsultacja[]): ReadonlySet<string> {
  return new Set(
    konsultacje
      .filter((konsultacja) => konsultacja.status !== 'odwolana')
      .map((konsultacja) => konsultacja.terminId),
  );
}

export interface WidokTerminu {
  termin: Termin;
  dostepny: boolean;
  /** Dlaczego niedostępny — puste, gdy dostępny. */
  powod?: string;
}

/**
 * Terminy z decyzją przy każdym. Zajęte i pilne-niedostępne zostają na liście
 * z powodem: pusty kalendarz nie mówi, czy nic nie ma, czy coś jest zamknięte.
 */
export function widokTerminarza(
  terminy: readonly Termin[],
  konsultacje: readonly Konsultacja[],
  kategoria: RiskCategory,
  teraz: string,
): readonly WidokTerminu[] {
  const wziete = zajete(konsultacje);

  return terminy
    .filter((termin) => termin.start > teraz)
    .slice()
    .sort((a, b) => (a.start < b.start ? -1 : 1))
    .map((termin) => {
      if (wziete.has(termin.id)) {
        return { termin, dostepny: false, powod: 'Termin jest już zajęty.' };
      }
      if (termin.rodzaj === 'pilny' && !czyPilnyDozwolony(kategoria)) {
        return {
          termin,
          dostepny: false,
          powod:
            'Pula pilna jest zarezerwowana dla osób z czerwoną kategorią ryzyka ' +
            'i pozostaje wolna na nagłe przypadki.',
        };
      }
      return { termin, dostepny: true };
    });
}

export interface DaneRezerwacji {
  termin: Termin;
  participantId: string;
  subjectRef: string;
  kategoria: RiskCategory;
  teraz: string;
  powod?: string;
}

export function zarezerwuj(
  konsultacje: readonly Konsultacja[],
  dane: DaneRezerwacji,
): Konsultacja {
  const { termin, kategoria, teraz } = dane;

  if (termin.start <= teraz) throw new TerminMinalError(termin.id);
  if (zajete(konsultacje).has(termin.id)) throw new TerminZajetyError(termin.id);
  if (termin.rodzaj === 'pilny' && !czyPilnyDozwolony(kategoria)) {
    throw new TerminPilnyNiedostepnyError();
  }

  return {
    id: `kons-${termin.id}`,
    terminId: termin.id,
    organizationId: termin.organizationId,
    clinicianId: termin.clinicianId,
    participantId: dane.participantId,
    subjectRef: dane.subjectRef,
    status: 'zarezerwowana',
    zarezerwowana: teraz,
    ...(dane.powod !== undefined && dane.powod.trim() !== '' ? { powod: dane.powod.trim() } : {}),
  };
}

function godzinDo(termin: Termin, teraz: string): number {
  return (Date.parse(termin.start) - Date.parse(teraz)) / 3_600_000;
}

export function odwolaj(
  konsultacja: Konsultacja,
  termin: Termin,
  teraz: string,
): Konsultacja {
  if (konsultacja.status !== 'zarezerwowana') {
    throw new ZlyStatusKonsultacjiError(konsultacja.status, 'zarezerwowana');
  }

  // Późne odwołanie jest odnotowane dla planowania grafiku, ale nie pociąga
  // za sobą opłaty. Kara zniechęca do odwoływania, nie do chorowania.
  const pozno = godzinDo(termin, teraz) < OKNO_ODWOLANIA_H;

  return {
    ...konsultacja,
    status: 'odwolana',
    odwolana: teraz,
    ...(pozno ? { poznoOdwolana: true } : {}),
  };
}

export function odnotujOdbycie(
  konsultacja: Konsultacja,
  termin: Termin,
  teraz: string,
): Konsultacja {
  if (konsultacja.status !== 'zarezerwowana') {
    throw new ZlyStatusKonsultacjiError(konsultacja.status, 'zarezerwowana');
  }
  if (teraz < termin.start) throw new KonsultacjaNierozpoczetaError();

  return { ...konsultacja, status: 'odbyta' };
}

export function odnotujNiestawiennictwo(
  konsultacja: Konsultacja,
  termin: Termin,
  teraz: string,
): Konsultacja {
  if (konsultacja.status !== 'zarezerwowana') {
    throw new ZlyStatusKonsultacjiError(konsultacja.status, 'zarezerwowana');
  }
  if (teraz < termin.start) throw new KonsultacjaNierozpoczetaError();

  return { ...konsultacja, status: 'niestawiennictwo' };
}

export class PustaNotatkaError extends Error {
  constructor() {
    super('Notatka z konsultacji nie może być pusta.');
    this.name = 'PustaNotatkaError';
  }
}

/**
 * Notatka lekarza.
 *
 * Powstaje wyłącznie do konsultacji odbytej — notatka z wizyty, która się nie
 * odbyła, jest zapisem czegoś, czego nie było. Treść pisze lekarz; platforma
 * jej nie generuje, nie streszcza i nie poprawia.
 */
export function zapiszNotatke(
  konsultacja: Konsultacja,
  tresc: string,
  zalecenia: readonly string[],
  autorId: string,
  teraz: string,
): Notatka {
  if (konsultacja.status !== 'odbyta') {
    throw new ZlyStatusKonsultacjiError(konsultacja.status, 'odbyta');
  }
  if (tresc.trim() === '') throw new PustaNotatkaError();

  return {
    konsultacjaId: konsultacja.id,
    tresc: tresc.trim(),
    zalecenia: zalecenia.filter((zalecenie) => zalecenie.trim() !== ''),
    autorId,
    utworzona: teraz,
  };
}

/** Konsultacje jednego lekarza na dany dzień, w kolejności godzin. */
export function grafik(
  konsultacje: readonly Konsultacja[],
  terminy: readonly Termin[],
  clinicianId: string,
  dzien: string,
): readonly { konsultacja: Konsultacja; termin: Termin }[] {
  const wgId = new Map(terminy.map((termin) => [termin.id, termin]));

  return konsultacje
    .filter((konsultacja) => konsultacja.clinicianId === clinicianId)
    .map((konsultacja) => ({ konsultacja, termin: wgId.get(konsultacja.terminId) }))
    .filter(
      (pozycja): pozycja is { konsultacja: Konsultacja; termin: Termin } =>
        pozycja.termin !== undefined && pozycja.termin.start.slice(0, 10) === dzien,
    )
    .sort((a, b) => (a.termin.start < b.termin.start ? -1 : 1));
}
