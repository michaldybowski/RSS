/**
 * Cache treści po stronie aplikacji.
 *
 * Interfejs jest wąski celowo: implementacja produkcyjna siada na Postgresie,
 * a testowa trzyma wszystko w pamięci. Logika synchronizacji nie wie, na czym
 * stoi, i nie ma jak sięgnąć do Notion przez tylne drzwi.
 */

import { createHash } from 'node:crypto';

import type { CachedRecord, SourceCode, SyncLogEntry } from './types.ts';

export interface CacheStore {
  /** Mapa notionId → hash dla rekordów aktywnych i zarchiwizowanych. */
  hashes: (source: SourceCode) => Promise<ReadonlyMap<string, string>>;
  upsert: (records: readonly CachedRecord[]) => Promise<void>;
  /**
   * Oznacza jako zarchiwizowane rekordy, których nie było w imporcie.
   * Bez kasowania — usunięcie strony w Notion nie może wyczyścić treści
   * powiązanej z historią uczestników (specyfikacja 5.2 pkt 4).
   */
  archiveMissing: (source: SourceCode, seenIds: readonly string[]) => Promise<number>;
  appendLog: (entries: readonly SyncLogEntry[]) => Promise<void>;
}

/** Skrót rekordu — pozwala pominąć zapis, gdy zmieniła się tylko data edycji. */
export function hashRecord(data: Readonly<Record<string, unknown>>): string {
  return createHash('sha256').update(stableStringify(data)).digest('hex').slice(0, 32);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`);

  return `{${entries.join(',')}}`;
}

export class InMemoryCacheStore implements CacheStore {
  private readonly records = new Map<string, CachedRecord>();
  readonly log: SyncLogEntry[] = [];

  private key(source: SourceCode, notionId: string): string {
    return `${source}:${notionId}`;
  }

  async hashes(source: SourceCode): Promise<ReadonlyMap<string, string>> {
    const result = new Map<string, string>();
    for (const record of this.records.values()) {
      if (record.source === source) result.set(record.notionId, record.hash);
    }
    return result;
  }

  async upsert(records: readonly CachedRecord[]): Promise<void> {
    for (const record of records) {
      this.records.set(this.key(record.source, record.notionId), record);
    }
  }

  async archiveMissing(source: SourceCode, seenIds: readonly string[]): Promise<number> {
    const seen = new Set(seenIds);
    let archived = 0;

    for (const [key, record] of this.records) {
      if (record.source !== source) continue;
      if (seen.has(record.notionId) || record.status === 'archived') continue;
      this.records.set(key, { ...record, status: 'archived' });
      archived += 1;
    }

    return archived;
  }

  async appendLog(entries: readonly SyncLogEntry[]): Promise<void> {
    this.log.push(...entries);
  }

  /** Widok dla testów i panelu admina. */
  list(source: SourceCode): readonly CachedRecord[] {
    return [...this.records.values()].filter((record) => record.source === source);
  }

  active(source: SourceCode): readonly CachedRecord[] {
    return this.list(source).filter((record) => record.status === 'active');
  }
}
