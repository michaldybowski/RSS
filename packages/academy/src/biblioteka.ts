/**
 * Katalog biblioteki: co jest widoczne i z jakim zastrzeżeniem.
 *
 * Różnica wobec wyzwań jest tu celowa i warta nazwania. Wyzwanie krokowe
 * przy bólu w klatce piersiowej **blokujemy**, bo wyzwanie się wykonuje.
 * Artykuł o treningu interwałowym przy tej samej fladze **oznaczamy**,
 * bo artykuł się czyta — a odcinanie człowieka od wiedzy o własnym stanie
 * jest dokładnie odwrotnością tego, po co ta biblioteka istnieje.
 *
 * Ostrzeżenie ma więc prowadzić do lekarza, nie zamykać strony.
 */

import type { Assessment, ScoreComponent } from '@longevity/core';

import type { Material, TypMaterialu } from './types.ts';

/**
 * Flagi, przy których materiał o wysokiej intensywności dostaje ostrzeżenie.
 * Ta sama lista co przy kwalifikacji do wyzwań — inny skutek, ta sama podstawa.
 */
export const FLAGI_WYSILKOWE: readonly string[] = [
  'FLAG_SYNCOPE',
  'FLAG_CHEST_PAIN',
  'FLAG_BMI_EXTREME',
  'FLAG_EATING_DISORDER',
];

export interface Ostrzezenie {
  kod: string;
  tresc: string;
}

export function ostrzezenia(material: Material, ocena: Assessment): readonly Ostrzezenie[] {
  if (material.intensywnosc !== 'wysoka') return [];

  const wynik: Ostrzezenie[] = [];

  const flaga = ocena.flags.find((pozycja) => FLAGI_WYSILKOWE.includes(pozycja.code));
  if (flaga !== undefined) {
    wynik.push({
      kod: 'wysilek_przeciwwskazany',
      tresc:
        `Materiał opisuje wysiłek o wysokiej intensywności. Twoja ocena wskazała: ${flaga.message} ` +
        'Przeczytaj, ale nie wdrażaj bez konsultacji z lekarzem.',
    });
  } else if (ocena.riskCategory === 'CZERWONA') {
    wynik.push({
      kod: 'kategoria_ryzyka',
      tresc:
        'Materiał opisuje wysiłek o wysokiej intensywności, a Twoja kategoria ryzyka to CZERWONA. ' +
        'Treść pozostaje dostępna; wdrożenie wymaga wcześniejszej konsultacji lekarskiej.',
    });
  }

  return wynik;
}

export interface FiltrBiblioteki {
  pakiet?: string;
  filar?: string;
  typ?: TypMaterialu;
  fraza?: string;
}

function pasuje(material: Material, filtr: FiltrBiblioteki): boolean {
  if (filtr.pakiet !== undefined && !material.pakiety.includes(filtr.pakiet)) return false;
  if (filtr.filar !== undefined && !material.filary.includes(filtr.filar)) return false;
  if (filtr.typ !== undefined && material.typ !== filtr.typ) return false;

  if (filtr.fraza !== undefined && filtr.fraza.trim() !== '') {
    const szukane = filtr.fraza.trim().toLocaleLowerCase('pl-PL');
    const wStronie = `${material.tytul} ${material.opis}`.toLocaleLowerCase('pl-PL');
    if (!wStronie.includes(szukane)) return false;
  }

  return true;
}

/**
 * Materiały widoczne w katalogu.
 *
 * Nieopublikowane i wycofane odpadają zawsze — publikacja jest decyzją redakcji
 * w Notion, a nie parametrem zapytania, którym da się je obejść.
 */
export function katalog(
  materialy: readonly Material[],
  filtr: FiltrBiblioteki = {},
): readonly Material[] {
  return materialy.filter(
    (material) =>
      material.opublikowana && material.wycofany !== true && pasuje(material, filtr),
  );
}

export function materialPoId(
  materialy: readonly Material[],
  id: string,
): Material | undefined {
  return materialy.find((material) => material.id === id);
}

/** Filary występujące w widocznym katalogu — do zbudowania filtra. */
export function filary(materialy: readonly Material[]): readonly string[] {
  const zbior = new Set<string>();
  for (const material of katalog(materialy)) for (const filar of material.filary) zbior.add(filar);
  return [...zbior].sort();
}

/**
 * Które filary biblioteki odpowiadają której składowej Health Score.
 *
 * Mapowanie musi istnieć jawnie, bo to dwa różne słowniki: silnik reguł liczy
 * składowe („metaboliczna", „sprawnościowa"), a redakcja opisuje treści
 * filarami programu („Żywienie", „Ruch"). Dopasowywanie ich po nazwie działałoby
 * przypadkiem dla snu i milcząco nie działało dla reszty.
 *
 * Nazwy po prawej muszą zgadzać się z bazą „Filary" w Notion. Zmiana nazwy
 * filaru w Notion wymaga poprawki tutaj — dlatego mapowanie da się nadpisać
 * parametrem, zamiast zaszywać je na stałe w ścieżce renderowania.
 */
export const FILARY_SKLADOWEJ: Readonly<Record<ScoreComponent, readonly string[]>> = {
  metaboliczna: ['Żywienie', 'Ruch'],
  sprawnościowa: ['Ruch', 'Regeneracja'],
  sen: ['Sen'],
  odżywianie: ['Żywienie'],
  stres: ['Stres', 'Regeneracja'],
  profilaktyka: ['Profilaktyka'],
};

export interface OpcjeProponowanych extends FiltrBiblioteki {
  ile?: number;
  mapowanie?: Readonly<Record<ScoreComponent, readonly string[]>>;
}

/**
 * Propozycje dla uczestnika: materiały z filarów, w których Health Score
 * wypadł najsłabiej.
 *
 * Liczone lokalnie, przy renderowaniu strony. Wynik nie jest nigdzie zapisywany
 * ani odsyłany do Notion — profil zainteresowań osoby, trzymany po stronie
 * treści, byłby danymi o zdrowiu w miejscu, które ich nie chroni.
 */
export function proponowane(
  materialy: readonly Material[],
  ocena: Assessment,
  opcje: OpcjeProponowanych = {},
): readonly Material[] {
  const { ile = 3, mapowanie = FILARY_SKLADOWEJ, ...filtr } = opcje;

  const najslabsze = [...ocena.healthScore.components]
    .sort((a, b) => a.score - b.score)
    .slice(0, 2)
    .flatMap((component) => mapowanie[component.component] ?? []);

  const widoczne = katalog(materialy, filtr);

  const dopasowane = widoczne.filter((material) =>
    material.filary.some((filar) => najslabsze.includes(filar)),
  );

  // Gdy nic nie pasuje do słabych obszarów, lepiej pokazać cokolwiek
  // sensownego niż pustą sekcję z komunikatem o braku dopasowania.
  return (dopasowane.length > 0 ? dopasowane : widoczne).slice(0, ile);
}

export function minutyKatalogu(materialy: readonly Material[]): number {
  return katalog(materialy).reduce((suma, material) => suma + material.czasTrwaniaMin, 0);
}
