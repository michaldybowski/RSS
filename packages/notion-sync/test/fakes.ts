/**
 * Atrapy do testów: czytnik Notion bez sieci i zegar bez czekania.
 */

import type { Clock } from '../src/rateLimit.ts';
import type {
  DataSourceIds,
  NotionPage,
  NotionQuery,
  NotionQueryResult,
  NotionReader,
  NotionValue,
} from '../src/index.ts';

export const DATA_SOURCE_IDS: DataSourceIds = {
  filary: 'ds-filary',
  biblioteka: 'ds-biblioteka',
  wyzwania: 'ds-wyzwania',
  partnerzy: 'ds-partnerzy',
  cennik: 'ds-cennik',
  progi_zfss: 'ds-progi',
};

export class FakeNotion implements NotionReader {
  readonly queries: NotionQuery[] = [];
  /** Rozmiar strony paginacji — do sprawdzenia, że kursor jest obsługiwany. */
  pageSize = 100;
  private readonly data = new Map<string, NotionPage[]>();
  private failuresLeft = 0;
  private failure: Error | null = null;

  set(dataSourceId: string, pages: readonly NotionPage[]): void {
    this.data.set(dataSourceId, [...pages]);
  }

  /** Ustawia N kolejnych żądań na błąd — do testu ponowień. */
  failNext(times: number, error: Error): void {
    this.failuresLeft = times;
    this.failure = error;
  }

  async queryDataSource(query: NotionQuery): Promise<NotionQueryResult> {
    this.queries.push(query);

    if (this.failuresLeft > 0 && this.failure !== null) {
      this.failuresLeft -= 1;
      throw this.failure;
    }

    const all = this.data.get(query.dataSourceId) ?? [];
    const filtered =
      query.editedSince === undefined
        ? all
        : all.filter((page) => page.lastEditedTime > query.editedSince!);

    const offset = query.cursor === undefined ? 0 : Number(query.cursor);
    const slice = filtered.slice(offset, offset + this.pageSize);
    const nextOffset = offset + this.pageSize;

    return {
      pages: slice,
      nextCursor: nextOffset < filtered.length ? String(nextOffset) : null,
    };
  }
}

export function fakeClock(startMs = 0): Clock & { elapsed: () => number } {
  let current = startMs;
  return {
    now: () => current,
    sleep: async (ms: number) => {
      current += ms;
    },
    elapsed: () => current - startMs,
  };
}

export function page(
  id: string,
  properties: Record<string, NotionValue>,
  overrides: Partial<Pick<NotionPage, 'lastEditedTime' | 'archived'>> = {},
): NotionPage {
  return {
    id,
    lastEditedTime: overrides.lastEditedTime ?? '2026-07-20T10:00:00.000Z',
    archived: overrides.archived ?? false,
    properties,
  };
}

export const text = (value: string): NotionValue => ({ type: 'text', value });
export const number = (value: number | null): NotionValue => ({ type: 'number', value });
export const select = (value: string | null): NotionValue => ({ type: 'select', value });
export const multi = (value: string[]): NotionValue => ({ type: 'multi_select', value });
export const checkbox = (value: boolean): NotionValue => ({ type: 'checkbox', value });
export const date = (value: string | null): NotionValue => ({ type: 'date', value });
export const relation = (value: string[]): NotionValue => ({ type: 'relation', value });
export const url = (value: string | null): NotionValue => ({ type: 'url', value });

/** Poprawny wpis do bazy „Pakiety i cennik". */
export function cennikPage(id: string, overrides: Record<string, NotionValue> = {}, meta = {}): NotionPage {
  return page(
    id,
    {
      Pakiet: select('pro'),
      Wariant: text('roczny'),
      'Cena netto': number(1200),
      VAT: select('zw'),
      Linia: select('A'),
      'Obowiązuje od': date('2026-09-01'),
      ...overrides,
    },
    meta,
  );
}

/** Poprawny wpis do bazy „Biblioteka treści". */
export function bibliotekaPage(id: string, overrides: Record<string, NotionValue> = {}, meta = {}): NotionPage {
  return page(
    id,
    {
      Tytuł: text('Higiena snu w 5 minut'),
      Typ: select('lekcja'),
      Opis: text('Krótka lekcja o rytmie dobowym.'),
      'Czas trwania': number(5),
      Filary: relation(['filar-sen']),
      Pakiety: multi(['pro', 'enterprise']),
      'Link do mediów': url('https://media.example.org/sen-01'),
      Opublikowana: checkbox(true),
      ...overrides,
    },
    meta,
  );
}
