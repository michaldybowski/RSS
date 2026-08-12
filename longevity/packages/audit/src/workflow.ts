/**
 * Przebieg audytu i wydanie certyfikatu.
 *
 * Certyfikat jest oświadczeniem wobec osób trzecich — kandydatów do pracy,
 * kontrahentów, w perspektywie sprawozdawczości CSRD. Dlatego warunki jego
 * wydania są twarde i sprawdzane w kodzie, a nie zostawione staranności
 * audytora przy zamykaniu formularza.
 */

import { assertCan, type Actor } from '@longevity/access';

import { ocen, wymagaDowodu } from './scoring.ts';
import type {
  Audyt,
  Certyfikat,
  Kryterium,
  OcenaKryterium,
  SchematCertyfikacji,
  Ustalenie,
  WynikAudytu,
} from './types.ts';

export class AudytZamknietyError extends Error {
  constructor(audytId: string) {
    super(`Audyt ${audytId} jest zamknięty — ustaleń nie można już zmieniać.`);
    this.name = 'AudytZamknietyError';
  }
}

export class NiekompletnyAudytError extends Error {
  constructor(
    readonly bezOceny: readonly string[],
    readonly bezDowodu: readonly string[],
  ) {
    const czesci: string[] = [];
    if (bezOceny.length > 0) czesci.push(`${bezOceny.length} kryteriów bez oceny`);
    if (bezDowodu.length > 0) czesci.push(`${bezDowodu.length} ocen pozytywnych bez dowodu`);
    super(`Audytu nie można zamknąć: ${czesci.join(', ')}.`);
    this.name = 'NiekompletnyAudytError';
  }
}

export interface WpisUstalenia {
  kryteriumId: string;
  ocena: OcenaKryterium;
  uwaga?: string;
  dowodKey?: string;
}

export function zapiszUstalenia(
  actor: Actor,
  audyt: Audyt,
  istniejace: readonly Ustalenie[],
  wpisy: readonly WpisUstalenia[],
  teraz: string,
): readonly Ustalenie[] {
  assertCan(actor, 'zapis_audytu', {
    kind: 'audyt',
    organizationId: audyt.organizationId,
    auditorId: audyt.audytorId,
  });

  if (audyt.status === 'zamkniety') throw new AudytZamknietyError(audyt.id);

  const pozostale = istniejace.filter((ustalenie) => ustalenie.audytId !== audyt.id);
  const wgKryterium = new Map(
    istniejace
      .filter((ustalenie) => ustalenie.audytId === audyt.id)
      .map((ustalenie) => [ustalenie.kryteriumId, ustalenie]),
  );

  for (const wpis of wpisy) {
    wgKryterium.set(wpis.kryteriumId, {
      audytId: audyt.id,
      kryteriumId: wpis.kryteriumId,
      ocena: wpis.ocena,
      ...(wpis.uwaga !== undefined && wpis.uwaga !== '' ? { uwaga: wpis.uwaga } : {}),
      ...(wpis.dowodKey !== undefined && wpis.dowodKey !== '' ? { dowodKey: wpis.dowodKey } : {}),
      odnotowal: actor.userId,
      at: teraz,
    });
  }

  return [...pozostale, ...wgKryterium.values()];
}

export interface GotowoscDoZamkniecia {
  gotowy: boolean;
  wynik: WynikAudytu;
  brakujace: readonly { kryterium: Kryterium; powod: 'brak_oceny' | 'brak_dowodu' }[];
}

export function sprawdzGotowosc(
  schemat: SchematCertyfikacji,
  audyt: Audyt,
  ustalenia: readonly Ustalenie[],
): GotowoscDoZamkniecia {
  const dlaAudytu = ustalenia.filter((ustalenie) => ustalenie.audytId === audyt.id);
  const wynik = ocen(schemat, dlaAudytu);
  const wgId = new Map(schemat.kryteria.map((kryterium) => [kryterium.id, kryterium]));

  const brakujace = [
    ...wynik.bezOceny.map((id) => ({ kryterium: wgId.get(id)!, powod: 'brak_oceny' as const })),
    ...wynik.bezDowodu.map((id) => ({ kryterium: wgId.get(id)!, powod: 'brak_dowodu' as const })),
  ].filter((pozycja) => pozycja.kryterium !== undefined);

  return { gotowy: brakujace.length === 0, wynik, brakujace };
}

export function zamknijAudyt(
  actor: Actor,
  schemat: SchematCertyfikacji,
  audyt: Audyt,
  ustalenia: readonly Ustalenie[],
  teraz: string,
): { audyt: Audyt; wynik: WynikAudytu } {
  assertCan(actor, 'zapis_audytu', {
    kind: 'audyt',
    organizationId: audyt.organizationId,
    auditorId: audyt.audytorId,
  });

  if (audyt.status === 'zamkniety') throw new AudytZamknietyError(audyt.id);

  const gotowosc = sprawdzGotowosc(schemat, audyt, ustalenia);
  if (!gotowosc.gotowy) {
    throw new NiekompletnyAudytError(gotowosc.wynik.bezOceny, gotowosc.wynik.bezDowodu);
  }

  return {
    audyt: { ...audyt, status: 'zamkniety', zamkniety: teraz },
    wynik: gotowosc.wynik,
  };
}

export class BrakPodstawyCertyfikatuError extends Error {
  constructor(powod: string) {
    super(`Nie można wydać certyfikatu: ${powod}.`);
    this.name = 'BrakPodstawyCertyfikatuError';
  }
}

/** Certyfikat ważny dwa lata — po tym czasie standard i zakład zdążą się zmienić. */
export const WAZNOSC_MIESIACY = 24;

function dodajMiesiace(data: string, miesiace: number): string {
  const [rok, miesiac, dzien] = data.slice(0, 10).split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(rok, miesiac - 1 + miesiace, dzien)).toISOString().slice(0, 10);
}

export function wydajCertyfikat(
  schemat: SchematCertyfikacji,
  audyt: Audyt,
  ustalenia: readonly Ustalenie[],
  kolejnyNumer: number,
  teraz: string,
): Certyfikat {
  if (audyt.status !== 'zamkniety') {
    throw new BrakPodstawyCertyfikatuError('audyt nie został zamknięty');
  }

  const wynik = ocen(
    schemat,
    ustalenia.filter((ustalenie) => ustalenie.audytId === audyt.id),
  );

  if (wynik.poziom === 'brak') {
    throw new BrakPodstawyCertyfikatuError(
      `wynik ${wynik.wynikProcent}% jest poniżej progu najniższego poziomu`,
    );
  }

  const rok = teraz.slice(0, 4);

  return {
    numer: `PD/${rok}/${String(kolejnyNumer).padStart(4, '0')}`,
    organizationId: audyt.organizationId,
    audytId: audyt.id,
    poziom: wynik.poziom,
    wynikProcent: wynik.wynikProcent,
    wydany: teraz.slice(0, 10),
    waznyDo: dodajMiesiace(teraz, WAZNOSC_MIESIACY),
    status: 'wazny',
  };
}

/**
 * Weryfikacja publiczna — po numerze, bez logowania.
 *
 * Certyfikat, którego nie da się sprawdzić, jest naklejką. Rejestr zwraca
 * status i poziom, ale nie ustalenia z audytu — te są sprawą zakładu.
 */
export interface WynikWeryfikacji {
  znaleziony: boolean;
  numer: string;
  poziom?: Certyfikat['poziom'];
  status?: Certyfikat['status'];
  waznyDo?: string;
}

export function zweryfikuj(
  certyfikaty: readonly Certyfikat[],
  numer: string,
  teraz: string,
): WynikWeryfikacji {
  const certyfikat = certyfikaty.find((pozycja) => pozycja.numer === numer);
  if (certyfikat === undefined) return { znaleziony: false, numer };

  const status: Certyfikat['status'] =
    certyfikat.status === 'cofniety'
      ? 'cofniety'
      : teraz.slice(0, 10) > certyfikat.waznyDo
        ? 'wygasly'
        : 'wazny';

  return {
    znaleziony: true,
    numer,
    poziom: certyfikat.poziom,
    status,
    waznyDo: certyfikat.waznyDo,
  };
}

export { wymagaDowodu };
