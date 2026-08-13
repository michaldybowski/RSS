/**
 * Przejście przez panel jak użytkownik — weryfikacja end-to-end.
 *
 * Sprawdza to, czego testy jednostkowe nie zobaczą: czy formularze faktycznie
 * zapisują odpowiedzi, czy logika warunkowa odsłania pytania w przeglądarce,
 * czy walidacja zatrzymuje przejście dalej i czy dokumenty da się pobrać.
 *
 * Uruchomienie (panel musi już działać):
 *   npx next start -p 3100
 *   node --import tsx e2e/przejscie.mts --url http://127.0.0.1:3100 --zrzuty ./zrzuty
 */

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { chromium, type Page } from 'playwright';

const baseUrl = arg('--url') ?? 'http://127.0.0.1:3100';
const shotsDir = arg('--zrzuty');

/** Komplet poprawnych odpowiedzi, krok po kroku. */
const ODPOWIEDZI: Readonly<Record<number, Readonly<Record<string, string | string[]>>>> = {
  1: {
    d1_wiek: '42',
    d1_plec: 'M',
    d1_choroby_przewlekle: ['brak'],
    d1_zaburzenia_odzywiania: 'nie',
    d1_omdlenia: 'nie',
    d1_bol_w_klatce: 'nie',
    d1_chrapanie: 'nie',
    d1_zmeczenie_dzienne: 'nie',
    d1_historia_rodzinna: ['brak'],
    d1_kontuzje: 'nie',
  },
  2: {
    d2_leki_metaboliczne: ['brak'],
    d2_leki_nadcisnienie: 'nie',
    d2_leki_psychotropowe: 'nie',
    d2_leki_tarczyca: 'nie',
    d2_kawa_dziennie: '2',
    d2_alkohol: 'okazjonalnie',
    d2_nikotyna: 'nie',
  },
  3: { d3_waga: '84', d3_wzrost: '180', d3_talia: '92', d3_biodra: '102', d3_waga_stabilna: 'tak' },
  4: {
    d4_posilki_dziennie: '4',
    d4_sniadania: 'tak',
    d4_dieta: 'bez_ograniczen',
    d4_woda: '2-3l',
    d4_warzywa_porcje: '5',
    d4_problemy_gi: ['brak'],
    d4_budzet: 'umiarkowany',
  },
  5: {
    d5_trening_dni: '3',
    d5_kroki: '9000',
    d5_doswiadczenie: 'sredni',
    d5_sprzet: ['hantle', 'mata'],
    d5_czas_sesji: '45',
    d5_dni_dostepne: '4',
    d5_okna_czasowe: ['rano', 'po_pracy'],
    d5_ograniczenia_ruchowe: ['brak'],
  },
  6: {
    d6_godziny_sen: '7.5',
    d6_jakosc: '4',
    d6_wybudzenia: '0',
    d6_ekrany_przed_snem: 'tak',
    d6_drzemki: 'nie',
  },
  7: {
    d7_poziom_stresu: '4',
    d7_zrodla: ['praca'],
    d7_coping: ['ruch'],
    d7_diagnoza_psychologiczna: 'nie',
  },
  8: { d8_tryb_pracy: 'hybrydowy', d8_dzieci: 'tak', d8_podroze_sluzbowe: 'rzadko' },
  9: {
    d9_data_badan: '2026-05-10',
    d9_glukoza: '92',
    d9_hba1c: '5.3',
    d9_insulina: '7',
    d9_ldl: '110',
    d9_hdl: '52',
    d9_trojglicerydy: '120',
    d9_witamina_d: '34',
    d9_ferrytyna: '90',
    d9_tsh: '1.8',
    d9_crp: '1.1',
    d9_profilaktyka_aktualna: 'tak',
  },
  10: {
    d10_cel_glowny: ['redukcja_masy', 'poprawa_snu'],
    d10_format_planu: 'elastyczny',
    d10_horyzont: '6m',
  },
};

const kroki: string[] = [];
let bledy = 0;

function sprawdz(warunek: boolean, opis: string): void {
  kroki.push(`${warunek ? 'OK  ' : 'BŁĄD'} ${opis}`);
  if (!warunek) bledy += 1;
}

async function wypelnij(page: Page, dane: Readonly<Record<string, string | string[]>>): Promise<void> {
  for (const [code, value] of Object.entries(dane)) {
    const values = Array.isArray(value) ? value : [value];
    const field = page.locator(`[name="${code}"]`).first();
    const type = await field.getAttribute('type');

    if (type === 'radio' || type === 'checkbox') {
      for (const item of values) await page.check(`[name="${code}"][value="${item}"]`);
    } else {
      await page.fill(`[name="${code}"]`, values[0]!);
    }
  }
}

async function zrzut(page: Page, nazwa: string): Promise<void> {
  if (shotsDir === undefined) return;
  await page.screenshot({ path: join(shotsDir, `${nazwa}.png`), fullPage: true });
}

/**
 * Akcja serwerowa robi POST i przekierowanie, a kliknięcie wraca zanim
 * przeglądarka dojedzie pod nowy adres. Bez jawnego czekania sprawdzalibyśmy
 * stan poprzedniej strony i test przechodziłby z fałszywym wynikiem.
 */
/**
 * Wysyła formularz i czeka na element, który ma się pojawić po akcji.
 *
 * Sam `networkidle` nie wystarcza: akcja serwerowa kończy się nawigacją po
 * stronie klienta, a asercja potrafi wykonać się jeszcze na poprzednim DOM-ie
 * i przejść albo polec z fałszywego powodu.
 */
async function wyslij(page: Page, oczekiwane: string): Promise<void> {
  await page.click('button[type="submit"]');
  await page.waitForSelector(oczekiwane, { timeout: 30_000, state: 'attached' });
}

/** Pierwsze pole danego kroku — kotwica, po której poznajemy, że krok się otworzył. */
function kotwica(step: number): string {
  return `[name="${Object.keys(ODPOWIEDZI[step]!)[0]!}"]`;
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: process.env.CHROMIUM_NO_SANDBOX === '1' ? ['--no-sandbox'] : [],
});
const context = await browser.newContext({ viewport: { width: 900, height: 1100 } });
const page = await context.newPage();

if (shotsDir !== undefined) await mkdir(shotsDir, { recursive: true });

try {
  // Krok 0 — zgody.
  await page.goto(baseUrl);
  await zrzut(page, '01-zgody');
  sprawdz(await page.locator('.pasek-prototyp').isVisible(), 'ostrzeżenie o danych syntetycznych widoczne');

  // Bez zgód nie wolno przejść dalej. Stan sygnalizujemy treścią strony,
  // nie parametrem w adresie — inaczej ścieżka bez JavaScriptu gubi komunikat.
  await wyslij(page, '.blad');
  sprawdz(await page.locator('.blad').isVisible(), 'brak zgód zatrzymuje na stronie startowej');

  for (const code of ['regulamin', 'dane_zdrowotne', 'przetwarzanie_ai']) {
    await page.check(`[name="${code}"]`);
  }
  await wyslij(page, kotwica(1));
  sprawdz(
    (await page.locator('[name="d1_wiek"]').count()) === 1,
    'komplet zgód otwiera kwestionariusz',
  );

  // Pierwsza warstwa: przeglądarka blokuje wartość spoza zakresu jeszcze
  // przed wysłaniem, bo pole niesie atrybuty min/max z definicji pytania.
  await wypelnij(page, { ...ODPOWIEDZI[1]!, d1_wiek: '5' });
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1500);
  sprawdz(
    (await page.locator('[name="d1_wiek"]').count()) === 1,
    'wiek poza zakresem zatrzymuje przejście po stronie przeglądarki',
  );
  sprawdz(
    !(await page.locator('[name="d1_wiek"]').evaluate((el: HTMLInputElement) => el.checkValidity())),
    'pole jest oznaczone jako niepoprawne',
  );
  await zrzut(page, '02-walidacja');

  // Logika warunkowa: opis kontuzji pojawia się dopiero po odpowiedzi twierdzącej.
  sprawdz(
    (await page.locator('[name="d1_kontuzje_opis"]').count()) === 0,
    'pytanie warunkowe ukryte przy odpowiedzi przeczącej',
  );

  // Kolejność ma znaczenie: `wypelnij` ustawia kontuzje na "nie", więc
  // zaznaczenie "tak" musi nastąpić po nim, a nie przed.
  await wypelnij(page, ODPOWIEDZI[1]!);
  await page.check('[name="d1_kontuzje"][value="tak"]');
  await wyslij(page, kotwica(2));

  await page.goto(`${baseUrl}/kwestionariusz/1`);
  sprawdz(
    (await page.locator('[name="d1_kontuzje_opis"]').count()) === 1,
    'pytanie warunkowe odsłania się po odpowiedzi twierdzącej',
  );

  // Wracamy do odpowiedzi bez kontuzji i przechodzimy cały kwestionariusz.
  await page.check('[name="d1_kontuzje"][value="nie"]');
  await wyslij(page, kotwica(2));

  for (const step of [2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    sprawdz((await page.locator(kotwica(step)).count()) > 0, `krok ${step} otwarty`);
    await wypelnij(page, ODPOWIEDZI[step]!);

    if (step === 5) await zrzut(page, '03-kwestionariusz');

    if (step === 10) {
      // Druga warstwa: limit trzech celów to reguła, której przeglądarka nie
      // zna — pole wielokrotnego wyboru nie ma natywnego ograniczenia liczby.
      // Musi ją złapać serwer.
      for (const cel of ['kondycja', 'wiecej_energii']) {
        await page.check(`[name="d10_cel_glowny"][value="${cel}"]`);
      }
      await wyslij(page, '.blad');
      sprawdz(
        await page.locator('.blad').isVisible(),
        'przekroczony limit celów zatrzymuje przejście po stronie serwera',
      );
      sprawdz(
        (await page.locator('.blad').innerText()).includes('maksymalnie'),
        'komunikat serwera mówi, na czym polega problem',
      );

      for (const cel of ['kondycja', 'wiecej_energii']) {
        await page.uncheck(`[name="d10_cel_glowny"][value="${cel}"]`);
      }
      // Kotwica musi być unikalna dla strony docelowej — sam przycisk
      // wysyłania istnieje też na kroku, z którego wychodzimy.
      await wyslij(page, 'h1:has-text("Wszystko gotowe")');
      continue;
    }

    await wyslij(page, kotwica(step + 1));
  }

  sprawdz(
    (await page.locator('h1').innerText()).includes('Wszystko gotowe'),
    'po ostatnim kroku trafiamy na podsumowanie',
  );
  await zrzut(page, '04-podsumowanie');

  await wyslij(page, '.wynik-liczba');
  sprawdz((await page.locator('.wynik-liczba').count()) === 1, 'wynik wygenerowany');
  await zrzut(page, '05-wynik');

  const score = Number((await page.locator('.wynik-liczba').innerText()).trim());
  sprawdz(score > 0 && score <= 100, `Health Score w zakresie (${score})`);
  sprawdz(
    (await page.locator('.kategoria').innerText()).trim() === 'ZIELONA',
    'kategoria ryzyka ZIELONA dla zdrowego profilu',
  );
  sprawdz((await page.locator('.skladowa-naglowek').count()) === 6, 'sześć składowych wyniku');
  sprawdz(await page.locator('table').first().isVisible(), 'harmonogram tygodnia pokazany');

  // Dokumenty.
  for (const [format, sygnatura] of [
    ['html', '<!DOCTYPE html'],
    ['ics', 'BEGIN:VCALENDAR'],
  ] as const) {
    const response = await context.request.get(`${baseUrl}/dokumenty/${format}`);
    const body = await response.text();
    sprawdz(response.ok() && body.startsWith(sygnatura), `dokument ${format} do pobrania`);
  }

  for (const format of ['docx', 'pdf'] as const) {
    const response = await context.request.get(`${baseUrl}/dokumenty/${format}`);
    const buffer = await response.body();
    const sygnatura = format === 'docx' ? 'PK' : '%PDF-';
    sprawdz(
      response.ok() && buffer.subarray(0, sygnatura.length).toString('latin1') === sygnatura,
      `dokument ${format} do pobrania (${buffer.length} B)`,
    );
  }

  // Dokumenty z danymi zdrowotnymi nie mogą trafić do pamięci podręcznej.
  const naglowki = (await context.request.get(`${baseUrl}/dokumenty/html`)).headers();
  sprawdz(
    (naglowki['cache-control'] ?? '').includes('no-store'),
    'dokumenty oznaczone jako niebuforowalne',
  );
  // --- wyzwania i gamifikacja ----------------------------------------------
  await page.goto(`${baseUrl}/wynik`);
  await page.click('a:has-text("Przejdź do wyzwań")');
  await page.waitForSelector('h1:has-text("Wyzwania")', { timeout: 30_000 });

  const wyzwania = await page.content();
  sprawdz(wyzwania.includes('10 tysięcy kroków'), 'katalog wyzwań otwarty');
  sprawdz(
    Number((await page.locator('.wynik-liczba').innerText()).trim()) > 0,
    'punkty policzone z historii pomiarów',
  );

  // Wyzwanie spoza pakietu zostaje na liście razem z powodem.
  sprawdz(wyzwania.includes('Protokół regeneracji PRIME'), 'wyzwanie spoza pakietu widoczne');
  sprawdz(wyzwania.includes('Wyzwanie wstrzymane'), 'niedostępne wyzwanie ma jawny powód');

  // Ranking: próg k odcina mały zespół razem z nazwą.
  sprawdz(wyzwania.includes('Produkcja') && wyzwania.includes('Biuro'), 'zespoły powyżej progu w rankingu');
  sprawdz(!wyzwania.includes('Serwis'), 'zespół poniżej progu nie jest nazwany');
  sprawdz(!/psd-(prod|biuro|serwis)-/u.test(wyzwania), 'ranking nie ujawnia pseudonimów innych osób');
  await zrzut(page, '06-wyzwania');

  // Dołączenie do wyzwania i wpis dzienny.
  await page.click('.wyzwanie:has-text("Dwa litry wody") button:has-text("Dołącz")');
  // Czekamy na link w karcie tego konkretnego wyzwania — ogólne
  // „Otwórz — jesteś zapisany" jest na stronie od początku, przy krokach,
  // więc oczekiwanie na nie przechodziłoby przed przeładowaniem.
  await page.waitForSelector('.wyzwanie:has-text("Dwa litry wody") a:has-text("Otwórz")', {
    timeout: 30_000,
  });
  sprawdz(true, 'zapis do nowego wyzwania widoczny w jego karcie');

  await page.goto(`${baseUrl}/wyzwania/w-kroki`);
  await page.waitForSelector('h1:has-text("10 tysięcy kroków")', { timeout: 30_000 });
  const szczegoly = await page.content();
  sprawdz(szczegoly.includes('Passa'), 'szczegóły wyzwania z passą');
  sprawdz(szczegoly.includes('urządzenie'), 'historia rozróżnia źródło pomiaru');

  // Wpis poza oknem wstecznym ma wrócić komunikatem, nie stroną błędu.
  await page.fill('#wartosc', '11000');
  await page.fill('#dzien', '2026-07-18');
  await page.click('button:has-text("Zapisz wynik")');
  await page.waitForSelector('.blad', { timeout: 30_000 });
  sprawdz(
    (await page.locator('.blad').innerText()).includes('poza oknem'),
    'ręczne uzupełnianie odległych dni odrzucone z powodem',
  );

  // Wpis za dziś przechodzi i trafia do historii jako ręczny.
  await page.fill('#wartosc', '10500');
  await page.fill('#dzien', '2026-07-26');
  await page.click('button:has-text("Zapisz wynik")');
  await page.waitForSelector('td:has-text("wpis ręczny")', { timeout: 30_000 });
  sprawdz(true, 'wpis dzienny zapisany');
  await zrzut(page, '07-wyzwanie');

  // --- biblioteka ----------------------------------------------------------
  await page.goto(`${baseUrl}/wynik`);
  await page.click('a:has-text("Otwórz bibliotekę")');
  await page.waitForSelector('h1:has-text("Biblioteka")', { timeout: 30_000 });

  const biblioteka = await page.content();
  sprawdz(biblioteka.includes('Higiena snu'), 'katalog biblioteki otwarty');
  sprawdz(biblioteka.includes('Dla Ciebie'), 'propozycje dobrane do słabych obszarów');
  sprawdz(!biblioteka.includes('Protokół regeneracji PRIME'), 'treść spoza pakietu niewidoczna');
  sprawdz(
    !biblioteka.includes('Suplementacja — wersja z 2025'),
    'materiał wycofany zniknął z katalogu',
  );
  await zrzut(page, '08-biblioteka');

  // Filtr po filarze zawęża listę.
  await page.goto(`${baseUrl}/biblioteka?filar=Sen`);
  await page.waitForSelector('h1:has-text("Biblioteka")', { timeout: 30_000 });
  sprawdz(
    !(await page.content()).includes('Rozgrzewka przy biurku'),
    'filtr po filarze zawęża katalog',
  );

  // Materiał spoza pakietu nie otwiera się także z adresu.
  await page.goto(`${baseUrl}/biblioteka/m-prime-01`);
  await page.waitForSelector('h1:has-text("Biblioteka")', { timeout: 30_000 });
  sprawdz(
    (await page.locator('h1').innerText()).trim() === 'Biblioteka',
    'materiał spoza pakietu nie otwiera się z adresu',
  );

  // Materiał o wysokiej intensywności ostrzega, ale się otwiera.
  await page.goto(`${baseUrl}/biblioteka/m-ruch-02`);
  await page.waitForSelector('h1:has-text("Trening interwałowy")', { timeout: 30_000 });
  sprawdz(true, 'materiał o wysokiej intensywności jest dostępny do czytania');

  // --- sprawdzian -----------------------------------------------------------
  await page.goto(`${baseUrl}/biblioteka/m-sen-01`);
  await page.waitForSelector('h2:has-text("Sprawdzian")', { timeout: 30_000 });

  // Dwie błędne odpowiedzi na trzy pytania — poniżej progu.
  await page.check('input[name="pyt_p1"][value="1"]');
  await page.check('input[name="pyt_p2"][value="2"]');
  await page.check('input[name="pyt_p3"][value="1"]');
  await page.click('button:has-text("Sprawdź")');
  await page.waitForSelector('.blad', { timeout: 30_000 });
  const nieudany = await page.content();
  sprawdz(nieudany.includes('spróbuj ponownie'), 'sprawdzian poniżej progu nie zalicza');
  sprawdz(
    nieudany.includes('Światło jest głównym sygnałem'),
    'wynik niesie wyjaśnienia, a nie samą ocenę',
  );

  // Poprawne odpowiedzi zaliczają.
  await page.check('input[name="pyt_p1"][value="0"]');
  await page.check('input[name="pyt_p2"][value="1"]');
  await page.check('input[name="pyt_p3"][value="1"]');
  await page.click('button:has-text("Spróbuj ponownie")');
  await page.waitForSelector('.notka:has-text("sprawdzian zaliczony")', { timeout: 30_000 });
  sprawdz(true, 'powtórne podejście zalicza sprawdzian');
  await zrzut(page, '09-sprawdzian');

  // --- akademia -------------------------------------------------------------
  await page.goto(`${baseUrl}/akademia`);
  await page.waitForSelector('h1:has-text("Akademia")', { timeout: 30_000 });
  const akademia = await page.content();
  sprawdz(akademia.includes('Podstawy długowieczności'), 'ścieżki Akademii widoczne');
  sprawdz(akademia.includes('sprawdzian 100%'), 'zaliczenie sprawdzianem opisane w module');
  sprawdz(
    akademia.includes('materiał wycofany — moduł pominięty'),
    'wycofany materiał jest pominięty, a nie ukryty',
  );

  // Domykamy ścieżkę: pozostałe moduły obowiązkowe.
  for (const materialId of ['m-ruch-01', 'm-zyw-01']) {
    await page.goto(`${baseUrl}/biblioteka/${materialId}`);
    await page.waitForSelector('h1', { timeout: 30_000 });

    if ((await page.locator('button:has-text("Oznacz jako przerobione")').count()) > 0) {
      await page.click('button:has-text("Oznacz jako przerobione")');
      await page.waitForSelector('.notka', { timeout: 30_000 });
    } else {
      await page.check('input[name="pyt_p1"][value="1"]');
      await page.check('input[name="pyt_p2"][value="0"]');
      await page.check('input[name="pyt_p3"][value="1"]');
      await page.click('button:has-text("Sprawdź")');
      await page.waitForSelector('.notka:has-text("sprawdzian zaliczony")', { timeout: 30_000 });
    }
  }

  await page.goto(`${baseUrl}/akademia`);
  await page.waitForSelector('button:has-text("Odbierz zaświadczenie")', { timeout: 30_000 });
  sprawdz(true, 'ścieżka domyka się mimo wycofanego modułu');

  await page.click('button:has-text("Odbierz zaświadczenie")');
  await page.waitForSelector('.notka:has-text("AK/2026/0001")', { timeout: 30_000 });
  const zZaswiadczeniem = await page.content();
  sprawdz(zZaswiadczeniem.includes('AK/2026/0001'), 'zaświadczenie wydane z numerem');
  sprawdz(
    zZaswiadczeniem.includes('pracodawca widzi wyłącznie zestawienia zbiorcze'),
    'zaświadczenie należy do uczestnika',
  );
  await zrzut(page, '10-akademia');
} finally {
  await browser.close();
}

for (const line of kroki) console.log(line);
console.log(`\n${kroki.length - bledy}/${kroki.length} sprawdzeń przeszło`);
process.exit(bledy === 0 ? 0 : 1);

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
