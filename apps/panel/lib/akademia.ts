/**
 * Biblioteka i Akademia — dane demonstracyjne, PROTOTYP.
 *
 * W produkcji materiały pochodzą z cache zasilanego z bazy „Biblioteka treści"
 * w Notion (@longevity/notion-sync), a ścieżki z bazy programów Akademii.
 * Tutaj są wpisane w kod, żeby panel dało się obejrzeć bez Notion.
 *
 * Sprawdziany są redagowane razem z materiałem i dotyczą wyłącznie jego treści.
 * Żadne pytanie nie dotyczy stanu zdrowia uczestnika — patrz komentarz
 * w @longevity/academy/src/quiz.ts.
 */

import type { Material, Quiz, Sciezka } from '@longevity/academy';

export const MATERIALY: readonly Material[] = [
  {
    id: 'm-sen-01',
    tytul: 'Higiena snu w pięć minut',
    typ: 'lekcja',
    opis: 'Rytm dobowy, światło wieczorem i temperatura sypialni. Trzy zmiany, które działają od pierwszej nocy.',
    czasTrwaniaMin: 12,
    filary: ['Sen'],
    pakiety: ['light', 'pro', 'enterprise'],
    opublikowana: true,
    intensywnosc: 'niska',
    quizId: 'q-sen-01',
  },
  {
    id: 'm-sen-02',
    tytul: 'Bezdech senny — kiedy iść do lekarza',
    typ: 'artykul',
    opis: 'Objawy, które warto zgłosić, i badania, o które można poprosić.',
    czasTrwaniaMin: 9,
    filary: ['Sen', 'Profilaktyka'],
    pakiety: ['light', 'pro', 'enterprise'],
    opublikowana: true,
    intensywnosc: 'niska',
  },
  {
    id: 'm-ruch-01',
    tytul: 'Rozgrzewka przy biurku',
    typ: 'lekcja',
    opis: 'Sześciominutowa sekwencja bez sprzętu, do wykonania między spotkaniami.',
    czasTrwaniaMin: 8,
    filary: ['Ruch'],
    pakiety: ['light', 'pro', 'enterprise'],
    opublikowana: true,
    intensywnosc: 'niska',
  },
  {
    id: 'm-ruch-02',
    tytul: 'Trening interwałowy — wprowadzenie',
    typ: 'webinar',
    opis: 'Zasady pracy na wysokim tętnie, dobór przerw i sygnały ostrzegawcze.',
    czasTrwaniaMin: 42,
    filary: ['Ruch'],
    pakiety: ['pro', 'enterprise'],
    opublikowana: true,
    intensywnosc: 'wysoka',
  },
  {
    id: 'm-zyw-01',
    tytul: 'Talerz zdrowego żywienia',
    typ: 'lekcja',
    opis: 'Proporcje na talerzu zamiast liczenia kalorii. Praktyczne przykłady posiłków.',
    czasTrwaniaMin: 15,
    filary: ['Żywienie'],
    pakiety: ['light', 'pro', 'enterprise'],
    opublikowana: true,
    intensywnosc: 'niska',
    quizId: 'q-zyw-01',
  },
  {
    id: 'm-stres-01',
    tytul: 'Oddech w pięć minut',
    typ: 'podcast',
    opis: 'Technika oddechowa do zastosowania przed trudną rozmową.',
    czasTrwaniaMin: 6,
    filary: ['Stres', 'Regeneracja'],
    pakiety: ['light', 'pro', 'enterprise'],
    opublikowana: true,
    intensywnosc: 'niska',
  },
  {
    id: 'm-prof-01',
    tytul: 'Badania, które warto powtarzać',
    typ: 'zeszyt',
    opis: 'Panel podstawowy, częstotliwość i to, co wyniki znaczą dla planu.',
    czasTrwaniaMin: 20,
    filary: ['Profilaktyka'],
    pakiety: ['light', 'pro', 'enterprise'],
    opublikowana: true,
    intensywnosc: 'niska',
  },
  {
    // Materiał z pakietu, którego uczestnik nie ma — nie pojawi się w katalogu.
    id: 'm-prime-01',
    tytul: 'Protokół regeneracji PRIME',
    typ: 'zeszyt',
    opis: 'Rozszerzony moduł regeneracji dla pakietu PRIME.',
    czasTrwaniaMin: 30,
    filary: ['Regeneracja'],
    pakiety: ['prime'],
    opublikowana: true,
    intensywnosc: 'umiarkowana',
  },
  {
    // Materiał wycofany przez redakcję w trakcie trwania ścieżki. Zostaje
    // w cache, znika z katalogu i nie blokuje ukończenia ścieżki.
    id: 'm-zyw-02',
    tytul: 'Suplementacja — wersja z 2025 roku',
    typ: 'artykul',
    opis: 'Materiał wycofany do aktualizacji.',
    czasTrwaniaMin: 11,
    filary: ['Żywienie'],
    pakiety: ['light', 'pro', 'enterprise'],
    opublikowana: true,
    wycofany: true,
    intensywnosc: 'niska',
  },
];

export const QUIZY: readonly Quiz[] = [
  {
    id: 'q-sen-01',
    materialId: 'm-sen-01',
    pytania: [
      {
        id: 'p1',
        tresc: 'Co najsilniej przesuwa rytm dobowy wieczorem?',
        odpowiedzi: ['jasne światło', 'ciepła kolacja', 'cisza w pokoju'],
        poprawna: 0,
        wyjasnienie:
          'Światło jest głównym sygnałem czasu dla zegara biologicznego. Wieczorem opóźnia zasypianie.',
      },
      {
        id: 'p2',
        tresc: 'Jaka temperatura sypialni sprzyja zasypianiu?',
        odpowiedzi: ['około 24°C', 'około 18°C', 'poniżej 12°C'],
        poprawna: 1,
        wyjasnienie:
          'Zasypianiu towarzyszy spadek temperatury ciała; chłodniejsze otoczenie mu pomaga.',
      },
      {
        id: 'p3',
        tresc: 'Co robić po dwudziestu minutach bezskutecznego zasypiania?',
        odpowiedzi: ['leżeć dalej', 'wstać i zająć się czymś spokojnym', 'włączyć telefon'],
        poprawna: 1,
        wyjasnienie:
          'Długie leżenie bez snu wiąże łóżko z czuwaniem. Lepiej wstać i wrócić, gdy przyjdzie senność.',
      },
    ],
  },
  {
    id: 'q-zyw-01',
    materialId: 'm-zyw-01',
    pytania: [
      {
        id: 'p1',
        tresc: 'Jaką część talerza zajmują warzywa i owoce?',
        odpowiedzi: ['jedną czwartą', 'połowę', 'trzy czwarte'],
        poprawna: 1,
        wyjasnienie: 'Połowa talerza to warzywa i owoce, z przewagą warzyw.',
      },
      {
        id: 'p2',
        tresc: 'Które źródło tłuszczu jest zalecane do sałatek?',
        odpowiedzi: ['olej rzepakowy', 'smalec', 'twarda margaryna'],
        poprawna: 0,
        wyjasnienie: 'Oleje roślinne dostarczają kwasów nienasyconych.',
      },
      {
        id: 'p3',
        tresc: 'Co zrobić, gdy plan posiłków nie mieści się w dniu pracy?',
        odpowiedzi: [
          'pominąć śniadanie',
          'dostosować liczbę posiłków do rytmu dnia',
          'zjeść wszystko wieczorem',
        ],
        poprawna: 1,
        wyjasnienie:
          'Liczba posiłków jest kwestią wykonalności. Ważniejsza jest stała podaż niż sztywny schemat.',
      },
    ],
  },
];

export const SCIEZKI: readonly Sciezka[] = [
  {
    id: 's-podstawy',
    nazwa: 'Podstawy długowieczności',
    opis: 'Cztery moduły wprowadzające: sen, ruch, żywienie i profilaktyka.',
    pakiety: ['light', 'pro', 'enterprise'],
    filar: 'Podstawy',
    moduly: [
      { materialId: 'm-sen-01', obowiazkowy: true },
      { materialId: 'm-ruch-01', obowiazkowy: true },
      { materialId: 'm-zyw-01', obowiazkowy: true },
      { materialId: 'm-zyw-02', obowiazkowy: true },
      { materialId: 'm-prof-01', obowiazkowy: false },
    ],
  },
  {
    id: 's-regeneracja',
    nazwa: 'Regeneracja i stres',
    opis: 'Krótka ścieżka o odpoczynku, oddechu i śnie.',
    pakiety: ['pro', 'enterprise'],
    filar: 'Regeneracja',
    moduly: [
      { materialId: 'm-stres-01', obowiazkowy: true },
      { materialId: 'm-sen-02', obowiazkowy: true },
      { materialId: 'm-ruch-02', obowiazkowy: false },
    ],
  },
];

export function materialPoIdentyfikatorze(id: string): Material | undefined {
  return MATERIALY.find((material) => material.id === id);
}

export function sciezkaPoId(id: string): Sciezka | undefined {
  return SCIEZKI.find((sciezka) => sciezka.id === id);
}
