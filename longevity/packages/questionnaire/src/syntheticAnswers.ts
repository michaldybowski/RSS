/**
 * Komplet poprawnych odpowiedzi na kwestionariusz — dane syntetyczne.
 * Używane w demie i testach; nadpisania budują przypadki brzegowe.
 */

import type { Answers, AnswerValue } from './types.ts';

const BASE: Record<string, AnswerValue> = {
  d1_wiek: 42,
  d1_plec: 'M',
  d1_choroby_przewlekle: ['brak'],
  d1_zaburzenia_odzywiania: 'nie',
  d1_omdlenia: 'nie',
  d1_bol_w_klatce: 'nie',
  d1_chrapanie: 'nie',
  d1_zmeczenie_dzienne: 'nie',
  d1_historia_rodzinna: ['brak'],
  d1_kontuzje: 'nie',

  d2_leki_metaboliczne: ['brak'],
  d2_leki_nadcisnienie: 'nie',
  d2_leki_psychotropowe: 'nie',
  d2_leki_tarczyca: 'nie',
  d2_suplementy: ['witamina_d'],
  d2_kawa_dziennie: 2,
  d2_alkohol: 'okazjonalnie',
  d2_nikotyna: 'nie',

  d3_waga: 84,
  d3_wzrost: 180,
  d3_talia: 92,
  d3_biodra: 102,
  d3_waga_stabilna: 'tak',

  d4_posilki_dziennie: 4,
  d4_sniadania: 'tak',
  d4_dieta: 'bez_ograniczen',
  d4_woda: '2-3l',
  d4_warzywa_porcje: 5,
  d4_problemy_gi: ['brak'],
  d4_awersje: 'ryby, kalafior',
  d4_budzet: 'umiarkowany',

  d5_trening_dni: 3,
  d5_kroki: 9000,
  d5_doswiadczenie: 'sredni',
  d5_sprzet: ['hantle', 'mata'],
  d5_czas_sesji: '45',
  d5_dni_dostepne: 4,
  d5_okna_czasowe: ['rano', 'po_pracy'],
  d5_ograniczenia_ruchowe: ['brak'],

  d6_godziny_sen: 7.5,
  d6_jakosc: '4',
  d6_wybudzenia: '0',
  d6_ekrany_przed_snem: 'tak',
  d6_drzemki: 'nie',

  d7_poziom_stresu: 4,
  d7_zrodla: ['praca'],
  d7_coping: ['ruch'],
  d7_diagnoza_psychologiczna: 'nie',

  d8_tryb_pracy: 'hybrydowy',
  d8_dzieci: 'tak',
  d8_podroze_sluzbowe: 'rzadko',

  d9_data_badan: '2026-05-10',
  d9_glukoza: 92,
  d9_hba1c: 5.3,
  d9_insulina: 7,
  d9_ldl: 110,
  d9_hdl: 52,
  d9_trojglicerydy: 120,
  d9_witamina_d: 34,
  d9_ferrytyna: 90,
  d9_tsh: 1.8,
  d9_crp: 1.1,
  d9_profilaktyka_aktualna: 'tak',

  d10_cel_glowny: ['redukcja_masy', 'poprawa_snu'],
  d10_format_planu: 'elastyczny',
  d10_horyzont: '6m',
  d10_deal_breakery: 'Nie zrezygnuję z kawy',
};

/**
 * Nadpisanie wartością `undefined` usuwa odpowiedź — potrzebne do testowania
 * pytań wymaganych i pustego panelu badań.
 */
export function syntheticAnswers(
  overrides: Readonly<Record<string, AnswerValue | undefined>> = {},
): Answers {
  const result: Record<string, AnswerValue> = { ...BASE };
  for (const [code, value] of Object.entries(overrides)) {
    if (value === undefined) delete result[code];
    else result[code] = value;
  }
  return result;
}

/** Kody wszystkich pytań Domeny 9 — do wyzerowania panelu badań w testach. */
export const LAB_ANSWER_CODES: readonly string[] = [
  'd9_data_badan',
  'd9_glukoza',
  'd9_hba1c',
  'd9_insulina',
  'd9_ldl',
  'd9_hdl',
  'd9_trojglicerydy',
  'd9_witamina_d',
  'd9_ferrytyna',
  'd9_tsh',
  'd9_crp',
];

export function answersWithoutLabs(): Answers {
  return syntheticAnswers(Object.fromEntries(LAB_ANSWER_CODES.map((code) => [code, undefined])));
}
