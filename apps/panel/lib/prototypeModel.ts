/**
 * Atrapa modelu językowego dla dema Fazy A.
 *
 * Zwraca stały, poprawny plan. Podmiana na prawdziwego dostawcę to jedna
 * implementacja `ModelClient` — pipeline, walidacja i bariery zostają bez zmian.
 */

import type { ModelClient } from '@longevity/plan';

export const PROTOTYPE_MODEL: ModelClient = {
  generatePlan: async () => ({
    podsumowanie:
      'Plan skupia się na dwóch obszarach o najniższej ocenie w Twoim profilu: jakości snu ' +
      'i regularności posiłków. Trening prowadzimy w trzech jednostkach tygodniowo, w oknach ' +
      'czasowych, które zadeklarowałeś jako realne. Obciążenia rosną powoli, żeby pierwsze ' +
      'tygodnie były do utrzymania także w gorszym okresie. Punkty kontrolne co cztery tygodnie ' +
      'pokażą, co działa, a co wymaga korekty — plan jest po to, żeby go zmieniać, a nie żeby ' +
      'go dotrzymać za wszelką cenę.',
    zywienie: {
      zasady: [
        'Trzy główne posiłki w stałych oknach czasowych',
        'Warzywa w każdym głównym posiłku',
        'Źródło białka w każdym posiłku głównym',
        'Około dwóch litrów wody dziennie, rozłożone na cały dzień',
      ],
      posilki: [
        {
          pora: 'Śniadanie',
          opis: 'Posiłek sycący, oparty na białku i pełnym ziarnie, do przygotowania w kwadrans.',
          przyklady: ['Jajecznica z pieczywem żytnim i pomidorem', 'Owsianka z jogurtem i orzechami'],
        },
        {
          pora: 'Obiad',
          opis: 'Największy posiłek dnia, z wyraźnym udziałem warzyw i źródłem białka.',
          przyklady: ['Kurczak z kaszą i surówką', 'Soczewica z warzywami i ryżem'],
        },
        {
          pora: 'Kolacja',
          opis: 'Lekki posiłek, najpóźniej dwie godziny przed snem, bez ciężkich tłuszczów.',
          przyklady: ['Twaróg z warzywami', 'Zupa krem z pieczywem'],
        },
      ],
      uwagi: ['Kawa najpóźniej osiem godzin przed planowaną porą snu'],
    },
    trening: {
      mikrocykl: [
        { dzien: 1, typ: 'silowy', czasMin: 45, bloki: ['Rozgrzewka', 'Przysiad', 'Wiosłowanie', 'Plank'] },
        { dzien: 2, typ: 'wolne', czasMin: 0, bloki: [] },
        { dzien: 3, typ: 'silowy', czasMin: 45, bloki: ['Rozgrzewka', 'Wyciskanie', 'Martwy ciąg', 'Podciąganie'] },
        { dzien: 4, typ: 'mobilnosc', czasMin: 20, bloki: ['Mobilizacja bioder', 'Rozciąganie klatki'] },
        { dzien: 5, typ: 'wytrzymalosciowy', czasMin: 40, bloki: ['Marsz w tempie ciągłym'] },
        { dzien: 6, typ: 'wolne', czasMin: 0, bloki: [] },
        { dzien: 7, typ: 'regeneracja', czasMin: 30, bloki: ['Spacer', 'Rozciąganie całego ciała'] },
      ],
      progresja: [
        'Co dwa tygodnie dokładamy jedno powtórzenie w seriach roboczych',
        'Ciężar rośnie dopiero po utrzymaniu techniki przez pełny mikrocykl',
      ],
    },
    sen: {
      protokol: [
        'Stała godzina wstawania, także w weekend',
        'Bez ekranów w ostatniej godzinie przed snem',
        'Sypialnia chłodna, ciemna i cicha',
        'Bez drzemek dłuższych niż dwadzieścia minut',
      ],
      celGodzin: '7-8 h',
    },
    harmonogram: [
      { dzien: 1, pora: 'rano', czynnosc: 'Trening siłowy', filar: 'Aktywność fizyczna' },
      { dzien: 3, pora: 'rano', czynnosc: 'Trening siłowy', filar: 'Aktywność fizyczna' },
      { dzien: 4, pora: 'po pracy', czynnosc: 'Sesja mobilności', filar: 'Aktywność fizyczna' },
      { dzien: 5, pora: 'po pracy', czynnosc: 'Marsz w tempie ciągłym', filar: 'Aktywność fizyczna' },
      { dzien: 7, pora: 'rano', czynnosc: 'Spacer regeneracyjny', filar: 'Sen i regeneracja' },
    ],
    monitoring: {
      wskazniki: [
        'Masa ciała raz w tygodniu, o tej samej porze',
        'Subiektywna jakość snu w skali 1-5',
        'Liczba kroków dziennie',
        'Obwód talii raz w miesiącu',
      ],
      punktyKontrolne: ['Po czterech tygodniach', 'Po dwunastu tygodniach'],
    },
  }),
};
