/**
 * Stan panelu administratora — PROTOTYP, pamięć procesu.
 *
 * Docelowo: cache treści i rejestr wniosków w Postgresie, audit log w tabeli
 * tylko do dopisywania. Tutaj wszystko żyje w module, więc restart serwera
 * przywraca stan początkowy.
 */

import { PamieciowyAuditLog, type MetadanePakietu, type PotwierdzenieUsuniecia, type WniosekOsoby, type ZadanieRetencyjne, type ZbiorPodmiotu } from '@longevity/gdpr';
import {
  InMemoryCacheStore,
  synchronize,
  type SourceCode,
  type SyncMode,
  type SyncReport,
} from '@longevity/notion-sync';

import { DATA_SOURCE_IDS, DemoNotion, TERAZ, WNIOSKI, ZBIORY } from './dane.ts';

/**
 * Czytnik demonstracyjny jest lokalny, więc ograniczanie tempa nie chroni tu
 * przed niczym — a wydłuża każde kliknięcie. W produkcji obowiązuje domyślne
 * 350 ms na żądanie, wynikające z limitu Notion.
 */
const BEZ_LIMITU = { minIntervalMs: 0 };

/**
 * Zegar prototypu. Bez niego raport przebiegu byłby datowany dniem, w którym
 * ktoś uruchomił serwer, a reszta panelu liczy terminy od {@link TERAZ} —
 * i demonstracja pokazywałaby dwie różne teraźniejszości.
 */
const ZEGAR = { now: () => Date.parse(TERAZ), sleep: async () => {} };

export const AUDIT = new PamieciowyAuditLog();

export const store = new InMemoryCacheStore();
const notion = new DemoNotion();

let zasiane = false;
let ostatniPrzebieg: SyncReport | undefined;
let potwierdzone: readonly SourceCode[] = [];

let wnioski: readonly WniosekOsoby[] = WNIOSKI;
let zbiory: readonly ZbiorPodmiotu[] = ZBIORY;
let pakiety: readonly MetadanePakietu[] = [];
let potwierdzeniaUsuniecia: readonly PotwierdzenieUsuniecia[] = [];
let wykonaneZadania: readonly (ZadanieRetencyjne & { subjectRef: string; wykonano: string })[] = [];

/**
 * Cache musi mieć zawartość, zanim zapowiedź pokaże różnicę — inaczej każdy
 * rekord byłby „nowy" i nie dałoby się zobaczyć zmiany ceny.
 */
export async function zapewnijZasiew(): Promise<void> {
  if (zasiane) return;
  zasiane = true;

  await synchronize({
    reader: notion,
    store,
    dataSourceIds: DATA_SOURCE_IDS,
    mode: { kind: 'pelna' },
    rateLimit: BEZ_LIMITU,
    clock: ZEGAR,
  });

  // Od tego momentu Notion „żyje": kolejne odczyty widzą zmiany redakcji.
  notion.przelaczNaBiezace();
}

export function czytnik(): DemoNotion {
  return notion;
}

export const OPCJE_NOTION = {
  reader: notion,
  store,
  dataSourceIds: DATA_SOURCE_IDS,
  rateLimit: BEZ_LIMITU,
  clock: ZEGAR,
};

export function zapiszPrzebieg(report: SyncReport): void {
  ostatniPrzebieg = report;
}

export function pobierzPrzebieg(): SyncReport | undefined {
  return ostatniPrzebieg;
}

export function potwierdz(source: SourceCode): void {
  if (!potwierdzone.includes(source)) potwierdzone = [...potwierdzone, source];
}

export function pobierzPotwierdzone(): readonly SourceCode[] {
  return potwierdzone;
}

export function trybZOpisu(tryb: string, since: string): SyncMode {
  return tryb === 'przyrostowa' ? { kind: 'przyrostowa', since } : { kind: 'pelna' };
}

/** Komunikat zablokowanej operacji — odczytywany raz i gaszony. */
let ostatniBlad: string | undefined;

export function zapiszBlad(komunikat: string): void {
  ostatniBlad = komunikat;
}

export function odczytajBlad(): string | undefined {
  const komunikat = ostatniBlad;
  ostatniBlad = undefined;
  return komunikat;
}

// --- wnioski i podmioty ----------------------------------------------------

export function pobierzWnioski(): readonly WniosekOsoby[] {
  return wnioski;
}

export function zapiszWniosek(zmieniony: WniosekOsoby): void {
  wnioski = wnioski.map((wniosek) => (wniosek.id === zmieniony.id ? zmieniony : wniosek));
}

export function pobierzZbior(subjectRef: string): ZbiorPodmiotu | undefined {
  return zbiory.find((zbior) => zbior.subjectRef === subjectRef);
}

export function pobierzZbiory(): readonly ZbiorPodmiotu[] {
  return zbiory;
}

export function zapiszZbior(zmieniony: ZbiorPodmiotu): void {
  zbiory = zbiory.map((zbior) => (zbior.subjectRef === zmieniony.subjectRef ? zmieniony : zbior));
}

export function dodajPakiet(metadane: MetadanePakietu): void {
  pakiety = [metadane, ...pakiety];
}

export function pobierzPakiety(): readonly MetadanePakietu[] {
  return pakiety;
}

export function dodajPotwierdzenie(potwierdzenie: PotwierdzenieUsuniecia): void {
  potwierdzeniaUsuniecia = [potwierdzenie, ...potwierdzeniaUsuniecia];
}

export function pobierzPotwierdzenia(): readonly PotwierdzenieUsuniecia[] {
  return potwierdzeniaUsuniecia;
}

export function dodajWykonaneZadania(
  subjectRef: string,
  zadania: readonly ZadanieRetencyjne[],
): void {
  wykonaneZadania = [
    ...zadania.map((zadanie) => ({ ...zadanie, subjectRef, wykonano: TERAZ })),
    ...wykonaneZadania,
  ];
}

export function pobierzWykonaneZadania(): readonly (ZadanieRetencyjne & {
  subjectRef: string;
  wykonano: string;
})[] {
  return wykonaneZadania;
}
