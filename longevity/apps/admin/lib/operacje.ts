/**
 * Jedyne wejście do operacji administracyjnych.
 *
 * Każda funkcja zaczyna od `assertCan` i kończy wpisem w audit logu. Strona,
 * która chciałaby ominąć ten moduł, musiałaby sięgnąć wprost do pakietów —
 * a to widać w przeglądzie kodu i nie da się schować w JSX.
 *
 * Czego tu nie ma i nie będzie: funkcji zwracającej treść danych uczestnika.
 * Administrator realizuje wnioski i utrzymuje system; do odczytu Karty
 * Pacjenta nie ma uprawnienia (@longevity/access) ani powodu.
 */

import { randomUUID } from 'node:crypto';

import { assertCan, type Actor } from '@longevity/access';
import { PROG_K } from '@longevity/analytics';
import { CONSENT_DEFINITIONS } from '@longevity/consent';
import { isRulesetApproved, RULESET_STATUS, RULESET_VERSION } from '@longevity/core';
import { QUESTIONNAIRE_V1 } from '@longevity/questionnaire';
import {
  oznaczZrealizowany,
  przygotujEksport,
  wykonajRetencje,
  wykonajUsuniecie,
  wymagalne,
  type MetadanePakietu,
  type PakietDoOdbioru,
  type ZadanieRetencyjne,
} from '@longevity/gdpr';
import {
  assertPotwierdzone,
  synchronize,
  zapowiedz,
  ZRODLA_KRYTYCZNE,
  type PodgladZrodla,
  type SourceCode,
  type SyncMode,
  type SyncReport,
} from '@longevity/notion-sync';

import { DZIS, TERAZ } from './dane.ts';
import {
  AUDIT,
  dodajPakiet,
  dodajPotwierdzenie,
  dodajWykonaneZadania,
  OPCJE_NOTION,
  pobierzWnioski,
  pobierzZbior,
  pobierzZbiory,
  zapewnijZasiew,
  zapiszPrzebieg,
  zapiszWniosek,
  zapiszZbior,
} from './stan.ts';

const SYSTEM = { kind: 'system' } as const;

function odnotuj(
  actor: Actor,
  akcja: Parameters<typeof AUDIT.dopisz>[0]['akcja'],
  zasob: string,
  kontekst: Record<string, string> = {},
  subjectRef?: string,
): void {
  AUDIT.dopisz({
    actorRef: actor.userId,
    ...(subjectRef !== undefined ? { subjectRef } : {}),
    akcja,
    zasob,
    kontekst,
    at: TERAZ,
  });
}

// ---------------------------------------------------------------------------
// Synchronizacja
// ---------------------------------------------------------------------------

export async function pokazZapowiedz(
  actor: Actor,
  mode: SyncMode,
  sources: readonly SourceCode[],
): Promise<readonly PodgladZrodla[]> {
  assertCan(actor, 'zarzadzanie_synchronizacja', SYSTEM);
  await zapewnijZasiew();

  return zapowiedz({ ...OPCJE_NOTION, mode, sources });
}

export async function uruchomSynchronizacje(
  actor: Actor,
  mode: SyncMode,
  sources: readonly SourceCode[],
  potwierdzone: readonly SourceCode[],
): Promise<SyncReport> {
  assertCan(actor, 'zarzadzanie_synchronizacja', SYSTEM);
  await zapewnijZasiew();

  // Rzuca, gdy administrator próbuje wpuścić cennik albo progi ZFŚS
  // bez obejrzenia zapowiedzi. Bramka jest przed zapisem, nie po nim.
  assertPotwierdzone(sources, potwierdzone);

  const report = await synchronize({ ...OPCJE_NOTION, mode, sources });
  zapiszPrzebieg(report);

  odnotuj(actor, 'synchronizacja_tresci', 'notion/synchronizacja', {
    tryb: report.mode,
    zrodla: sources.join(','),
    zmian: String(report.log.length),
  });

  return report;
}

export async function pobierzStanCache(
  actor: Actor,
  sources: readonly SourceCode[],
): Promise<readonly { source: SourceCode; aktywne: number; zarchiwizowane: number }[]> {
  assertCan(actor, 'odczyt_logu_synchronizacji', SYSTEM);
  await zapewnijZasiew();

  return sources.map((source) => {
    const wszystkie = OPCJE_NOTION.store.list(source);
    return {
      source,
      aktywne: wszystkie.filter((record) => record.status === 'active').length,
      zarchiwizowane: wszystkie.filter((record) => record.status === 'archived').length,
    };
  });
}

// ---------------------------------------------------------------------------
// Wnioski osób
// ---------------------------------------------------------------------------

export function wnioski(actor: Actor) {
  assertCan(actor, 'obsluga_wnioskow_rodo', SYSTEM);
  return pobierzWnioski();
}

/**
 * Pakiety zapieczętowane, poza zasięgiem panelu.
 *
 * Mapa jest prywatna dla modułu i nie ma funkcji odczytu — panel dostaje
 * wyłącznie metadane. W produkcji pakiet trafia do magazynu z ograniczonym
 * dostępem, a osoba odbiera go w swoim panelu po podaniu tokenu z e-maila.
 */
const zapieczetowane = new Map<string, PakietDoOdbioru>();

export function przygotujPakietDoOdbioru(actor: Actor, wniosekId: string): MetadanePakietu {
  assertCan(actor, 'obsluga_wnioskow_rodo', SYSTEM);

  const wniosek = pobierzWnioski().find((pozycja) => pozycja.id === wniosekId);
  if (wniosek === undefined) throw new Error(`Nieznany wniosek ${wniosekId}.`);

  const zbior = pobierzZbior(wniosek.subjectRef);
  if (zbior === undefined) throw new Error(`Brak danych podmiotu ${wniosek.subjectRef}.`);

  // Token jest jednorazowy i wychodzi do osoby kanałem poza panelem.
  // Prototyp nie ma poczty, więc token po prostu przepada — to i tak lepsze
  // niż wyświetlenie go administratorowi, który treści pakietu widzieć nie ma.
  const token = `${randomUUID()}-${randomUUID()}`;
  const pakiet = przygotujEksport(zbior, wniosek, TERAZ, token);

  zapieczetowane.set(wniosek.id, pakiet);
  dodajPakiet(pakiet.metadane);
  zapiszWniosek(oznaczZrealizowany(wniosek, DZIS));

  odnotuj(
    actor,
    'eksport_danych',
    `wniosek/${wniosek.id}`,
    { prawo: wniosek.prawo, rekordow: String(pakiet.metadane.liczbaRekordow) },
    wniosek.subjectRef,
  );

  return pakiet.metadane;
}

export function wykonajWniosekUsuniecia(actor: Actor, wniosekId: string) {
  assertCan(actor, 'obsluga_wnioskow_rodo', SYSTEM);

  const wniosek = pobierzWnioski().find((pozycja) => pozycja.id === wniosekId);
  if (wniosek === undefined) throw new Error(`Nieznany wniosek ${wniosekId}.`);

  const zbior = pobierzZbior(wniosek.subjectRef);
  if (zbior === undefined) throw new Error(`Brak danych podmiotu ${wniosek.subjectRef}.`);

  const wynik = wykonajUsuniecie(zbior, wniosek.id, DZIS);
  zapiszZbior(wynik.zbior);
  dodajPotwierdzenie(wynik.potwierdzenie);
  zapiszWniosek(oznaczZrealizowany(wniosek, DZIS));

  odnotuj(
    actor,
    'usuniecie_danych',
    `wniosek/${wniosek.id}`,
    { pozycji: String(wynik.potwierdzenie.pozycje.length) },
    wniosek.subjectRef,
  );

  return wynik.potwierdzenie;
}

export function odnotujRealizacjePozaPanelem(actor: Actor, wniosekId: string): void {
  assertCan(actor, 'obsluga_wnioskow_rodo', SYSTEM);

  const wniosek = pobierzWnioski().find((pozycja) => pozycja.id === wniosekId);
  if (wniosek === undefined) throw new Error(`Nieznany wniosek ${wniosekId}.`);

  zapiszWniosek(oznaczZrealizowany(wniosek, DZIS));
  odnotuj(actor, 'zmiana_zgody', `wniosek/${wniosek.id}`, { prawo: wniosek.prawo }, wniosek.subjectRef);
}

// ---------------------------------------------------------------------------
// Stan systemu
// ---------------------------------------------------------------------------

export interface StanSystemu {
  ruleset: { wersja: string; status: string; zatwierdzony: boolean };
  kwestionariusz: { wersja: string; pytan: number };
  zgody: readonly { kod: string; wersja: string; podstawa: string; obowiazujeOd: string }[];
  progK: number;
  zrodlaKrytyczne: readonly SourceCode[];
}

export function stanSystemu(actor: Actor): StanSystemu {
  assertCan(actor, 'odczyt_stanu_systemu', SYSTEM);

  return {
    ruleset: {
      wersja: RULESET_VERSION,
      status: RULESET_STATUS,
      zatwierdzony: isRulesetApproved(),
    },
    kwestionariusz: {
      wersja: QUESTIONNAIRE_V1.version,
      pytan: QUESTIONNAIRE_V1.steps.reduce((suma, krok) => suma + krok.questions.length, 0),
    },
    zgody: CONSENT_DEFINITIONS.map((definicja) => ({
      kod: definicja.code,
      wersja: definicja.version,
      podstawa: definicja.legalBasis,
      obowiazujeOd: definicja.effectiveFrom,
    })),
    progK: PROG_K,
    zrodlaKrytyczne: ZRODLA_KRYTYCZNE,
  };
}

// ---------------------------------------------------------------------------
// Retencja
// ---------------------------------------------------------------------------

export interface KolejkaRetencji {
  subjectRef: string;
  uczestnictwoDo: string | undefined;
  zadania: readonly ZadanieRetencyjne[];
}

export function kolejkaRetencji(actor: Actor): readonly KolejkaRetencji[] {
  assertCan(actor, 'wykonanie_retencji', SYSTEM);

  return pobierzZbiory()
    .map((zbior) => ({
      subjectRef: zbior.subjectRef,
      uczestnictwoDo: zbior.uczestnictwo.do,
      zadania: wymagalne(zbior.rekordy, zbior.uczestnictwo, DZIS),
    }))
    .filter((pozycja) => pozycja.zadania.length > 0);
}

export function wykonajZadaniaRetencyjne(actor: Actor, subjectRef: string): number {
  assertCan(actor, 'wykonanie_retencji', SYSTEM);

  const zbior = pobierzZbior(subjectRef);
  if (zbior === undefined) throw new Error(`Brak danych podmiotu ${subjectRef}.`);

  const wynik = wykonajRetencje(zbior, DZIS);
  zapiszZbior(wynik.zbior);
  dodajWykonaneZadania(subjectRef, wynik.wykonane);

  odnotuj(
    actor,
    'usuniecie_danych',
    `retencja/${subjectRef}`,
    { zadan: String(wynik.wykonane.length) },
    subjectRef,
  );

  return wynik.wykonane.length;
}
