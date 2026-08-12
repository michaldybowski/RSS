/**
 * Zapisy na warsztaty.
 *
 * Operacje są czyste: przyjmują stan i zwracają nowy. Lista rezerwowa działa
 * w kolejności zgłoszeń, a zwolnione miejsce jest obsadzane automatycznie —
 * inaczej ktoś musiałby codziennie przeglądać listy i dzwonić.
 */

import type {
  Obloznosc,
  PowodOdrzucenia,
  Warsztat,
  WynikWypisania,
  WynikZapisu,
  Zapis,
} from './types.ts';

export interface StanZapisow {
  zapisy: readonly Zapis[];
}

function aktywne(zapisy: readonly Zapis[], warsztatId: string): Zapis[] {
  return zapisy
    .filter((zapis) => zapis.warsztatId === warsztatId && zapis.status !== 'wypisany')
    .slice()
    .sort((a, b) => (a.zgloszony < b.zgloszony ? -1 : 1));
}

export function obloznosc(warsztat: Warsztat, zapisy: readonly Zapis[]): Obloznosc {
  const lista = aktywne(zapisy, warsztat.id);
  const zapisani = lista.filter((zapis) => zapis.status === 'zapisany').length;
  const rezerwowa = lista.filter((zapis) => zapis.status === 'lista_rezerwowa').length;

  return {
    miejsc: warsztat.miejsc,
    zapisani,
    naLiscieRezerwowej: rezerwowa,
    wolneMiejsca: Math.max(0, warsztat.miejsc - zapisani),
    pelny: zapisani >= warsztat.miejsc,
  };
}

/** Zapisy zamykają się z chwilą rozpoczęcia warsztatu. */
function powodOdmowy(warsztat: Warsztat, teraz: string): PowodOdrzucenia | undefined {
  if (warsztat.status === 'odwolany') return 'warsztat_odwolany';
  if (warsztat.status === 'zakonczony') return 'warsztat_zakonczony';
  if (teraz >= warsztat.start) return 'zapisy_zamkniete';
  return undefined;
}

export function zapisz(
  stan: StanZapisow,
  warsztat: Warsztat,
  participantId: string,
  teraz: string,
): { stan: StanZapisow; wynik: WynikZapisu } {
  const powod = powodOdmowy(warsztat, teraz);
  if (powod !== undefined) return { stan, wynik: { kind: 'odrzucony', powod } };

  const istniejacy = aktywne(stan.zapisy, warsztat.id).find(
    (zapis) => zapis.participantId === participantId,
  );
  if (istniejacy !== undefined) {
    return { stan, wynik: { kind: 'odrzucony', powod: 'juz_zapisany' } };
  }

  const zajete = obloznosc(warsztat, stan.zapisy);
  const status = zajete.pelny ? 'lista_rezerwowa' : 'zapisany';

  const nowy: Zapis = { warsztatId: warsztat.id, participantId, status, zgloszony: teraz };
  const stanPo = { zapisy: [...stan.zapisy, nowy] };

  return {
    stan: stanPo,
    wynik:
      status === 'zapisany'
        ? { kind: 'zapisany' }
        : { kind: 'lista_rezerwowa', pozycja: zajete.naLiscieRezerwowej + 1 },
  };
}

export function wypisz(
  stan: StanZapisow,
  warsztat: Warsztat,
  participantId: string,
  teraz: string,
): { stan: StanZapisow; wynik: WynikWypisania } {
  if (warsztat.status === 'zakonczony') {
    return { stan, wynik: { kind: 'odrzucony', powod: 'warsztat_zakonczony' } };
  }

  const lista = aktywne(stan.zapisy, warsztat.id);
  const wypisywany = lista.find((zapis) => zapis.participantId === participantId);

  if (wypisywany === undefined) {
    return { stan, wynik: { kind: 'odrzucony', powod: 'nie_byl_zapisany' } };
  }

  let zapisy = stan.zapisy.map((zapis) =>
    zapis.warsztatId === warsztat.id && zapis.participantId === participantId
      ? { ...zapis, status: 'wypisany' as const }
      : zapis,
  );

  // Zwolnienie miejsca awansuje pierwszą osobę z listy rezerwowej. Bez tego
  // warsztat jedzie z pustym krzesłem, a ktoś czeka.
  let awansowany: string | undefined;

  if (wypisywany.status === 'zapisany') {
    const pierwszyZRezerwy = aktywne(zapisy, warsztat.id).find(
      (zapis) => zapis.status === 'lista_rezerwowa',
    );

    if (pierwszyZRezerwy !== undefined) {
      awansowany = pierwszyZRezerwy.participantId;
      zapisy = zapisy.map((zapis) =>
        zapis.warsztatId === warsztat.id && zapis.participantId === awansowany
          ? { ...zapis, status: 'zapisany' as const }
          : zapis,
      );
    }
  }

  void teraz;

  return {
    stan: { zapisy },
    wynik: { kind: 'wypisany', ...(awansowany !== undefined ? { awansowany } : {}) },
  };
}

/**
 * Odwołanie warsztatu. Zapisy zostają — trzeba wiedzieć, kogo powiadomić,
 * a przy okazji nie gubimy informacji, że ktoś chciał przyjść.
 */
export function odwolaj(warsztat: Warsztat): Warsztat {
  return { ...warsztat, status: 'odwolany' };
}

export function doPowiadomienia(stan: StanZapisow, warsztatId: string): readonly string[] {
  return aktywne(stan.zapisy, warsztatId).map((zapis) => zapis.participantId);
}
