/**
 * Dane syntetyczne dla prototypu panelu HR.
 *
 * Dwie organizacje — druga istnieje po to, żeby dało się sprawdzić, że HR
 * jednej firmy nie sięgnie po drugą. Rozkłady dobrane tak, by pokazać oba
 * zachowania dashboardu: wynik i wstrzymanie ze względu na próg.
 */

import type { ParticipantRecord } from '@longevity/analytics';
import type { Obciazenie, PozycjaKatalogu, ProgZfss, Uczestnik } from '@longevity/billing';

export const ORGANIZACJE = [
  { id: 'zaklad-polnoc', nazwa: 'Zakład Północ' },
  { id: 'zaklad-poludnie', nazwa: 'Zakład Południe' },
] as const;

export const DZIALY = [
  { id: 'produkcja', nazwa: 'Produkcja' },
  { id: 'utrzymanie', nazwa: 'Utrzymanie ruchu' },
  { id: 'biuro', nazwa: 'Biuro' },
] as const;

/** Prosty generator deterministyczny — ten sam zestaw przy każdym uruchomieniu. */
function pseudolosowa(seed: number): () => number {
  let stan = seed;
  return () => {
    stan = (stan * 1_103_515_245 + 12_345) % 2_147_483_648;
    return stan / 2_147_483_648;
  };
}

function zbudujUczestnikow(): ParticipantRecord[] {
  const losuj = pseudolosowa(42);
  const rekordy: ParticipantRecord[] = [];

  const rozklad: readonly { org: string; unit: string; ile: number }[] = [
    { org: 'zaklad-polnoc', unit: 'produkcja', ile: 48 },
    { org: 'zaklad-polnoc', unit: 'utrzymanie', ile: 22 },
    // Biuro celowo małe: filtr na ten dział ma pokazać wstrzymanie wyniku.
    { org: 'zaklad-polnoc', unit: 'biuro', ile: 7 },
    { org: 'zaklad-poludnie', unit: 'produkcja', ile: 30 },
  ];

  let numer = 0;

  for (const grupa of rozklad) {
    for (let i = 0; i < grupa.ile; i += 1) {
      numer += 1;
      const wiek = losuj();
      const maWynik = losuj() > 0.15;

      rekordy.push({
        participantId: `psd-${String(numer).padStart(4, '0')}`,
        organizationId: grupa.org,
        unitId: grupa.unit,
        ageBand: wiek < 0.2 ? '18-29' : wiek < 0.5 ? '30-39' : wiek < 0.8 ? '40-49' : '50-59',
        sex: losuj() > 0.45 ? 'M' : 'K',
        active: losuj() > 0.18,
        ...(maWynik ? { healthScore: Math.round(45 + losuj() * 50) } : {}),
        challengesCompleted: Math.floor(losuj() * 4),
        workshopsAttended: Math.floor(losuj() * 4),
        workshopsOffered: 4,
      });
    }
  }

  return rekordy;
}

export const UCZESTNICY_ANALITYKA: readonly ParticipantRecord[] = zbudujUczestnikow();

export const KATALOG: readonly PozycjaKatalogu[] = [
  { kod: 'pro-a', nazwa: 'Pakiet Pro — ryczałt miesięczny', cenaNettoGr: 12_000, vat: 'zw', linia: 'A', obowiazujeOd: '2026-01-01', przedInterpretacja: true },
  { kod: 'klub-b', nazwa: 'Karnet klubowy', cenaNettoGr: 20_000, vat: '8', linia: 'B', obowiazujeOd: '2026-01-01' },
  { kod: 'med-c', nazwa: 'Pakiet diagnostyczny', cenaNettoGr: 45_000, vat: '23', linia: 'C', obowiazujeOd: '2026-01-01' },
  { kod: 'audyt-c', nazwa: 'Audyt Zdrowe Biuro', cenaNettoGr: 380_000, vat: '23', linia: 'C', obowiazujeOd: '2026-01-01' },
];

export const PROGI_ZFSS: readonly ProgZfss[] = [
  { organizationId: 'zaklad-polnoc', progDochodowyGr: 300_000, doplataPct: 80, obowiazujeOd: '2026-01-01' },
  { organizationId: 'zaklad-polnoc', progDochodowyGr: 500_000, doplataPct: 50, obowiazujeOd: '2026-01-01' },
  { organizationId: 'zaklad-polnoc', progDochodowyGr: 800_000, doplataPct: 20, obowiazujeOd: '2026-01-01' },
  { organizationId: 'zaklad-poludnie', progDochodowyGr: 400_000, doplataPct: 70, obowiazujeOd: '2026-01-01' },
  { organizationId: 'zaklad-poludnie', progDochodowyGr: 900_000, doplataPct: 30, obowiazujeOd: '2026-01-01' },
];

function zbudujRozliczenia(): { uczestnicy: Uczestnik[]; obciazenia: Obciazenie[] } {
  const losuj = pseudolosowa(7);
  const uczestnicy: Uczestnik[] = [];
  const obciazenia: Obciazenie[] = [];

  for (const rekord of UCZESTNICY_ANALITYKA) {
    if (!rekord.active) continue;

    uczestnicy.push({
      participantId: rekord.participantId,
      organizationId: rekord.organizationId,
      dochodGr: Math.round((200_000 + losuj() * 900_000) / 1000) * 1000,
    });

    // Ryczałt z ZFŚS obejmuje każdego aktywnego uczestnika.
    obciazenia.push({
      participantId: rekord.participantId,
      organizationId: rekord.organizationId,
      kodPozycji: 'pro-a',
      ilosc: 1,
    });

    if (losuj() > 0.6) {
      obciazenia.push({
        participantId: rekord.participantId,
        organizationId: rekord.organizationId,
        kodPozycji: 'klub-b',
        ilosc: 1,
      });
    }

    if (losuj() > 0.9) {
      obciazenia.push({
        participantId: rekord.participantId,
        organizationId: rekord.organizationId,
        kodPozycji: 'med-c',
        ilosc: 1,
      });
    }
  }

  for (const organizacja of ORGANIZACJE) {
    obciazenia.push({
      participantId: 'psd-0001',
      organizationId: organizacja.id,
      kodPozycji: 'audyt-c',
      ilosc: 1,
    });
  }

  return { uczestnicy, obciazenia };
}

const rozliczenia = zbudujRozliczenia();

export const UCZESTNICY_ROZLICZENIA: readonly Uczestnik[] = rozliczenia.uczestnicy;
export const OBCIAZENIA: readonly Obciazenie[] = rozliczenia.obciazenia;

export const OKRES = '2026-09';

export function nazwaOrganizacji(id: string): string {
  return ORGANIZACJE.find((organizacja) => organizacja.id === id)?.nazwa ?? id;
}

export function nazwaDzialu(id: string | undefined): string {
  return DZIALY.find((dzial) => dzial.id === id)?.nazwa ?? 'wszystkie działy';
}
