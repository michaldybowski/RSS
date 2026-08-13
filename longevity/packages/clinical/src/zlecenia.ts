/**
 * Zlecenia badań.
 *
 * Reguły platformy potrafią wskazać, jakie badania warto wykonać — robi to
 * `buildReferrals` z @longevity/plan i robi to deterministycznie. Ale **wskazanie
 * to nie zlecenie**. Dokument, z którym pacjent idzie do laboratorium, podpisuje
 * lekarz, i dopiero jego decyzja zamienia propozycję w zlecenie.
 *
 * Dlatego:
 *  - propozycja powstaje ze statusem `propozycja` i nie da się jej wydrukować;
 *  - lekarz może usunąć pozycje przed podpisem — zatwierdza to, co uznaje
 *    za zasadne, a nie całą listę w ciemno;
 *  - odrzucenie wymaga uzasadnienia, bo uczestnik zobaczył już propozycję
 *    i ma prawo wiedzieć, dlaczego nie dostał zlecenia.
 */

import type { Assessment, ParticipantIntake } from '@longevity/core';
import { buildReferrals } from '@longevity/plan';

import type { PozycjaZlecenia, ZlecenieBadan } from './types.ts';

export class ZlecenieNiezatwierdzoneError extends Error {
  constructor(status: string) {
    super(
      `Zlecenie ma status "${status}". Dokument powstaje wyłącznie ze zlecenia ` +
        'podpisanego przez lekarza — platforma nie wystawia zleceń samodzielnie.',
    );
    this.name = 'ZlecenieNiezatwierdzoneError';
  }
}

export class ZlecenieJuzRozpatrzoneError extends Error {
  constructor(status: string) {
    super(`Zlecenie zostało już rozpatrzone (status "${status}").`);
    this.name = 'ZlecenieJuzRozpatrzoneError';
  }
}

export class BrakUzasadnieniaError extends Error {
  constructor() {
    super('Odrzucenie propozycji wymaga uzasadnienia widocznego dla uczestnika.');
    this.name = 'BrakUzasadnieniaError';
  }
}

export class PusteZlecenieError extends Error {
  constructor() {
    super('Zatwierdzenie wymaga co najmniej jednej pozycji.');
    this.name = 'PusteZlecenieError';
  }
}

/**
 * Propozycja zlecenia z reguł. Każda pozycja niesie powód — lekarz podpisujący
 * dokument musi wiedzieć, skąd wzięło się badanie, a nie tylko że „system je dodał".
 */
export function przygotujPropozycje(
  intake: ParticipantIntake,
  ocena: Assessment,
  konsultacjaId: string,
  participantId: string,
  teraz: string,
): ZlecenieBadan {
  const skierowania = buildReferrals(intake, ocena);

  const pozycje: PozycjaZlecenia[] = [
    ...skierowania.panelBazowy.map((badanie) => ({
      badanie,
      powod: 'Panel Bazowy Longevity — ten sam dla każdego uczestnika.',
    })),
    ...skierowania.paneleWarunkowe.flatMap((panel) =>
      panel.badania.map((badanie) => ({ badanie, powod: panel.powod })),
    ),
  ];

  return {
    id: `zlec-${konsultacjaId}`,
    konsultacjaId,
    participantId,
    // Powtórzenia usuwamy po nazwie badania, zachowując pierwszy powód:
    // ta sama pozycja z dwóch panelów to jedno pobranie, nie dwa.
    pozycje: pozycje.filter(
      (pozycja, index) =>
        pozycje.findIndex((inna) => inna.badanie === pozycja.badanie) === index,
    ),
    status: 'propozycja',
    utworzone: teraz,
  };
}

export interface DecyzjaLekarza {
  lekarzId: string;
  teraz: string;
  /** Nazwy badań, które lekarz usuwa przed podpisem. */
  usun?: readonly string[];
}

export function zatwierdz(zlecenie: ZlecenieBadan, decyzja: DecyzjaLekarza): ZlecenieBadan {
  if (zlecenie.status !== 'propozycja') throw new ZlecenieJuzRozpatrzoneError(zlecenie.status);

  const usun = new Set(decyzja.usun ?? []);
  const pozostale = zlecenie.pozycje.filter((pozycja) => !usun.has(pozycja.badanie));
  if (pozostale.length === 0) throw new PusteZlecenieError();

  return {
    ...zlecenie,
    pozycje: pozostale,
    status: 'zatwierdzone',
    lekarzId: decyzja.lekarzId,
    rozpatrzone: decyzja.teraz,
    ...(usun.size > 0 ? { usuniete: [...usun] } : {}),
  };
}

export function odrzuc(
  zlecenie: ZlecenieBadan,
  lekarzId: string,
  uzasadnienie: string,
  teraz: string,
): ZlecenieBadan {
  if (zlecenie.status !== 'propozycja') throw new ZlecenieJuzRozpatrzoneError(zlecenie.status);
  if (uzasadnienie.trim() === '') throw new BrakUzasadnieniaError();

  return {
    ...zlecenie,
    status: 'odrzucone',
    lekarzId,
    rozpatrzone: teraz,
    uzasadnienieOdrzucenia: uzasadnienie.trim(),
  };
}

export interface DokumentZlecenia {
  numer: string;
  wystawil: string;
  wystawione: string;
  pozycje: readonly string[];
  zastrzezenie: string;
}

/**
 * Dokument do wydruku. Rzuca, dopóki zlecenie nie jest podpisane — to jedyne
 * miejsce, w którym propozycja zamienia się w coś, co pacjent zabiera do punktu
 * pobrań, i dlatego bramka jest właśnie tutaj, a nie w widoku.
 */
export function dokumentZlecenia(zlecenie: ZlecenieBadan): DokumentZlecenia {
  if (zlecenie.status !== 'zatwierdzone') {
    throw new ZlecenieNiezatwierdzoneError(zlecenie.status);
  }

  return {
    numer: zlecenie.id,
    wystawil: zlecenie.lekarzId!,
    wystawione: zlecenie.rozpatrzone!,
    pozycje: zlecenie.pozycje.map((pozycja) => pozycja.badanie),
    zastrzezenie:
      'Zlecenie wystawił lekarz na podstawie konsultacji. Zakres badań ' +
      'zaproponowała platforma regułami; decyzja i podpis należą do lekarza.',
  };
}
