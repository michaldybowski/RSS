/**
 * Mapowanie baz Notion na rekordy cache (specyfikacja 5.1).
 *
 * Sześć baz obsługiwanych w Fazie A. Harmonogram warsztatów i schemat
 * certyfikacji dochodzą w Fazie B — wzorzec jest ten sam.
 *
 * Identyfikatory baz są konfiguracją środowiskową, nie stałą w kodzie:
 * przestrzeń testowa i produkcyjna mają inne bazy, a przełączanie ich
 * podmianą kodu kończy się importem z niewłaściwej przestrzeni.
 */

import { PropertyReader } from './props.ts';
import type { NotionPage, ParseResult, SourceCode } from './types.ts';

export interface SourceMapping<T = Record<string, unknown>> {
  code: SourceCode;
  /** Nazwa bazy w Notion — używana w komunikatach dla administratora. */
  label: string;
  parse: (page: NotionPage) => ParseResult<T>;
}

export type DataSourceIds = Readonly<Record<SourceCode, string>>;

const PAKIETY = ['light', 'pro', 'enterprise', 'prime'] as const;
const LINIE = ['A', 'B', 'C', 'G', 'M'] as const;
const TYPY_TRESCI = ['lekcja', 'webinar', 'podcast', 'artykul', 'ebook', 'zeszyt'] as const;

function result<T>(reader: PropertyReader, value: T): ParseResult<T> {
  return reader.ok ? { ok: true, value } : { ok: false, issues: reader.issues };
}

export const SOURCE_MAPPINGS: readonly SourceMapping[] = [
  {
    code: 'filary',
    label: 'Filary',
    parse: (page) => {
      const r = new PropertyReader(page);
      return result(r, {
        kod: r.text('Kod', { required: true }),
        nazwa: r.text('Nazwa', { required: true }),
        opis: r.text('Opis'),
        ikona: r.text('Ikona'),
        // Jedna treść, trzy narracje: 8 filarów B2B, 12 B2G, 4 moduły PRIME.
        pozycjaSchemat8: r.number('Schemat 8', { min: 1 }),
        pozycjeSchemat12: r.multiSelect('Schemat 12'),
        modulPrime: r.select('Moduł PRIME'),
      });
    },
  },
  {
    code: 'biblioteka',
    label: 'Biblioteka treści',
    parse: (page) => {
      const r = new PropertyReader(page);
      return result(r, {
        tytul: r.text('Tytuł', { required: true }),
        typ: r.requiredSelect('Typ', TYPY_TRESCI),
        opis: r.text('Opis'),
        czasTrwaniaMin: r.number('Czas trwania', { min: 0 }),
        filary: r.relation('Filary'),
        pakiety: r.multiSelect('Pakiety', PAKIETY),
        mediaUrl: r.url('Link do mediów'),
        opublikowana: r.checkbox('Opublikowana'),
      });
    },
  },
  {
    code: 'wyzwania',
    label: 'Wyzwania',
    parse: (page) => {
      const r = new PropertyReader(page);
      return result(r, {
        nazwa: r.text('Nazwa', { required: true }),
        typ: r.requiredSelect('Typ', ['indywidualne', 'zespolowe']),
        metryka: r.requiredSelect('Metryka', ['kroki', 'sen', 'trening', 'nawyk', 'woda']),
        cel: r.number('Cel', { required: true, min: 1 }),
        czasTrwaniaDni: r.number('Czas trwania', { required: true, min: 1 }),
        punkty: r.number('Punkty', { min: 0 }),
        pakiety: r.multiSelect('Pakiety', PAKIETY),
        filar: r.relation('Filar'),
      });
    },
  },
  {
    code: 'partnerzy',
    label: 'Partnerzy marketplace',
    parse: (page) => {
      const r = new PropertyReader(page);
      return result(r, {
        nazwa: r.text('Nazwa', { required: true }),
        kategoria: r.requiredSelect('Kategoria', [
          'diagnostyka',
          'sport',
          'zywienie',
          'suplementy',
          'regeneracja',
          'sprzet',
        ]),
        opis: r.text('Opis'),
        url: r.url('URL'),
        prowizjaPct: r.number('Prowizja', { min: 0 }),
        statusUmowy: r.requiredSelect('Status umowy', ['negocjacje', 'podpisana', 'zawieszona']),
      });
    },
  },
  {
    code: 'cennik',
    label: 'Pakiety i cennik',
    parse: (page) => {
      const r = new PropertyReader(page);
      return result(r, {
        pakiet: r.requiredSelect('Pakiet', PAKIETY),
        wariant: r.text('Wariant'),
        cenaNetto: r.number('Cena netto', { required: true, min: 0 }),
        // Stawka VAT to parametr, nie założenie — decyzja 4. Do czasu
        // interpretacji KIS ustawia ją księgowość, per pozycja katalogu.
        stawkaVat: r.requiredSelect('VAT', ['23', '8', '5', '0', 'zw']),
        linia: r.requiredSelect('Linia', LINIE),
        obowiazujeOd: r.date('Obowiązuje od', { required: true }),
      });
    },
  },
  {
    code: 'progi_zfss',
    label: 'Progi ZFŚS',
    parse: (page) => {
      const r = new PropertyReader(page);
      return result(r, {
        organizacja: r.text('Organizacja', { required: true }),
        progDochodowy: r.number('Próg dochodowy', { required: true, min: 0 }),
        doplataPct: r.number('Dopłata %', { required: true, min: 0 }),
        obowiazujeOd: r.date('Obowiązuje od', { required: true }),
      });
    },
  },
];

export function mappingFor(code: SourceCode): SourceMapping {
  const mapping = SOURCE_MAPPINGS.find((item) => item.code === code);
  if (mapping === undefined) throw new Error(`Brak mapowania dla źródła "${code}".`);
  return mapping;
}
