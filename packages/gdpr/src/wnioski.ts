/**
 * Rejestr wniosków osób i ich realizacja (specyfikacja 12.3).
 *
 * Sedno tego modułu jest jedno: **realizacja wniosku to nie odczyt danych**.
 * Administrator uruchamia eksport i wykonuje usunięcie, ale nie ma powodu
 * czytać, co ta osoba wpisała w kwestionariuszu — a skoro nie ma powodu,
 * to nie ma też drogi.
 *
 * Dlatego `przygotujEksport` zwraca pakiet **zapieczętowany**: panel dostaje
 * metadane (ile rekordów, jakich rodzajów, jak duży plik, jaka suma kontrolna),
 * a treść otwiera się dopiero tokenem, który trafia do osoby kanałem poza
 * panelem. Gdyby funkcja zwracała gotowy `PakietEksportu`, każdy ekran
 * administratora byłby o jedno `JSON.stringify` od wycieku danych zdrowotnych.
 *
 * Termin 30 dni liczymy od złożenia (art. 12 ust. 3 RODO). Wnioski po terminie
 * są w panelu osobną kategorią, bo przekroczenie terminu jest naruszeniem,
 * a nie opóźnieniem.
 */

import { createHash } from 'node:crypto';

import { doFormatuPrzenoszalnego, zbudujEksport, type PakietEksportu } from './export.ts';
import type { Prawo, RodzajRekordu, WniosekOsoby, ZbiorPodmiotu } from './types.ts';

export const TERMIN_REALIZACJI_DNI = 30;

export type StanWniosku = 'przyjety' | 'zalegly' | 'zrealizowany';

function dodajDni(data: string, dni: number): string {
  const [rok, miesiac, dzien] = data.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(rok, miesiac - 1, dzien + dni)).toISOString().slice(0, 10);
}

export function terminRealizacji(wniosek: WniosekOsoby): string {
  return dodajDni(wniosek.zlozony, TERMIN_REALIZACJI_DNI);
}

export function stanWniosku(wniosek: WniosekOsoby, na: string): StanWniosku {
  if (wniosek.zrealizowany !== undefined) return 'zrealizowany';
  return na > terminRealizacji(wniosek) ? 'zalegly' : 'przyjety';
}

/** Wnioski oczekujące, najpilniejsze na górze. */
export function doRealizacji(
  wnioski: readonly WniosekOsoby[],
  na: string,
): readonly WniosekOsoby[] {
  return wnioski
    .filter((wniosek) => stanWniosku(wniosek, na) !== 'zrealizowany')
    .sort((a, b) => (terminRealizacji(a) < terminRealizacji(b) ? -1 : 1));
}

/**
 * Co administrator ma faktycznie zrobić. Trzy z pięciu praw realizuje sam
 * uczestnik w swoim panelu — wpisanie ich tutaj jako „zadania administratora"
 * byłoby zapraszaniem do zaglądania w cudze dane bez potrzeby.
 */
export const INSTRUKCJE_REALIZACJI: Readonly<Record<Prawo, string>> = {
  dostep:
    'Uczestnik pobiera pakiet samodzielnie w panelu. Wniosek złożony poza panelem ' +
    'realizuje się przygotowaniem pakietu do odbioru — administrator nie otwiera jego treści.',
  przenoszenie:
    'Pakiet w formacie JSON, przygotowany do odbioru przez osobę. ' +
    'Zakres bez części informacyjnej — same dane.',
  sprostowanie:
    'Realizuje uczestnik w panelu, z zachowaniem historii zmian. ' +
    'Administrator nie edytuje danych zdrowotnych w cudzym imieniu.',
  usuniecie:
    'Usunięcie w trzech kategoriach: dane zdrowotne i tożsamość znikają, ' +
    'dokumenty księgowe zostają z ograniczonym dostępem, audit log zostaje bez przypisania. ' +
    'Osoba dostaje potwierdzenie z wyszczególnieniem, co i dlaczego zachowano.',
  sprzeciw_wobec_profilowania:
    'Wycofanie zgody na przetwarzanie AI przełącza generowanie planu na ścieżkę ręczną. ' +
    'Realizuje się zmianą zgody, nie usunięciem danych.',
};

export interface RodzajWPakiecie {
  rodzaj: RodzajRekordu | string;
  liczba: number;
}

/**
 * Wszystko, co o pakiecie widzi administrator. Świadomie bez pola na treść —
 * dopisanie go tutaj byłoby zmianą decyzji, a nie rozszerzeniem struktury.
 */
export interface MetadanePakietu {
  wniosekId: string;
  subjectRef: string;
  wygenerowano: string;
  liczbaRekordow: number;
  rodzaje: readonly RodzajWPakiecie[];
  bajtow: number;
  sumaKontrolna: string;
  zawieraTozsamosc: boolean;
}

export class NieuprawnionyOdbiorError extends Error {
  constructor() {
    super(
      'Nieprawidłowy token odbioru. Pakiet z danymi osoby otwiera się wyłącznie ' +
        'tokenem przekazanym tej osobie — nie jest dostępny z poziomu panelu administratora.',
    );
    this.name = 'NieuprawnionyOdbiorError';
  }
}

export class NiezgodnyPodmiotError extends Error {
  constructor(wniosek: string, zbior: string) {
    super(`Wniosek dotyczy podmiotu ${wniosek}, a przekazany zbiór należy do ${zbior}.`);
    this.name = 'NiezgodnyPodmiotError';
  }
}

export interface PakietDoOdbioru {
  metadane: MetadanePakietu;
  /** Otwiera pakiet. Wymaga tokenu, którego panel administratora nie przechowuje. */
  odbierz: (token: string) => PakietEksportu;
  /** Format przenoszalny (art. 20), również za tokenem. */
  odbierzJako: (token: string) => string;
}

export function przygotujEksport(
  zbior: ZbiorPodmiotu,
  wniosek: WniosekOsoby,
  wygenerowano: string,
  tokenOdbioru: string,
): PakietDoOdbioru {
  if (wniosek.subjectRef !== zbior.subjectRef) {
    throw new NiezgodnyPodmiotError(wniosek.subjectRef, zbior.subjectRef);
  }
  if (tokenOdbioru.length < 16) {
    throw new Error('Token odbioru musi być losowy i nie krótszy niż 16 znaków.');
  }

  const pakiet = zbudujEksport(zbior, wygenerowano);
  const tresc = doFormatuPrzenoszalnego(pakiet);

  const rodzaje = Object.entries(pakiet.dane)
    .map(([rodzaj, pozycje]) => ({ rodzaj, liczba: pozycje.length }))
    .sort((a, b) => (a.rodzaj < b.rodzaj ? -1 : 1));

  const sprawdz = (token: string): void => {
    if (token !== tokenOdbioru) throw new NieuprawnionyOdbiorError();
  };

  return {
    metadane: {
      wniosekId: wniosek.id,
      subjectRef: zbior.subjectRef,
      wygenerowano,
      liczbaRekordow: pakiet.liczbaRekordow,
      rodzaje,
      bajtow: Buffer.byteLength(tresc, 'utf8'),
      sumaKontrolna: createHash('sha256').update(tresc).digest('hex').slice(0, 16),
      zawieraTozsamosc: pakiet.tozsamosc !== undefined,
    },
    odbierz: (token) => {
      sprawdz(token);
      return pakiet;
    },
    odbierzJako: (token) => {
      sprawdz(token);
      return tresc;
    },
  };
}

export function oznaczZrealizowany(wniosek: WniosekOsoby, kiedy: string): WniosekOsoby {
  return { ...wniosek, zrealizowany: kiedy };
}
