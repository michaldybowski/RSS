/**
 * Synchronizacja Notion → cache aplikacji (specyfikacja 5.2–5.3).
 *
 * Kierunek jest jeden. Interfejs czytnika ma dokładnie jedną metodę i jest to
 * odczyt — brak ścieżki zapisu nie jest tu konwencją, tylko właściwością typu
 * (ADR-02, decyzja 2).
 *
 * Pakiet operuje na znormalizowanych stronach, nie na surowej odpowiedzi API
 * Notion. Tłumaczenie z formatu Notion na ten kształt należy do adaptera —
 * dzięki temu logika synchronizacji jest testowalna bez sieci i nie kruszy się
 * przy zmianie formatu odpowiedzi API.
 */

export type NotionValue =
  | { type: 'text'; value: string }
  | { type: 'number'; value: number | null }
  | { type: 'select'; value: string | null }
  | { type: 'multi_select'; value: readonly string[] }
  | { type: 'checkbox'; value: boolean }
  | { type: 'date'; value: string | null }
  | { type: 'relation'; value: readonly string[] }
  | { type: 'url'; value: string | null };

export interface NotionPage {
  id: string;
  /** ISO 8601. Podstawa synchronizacji przyrostowej. */
  lastEditedTime: string;
  /** Strona przeniesiona do kosza w Notion. */
  archived: boolean;
  properties: Readonly<Record<string, NotionValue>>;
}

export interface NotionQueryResult {
  pages: readonly NotionPage[];
  nextCursor: string | null;
}

export interface NotionQuery {
  dataSourceId: string;
  /** Gdy podane — tylko strony zmienione od tego momentu (synchronizacja przyrostowa). */
  editedSince?: string;
  cursor?: string;
}

/**
 * Jedyny kontrakt wobec Notion. Celowo bez metod zapisu — rozszerzenie tego
 * interfejsu o `updatePage` byłoby zmianą architektoniczną, nie drobiazgiem.
 */
export interface NotionReader {
  queryDataSource(query: NotionQuery): Promise<NotionQueryResult>;
}

export type SourceCode =
  | 'filary'
  | 'biblioteka'
  | 'wyzwania'
  | 'partnerzy'
  | 'cennik'
  | 'progi_zfss';

/** Rekord w cache. `hash` pozwala pominąć rekordy nietknięte mimo zmiany daty edycji. */
export interface CachedRecord {
  notionId: string;
  source: SourceCode;
  hash: string;
  lastEditedTime: string;
  status: 'active' | 'archived';
  data: Readonly<Record<string, unknown>>;
}

export interface ParseIssue {
  property: string;
  message: string;
}

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: readonly ParseIssue[] };

export interface SyncLogEntry {
  source: SourceCode;
  notionId: string;
  action: 'utworzony' | 'zaktualizowany' | 'bez_zmian' | 'zarchiwizowany' | 'odrzucony';
  status: 'ok' | 'blad';
  error?: string;
  at: string;
}

export interface SourceReport {
  source: SourceCode;
  fetched: number;
  created: number;
  updated: number;
  unchanged: number;
  archived: number;
  rejected: number;
}

export interface SyncReport {
  mode: 'pelna' | 'przyrostowa';
  startedAt: string;
  sources: readonly SourceReport[];
  log: readonly SyncLogEntry[];
}
