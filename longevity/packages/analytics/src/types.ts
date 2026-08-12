/**
 * Dashboard HR — dane zagregowane (specyfikacja 10).
 *
 * Macierz funkcjonalności wymaga: „Tylko zagregowane; zakaz danych imiennych
 * w linii A". Ten pakiet jest jedynym miejscem, przez które dane uczestników
 * mogą trafić do widoku pracodawcy, i to on odpowiada za to, żeby z agregatu
 * nie dało się odtworzyć osoby.
 */

import type { RiskCategory } from '@longevity/core';

export type AgeBand = '18-29' | '30-39' | '40-49' | '50-59' | '60+';
export type Sex = 'K' | 'M' | 'X';

/**
 * Wejście do agregacji. Rekord jest pseudonimizowany — `participantId` służy
 * wyłącznie do liczenia unikalnych osób i nigdy nie opuszcza tego pakietu.
 */
export interface ParticipantRecord {
  participantId: string;
  organizationId: string;
  unitId?: string;
  ageBand: AgeBand;
  sex: Sex;
  active: boolean;
  // Brak wyniku to realny stan, nie brak pola — uczestnik może nie mieć
  // jeszcze złożonego kwestionariusza. Typ musi to odróżniać.
  healthScore?: number | undefined;
  riskCategory?: RiskCategory | undefined;
  challengesCompleted: number;
  workshopsAttended: number;
  workshopsOffered: number;
}

export interface DashboardFilters {
  unitId?: string;
  ageBand?: AgeBand;
  sex?: Sex;
}

export type Metric =
  | 'uczestnictwo'
  | 'rozklad_health_score'
  | 'wyzwania'
  | 'frekwencja_warsztatow';

export interface DashboardQuery {
  organizationId: string;
  metric: Metric;
  filters?: DashboardFilters;
}

export interface Band {
  etykieta: string;
  /** Udział w grupie, zaokrąglony — nigdy liczba osób. */
  udzialProcent: number;
}

export type DashboardResult =
  | {
      kind: 'wynik';
      metric: Metric;
      /** Liczebność podana jako przedział, nie dokładna wartość. */
      liczebnosc: string;
      wartosci: readonly Band[];
      /** Wartość zbiorcza, gdy metryka ma sens jako jedna liczba. */
      podsumowanie?: string;
    }
  | {
      kind: 'za_malo_danych';
      /** Dlaczego wynik został wstrzymany — pokazywane HR, żeby nie zgadywał. */
      powod:
        | 'grupa_ponizej_progu'
        | 'dopelnienie_ponizej_progu'
        | 'brak_danych_metryki';
      prog: number;
    };
