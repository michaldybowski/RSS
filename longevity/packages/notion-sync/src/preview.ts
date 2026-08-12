/**
 * Zapowiedź synchronizacji (specyfikacja 5.2 pkt 5).
 *
 * Zapowiedź liczy to samo co przebieg właściwy, ale nie dotyka magazynu:
 * nie ma tu `upsert`, `archiveMissing` ani `appendLog`. Administrator widzi,
 * co się zmieni, zanim się zmieni.
 *
 * Dla dwóch źródeł zapowiedź nie jest udogodnieniem, tylko warunkiem:
 * cennik decyduje o kwotach na notach, a progi ZFŚS o wysokości dopłaty
 * z funduszu socjalnego. Pomyłka w Notion przenosi się stamtąd wprost
 * na pieniądze konkretnych ludzi, a przebieg synchronizacji jest cichy —
 * bez podglądu nikt nie zauważy, że zmieniła się jedna cyfra.
 */

import { fetchAllPages } from './fetch.ts';
import { RateLimiter, systemClock, type Clock, type RateLimitOptions } from './rateLimit.ts';
import { mappingFor, type DataSourceIds } from './sources.ts';
import { hashRecord, type CacheStore } from './store.ts';
import type { CachedRecord, NotionReader, SourceCode } from './types.ts';
import type { SyncMode } from './sync.ts';

/** Źródła, których nie wolno zsynchronizować bez potwierdzenia zapowiedzi. */
export const ZRODLA_KRYTYCZNE: readonly SourceCode[] = ['cennik', 'progi_zfss'];

export function wymagaPotwierdzenia(source: SourceCode): boolean {
  return ZRODLA_KRYTYCZNE.includes(source);
}

export type RodzajZmiany = 'nowy' | 'zmieniony' | 'zniknal' | 'odrzucony';

export interface Roznica {
  pole: string;
  przed: unknown;
  po: unknown;
}

export interface ZmianaPodgladu {
  notionId: string;
  rodzaj: RodzajZmiany;
  /** Puste dla rekordów odrzuconych — nie ma czego porównać. */
  roznice: readonly Roznica[];
  blad?: string;
}

export interface PodgladZrodla {
  source: SourceCode;
  label: string;
  pobrane: number;
  bezZmian: number;
  zmiany: readonly ZmianaPodgladu[];
  wymagaPotwierdzenia: boolean;
  /**
   * Czy zapowiedź mogła wykryć zniknięcia. W trybie przyrostowym nie mogła:
   * „nie przyszło" znaczy tam „nie zmieniło się", nie „usunięto".
   */
  wykrywaZnikniecia: boolean;
}

export interface PodgladOptions {
  reader: NotionReader;
  store: CacheStore;
  dataSourceIds: DataSourceIds;
  mode: SyncMode;
  sources?: readonly SourceCode[];
  clock?: Clock;
  rateLimit?: RateLimitOptions;
  maxPages?: number;
}

export async function zapowiedz(options: PodgladOptions): Promise<readonly PodgladZrodla[]> {
  const clock = options.clock ?? systemClock;
  const limiter = new RateLimiter(clock, options.rateLimit);
  const codes = options.sources ?? (Object.keys(options.dataSourceIds) as SourceCode[]);

  const podglady: PodgladZrodla[] = [];

  for (const code of codes) {
    const mapping = mappingFor(code);
    const znane = new Map(
      (await options.store.current(code)).map((record) => [record.notionId, record]),
    );

    const strony = await fetchAllPages({
      reader: options.reader,
      limiter,
      dataSourceId: options.dataSourceIds[code],
      ...(options.mode.kind === 'przyrostowa' ? { editedSince: options.mode.since } : {}),
      maxPages: options.maxPages ?? 200,
    });

    const zmiany: ZmianaPodgladu[] = [];
    const widziane = new Set<string>();
    let bezZmian = 0;

    for (const strona of strony) {
      widziane.add(strona.id);
      const znany = znane.get(strona.id);

      if (strona.archived) {
        if (znany !== undefined && znany.status === 'active') {
          zmiany.push({ notionId: strona.id, rodzaj: 'zniknal', roznice: [] });
        }
        continue;
      }

      const parsed = mapping.parse(strona);

      if (!parsed.ok) {
        zmiany.push({
          notionId: strona.id,
          rodzaj: 'odrzucony',
          roznice: [],
          blad: parsed.issues.map((issue) => `${issue.property}: ${issue.message}`).join(' '),
        });
        continue;
      }

      if (znany !== undefined && znany.hash === hashRecord(parsed.value) && znany.status === 'active') {
        bezZmian += 1;
        continue;
      }

      zmiany.push({
        notionId: strona.id,
        rodzaj: znany === undefined ? 'nowy' : 'zmieniony',
        roznice: roznice(znany?.data ?? {}, parsed.value),
      });
    }

    // Zniknięcia z pełnego przebiegu — w przyrostowym byłyby fałszywe.
    if (options.mode.kind === 'pelna') {
      for (const [notionId, record] of znane) {
        if (widziane.has(notionId) || record.status === 'archived') continue;
        zmiany.push({ notionId, rodzaj: 'zniknal', roznice: [] });
      }
    }

    podglady.push({
      source: code,
      label: mapping.label,
      pobrane: strony.length,
      bezZmian,
      zmiany,
      wymagaPotwierdzenia: wymagaPotwierdzenia(code),
      wykrywaZnikniecia: options.mode.kind === 'pelna',
    });
  }

  return podglady;
}

/** Różnice pole po polu. Klucze z obu stron, żeby zniknięcie pola też było widać. */
export function roznice(
  przed: Readonly<Record<string, unknown>>,
  po: Readonly<Record<string, unknown>>,
): readonly Roznica[] {
  const pola = [...new Set([...Object.keys(przed), ...Object.keys(po)])].sort();

  return pola
    .filter((pole) => JSON.stringify(przed[pole] ?? null) !== JSON.stringify(po[pole] ?? null))
    .map((pole) => ({ pole, przed: przed[pole], po: po[pole] }));
}

/** Czy zapowiedź zawiera cokolwiek do zatwierdzenia. */
export function czyPusta(podglady: readonly PodgladZrodla[]): boolean {
  return podglady.every((podglad) => podglad.zmiany.length === 0);
}

export class BrakPotwierdzeniaZapowiedziError extends Error {
  constructor(readonly source: SourceCode) {
    super(
      `Źródło "${source}" wpływa na rozliczenia. Synchronizacja wymaga ` +
        'potwierdzenia zapowiedzi zmian przed zapisem.',
    );
    this.name = 'BrakPotwierdzeniaZapowiedziError';
  }
}

/**
 * Bramka przed przebiegiem zapisującym. Wywołanie jej jest obowiązkiem
 * wywołującego — pakiet nie zna intencji administratora i nie zgadnie,
 * czy zapowiedź została komukolwiek pokazana.
 */
export function assertPotwierdzone(
  sources: readonly SourceCode[],
  potwierdzone: readonly SourceCode[],
): void {
  for (const source of sources) {
    if (wymagaPotwierdzenia(source) && !potwierdzone.includes(source)) {
      throw new BrakPotwierdzeniaZapowiedziError(source);
    }
  }
}
