/**
 * Realizacja praw osoby i retencji (specyfikacja 12.3–12.4).
 *
 * Kluczowa decyzja projektowa: w rejestrach operacyjnych osoba występuje pod
 * **pseudonimem** (`subjectRef`), a powiązanie pseudonimu z tożsamością żyje
 * w jednym miejscu — rekordzie tożsamości. Usunięcie konta kasuje to powiązanie,
 * przez co wpisy audytowe zostają (bo muszą, przez pięć lat), ale przestają być
 * przypisywalne do człowieka.
 *
 * Bez tego rozdziału prawo do usunięcia i obowiązek prowadzenia audit logu
 * wykluczałyby się nawzajem.
 */

export type KlasaDanych =
  | 'K1_zdrowotne'
  | 'K2_osobowe'
  | 'K3_pseudonimizowane'
  | 'K4_zagregowane'
  | 'ksiegowe';

export type RodzajRekordu =
  | 'kwestionariusz'
  | 'plan'
  | 'health_score'
  | 'wyniki_badan'
  | 'dziennik_objawow'
  | 'wearables_surowe'
  | 'wearables_dobowe'
  | 'zgoda'
  | 'audit_log'
  | 'dokument_ksiegowy'
  | 'tozsamosc';

export interface Rekord {
  id: string;
  rodzaj: RodzajRekordu;
  /** Data powstania, ISO 8601 (YYYY-MM-DD). */
  utworzono: string;
  /** Treść — nieinterpretowana przez ten pakiet. */
  dane: Readonly<Record<string, unknown>>;
}

export interface Tozsamosc {
  userId: string;
  email: string;
  imie: string;
  nazwisko: string;
  dataUrodzenia: string;
}

export interface Uczestnictwo {
  od: string;
  /** Brak daty oznacza uczestnictwo trwające. */
  do?: string;
}

/** Wszystko, co system trzyma o jednej osobie. */
export interface ZbiorPodmiotu {
  subjectRef: string;
  uczestnictwo: Uczestnictwo;
  /**
   * Usunięcie tego rekordu odcina pseudonim od człowieka. Brak tożsamości
   * to stan po realizacji wniosku, a nie brak pola — typ musi to odróżniać.
   */
  tozsamosc?: Tozsamosc | undefined;
  rekordy: readonly Rekord[];
}

export type Prawo =
  | 'dostep'
  | 'przenoszenie'
  | 'sprostowanie'
  | 'usuniecie'
  | 'sprzeciw_wobec_profilowania';

export interface WniosekOsoby {
  id: string;
  subjectRef: string;
  prawo: Prawo;
  zlozony: string;
  zrealizowany?: string;
}
