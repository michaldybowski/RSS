/**
 * Prawo dostępu i przenoszenia (art. 15 i 20 RODO).
 *
 * Art. 15 to nie zrzut bazy. Osoba ma prawo wiedzieć **po co** przetwarzamy
 * jej dane, komu je przekazujemy, jak długo trzymamy i jakie ma prawa —
 * dlatego eksport zawiera te informacje obok samych danych. Sam plik JSON
 * z rekordami spełniałby art. 20, ale nie art. 15.
 */

import { terminRetencji } from './retention.ts';
import type { Rekord, ZbiorPodmiotu } from './types.ts';

export interface OpisCelu {
  cel: string;
  podstawaPrawna: string;
  kategorieDanych: readonly string[];
  odbiorcy: readonly string[];
}

export const CELE_PRZETWARZANIA: readonly OpisCelu[] = [
  {
    cel: 'Prowadzenie konta i rozliczenie uczestnictwa',
    podstawaPrawna: 'Art. 6 ust. 1 lit. b RODO — wykonanie umowy',
    kategorieDanych: ['dane kontaktowe', 'dane rozliczeniowe'],
    odbiorcy: ['operator płatności', 'dostawca hostingu'],
  },
  {
    cel: 'Ocena ryzyka zdrowotnego i przygotowanie planu',
    podstawaPrawna: 'Art. 9 ust. 2 lit. a RODO — wyraźna zgoda',
    kategorieDanych: [
      'odpowiedzi kwestionariusza',
      'wyniki badań laboratoryjnych',
      'wskaźniki wyliczone',
    ],
    odbiorcy: ['dostawca hostingu'],
  },
  {
    cel: 'Przygotowanie opisowej części planu z użyciem systemu AI',
    podstawaPrawna: 'Art. 6 ust. 1 lit. a RODO — zgoda',
    kategorieDanych: ['wiek', 'płeć', 'kategoria ryzyka', 'kody flag', 'interpretacje wyników'],
    odbiorcy: ['dostawca modelu językowego (poza EOG, standardowe klauzule umowne)'],
  },
  {
    cel: 'Udostępnienie Karty Pacjenta lekarzowi',
    podstawaPrawna: 'Art. 9 ust. 2 lit. a RODO — wyraźna zgoda',
    kategorieDanych: ['podsumowanie wywiadu', 'wyniki badań', 'plan'],
    odbiorcy: ['lekarz prowadzący konsultację'],
  },
  {
    cel: 'Statystyka zbiorcza dla pracodawcy',
    podstawaPrawna: 'Dane zanonimizowane — poza zakresem RODO',
    kategorieDanych: ['agregaty grup nie mniejszych niż 10 osób'],
    odbiorcy: ['pracodawca'],
  },
];

export const PRAWA_OSOBY: readonly string[] = [
  'Dostęp do danych (art. 15) — realizowany samoobsługowo w panelu',
  'Sprostowanie (art. 16) — edycja w panelu, z zachowaniem historii',
  'Usunięcie (art. 17) — wniosek realizowany do 30 dni',
  'Przenoszenie (art. 20) — eksport w formacie JSON',
  'Sprzeciw wobec zautomatyzowanego przetwarzania (art. 21 i 22) — wycofanie zgody na AI przełącza plan na ścieżkę ręczną',
  'Wycofanie zgody w każdej chwili, bez wpływu na legalność wcześniejszego przetwarzania',
  'Skarga do Prezesa Urzędu Ochrony Danych Osobowych',
];

export interface PozycjaEksportu {
  id: string;
  rodzaj: string;
  utworzono: string;
  /** Kiedy rekord zostanie usunięty lub zagregowany. */
  przechowywanyDo?: string;
  dane: Readonly<Record<string, unknown>>;
}

export interface PakietEksportu {
  wygenerowano: string;
  subjectRef: string;
  tozsamosc?: Readonly<Record<string, string>>;
  uczestnictwo: { od: string; do?: string };
  celePrzetwarzania: readonly OpisCelu[];
  prawa: readonly string[];
  /** Rekordy pogrupowane po rodzaju, żeby pakiet dało się przejrzeć. */
  dane: Readonly<Record<string, readonly PozycjaEksportu[]>>;
  liczbaRekordow: number;
}

export function zbudujEksport(zbior: ZbiorPodmiotu, wygenerowano: string): PakietEksportu {
  const pogrupowane: Record<string, PozycjaEksportu[]> = {};

  for (const rekord of zbior.rekordy) {
    const lista = pogrupowane[rekord.rodzaj] ?? [];
    lista.push(pozycja(rekord, zbior));
    pogrupowane[rekord.rodzaj] = lista;
  }

  return {
    wygenerowano,
    subjectRef: zbior.subjectRef,
    ...(zbior.tozsamosc !== undefined
      ? {
          tozsamosc: {
            imie: zbior.tozsamosc.imie,
            nazwisko: zbior.tozsamosc.nazwisko,
            email: zbior.tozsamosc.email,
            dataUrodzenia: zbior.tozsamosc.dataUrodzenia,
          },
        }
      : {}),
    uczestnictwo: {
      od: zbior.uczestnictwo.od,
      ...(zbior.uczestnictwo.do !== undefined ? { do: zbior.uczestnictwo.do } : {}),
    },
    celePrzetwarzania: CELE_PRZETWARZANIA,
    prawa: PRAWA_OSOBY,
    dane: pogrupowane,
    liczbaRekordow: zbior.rekordy.length,
  };
}

function pozycja(rekord: Rekord, zbior: ZbiorPodmiotu): PozycjaEksportu {
  const retencja = terminRetencji(rekord, zbior.uczestnictwo);

  return {
    id: rekord.id,
    rodzaj: rekord.rodzaj,
    utworzono: rekord.utworzono,
    ...(retencja !== undefined ? { przechowywanyDo: retencja.termin } : {}),
    dane: rekord.dane,
  };
}

/** Format przenoszalny (art. 20) — bez części informacyjnej, same dane. */
export function doFormatuPrzenoszalnego(pakiet: PakietEksportu): string {
  return JSON.stringify(
    {
      subjectRef: pakiet.subjectRef,
      tozsamosc: pakiet.tozsamosc,
      uczestnictwo: pakiet.uczestnictwo,
      dane: pakiet.dane,
    },
    null,
    2,
  );
}
