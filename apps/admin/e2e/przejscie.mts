/**
 * Przejście przez panel administratora.
 *
 * Sprawdzenia dzielą się na dwie grupy. Pozytywne: zapowiedź pokazuje różnice,
 * źródło krytyczne nie przechodzi bez potwierdzenia, wnioski i retencja dają
 * się zrealizować. Negatywne — ważniejsze: żadna wartość zdrowotna, nazwisko,
 * e-mail ani token odbioru nie pojawia się na ekranie administratora.
 *
 * UWAGA: przebieg jest jednorazowy. Realizacja wniosku i wykonanie retencji
 * są nieodwracalne, a prototyp trzyma stan w pamięci procesu — przed każdym
 * uruchomieniem serwer trzeba wystartować na nowo.
 */

import { chromium, type Page } from 'playwright';

const baseUrl = arg('--url') ?? 'http://127.0.0.1:3104';
const shotsDir = arg('--zrzuty');

const kroki: string[] = [];
let bledy = 0;

function sprawdz(warunek: boolean, opis: string): void {
  kroki.push(`${warunek ? 'OK  ' : 'BŁĄD'} ${opis}`);
  if (!warunek) bledy += 1;
}

async function zrzut(page: Page, nazwa: string): Promise<void> {
  if (shotsDir === undefined) return;
  await page.screenshot({ path: `${shotsDir}/${nazwa}.png`, fullPage: true });
}

async function zaloguj(page: Page, kontoId: string): Promise<void> {
  await page.goto(baseUrl);
  await page.check(`input[value="${kontoId}"]`);
  await page.click('button[type="submit"]');
  await page.waitForSelector('h1', { timeout: 30_000 });
}

/** Wartości, które w tym panelu nie mają prawa się pojawić. */
const NIEDOZWOLONE = [
  'Kowalska',
  'Nowak',
  'Zielińska',
  'anna.kowalska@example.org',
  'cukrzyca_t2',
  'nadcisnienie',
  'hba1c',
  '1984-03-12',
];

/** Token odbioru ma kształt UUID — nie może trafić na ekran administratora. */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: process.env.CHROMIUM_NO_SANDBOX === '1' ? ['--no-sandbox'] : [],
});
const context = await browser.newContext({ viewport: { width: 1060, height: 1400 } });
const page = await context.newPage();

try {
  // --- rola bez uprawnień administracyjnych ---------------------------------
  await zaloguj(page, 'hr-alfa');
  await page.waitForSelector('.blad', { timeout: 30_000 });
  const hrSync = await page.content();
  sprawdz(hrSync.includes('Wymagana rola administratora'), 'HR dostaje odmowę z powodem');
  sprawdz(!hrSync.includes('Synchronizuj teraz'), 'HR nie widzi przycisku synchronizacji');

  await page.goto(`${baseUrl}/rodo`);
  await page.waitForSelector('.blad', { timeout: 30_000 });
  sprawdz(
    (await page.locator('.blad').first().innerText()).includes('administrator'),
    'wnioski RODO są zamknięte dla HR',
  );
  await zrzut(page, '01-odmowa-hr');

  // --- administrator: zapowiedź --------------------------------------------
  await zaloguj(page, 'adm-1');
  await page.waitForSelector('h1:has-text("Synchronizacja")', { timeout: 30_000 });

  await page.goto(`${baseUrl}/synchronizacja?tryb=pelna&zrodla=cennik,progi_zfss,biblioteka`);
  await page.waitForSelector('.wstrzymane', { timeout: 30_000 });
  const zapowiedz = await page.content();

  // Kwoty muszą być sformatowane. Surowe grosze („89000 → 129000") zmuszałyby
  // zatwierdzającego do przeliczania w pamięci.
  sprawdz(
    zapowiedz.includes('890,00 zł') && zapowiedz.includes('1290,00 zł'),
    'zapowiedź pokazuje kwotę przed i po, w złotych',
  );
  sprawdz(!zapowiedz.includes('>89000<'), 'kwoty nie są pokazywane jako surowe grosze');
  sprawdz(zapowiedz.includes('cen-prime'), 'nowy pakiet jest w zapowiedzi');
  sprawdz(zapowiedz.includes('zniknął w Notion'), 'zniknięcie materiału jest nazwane wprost');
  sprawdz(zapowiedz.includes('odrzucony'), 'wpis z brakującą dopłatą jest odrzucony w zapowiedzi');
  sprawdz(zapowiedz.includes('Zapowiedź wymaga potwierdzenia'), 'źródła krytyczne wymagają potwierdzenia');
  await zrzut(page, '02-zapowiedz');

  // Zapowiedź niczego nie zapisała: cache wciąż ma stan sprzed zmian.
  sprawdz(
    !zapowiedz.includes('Ostatni przebieg'),
    'sama zapowiedź nie tworzy przebiegu synchronizacji',
  );

  // --- próba synchronizacji bez potwierdzenia -------------------------------
  await page.click('button:has-text("Synchronizuj teraz")');
  await page.waitForSelector('.blad', { timeout: 30_000 });
  sprawdz(
    (await page.locator('.blad').first().innerText()).includes('wymaga'),
    'cennik nie przechodzi bez potwierdzenia zapowiedzi',
  );

  // --- potwierdzenie i przebieg --------------------------------------------
  await page.goto(`${baseUrl}/synchronizacja?tryb=pelna&zrodla=cennik,progi_zfss,biblioteka`);
  await page.waitForSelector('button:has-text("Potwierdzam zapowiedź")', { timeout: 30_000 });
  await page.click('button:has-text("Potwierdzam zapowiedź")');
  await page.waitForSelector('h1:has-text("Synchronizacja")', { timeout: 30_000 });

  await page.click('button:has-text("Synchronizuj teraz")');
  await page.waitForSelector('h2:has-text("Ostatni przebieg")', { timeout: 30_000 });
  const poPrzebiegu = await page.content();

  sprawdz(poPrzebiegu.includes('Rekordy odrzucone'), 'odrzucone rekordy są wypisane po przebiegu');
  sprawdz(poPrzebiegu.includes('zf-alfa-3'), 'wskazany jest konkretny rekord do poprawy w Notion');
  await zrzut(page, '03-po-synchronizacji');

  // --- wnioski osób ---------------------------------------------------------
  await page.goto(`${baseUrl}/rodo`);
  await page.waitForSelector('h1:has-text("Wnioski")', { timeout: 30_000 });
  const wnioski = await page.content();
  sprawdz(wnioski.includes('psd-8fa2'), 'wnioski są opisane pseudonimem');
  sprawdz(wnioski.includes('po terminie'), 'wniosek po trzydziestu dniach jest oznaczony jako zaległy');

  await page.click('button:has-text("Przygotuj pakiet do odbioru")');
  await page.waitForSelector('table:below(h2:has-text("Pakiety"))', { timeout: 30_000 });
  const zPakietem = await page.content();
  sprawdz(zPakietem.includes('wn-2026-015'), 'pakiet pojawia się w zestawieniu');
  sprawdz(
    zPakietem.includes('odpowiedzi kwestionariusza ×1'),
    'metadane mówią, ilu rekordów dotyczy pakiet',
  );
  sprawdz(!UUID.test(zPakietem), 'token odbioru nie trafia na ekran administratora');

  await page.click('button:has-text("Wykonaj usunięcie")');
  await page.waitForSelector('h2:has-text("Potwierdzenia usunięcia")', { timeout: 30_000 });
  const poUsunieciu = await page.content();
  sprawdz(
    poUsunieciu.includes('zachowane z ograniczonym dostępem'),
    'potwierdzenie mówi, co zostaje i dlaczego',
  );
  sprawdz(
    poUsunieciu.includes('zachowane bez przypisania do osoby'),
    'audit log zostaje bez przypisania do osoby',
  );
  // Nazwy słowników sprawdzamy w tekście widocznym na ekranie: identyfikatory
  // trafiają też do payloadu RSC przez atrybut `key`, a to nie jest treść
  // pokazywana człowiekowi. Dane osobowe sprawdzamy odwrotnie — w całym HTML,
  // bo payload również jedzie do przeglądarki.
  const tekstUsuniecia = await page.locator('body').innerText();
  sprawdz(
    !tekstUsuniecia.includes('dokument_ksiegowy') && !tekstUsuniecia.includes('tozsamosc'),
    'potwierdzenie dla osoby nie zawiera kodów z bazy',
  );
  sprawdz(poUsunieciu.includes('Zachowano 2 rekordy'), 'komunikat odmienia liczebnik');
  await zrzut(page, '04-rodo');

  // --- retencja -------------------------------------------------------------
  await page.goto(`${baseUrl}/retencja`);
  await page.waitForSelector('h1:has-text("Retencja")', { timeout: 30_000 });
  const retencja = await page.content();
  sprawdz(retencja.includes('agregacja do danych dobowych'), 'agregacja jest odróżniona od usunięcia');
  sprawdz(retencja.includes('psd-31c7'), 'kolejka retencji operuje na pseudonimach');

  await page.click('button:has-text("Wykonaj zadania")');
  await page.waitForSelector('h2:has-text("Wykonane")', { timeout: 30_000 });
  const poRetencji = await page.locator('body').innerText();
  sprawdz(poRetencji.includes('surowe dane z urządzeń'), 'wykonane zadanie jest odnotowane');
  sprawdz(
    !poRetencji.includes('wearables_surowe') && !poRetencji.includes('dziennik_objawow'),
    'rodzaje rekordów są nazwane, a nie pokazane jako kody z bazy',
  );
  await zrzut(page, '05-retencja');

  // --- stan systemu ---------------------------------------------------------
  await page.goto(`${baseUrl}/stan`);
  await page.waitForSelector('h1:has-text("Stan systemu")', { timeout: 30_000 });
  const stan = await page.content();
  sprawdz(stan.includes('0.1.0-draft'), 'wersja zestawu reguł jest widoczna');
  sprawdz(stan.includes('zablokowana'), 'status roboczy jest nazwany blokadą, nie ostrzeżeniem');
  sprawdz(
    stan.includes('CloudFerro') && stan.includes('umowy powierzenia'),
    'rozstrzygnięcie hostingu nie kasuje warunku umowy powierzenia',
  );
  sprawdz(!stan.includes('Bluehost'), 'nieaktualny wariant hostingu zniknął ze stanu systemu');
  await zrzut(page, '06-stan');

  // --- prowizje marketplace -------------------------------------------------
  await page.goto(`${baseUrl}/prowizje`);
  await page.waitForSelector('h1:has-text("Prowizje")', { timeout: 30_000 });
  const prowizje = await page.locator('body').innerText();

  sprawdz(prowizje.includes('Laboratorium Alfa'), 'faktura prowizyjna dla partnera');
  sprawdz(prowizje.includes('48,00 zł'), 'prowizja policzona z zamówień zrealizowanych');
  sprawdz(prowizje.includes('pominięto 2'), 'zamówienia niezrealizowane są pominięte i policzone');
  sprawdz(
    !prowizje.includes('Suplementy Gamma'),
    'partner bez zamówień nie dostaje faktury na zero',
  );
  sprawdz(!/psd-/u.test(prowizje), 'faktura nie zawiera pseudonimów uczestników');
  await zrzut(page, '07-prowizje');

  // --- asercje negatywne na wszystkich stronach -----------------------------
  for (const sciezka of ['/synchronizacja', '/rodo', '/retencja', '/prowizje', '/stan']) {
    await page.goto(baseUrl + sciezka);
    await page.waitForSelector('h1', { timeout: 30_000 });
    const tresc = await page.content();

    for (const zakazane of NIEDOZWOLONE) {
      sprawdz(!tresc.includes(zakazane), `${sciezka} nie ujawnia „${zakazane}"`);
    }
  }
} finally {
  await browser.close();
}

for (const line of kroki) console.log(line);
console.log(`\n${kroki.filter((k) => k.startsWith('OK')).length}/${kroki.length} sprawdzeń przeszło`);
process.exit(bledy === 0 ? 0 : 1);

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
