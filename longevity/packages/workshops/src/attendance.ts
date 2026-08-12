/**
 * Obecności.
 *
 * Trzy reguły, każda z powodu:
 *
 * 1. Obecność odnotowuje wyłącznie trener prowadzący — sprawdzane przez
 *    @longevity/access, nie przez ukrycie przycisku.
 * 2. Nie da się odnotować obecności przed rozpoczęciem warsztatu. Lista
 *    wypełniona z góry nie jest listą obecności, tylko listą zapisów.
 * 3. Poprawka jest dozwolona i zastępuje poprzedni wpis, ale zostawia ślad —
 *    trener który pomylił się przy trzydziestu osobach musi mieć jak to naprawić.
 */

import { assertCan, type Actor } from '@longevity/access';

import type { DaneOsobowe, Obecnosc, PozycjaListy, Warsztat, Zapis } from './types.ts';

export class ObecnoscPrzedRozpoczeciemError extends Error {
  constructor(start: string) {
    super(`Obecność można odnotować dopiero po rozpoczęciu warsztatu (${start}).`);
    this.name = 'ObecnoscPrzedRozpoczeciemError';
  }
}

export class UczestnikSpozaListyError extends Error {
  constructor(participantId: string) {
    super(`Uczestnik ${participantId} nie jest zapisany, a warsztat nie dopuszcza wejść bez zapisu.`);
    this.name = 'UczestnikSpozaListyError';
  }
}

export interface WpisObecnosci {
  participantId: string;
  obecny: boolean;
}

export interface WynikOdnotowania {
  obecnosci: readonly Obecnosc[];
  /** Wpisy, które zastąpiły wcześniejszą odpowiedź — do audytu. */
  poprawione: readonly string[];
}

export function odnotujObecnosc(
  actor: Actor,
  warsztat: Warsztat,
  zapisy: readonly Zapis[],
  istniejace: readonly Obecnosc[],
  wpisy: readonly WpisObecnosci[],
  teraz: string,
): WynikOdnotowania {
  assertCan(actor, 'zapis_obecnosci', {
    kind: 'warsztat',
    organizationId: warsztat.organizationId,
    trainerId: warsztat.trenerId,
  });

  if (teraz < warsztat.start) throw new ObecnoscPrzedRozpoczeciemError(warsztat.start);

  const zapisani = new Set(
    zapisy
      .filter((zapis) => zapis.warsztatId === warsztat.id && zapis.status !== 'wypisany')
      .map((zapis) => zapis.participantId),
  );

  const poprawione: string[] = [];
  const wynik = istniejace.filter((obecnosc) => obecnosc.warsztatId !== warsztat.id);
  const dlaWarsztatu = new Map(
    istniejace
      .filter((obecnosc) => obecnosc.warsztatId === warsztat.id)
      .map((obecnosc) => [obecnosc.participantId, obecnosc]),
  );

  for (const wpis of wpisy) {
    if (!zapisani.has(wpis.participantId) && !warsztat.dopuscBezZapisu) {
      throw new UczestnikSpozaListyError(wpis.participantId);
    }

    const wczesniejszy = dlaWarsztatu.get(wpis.participantId);
    if (wczesniejszy !== undefined && wczesniejszy.obecny !== wpis.obecny) {
      poprawione.push(wpis.participantId);
    }

    dlaWarsztatu.set(wpis.participantId, {
      warsztatId: warsztat.id,
      participantId: wpis.participantId,
      obecny: wpis.obecny,
      odnotowalTrenerId: actor.userId,
      at: teraz,
    });
  }

  return { obecnosci: [...wynik, ...dlaWarsztatu.values()], poprawione };
}

/**
 * Lista dla trenera. Wymaga osobnego uprawnienia — to jedyne miejsce
 * w systemie, gdzie powstaje imienna lista uczestników.
 */
export function listaDlaTrenera(
  actor: Actor,
  warsztat: Warsztat,
  zapisy: readonly Zapis[],
  osoby: readonly DaneOsobowe[],
  obecnosci: readonly Obecnosc[],
): readonly PozycjaListy[] {
  assertCan(actor, 'odczyt_listy_zapisanych', {
    kind: 'warsztat',
    organizationId: warsztat.organizationId,
    trainerId: warsztat.trenerId,
  });

  const wgId = new Map(osoby.map((osoba) => [osoba.participantId, osoba]));
  const obecnosciWgId = new Map(
    obecnosci
      .filter((obecnosc) => obecnosc.warsztatId === warsztat.id)
      .map((obecnosc) => [obecnosc.participantId, obecnosc]),
  );

  return zapisy
    .filter((zapis) => zapis.warsztatId === warsztat.id && zapis.status !== 'wypisany')
    .slice()
    .sort((a, b) => (a.zgloszony < b.zgloszony ? -1 : 1))
    .map((zapis) => {
      const osoba = wgId.get(zapis.participantId);
      const obecnosc = obecnosciWgId.get(zapis.participantId);

      return {
        participantId: zapis.participantId,
        etykieta: osoba === undefined ? '—' : `${osoba.imie} ${osoba.nazwisko.slice(0, 1)}.`,
        kod: zapis.participantId.slice(-4).toUpperCase(),
        status: zapis.status,
        ...(obecnosc !== undefined ? { obecny: obecnosc.obecny } : {}),
      };
    });
}

export interface Frekwencja {
  zapisanych: number;
  obecnych: number;
  nieobecnych: number;
  bezOdnotowania: number;
  /** Udział obecnych wśród zapisanych, w pełnych procentach. */
  udzialProcent: number;
}

export function frekwencja(
  warsztat: Warsztat,
  zapisy: readonly Zapis[],
  obecnosci: readonly Obecnosc[],
): Frekwencja {
  const zapisani = zapisy.filter(
    (zapis) => zapis.warsztatId === warsztat.id && zapis.status === 'zapisany',
  );
  const dlaWarsztatu = obecnosci.filter((obecnosc) => obecnosc.warsztatId === warsztat.id);

  const obecnych = dlaWarsztatu.filter((obecnosc) => obecnosc.obecny).length;
  const nieobecnych = dlaWarsztatu.filter((obecnosc) => !obecnosc.obecny).length;

  return {
    zapisanych: zapisani.length,
    obecnych,
    nieobecnych,
    bezOdnotowania: Math.max(0, zapisani.length - obecnych - nieobecnych),
    udzialProcent: zapisani.length === 0 ? 0 : Math.round((obecnych / zapisani.length) * 100),
  };
}
