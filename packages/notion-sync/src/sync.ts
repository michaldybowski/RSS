/**
 * Orkiestracja synchronizacji (specyfikacja 5.2).
 *
 * Dwa tryby:
 *  - pełna — bez znacznika czasu; po niej wolno archiwizować rekordy, których
 *    nie było w imporcie;
 *  - przyrostowa — tylko strony zmienione od ostatniego przebiegu; archiwizacja
 *    jest tu zabroniona, bo „nie było w imporcie" znaczy wtedy „nie zmieniło się",
 *    a nie „zniknęło".
 *
 * Ta różnica jest jedynym miejscem, w którym synchronizator może skasować
 * połowę biblioteki treści — dlatego jest wymuszona typem, nie komentarzem.
 */

import { RateLimiter, systemClock, type Clock, type RateLimitOptions } from './rateLimit.ts';
import { mappingFor, type DataSourceIds, type SourceMapping } from './sources.ts';
import { hashRecord, type CacheStore } from './store.ts';
import type {
  CachedRecord,
  NotionPage,
  NotionReader,
  SourceCode,
  SourceReport,
  SyncLogEntry,
  SyncReport,
} from './types.ts';

export type SyncMode =
  | { kind: 'pelna' }
  | { kind: 'przyrostowa'; since: string };

export interface SyncOptions {
  reader: NotionReader;
  store: CacheStore;
  dataSourceIds: DataSourceIds;
  mode: SyncMode;
  sources?: readonly SourceCode[];
  clock?: Clock;
  rateLimit?: RateLimitOptions;
  /** Maksymalna liczba stron paginacji na źródło — zabezpieczenie przed pętlą. */
  maxPages?: number;
}

export async function synchronize(options: SyncOptions): Promise<SyncReport> {
  const clock = options.clock ?? systemClock;
  const limiter = new RateLimiter(clock, options.rateLimit);
  const startedAt = new Date(clock.now()).toISOString();
  const codes = options.sources ?? (Object.keys(options.dataSourceIds) as SourceCode[]);

  const sources: SourceReport[] = [];
  const log: SyncLogEntry[] = [];

  for (const code of codes) {
    const { report, entries } = await syncSource({
      mapping: mappingFor(code),
      dataSourceId: options.dataSourceIds[code],
      limiter,
      options,
      at: startedAt,
    });
    sources.push(report);
    log.push(...entries);
  }

  await options.store.appendLog(log);

  return { mode: options.mode.kind, startedAt, sources, log };
}

interface SyncSourceInput {
  mapping: SourceMapping;
  dataSourceId: string;
  limiter: RateLimiter;
  options: SyncOptions;
  at: string;
}

async function syncSource({
  mapping,
  dataSourceId,
  limiter,
  options,
  at,
}: SyncSourceInput): Promise<{ report: SourceReport; entries: SyncLogEntry[] }> {
  const { reader, store, mode } = options;
  const entries: SyncLogEntry[] = [];
  const known = await store.hashes(mapping.code);

  const pages = await fetchAllPages({
    reader,
    limiter,
    dataSourceId,
    ...(mode.kind === 'przyrostowa' ? { editedSince: mode.since } : {}),
    maxPages: options.maxPages ?? 200,
  });

  const toUpsert: CachedRecord[] = [];
  const seenIds: string[] = [];
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let rejected = 0;

  for (const page of pages) {
    seenIds.push(page.id);

    // Strona w koszu Notion to archiwizacja, nie usunięcie z cache.
    if (page.archived) {
      const existing = known.get(page.id);
      if (existing !== undefined) {
        toUpsert.push({
          notionId: page.id,
          source: mapping.code,
          hash: existing,
          lastEditedTime: page.lastEditedTime,
          status: 'archived',
          data: {},
        });
        entries.push(logEntry(mapping.code, page.id, 'zarchiwizowany', at));
      }
      continue;
    }

    const parsed = mapping.parse(page);

    if (!parsed.ok) {
      rejected += 1;
      entries.push({
        source: mapping.code,
        notionId: page.id,
        action: 'odrzucony',
        status: 'blad',
        error: parsed.issues.map((issue) => issue.message).join(' '),
        at,
      });
      continue;
    }

    const hash = hashRecord(parsed.value);

    if (known.get(page.id) === hash) {
      unchanged += 1;
      continue;
    }

    if (known.has(page.id)) updated += 1;
    else created += 1;

    toUpsert.push({
      notionId: page.id,
      source: mapping.code,
      hash,
      lastEditedTime: page.lastEditedTime,
      status: 'active',
      data: parsed.value,
    });
    entries.push(logEntry(mapping.code, page.id, known.has(page.id) ? 'zaktualizowany' : 'utworzony', at));
  }

  if (toUpsert.length > 0) await store.upsert(toUpsert);

  let archived = entries.filter((entry) => entry.action === 'zarchiwizowany').length;

  if (mode.kind === 'pelna') {
    const missing = await store.archiveMissing(mapping.code, seenIds);
    archived += missing;
  }

  return {
    report: { source: mapping.code, fetched: pages.length, created, updated, unchanged, archived, rejected },
    entries,
  };
}

interface FetchInput {
  reader: NotionReader;
  limiter: RateLimiter;
  dataSourceId: string;
  editedSince?: string;
  maxPages: number;
}

async function fetchAllPages({
  reader,
  limiter,
  dataSourceId,
  editedSince,
  maxPages,
}: FetchInput): Promise<readonly NotionPage[]> {
  const pages: NotionPage[] = [];
  let cursor: string | null = null;
  let requests = 0;

  do {
    if (requests >= maxPages) {
      throw new Error(
        `Przekroczono limit ${maxPages} stron paginacji dla źródła ${dataSourceId}. ` +
          'Przerwano, żeby nie zapętlić importu.',
      );
    }

    const result = await limiter.run(() =>
      reader.queryDataSource({
        dataSourceId,
        ...(editedSince !== undefined ? { editedSince } : {}),
        ...(cursor !== null ? { cursor } : {}),
      }),
    );

    pages.push(...result.pages);
    cursor = result.nextCursor;
    requests += 1;
  } while (cursor !== null);

  return pages;
}

function logEntry(
  source: SourceCode,
  notionId: string,
  action: SyncLogEntry['action'],
  at: string,
): SyncLogEntry {
  return { source, notionId, action, status: 'ok', at };
}

/** Rekordy odrzucone w ostatnim przebiegu — widok dla panelu admina. */
export function rejectedRecords(report: SyncReport): readonly SyncLogEntry[] {
  return report.log.filter((entry) => entry.status === 'blad');
}
