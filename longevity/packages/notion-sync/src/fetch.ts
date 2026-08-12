/**
 * Pobranie wszystkich stron źródła, z paginacją i limitem żądań.
 *
 * Wydzielone z orkiestracji, bo korzysta z tego zarówno przebieg zapisujący,
 * jak i zapowiedź (`zapowiedz`). Gdyby zapowiedź miała własną kopię pobierania,
 * podgląd i przebieg mogłyby rozjechać się w tym, co w ogóle zobaczą.
 */

import type { RateLimiter } from './rateLimit.ts';
import type { NotionPage, NotionReader } from './types.ts';

export interface FetchInput {
  reader: NotionReader;
  limiter: RateLimiter;
  dataSourceId: string;
  editedSince?: string;
  maxPages: number;
}

export async function fetchAllPages({
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
