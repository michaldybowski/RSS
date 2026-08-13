/**
 * Dane demonstracyjne panelu administratora — PROTOTYP.
 *
 * Zawartość Notion jest tu udawana dwoma zestawami stron: „zastanym" (to, co
 * już siedzi w cache) i „bieżącym" (to, co ktoś w międzyczasie zmienił).
 * Dzięki temu zapowiedź synchronizacji ma co pokazać, w tym pomyłkę w cenniku,
 * której nie wolno wpuścić do rozliczeń bez świadomej zgody administratora.
 *
 * Zbiory podmiotów są syntetyczne i celowo zawierają wartości zdrowotne —
 * po to, żeby testy przejścia mogły sprawdzić, że **nie pojawiają się**
 * na żadnym ekranie tego panelu.
 */

import type { Actor } from '@longevity/access';
import type { Rekord, WniosekOsoby, ZbiorPodmiotu } from '@longevity/gdpr';
import type {
  Partner as MarketPartner,
  Zamowienie as MarketZamowienie,
} from '@longevity/marketplace';
import type {
  DataSourceIds,
  NotionPage,
  NotionQuery,
  NotionQueryResult,
  NotionReader,
  NotionValue,
} from '@longevity/notion-sync';

export const TERAZ = '2026-09-28T09:00:00.000Z';
export const DZIS = TERAZ.slice(0, 10);

/** Znacznik ostatniej udanej synchronizacji — punkt odniesienia trybu przyrostowego. */
export const OSTATNIA_SYNCHRONIZACJA = '2026-09-20T04:00:00.000Z';

export interface Konto {
  id: string;
  opis: string;
  rola: 'admin' | 'hr';
  actor: Actor;
}

/**
 * Drugie konto nie jest ozdobą: panel ma pokazywać odmowę tak samo wyraźnie
 * jak zgodę, a odmowy nie da się obejrzeć, jeśli zalogować się można tylko
 * jako administrator.
 */
export const KONTA: readonly Konto[] = [
  {
    id: 'adm-1',
    opis: 'Administrator platformy',
    rola: 'admin',
    actor: { userId: 'adm-1', grants: [{ role: 'admin' }] },
  },
  {
    id: 'hr-alfa',
    opis: 'HR — Firma Alfa (do sprawdzenia odmowy)',
    rola: 'hr',
    actor: { userId: 'hr-alfa', grants: [{ role: 'hr', organizationId: 'org-alfa' }] },
  },
];

export function kontoPoId(id: string): Konto | undefined {
  return KONTA.find((konto) => konto.id === id);
}

// ---------------------------------------------------------------------------
// Notion
// ---------------------------------------------------------------------------

export const DATA_SOURCE_IDS: DataSourceIds = {
  filary: 'ds-filary',
  biblioteka: 'ds-biblioteka',
  wyzwania: 'ds-wyzwania',
  partnerzy: 'ds-partnerzy',
  cennik: 'ds-cennik',
  progi_zfss: 'ds-progi',
};

const text = (value: string): NotionValue => ({ type: 'text', value });
const number = (value: number | null): NotionValue => ({ type: 'number', value });
const select = (value: string | null): NotionValue => ({ type: 'select', value });
const multi = (value: string[]): NotionValue => ({ type: 'multi_select', value });
const checkbox = (value: boolean): NotionValue => ({ type: 'checkbox', value });
const date = (value: string | null): NotionValue => ({ type: 'date', value });
const relation = (value: string[]): NotionValue => ({ type: 'relation', value });
const url = (value: string | null): NotionValue => ({ type: 'url', value });

function strona(
  id: string,
  properties: Record<string, NotionValue>,
  lastEditedTime = '2026-09-15T10:00:00.000Z',
  archived = false,
): NotionPage {
  return { id, lastEditedTime, archived, properties };
}

const cennik = (
  id: string,
  pakiet: string,
  cena: number,
  linia: string,
  nadpisania: Record<string, NotionValue> = {},
  edycja?: string,
): NotionPage =>
  strona(
    id,
    {
      Pakiet: select(pakiet),
      Wariant: text('roczny'),
      'Cena netto': number(cena),
      VAT: select('zw'),
      Linia: select(linia),
      'Obowiązuje od': date('2026-01-01'),
      ...nadpisania,
    },
    edycja,
  );

const tresc = (id: string, tytul: string, typ: string, edycja?: string): NotionPage =>
  strona(
    id,
    {
      Tytuł: text(tytul),
      Typ: select(typ),
      Opis: text('Materiał programu Longevity.'),
      'Czas trwania': number(12),
      Filary: relation(['filar-sen']),
      Pakiety: multi(['pro', 'enterprise']),
      'Link do mediów': url('https://media.example.org/' + id),
      Opublikowana: checkbox(true),
    },
    edycja,
  );

const prog = (id: string, organizacja: string, prog_: number, doplata: number, edycja?: string): NotionPage =>
  strona(
    id,
    {
      Organizacja: text(organizacja),
      'Próg dochodowy': number(prog_),
      'Dopłata %': number(doplata),
      'Obowiązuje od': date('2026-01-01'),
    },
    edycja,
  );

/** Stan Notion w chwili ostatniej udanej synchronizacji. */
const ZASTANE: Readonly<Record<string, readonly NotionPage[]>> = {
  [DATA_SOURCE_IDS.cennik]: [
    cennik('cen-light', 'light', 39000, 'A'),
    cennik('cen-pro', 'pro', 89000, 'B'),
    cennik('cen-ent', 'enterprise', 240000, 'B'),
  ],
  [DATA_SOURCE_IDS.progi_zfss]: [
    prog('zf-alfa-1', 'Firma Alfa', 450000, 70),
    prog('zf-alfa-2', 'Firma Alfa', 700000, 40),
  ],
  [DATA_SOURCE_IDS.biblioteka]: [
    tresc('bib-sen', 'Higiena snu w 5 minut', 'lekcja'),
    tresc('bib-stres', 'Oddech i stres', 'lekcja'),
  ],
  [DATA_SOURCE_IDS.filary]: [],
  [DATA_SOURCE_IDS.wyzwania]: [],
  [DATA_SOURCE_IDS.partnerzy]: [],
};

const PO_ZMIANACH = '2026-09-26T12:00:00.000Z';

/**
 * Stan Notion teraz. Cztery rzeczy do zobaczenia w zapowiedzi:
 * podniesiona cena pakietu pro, nowy pakiet PRIME, wpis progów ZFŚS z pustą
 * dopłatą (odrzucony przy imporcie) i zniknięty materiał z biblioteki.
 */
const BIEZACE: Readonly<Record<string, readonly NotionPage[]>> = {
  [DATA_SOURCE_IDS.cennik]: [
    cennik('cen-light', 'light', 39000, 'A'),
    cennik('cen-pro', 'pro', 129000, 'B', {}, PO_ZMIANACH),
    cennik('cen-ent', 'enterprise', 240000, 'B'),
    cennik('cen-prime', 'prime', 1450000, 'M', {}, PO_ZMIANACH),
  ],
  [DATA_SOURCE_IDS.progi_zfss]: [
    prog('zf-alfa-1', 'Firma Alfa', 450000, 70),
    prog('zf-alfa-2', 'Firma Alfa', 700000, 40),
    strona(
      'zf-alfa-3',
      {
        Organizacja: text('Firma Alfa'),
        'Próg dochodowy': number(950000),
        'Dopłata %': number(null),
        'Obowiązuje od': date('2026-10-01'),
      },
      PO_ZMIANACH,
    ),
  ],
  [DATA_SOURCE_IDS.biblioteka]: [
    tresc('bib-sen', 'Higiena snu w 5 minut', 'lekcja'),
    tresc('bib-ruch', 'Rozgrzewka przy biurku', 'lekcja', PO_ZMIANACH),
  ],
  [DATA_SOURCE_IDS.filary]: [],
  [DATA_SOURCE_IDS.wyzwania]: [],
  [DATA_SOURCE_IDS.partnerzy]: [],
};

/** Czytnik bez sieci. Kontrakt ten sam co produkcyjny: wyłącznie odczyt. */
export class DemoNotion implements NotionReader {
  constructor(private zestaw: Readonly<Record<string, readonly NotionPage[]>> = ZASTANE) {}

  przelaczNaBiezace(): void {
    this.zestaw = BIEZACE;
  }

  async queryDataSource(query: NotionQuery): Promise<NotionQueryResult> {
    const wszystkie = this.zestaw[query.dataSourceId] ?? [];
    const strony =
      query.editedSince === undefined
        ? wszystkie
        : wszystkie.filter((s) => s.lastEditedTime > query.editedSince!);

    return { pages: strony, nextCursor: null };
  }
}

export const OPIS_ZRODLA: Readonly<Record<string, string>> = {
  filary: 'Filary',
  biblioteka: 'Biblioteka treści',
  wyzwania: 'Wyzwania',
  partnerzy: 'Partnerzy marketplace',
  cennik: 'Pakiety i cennik',
  progi_zfss: 'Progi ZFŚS',
};

// ---------------------------------------------------------------------------
// Podmioty danych i wnioski
// ---------------------------------------------------------------------------

const rekord = (
  id: string,
  rodzaj: Rekord['rodzaj'],
  utworzono: string,
  dane: Record<string, unknown>,
): Rekord => ({ id, rodzaj, utworzono, dane });

export const ZBIORY: readonly ZbiorPodmiotu[] = [
  {
    subjectRef: 'psd-8fa2',
    uczestnictwo: { od: '2025-02-01', do: '2026-01-31' },
    tozsamosc: {
      userId: 'u-101',
      email: 'anna.kowalska@example.org',
      imie: 'Anna',
      nazwisko: 'Kowalska',
      dataUrodzenia: '1984-03-12',
    },
    rekordy: [
      rekord('r-101', 'kwestionariusz', '2025-02-03', { d1_choroby_przewlekle: ['nadcisnienie'] }),
      rekord('r-102', 'wyniki_badan', '2025-02-10', { hba1c: 6.4, glukoza: 108 }),
      rekord('r-103', 'plan', '2025-02-12', { dniTreningowe: 3 }),
      rekord('r-104', 'wearables_surowe', '2024-06-01', { probki: 41288 }),
      rekord('r-105', 'zgoda', '2025-02-01', { kod: 'dane_zdrowotne' }),
      rekord('r-106', 'audit_log', '2025-02-03', { akcja: 'zapis_danych_zdrowotnych' }),
      rekord('r-107', 'dokument_ksiegowy', '2025-03-31', { nota: 'FDP/2025/0031' }),
    ],
  },
  {
    subjectRef: 'psd-31c7',
    uczestnictwo: { od: '2026-03-01' },
    tozsamosc: {
      userId: 'u-102',
      email: 'piotr.nowak@example.org',
      imie: 'Piotr',
      nazwisko: 'Nowak',
      dataUrodzenia: '1979-11-04',
    },
    rekordy: [
      rekord('r-201', 'kwestionariusz', '2026-03-02', { d1_choroby_przewlekle: ['cukrzyca_t2'] }),
      rekord('r-202', 'wyniki_badan', '2026-03-08', { hba1c: 7.1 }),
      rekord('r-203', 'dziennik_objawow', '2026-04-01', { wpisy: 22 }),
      rekord('r-204', 'wearables_surowe', '2024-05-15', { probki: 88214 }),
      rekord('r-205', 'audit_log', '2026-03-02', { akcja: 'wygenerowanie_planu' }),
    ],
  },
  {
    subjectRef: 'psd-5b90',
    uczestnictwo: { od: '2025-06-01', do: '2026-05-31' },
    tozsamosc: {
      userId: 'u-103',
      email: 'maria.zielinska@example.org',
      imie: 'Maria',
      nazwisko: 'Zielińska',
      dataUrodzenia: '1991-07-22',
    },
    rekordy: [
      rekord('r-301', 'kwestionariusz', '2025-06-04', { d1_choroby_przewlekle: ['brak'] }),
      rekord('r-302', 'plan', '2025-06-06', { dniTreningowe: 4 }),
      rekord('r-303', 'audit_log', '2025-06-04', { akcja: 'logowanie' }),
    ],
  },
];

export const WNIOSKI: readonly WniosekOsoby[] = [
  { id: 'wn-2026-014', subjectRef: 'psd-8fa2', prawo: 'usuniecie', zlozony: '2026-09-10' },
  { id: 'wn-2026-015', subjectRef: 'psd-31c7', prawo: 'przenoszenie', zlozony: '2026-09-22' },
  { id: 'wn-2026-011', subjectRef: 'psd-5b90', prawo: 'sprzeciw_wobec_profilowania', zlozony: '2026-08-20' },
  {
    id: 'wn-2026-009',
    subjectRef: 'psd-5b90',
    prawo: 'dostep',
    zlozony: '2026-08-01',
    zrealizowany: '2026-08-06',
  },
];

export const OPIS_PRAWA: Readonly<Record<string, string>> = {
  dostep: 'Dostęp do danych (art. 15)',
  przenoszenie: 'Przenoszenie danych (art. 20)',
  sprostowanie: 'Sprostowanie (art. 16)',
  usuniecie: 'Usunięcie (art. 17)',
  sprzeciw_wobec_profilowania: 'Sprzeciw wobec profilowania (art. 21 i 22)',
};

export const OPIS_LOSU: Readonly<Record<string, string>> = {
  usuniety: 'usunięte',
  zachowany_z_ograniczeniem: 'zachowane z ograniczonym dostępem',
  zachowany_bez_przypisania: 'zachowane bez przypisania do osoby',
};

export const OPIS_AKCJI_RETENCJI: Readonly<Record<string, string>> = {
  usun: 'usunięcie',
  agreguj_dobowo: 'agregacja do danych dobowych',
};

// ---------------------------------------------------------------------------
// Marketplace
// ---------------------------------------------------------------------------

export const OKRES_PROWIZJI = '2026-09';

/** Stawka VAT usługi pośrednictwa — parametr księgowy, nie stała w kodzie. */
export const VAT_PROWIZJI = '23' as const;

export const PARTNERZY: readonly MarketPartner[] = [
  {
    id: 'p-lab',
    nazwa: 'Laboratorium Alfa',
    kategoria: 'diagnostyka',
    opis: 'Sieć punktów pobrań.',
    prowizjaPct: 10,
    statusUmowy: 'podpisana',
  },
  {
    id: 'p-klub',
    nazwa: 'Klub Ruchu Beta',
    kategoria: 'sport',
    opis: 'Zajęcia grupowe i siłownia.',
    prowizjaPct: 15,
    statusUmowy: 'podpisana',
  },
  {
    id: 'p-suple',
    nazwa: 'Suplementy Gamma',
    kategoria: 'suplementy',
    opis: 'Umowa w negocjacjach.',
    prowizjaPct: 25,
    statusUmowy: 'negocjacje',
  },
];

function zamowienie(
  id: string,
  partnerId: string,
  nettoGr: number,
  prowizjaPct: number,
  status: MarketZamowienie['status'],
  dzien: string,
): MarketZamowienie {
  return {
    id,
    ofertaId: `o-${id}`,
    partnerId,
    subjectRef: `psd-${id}`,
    kwotaNettoGr: nettoGr,
    stawkaVat: '23',
    prowizjaPct,
    prowizjaGr: Math.round((nettoGr * prowizjaPct) / 100),
    zlozone: `${dzien}T10:00:00.000Z`,
    status,
    ...(status === 'zrealizowane' ? { zrealizowane: `${dzien}T18:00:00.000Z` } : {}),
  };
}

export const ZAMOWIENIA: readonly MarketZamowienie[] = [
  zamowienie('a1', 'p-lab', 39_000, 10, 'zrealizowane', '2026-09-04'),
  zamowienie('a2', 'p-lab', 9_000, 10, 'zrealizowane', '2026-09-11'),
  zamowienie('a3', 'p-lab', 39_000, 10, 'anulowane', '2026-09-12'),
  zamowienie('b1', 'p-klub', 14_900, 15, 'zrealizowane', '2026-09-06'),
  zamowienie('b2', 'p-klub', 14_900, 15, 'zlozone', '2026-09-28'),
  // Zamówienie z poprzedniego okresu — nie wejdzie do faktury za wrzesień.
  zamowienie('a0', 'p-lab', 39_000, 10, 'zrealizowane', '2026-08-30'),
];
