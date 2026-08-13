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

// --- Akademia ----------------------------------------------------------------

const sciezkiPrzed = await zapytaj('/api/v1/academy/paths', { token: UCZESTNIK });
sprawdz(sciezkiPrzed.status === 200, 'ścieżki Akademii wydane');
sprawdz(
  !sciezkiPrzed.cialo.sciezki.some((s: any) => s.id === 's-prime'),
  'ścieżka spoza pakietu niewidoczna',
);

const podstawy = sciezkiPrzed.cialo.sciezki.find((s: any) => s.id === 's-podstawy');
sprawdz(podstawy?.wymaganych === 2, 'moduł z materiałem wycofanym nie wchodzi do wymagań');
sprawdz(podstawy?.pominietych === 1, 'pominięty moduł jest policzony, a nie ukryty');
sprawdz(
  podstawy?.moduly.some((m: any) => m.stan === 'niedostepny' && m.tytul !== 'm-stary'),
  'moduł niedostępny ma tytuł, a nie identyfikator z bazy',
);
sprawdz(
  podstawy?.moduly.find((m: any) => m.materialId === 'm-ruch-02')?.stan === 'zablokowany',
  'kolejny moduł jest zamknięty do czasu zaliczenia poprzedniego',
);

const deklaracjaNaQuizie = await zapytaj('/api/v1/library/m-sen-01/complete', {
  token: UCZESTNIK,
  metoda: 'POST',
});
sprawdz(
  deklaracjaNaQuizie.status === 400,
  'materiału ze sprawdzianem nie zalicza deklaracja uczestnika',
);

const quizOblany = await zapytaj('/api/v1/library/m-sen-01/complete', {
  token: UCZESTNIK,
  metoda: 'POST',
  cialo: { odpowiedzi: { 'p-1': 1, 'p-2': 0 } },
});
sprawdz(quizOblany.status === 422, 'niezaliczony sprawdzian nie zalicza materiału');

const quizZdany = await zapytaj('/api/v1/library/m-sen-01/complete', {
  token: UCZESTNIK,
  metoda: 'POST',
  cialo: { odpowiedzi: { 'p-1': 0, 'p-2': 1 } },
});
sprawdz(quizZdany.status === 200 && quizZdany.cialo.sposob === 'quiz', 'sprawdzian zaliczony');
sprawdz(
  quizZdany.cialo.wynik.pytania.every((p: any) => typeof p.wyjasnienie === 'string'),
  'wynik sprawdzianu niesie wyjaśnienia, nie samą liczbę',
);

const wycofany = await zapytaj('/api/v1/library/m-stary/complete', {
  token: UCZESTNIK,
  metoda: 'POST',
});
sprawdz(wycofany.status === 404, 'materiału wycofanego nie da się zaliczyć');

const pozaPakietem = await zapytaj('/api/v1/library/m-prime-01/complete', {
  token: UCZESTNIK,
  metoda: 'POST',
});
sprawdz(pozaPakietem.status === 404, 'materiału spoza pakietu nie da się zaliczyć');

await zapytaj('/api/v1/library/m-ruch-02/complete', { token: UCZESTNIK, metoda: 'POST' });

const sciezkiPo = await zapytaj('/api/v1/academy/paths', { token: UCZESTNIK });
const podstawyPo = sciezkiPo.cialo.sciezki.find((s: any) => s.id === 's-podstawy');
sprawdz(podstawyPo?.procent === 100, 'ścieżka domyka się mimo wycofanego modułu');
sprawdz(podstawyPo?.ukonczona === true, 'ukończenie liczy się z modułów obowiązkowych');
sprawdz(
  podstawyPo?.moduly.find((m: any) => m.materialId === 'm-sen-01')?.sposobZaliczenia === 'quiz',
  'zaliczenie mówi, skąd się wzięło',
);

// --- konsultacje -------------------------------------------------------------

const terminarz = await zapytaj('/api/v1/consultations', { token: UCZESTNIK });
sprawdz(terminarz.status === 200, 'terminarz wydany uczestnikowi');
sprawdz(
  !terminarz.cialo.terminy.some((t: any) => t.id === 't-0'),
  'termin przeszły nie trafia do terminarza',
);

const pilny = terminarz.cialo.terminy.find((t: any) => t.id === 't-2');
sprawdz(
  pilny !== undefined && pilny.dostepny === false,
  'termin pilny zostaje na liście, ale jest niedostępny',
);
sprawdz(
  typeof pilny?.powod === 'string' && pilny.powod.includes('czerwoną'),
  'niedostępny termin pilny niesie powód, a nie znika',
);
sprawdz(
  typeof terminarz.cialo.uwaga === 'string' && terminarz.cialo.uwaga.includes('Karty Pacjenta'),
  'terminarz mówi, że rezerwacja nie jest zgodą na udostępnienie karty',
);

const rezerwacjaPilna = await zapytaj('/api/v1/consultations', {
  token: UCZESTNIK,
  metoda: 'POST',
  cialo: { terminId: 't-2' },
});
sprawdz(rezerwacjaPilna.status === 403, 'pula pilna zamknięta także po stronie serwera');

const rezerwacjaPrzeszla = await zapytaj('/api/v1/consultations', {
  token: UCZESTNIK,
  metoda: 'POST',
  cialo: { terminId: 't-0' },
});
sprawdz(rezerwacjaPrzeszla.status === 400, 'terminu, który minął, nie da się zarezerwować');

const bezTerminu = await zapytaj('/api/v1/consultations', {
  token: UCZESTNIK,
  metoda: 'POST',
  cialo: { cos: 'innego' },
});
sprawdz(bezTerminu.status === 400, 'żądanie bez terminId to 400');

const rezerwacja = await zapytaj('/api/v1/consultations', {
  token: UCZESTNIK,
  metoda: 'POST',
  cialo: { terminId: 't-1', powod: 'Omówienie wyników' },
});
sprawdz(rezerwacja.status === 201, 'termin planowy zarezerwowany');
sprawdz(
  typeof rezerwacja.cialo.uwaga === 'string' && rezerwacja.cialo.uwaga.includes('osobna decyzja'),
  'potwierdzenie rezerwacji rozdziela ją od zgody dla lekarza',
);

const podwojna = await zapytaj('/api/v1/consultations', {
  token: UCZESTNIK,
  metoda: 'POST',
  cialo: { terminId: 't-1' },
});
sprawdz(podwojna.status === 409, 'zajęty termin to konflikt, a nie błędne żądanie');
sprawdz(podwojna.cialo?.blad?.kod === 'konflikt', 'konflikt ma własny kod maszynowy');

const idKonsultacji: string = rezerwacja.cialo.konsultacja.id;

const cudzeOdwolanie = await zapytaj(`/api/v1/consultations/${idKonsultacji}/cancel`, {
  token: HR,
  metoda: 'POST',
});
sprawdz(cudzeOdwolanie.status === 403, 'cudzej konsultacji nie da się odwołać');

const odwolanie = await zapytaj(`/api/v1/consultations/${idKonsultacji}/cancel`, {
  token: UCZESTNIK,
  metoda: 'POST',
});
sprawdz(odwolanie.status === 200, 'uczestnik odwołuje własną konsultację');
sprawdz(odwolanie.cialo.oplataGr === 0, 'odwołanie nie pociąga za sobą opłaty');

const ponowneOdwolanie = await zapytaj(`/api/v1/consultations/${idKonsultacji}/cancel`, {
  token: UCZESTNIK,
  metoda: 'POST',
});
sprawdz(ponowneOdwolanie.status === 409, 'odwołanie odwołanej konsultacji to konflikt');

const poOdwolaniu = await zapytaj('/api/v1/consultations', { token: UCZESTNIK });
sprawdz(
  poOdwolaniu.cialo.terminy.find((t: any) => t.id === 't-1')?.dostepny === true,
  'odwołany termin wraca do puli',
);

// --- marketplace -------------------------------------------------------------

const oferty = await zapytaj('/api/v1/marketplace/offers', { token: UCZESTNIK });
const idOfert = oferty.cialo.oferty.map((o: any) => o.id);
sprawdz(oferty.status === 200, 'katalog ofert wydany');
sprawdz(!idOfert.includes('o-suple'), 'oferta partnera w negocjacjach niewidoczna');
sprawdz(!idOfert.includes('o-prime'), 'oferta spoza pakietu niewidoczna');
sprawdz(
  oferty.cialo.oferty.every(
    (o: any) => typeof o.ujawnienieProwizji === 'string' && o.ujawnienieProwizji.includes('%'),
  ),
  'każda oferta ujawnia prowizję programu',
);

const sauna = oferty.cialo.oferty.find((o: any) => o.id === 'o-sauna');
sprawdz(
  sauna?.ostrzezenia.length === 1 && sauna.ostrzezenia[0].kod === 'FLAG_HYPERTENSION',
  'przeciwwskazanie daje ostrzeżenie przy ofercie',
);
sprawdz(
  sauna?.ostrzezenia[0].tresc.includes('lekarzem'),
  'ostrzeżenie prowadzi do lekarza, a nie ukrywa oferty',
);

const zamowienieSpozaKatalogu = await zapytaj('/api/v1/marketplace/orders', {
  token: UCZESTNIK,
  metoda: 'POST',
  cialo: { ofertaId: 'o-suple' },
});
sprawdz(
  zamowienieSpozaKatalogu.status === 404,
  'oferty niewidocznej w katalogu nie da się zamówić po identyfikatorze',
);

const zamowienie = await zapytaj('/api/v1/marketplace/orders', {
  token: UCZESTNIK,
  metoda: 'POST',
  cialo: { ofertaId: 'o-panel' },
});
sprawdz(zamowienie.status === 201, 'zamówienie złożone');
sprawdz(
  zamowienie.cialo.zamowienie.prowizjaGr === 3900 && zamowienie.cialo.zamowienie.prowizjaPct === 10,
  'prowizja policzona i zamrożona na zamówieniu',
);
sprawdz(
  zamowienie.cialo.ladunekPartnera.kodOdbioru === 'psd-8fa2',
  'partner dostaje kod odbioru, a nie tożsamość',
);
sprawdz(
  !JSON.stringify(zamowienie.cialo.ladunekPartnera).includes('healthScore') &&
    !JSON.stringify(zamowienie.cialo.ladunekPartnera).includes('org-alfa'),
  'ładunek dla partnera nie niesie danych zdrowotnych ani pracodawcy',
);

const zamowieniePonownie = await zapytaj('/api/v1/marketplace/orders', {
  token: UCZESTNIK,
  metoda: 'POST',
  cialo: { ofertaId: 'o-panel' },
});
sprawdz(zamowieniePonownie.status === 409, 'powtórzone zamówienie tego samego dnia to konflikt');

const mojeZamowienia = await zapytaj('/api/v1/marketplace/orders', { token: UCZESTNIK });
sprawdz(mojeZamowienia.cialo.zamowienia.length === 1, 'uczestnik widzi własne zamówienia');

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
sprawdz(
  rejestr.cialo.wpisy.every((w: any) => typeof w.opis === 'string' && !w.opis.includes('_')),
  'rejestr nazywa akcje zdaniem, nie kodem z bazy',
);
sprawdz(
  rejestr.cialo.wpisy.some((w: any) => w.akcja === 'zamowienie_marketplace'),
  'zamówienie u partnera jest widoczne w rejestrze uczestnika',
);
sprawdz(
  rejestr.cialo.wpisy.some((w: any) => w.akcja === 'odwolanie_konsultacji'),
  'odwołana konsultacja nie znika z rejestru',
);

// --- wycofanie zgody a dostęp do lekarza i katalogu --------------------------
//
// Najważniejsze sprawdzenie w tej sekcji jest negatywne: wycofanie zgody na
// przetwarzanie danych zdrowotnych **nie może** odciąć nikogo od umówienia
// wizyty. Kara za skorzystanie z prawa jest zaprzeczeniem tego prawa.

await zapytaj('/api/v1/me/consents/dane_zdrowotne', {
  token: UCZESTNIK,
  metoda: 'POST',
  cialo: { udzielona: false },
});

const terminarzBezZgody = await zapytaj('/api/v1/consultations', { token: UCZESTNIK });
sprawdz(terminarzBezZgody.status === 200, 'terminarz działa po wycofaniu zgody zdrowotnej');
sprawdz(
  terminarzBezZgody.cialo.terminy.some((t: any) => t.rodzaj === 'planowy' && t.dostepny),
  'wycofanie zgody nie odcina od terminów planowych',
);
sprawdz(
  terminarzBezZgody.cialo.pulaPilnaOcenionaZeZgody === false,
  'odpowiedź mówi wprost, że pula pilna nie została oceniona',
);

const ofertyBezZgody = await zapytaj('/api/v1/marketplace/offers', { token: UCZESTNIK });
sprawdz(
  ofertyBezZgody.cialo.ostrzezeniaPoliczone === false &&
    ofertyBezZgody.cialo.oferty.every((o: any) => o.ostrzezenia.length === 0),
  'bez zgody nie zgadujemy ostrzeżeń — i mówimy, że ich nie policzyliśmy',
);

await zapytaj('/api/v1/me/consents/dane_zdrowotne', {
  token: UCZESTNIK,
  metoda: 'POST',
  cialo: { udzielona: true },
});

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
