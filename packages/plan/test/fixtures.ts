/**
 * Poprawny plan i atrapa modelu — do testów bez sieci.
 */

import type { PlanPreferences } from '@longevity/core';
import type { ModelClient, ModelRequest } from '../src/pipeline.ts';
import type { Plan } from '../src/plan.ts';

export const PREFERENCES: PlanPreferences = {
  goals: ['redukcja_masy', 'poprawa_snu'],
  planFormat: 'elastyczny',
  minutesPerSession: 45,
  daysAvailable: 4,
  timeWindows: ['rano', 'po_pracy'],
  equipment: ['hantle', 'mata'],
  dietaryPattern: 'bez_ograniczen',
  aversions: ['ryby'],
  movementLimitations: [],
};

export function validPlan(overrides: Partial<Plan> = {}): Plan {
  const plan: Plan = {
    podsumowanie:
      'Plan skupia się na stopniowej poprawie jakości snu i uporządkowaniu rytmu posiłków, ' +
      'bo to dwa obszary o najniższej ocenie w Twoim profilu. Trening prowadzimy trzy razy ' +
      'w tygodniu, w oknach czasowych, które zadeklarowałeś jako realne. Zakres obciążeń ' +
      'rośnie powoli, żeby pierwsze tygodnie były do utrzymania także w gorszym okresie. ' +
      'Punkty kontrolne co cztery tygodnie pozwolą ocenić, co działa, a co wymaga korekty.',
    zywienie: {
      zasady: [
        'Trzy główne posiłki w stałych oknach czasowych',
        'Warzywa w każdym głównym posiłku',
        'Źródło białka w każdym posiłku głównym',
        'Woda w ilości około dwóch litrów dziennie',
      ],
      posilki: [
        {
          pora: 'Śniadanie',
          opis: 'Posiłek sycący, oparty na białku i pełnym ziarnie, do zjedzenia w piętnaście minut.',
          przyklady: ['Jajecznica z pieczywem żytnim i pomidorem', 'Owsianka z jogurtem i orzechami'],
        },
        {
          pora: 'Obiad',
          opis: 'Największy posiłek dnia, z wyraźnym udziałem warzyw i źródłem białka.',
          przyklady: ['Kurczak z kaszą i surówką', 'Soczewica z warzywami i ryżem'],
        },
      ],
      uwagi: ['Kolacja najpóźniej dwie godziny przed snem'],
    },
    trening: {
      mikrocykl: [
        { dzien: 1, typ: 'silowy', czasMin: 45, bloki: ['Rozgrzewka', 'Przysiad', 'Wiosłowanie'] },
        { dzien: 2, typ: 'wolne', czasMin: 0, bloki: [] },
        { dzien: 3, typ: 'silowy', czasMin: 45, bloki: ['Rozgrzewka', 'Wyciskanie', 'Martwy ciąg'] },
        { dzien: 4, typ: 'mobilnosc', czasMin: 20, bloki: ['Mobilizacja bioder', 'Rozciąganie'] },
        { dzien: 5, typ: 'wytrzymalosciowy', czasMin: 40, bloki: ['Marsz w tempie ciągłym'] },
        { dzien: 6, typ: 'wolne', czasMin: 0, bloki: [] },
        { dzien: 7, typ: 'regeneracja', czasMin: 30, bloki: ['Spacer', 'Rozciąganie'] },
      ],
      progresja: ['Co dwa tygodnie dokładamy jedno powtórzenie w seriach roboczych'],
    },
    sen: {
      protokol: [
        'Stała godzina wstawania, także w weekend',
        'Bez ekranów w ostatniej godzinie przed snem',
        'Sypialnia chłodna, ciemna i cicha',
      ],
      celGodzin: '7-8 h',
    },
    harmonogram: [
      { dzien: 1, pora: 'rano', czynnosc: 'Trening siłowy', filar: 'Aktywność fizyczna' },
      { dzien: 3, pora: 'rano', czynnosc: 'Trening siłowy', filar: 'Aktywność fizyczna' },
      { dzien: 4, pora: 'po pracy', czynnosc: 'Sesja mobilności', filar: 'Aktywność fizyczna' },
      { dzien: 5, pora: 'po pracy', czynnosc: 'Marsz', filar: 'Aktywność fizyczna' },
      { dzien: 7, pora: 'rano', czynnosc: 'Spacer regeneracyjny', filar: 'Sen i regeneracja' },
    ],
    monitoring: {
      wskazniki: ['Masa ciała raz w tygodniu', 'Subiektywna jakość snu', 'Liczba kroków'],
      punktyKontrolne: ['Po czterech tygodniach', 'Po dwunastu tygodniach'],
    },
  };

  return { ...plan, ...overrides };
}

/** Model, który zwraca zadane odpowiedzi po kolei. */
export class ScriptedModel implements ModelClient {
  readonly requests: ModelRequest[] = [];

  constructor(private readonly responses: readonly (unknown | Error)[]) {}

  async generatePlan(request: ModelRequest): Promise<unknown> {
    this.requests.push(request);
    const response = this.responses[this.requests.length - 1] ?? this.responses.at(-1);
    if (response instanceof Error) throw response;
    return response;
  }
}
