/**
 * Sprawdzenie kontraktu API v1.
 *
 * Bez przeglądarki — API jest kontraktem dla klienta mobilnego, więc sprawdza
 * się je tak, jak ten klient będzie z niego korzystał: żądaniami HTTP.
 *
 * Nacisk pada na odmowy. Punkt końcowy, który zwraca dane, widać od razu;
 * punkt końcowy, który *nie* zwraca danych osobie bez zgody, widać wyłącznie
 * w takim przebiegu jak ten.
 *
 * UWAGA: przebieg jest jednorazowy. Zmienia rejestr zgód i zapisy do wyzwań,
 * a prototyp trzyma stan w pamięci procesu — serwer trzeba wystartować na nowo.
 */

const baseUrl = arg('--url') ?? 'http://127.0.0.1:3105';

const UCZESTNIK = 'tok-uczestnik-demo';
const HR = 'tok-hr-demo';
const LEKARZ = 'tok-lekarz-demo';
const ADMIN = 'tok-admin-demo';

const kroki: string[] = [];
let bledy = 0;

function sprawdz(warunek: boolean, opis: string): void {
  kroki.push(`${warunek ? 'OK  ' : 'BŁĄD'} ${opis}`);
  if (!warunek) bledy += 1;
}

interface Wynik {
  status: number;
  naglowki: Headers;
  cialo: any;
  tekst: string;
}

async function zapytaj(
  sciezka: string,
  opcje: { token?: string; metoda?: string; cialo?: unknown } = {},
): Promise<Wynik> {
  const odpowiedz = await fetch(`${baseUrl}${sciezka}`, {
    method: opcje.metoda ?? 'GET',
    headers: {
      ...(opcje.token !== undefined ? { Authorization: `Bearer ${opcje.token}` } : {}),
      ...(opcje.cialo !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(opcje.cialo !== undefined ? { body: JSON.stringify(opcje.cialo) } : {}),
  });

  const tekst = await odpowiedz.text();
  let cialo: unknown;
  try {
    cialo = JSON.parse(tekst);
  } catch {
    cialo = undefined;
  }

  return { status: odpowiedz.status, naglowki: odpowiedz.headers, cialo, tekst };
}

// --- uwierzytelnianie --------------------------------------------------------

const bezTokenu = await zapytaj('/api/v1/me');
sprawdz(bezTokenu.status === 401, `bez tokenu 401 (${bezTokenu.status})`);
sprawdz(bezTokenu.cialo?.blad?.kod === 'brak_uwierzytelnienia', 'błąd niesie kod maszynowy');

const zlyToken = await zapytaj('/api/v1/me', { token: 'tok-zmyslony' });
sprawdz(zlyToken.status === 401, 'nieznany token 401');
sprawdz(
  zlyToken.cialo?.blad?.komunikat === bezTokenu.cialo?.blad?.komunikat,
  'brak tokenu i zły token dają identyczną odpowiedź',
);

const ja = await zapytaj('/api/v1/me', { token: UCZESTNIK });
sprawdz(ja.status === 200 && ja.cialo.subjectRef === 'psd-8fa2', 'uczestnik rozpoznany');
sprawdz(!ja.tekst.includes('tok-'), 'odpowiedź nie zawiera tokenu');

// --- dane zdrowotne ----------------------------------------------------------

const score = await zapytaj('/api/v1/health-score', { token: UCZESTNIK });
sprawdz(score.status === 200 && typeof score.cialo.wynik === 'number', 'Health Score wydany');
sprawdz(
  (score.naglowki.get('cache-control') ?? '').includes('no-store'),
  'dane zdrowotne oznaczone jako niebuforowalne',
);
sprawdz(score.cialo.tryb === 'synthetic', 'tryb danych jest jawny w odpowiedzi');

// --- zgody -------------------------------------------------------------------

const zgody = await zapytaj('/api/v1/me/consents', { token: UCZESTNIK });
const daneZdrowotne = zgody.cialo.zgody.find((z: any) => z.kod === 'dane_zdrowotne');
sprawdz(daneZdrowotne?.aktywna === true, 'zgoda na dane zdrowotne aktywna');
sprawdz(
  typeof daneZdrowotne?.skutekWycofania === 'string' && daneZdrowotne.skutekWycofania.length > 20,
  'każda zgoda niesie skutek wycofania',
);

const bledneCialo = await zapytaj('/api/v1/me/consents/przetwarzanie_ai', {
  token: UCZESTNIK,
  metoda: 'POST',
  cialo: { cos: 'innego' },
});
sprawdz(bledneCialo.status === 400, 'złe ciało żądania to 400, nie 500');

const nieznanaZgoda = await zapytaj('/api/v1/me/consents/nie_ma_takiej', {
  token: UCZESTNIK,
  metoda: 'POST',
  cialo: { udzielona: true },
});
sprawdz(nieznanaZgoda.status === 404, 'nieznany kod zgody to 404');

const wycofanieAi = await zapytaj('/api/v1/me/consents/przetwarzanie_ai', {
  token: UCZESTNIK,
  metoda: 'POST',
  cialo: { udzielona: false },
});
sprawdz(wycofanieAi.status === 200, 'wycofanie zgody na AI przyjęte');
sprawdz(
  wycofanieAi.cialo.trybGenerowaniaPlanu === 'reczna',
  'wycofanie AI przełącza plan na ścieżkę ręczną, nie odcina uczestnika',
);

// Wycofanie zgody na dane zdrowotne zamyka Health Score.
await zapytaj('/api/v1/me/consents/dane_zdrowotne', {
  token: UCZESTNIK,
  metoda: 'POST',
  cialo: { udzielona: false },
});
const scoreBezZgody = await zapytaj('/api/v1/health-score', { token: UCZESTNIK });
sprawdz(scoreBezZgody.status === 403, 'bez zgody Health Score jest zamknięty');
sprawdz(scoreBezZgody.cialo?.blad?.kod === 'brak_zgody', 'odmowa rozróżnia zgodę od uprawnienia');

// Przywracamy zgodę na potrzeby dalszych sprawdzeń.
await zapytaj('/api/v1/me/consents/dane_zdrowotne', {
  token: UCZESTNIK,
  metoda: 'POST',
  cialo: { udzielona: true },
});

// --- wyzwania ----------------------------------------------------------------

const wyzwania = await zapytaj('/api/v1/challenges', { token: UCZESTNIK });
const prime = wyzwania.cialo.wyzwania.find((w: any) => w.id === 'w-prime');
sprawdz(prime !== undefined, 'wyzwanie spoza pakietu jest w odpowiedzi, nie odfiltrowane');
sprawdz(
  prime?.dozwolone === false && typeof prime?.powod === 'string',
  'niedostępne wyzwanie niesie powód',
);

const zapisPrime = await zapytaj('/api/v1/challenges/w-prime/join', {
  token: UCZESTNIK,
  metoda: 'POST',
});
sprawdz(zapisPrime.status === 403, 'zapis do niedostępnego wyzwania odrzucony po stronie serwera');

const zapisKroki = await zapytaj('/api/v1/challenges/w-kroki/join', {
  token: UCZESTNIK,
  metoda: 'POST',
});
sprawdz(zapisKroki.status === 201, 'zapis do dozwolonego wyzwania przyjęty');

const ponownie = await zapytaj('/api/v1/challenges/w-kroki/join', {
  token: UCZESTNIK,
  metoda: 'POST',
});
sprawdz(ponownie.status === 400, 'powtórny zapis odrzucony z jednoznacznym kodem');

const nieznane = await zapytaj('/api/v1/challenges/w-nie-ma/join', {
  token: UCZESTNIK,
  metoda: 'POST',
});
sprawdz(nieznane.status === 404, 'zapis do nieistniejącego wyzwania to 404');

await zapytaj('/api/v1/challenges/w-sen/join', { token: UCZESTNIK, metoda: 'POST' });

// --- wsad z urządzenia -------------------------------------------------------

const partia = await zapytaj('/api/v1/wearables/samples', {
  token: UCZESTNIK,
  metoda: 'POST',
  cialo: {
    probki: [
      { wyzwanieId: 'w-kroki', dzien: '2026-10-05', wartosc: 11_200, zrodlo: 'wearable' },
      { wyzwanieId: 'w-sen', dzien: '2026-10-05', wartosc: 430, zrodlo: 'wearable' },
      // Wartość poza fizjologicznym zakresem.
      { wyzwanieId: 'w-kroki', dzien: '2026-10-05', wartosc: 999_999, zrodlo: 'wearable' },
      // Dzień sprzed zapisu do wyzwania — telefon może mieć starszą historię,
      // ale nie zalicza się jej wstecz do wyzwania, do którego nikt wtedy nie należał.
      { wyzwanieId: 'w-kroki', dzien: '2026-09-20', wartosc: 12_000, zrodlo: 'wearable' },
      // Wyzwanie, do którego uczestnik nie należy.
      { wyzwanieId: 'w-prime', dzien: '2026-10-05', wartosc: 50, zrodlo: 'wearable' },
    ],
  },
});
sprawdz(partia.status === 207, `partia częściowo przyjęta (${partia.status})`);
sprawdz(partia.cialo.przyjetych === 2, 'poprawne próbki weszły mimo błędów w partii');
sprawdz(partia.cialo.odrzuconych === 3, 'próbki wadliwe odrzucone pojedynczo');
sprawdz(
  partia.cialo.odrzucone.some((o: any) => /maksimum/u.test(o.powod)),
  'odrzucenie niesie powód, nie sam indeks',
);
sprawdz(
  partia.cialo.odrzucone.some((o: any) => /sprzed startu/u.test(o.powod)),
  'pomiar sprzed zapisu do wyzwania nie liczy się wstecz',
);
sprawdz(
  partia.cialo.odrzucone.every((o: any) => typeof o.indeks === 'number'),
  'klient wie, którą próbkę poprawić',
);

const pustaPartia = await zapytaj('/api/v1/wearables/samples', {
  token: UCZESTNIK,
  metoda: 'POST',
  cialo: { cos: 'innego' },
});
sprawdz(pustaPartia.status === 400, 'żądanie bez tablicy próbek to 400');

// --- biblioteka --------------------------------------------------------------

const biblioteka = await zapytaj('/api/v1/library', { token: UCZESTNIK });
const idMaterialow = biblioteka.cialo.materialy.map((m: any) => m.id);
sprawdz(!idMaterialow.includes('m-prime-01'), 'treść spoza pakietu niewidoczna');
sprawdz(!idMaterialow.includes('m-stary'), 'materiał wycofany niewidoczny');

const filtrowana = await zapytaj('/api/v1/library?filar=Sen', { token: UCZESTNIK });
sprawdz(
  filtrowana.cialo.materialy.every((m: any) => m.filary.includes('Sen')),
  'filtr po filarze działa po stronie serwera',
);

// --- dashboard HR ------------------------------------------------------------

const dashboardUczestnik = await zapytaj('/api/v1/org/org-alfa/dashboard', { token: UCZESTNIK });
sprawdz(dashboardUczestnik.status === 403, 'uczestnik nie dosięgnie dashboardu organizacji');

const dashboardObcy = await zapytaj('/api/v1/org/org-beta/dashboard', { token: HR });
sprawdz(dashboardObcy.status === 403, 'HR nie dosięgnie danych innej organizacji');

const dashboard = await zapytaj('/api/v1/org/org-alfa/dashboard?metric=uczestnictwo', {
  token: HR,
});
sprawdz(dashboard.status === 200 && dashboard.cialo.kind === 'wynik', 'dashboard wydany dla HR');
sprawdz(!dashboard.tekst.includes('p-0'), 'agregat nie zawiera identyfikatorów uczestników');

const zIdentyfikatorem = await zapytaj(
  '/api/v1/org/org-alfa/dashboard?metric=uczestnictwo&participantId=p-1',
  { token: HR },
);
sprawdz(
  zIdentyfikatorem.status === 400,
  'dashboard odrzuca parametr identyfikujący osobę, zamiast go ignorować',
);
sprawdz(
  zIdentyfikatorem.cialo?.blad?.szczegoly?.zakazaneParametry?.length > 0,
  'odpowiedź wymienia zakazane parametry',
);

const waskiFiltr = await zapytaj(
  '/api/v1/org/org-alfa/dashboard?metric=uczestnictwo&unitId=biuro',
  { token: HR },
);
sprawdz(
  waskiFiltr.cialo.kind === 'za_malo_danych',
  'filtr poniżej progu k wstrzymuje wynik, a nie zwraca liczby',
);

// --- Karta Pacjenta ----------------------------------------------------------

const kartaBezZgody = await zapytaj('/api/v1/clinician/patients/u-101/card', { token: LEKARZ });
sprawdz(kartaBezZgody.status === 403, 'lekarz bez zgody nie dostaje Karty Pacjenta');
sprawdz(kartaBezZgody.cialo?.blad?.kod === 'brak_zgody', 'powodem odmowy jest zgoda, nie rola');

await zapytaj('/api/v1/me/consents/udostepnienie_lekarzowi', {
  token: UCZESTNIK,
  metoda: 'POST',
  cialo: { udzielona: true },
});

const karta = await zapytaj('/api/v1/clinician/patients/u-101/card', { token: LEKARZ });
sprawdz(karta.status === 200, 'po udzieleniu zgody karta jest dostępna');
sprawdz(
  typeof karta.cialo.zastrzezenie === 'string' && karta.cialo.zastrzezenie.includes('diagnozy'),
  'karta niesie zastrzeżenie o braku diagnozy',
);
sprawdz(karta.cialo.subjectRef === 'psd-8fa2', 'karta identyfikuje pseudonimem');

const kartaHR = await zapytaj('/api/v1/clinician/patients/u-101/card', { token: HR });
sprawdz(kartaHR.status === 403, 'HR nie dosięgnie Karty Pacjenta nawet po zgodzie');

// Wycofanie zgody zamyka dostęp natychmiast.
await zapytaj('/api/v1/me/consents/udostepnienie_lekarzowi', {
  token: UCZESTNIK,
  metoda: 'POST',
  cialo: { udzielona: false },
});
const kartaPoWycofaniu = await zapytaj('/api/v1/clinician/patients/u-101/card', { token: LEKARZ });
sprawdz(kartaPoWycofaniu.status === 403, 'wycofanie zgody zamyka dostęp lekarza natychmiast');

// --- rejestr dostępu ---------------------------------------------------------

const rejestr = await zapytaj('/api/v1/me/access-log', { token: UCZESTNIK });
sprawdz(rejestr.status === 200, 'uczestnik widzi rejestr dostępu do swoich danych');

const wpisyLekarza = rejestr.cialo.wpisy.filter(
  (w: any) => w.akcja === 'udostepnienie_lekarzowi',
);
sprawdz(wpisyLekarza.length >= 2, 'otwarcie karty przez lekarza jest widoczne dla uczestnika');
sprawdz(
  wpisyLekarza.some((w: any) => w.kontekst?.wynik === 'odmowa'),
  'nieudana próba dostępu też jest w rejestrze',
);
sprawdz(
  rejestr.cialo.wpisy.every((w: any) => typeof w.aktor === 'string' && !w.aktor.includes('@')),
  'rejestr pokazuje identyfikator aktora, nie dane kontaktowe',
);

// --- administracja -----------------------------------------------------------

const syncHR = await zapytaj('/api/v1/admin/sync/notion', { token: HR, metoda: 'POST' });
sprawdz(syncHR.status === 403, 'HR nie uruchomi synchronizacji');

const sync = await zapytaj('/api/v1/admin/sync/notion', { token: ADMIN, metoda: 'POST' });
sprawdz(sync.status === 202, 'administrator planuje synchronizację');
sprawdz(
  typeof sync.cialo.uwaga === 'string' && sync.cialo.uwaga.includes('cennik'),
  'odpowiedź mówi, że źródła krytyczne wymagają potwierdzenia',
);

// --- eksport RODO ------------------------------------------------------------

const eksport = await zapytaj('/api/v1/gdpr/export', { token: UCZESTNIK });
sprawdz(eksport.status === 200, 'uczestnik pobiera własne dane');
sprawdz(
  (eksport.naglowki.get('content-disposition') ?? '').includes('longevity-psd-8fa2'),
  'eksport wraca jako plik z nazwą po pseudonimie',
);
sprawdz(eksport.cialo.subjectRef === 'psd-8fa2', 'eksport jest w formacie przenoszalnym');

// --- wersjonowanie i nieznane ścieżki ----------------------------------------

const nieistniejaca = await zapytaj('/api/v1/nie-ma-takiego', { token: UCZESTNIK });
sprawdz(nieistniejaca.status === 404, 'nieznana ścieżka to 404');
sprawdz(
  nieistniejaca.cialo?.blad?.kod === 'nie_znaleziono',
  'nieznana ścieżka trzyma kontrakt błędu, a nie zwraca HTML',
);
sprawdz(
  (nieistniejaca.naglowki.get('content-type') ?? '').includes('application/json'),
  'odpowiedź 404 jest JSON-em',
);

const bezTokenuNaNieznanej = await zapytaj('/api/v1/nie-ma-takiego');
sprawdz(
  bezTokenuNaNieznanej.status === 404,
  'nieznana ścieżka nie zdradza, że istnieje po zalogowaniu',
);

for (const line of kroki) console.log(line);
console.log(`\n${kroki.length - bledy}/${kroki.length} sprawdzeń przeszło`);
process.exit(bledy === 0 ? 0 : 1);

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
