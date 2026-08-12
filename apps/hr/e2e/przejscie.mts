/**
 * Przejście przez panel HR.
 *
 * Najważniejsze sprawdzenie jest negatywne: żaden identyfikator uczestnika
 * nie może pojawić się w kodzie strony — ani na statystykach, ani na
 * rozliczeniach. Testy jednostkowe pilnują tego na wyniku funkcji; tutaj
 * sprawdzamy to na tym, co faktycznie dociera do przeglądarki.
 */

import { chromium, type Page } from 'playwright';

const baseUrl = arg('--url') ?? 'http://127.0.0.1:3101';
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

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: process.env.CHROMIUM_NO_SANDBOX === '1' ? ['--no-sandbox'] : [],
});
const context = await browser.newContext({ viewport: { width: 980, height: 1200 } });
const page = await context.newPage();

try {
  await page.goto(baseUrl);
  await zrzut(page, '01-wybor-zakladu');
  sprawdz(await page.locator('.pasek-prototyp').isVisible(), 'ostrzeżenie o danych syntetycznych');

  await page.check('input[value="zaklad-polnoc"]');
  await page.click('button[type="submit"]');
  await page.waitForSelector('.kafel-wartosc', { timeout: 30_000 });
  sprawdz(true, 'wybór zakładu otwiera statystyki');
  await zrzut(page, '02-statystyki');

  const liczebnosc = (await page.locator('.kafel-wartosc').first().innerText()).trim();
  sprawdz(/^\d+-\d+$/u.test(liczebnosc), `liczebność podana jako przedział (${liczebnosc})`);

  // Rozkład wyniku zdrowia.
  await page.goto(`${baseUrl}/dashboard?metric=rozklad_health_score`);
  await page.waitForSelector('.slupek', { timeout: 30_000 });
  sprawdz((await page.locator('.slupek').count()) === 4, 'rozkład wyniku w czterech przedziałach');

  const udzialy = await page.locator('.slupek-naglowek strong').allInnerTexts();
  sprawdz(
    udzialy.every((tekst) => Number(tekst.replace('%', '')) % 5 === 0),
    'udziały zaokrąglone do pełnych pięciu punktów',
  );

  // Mały dział — wynik musi zostać wstrzymany z wyjaśnieniem.
  await page.goto(`${baseUrl}/dashboard?metric=uczestnictwo&unitId=biuro`);
  await page.waitForSelector('.wstrzymane, .kafel-wartosc', { timeout: 30_000 });
  sprawdz(await page.locator('.wstrzymane').isVisible(), 'mały dział nie pokazuje wyniku');
  sprawdz(
    (await page.locator('.wstrzymane').innerText()).includes('dziesięć') ||
      (await page.locator('.wstrzymane').innerText()).includes('10'),
    'wstrzymanie jest wyjaśnione, nie milczące',
  );
  await zrzut(page, '03-wstrzymane');

  // Krzyżowanie filtrów też musi trafić na próg.
  await page.goto(`${baseUrl}/dashboard?metric=uczestnictwo&unitId=utrzymanie&ageBand=18-29&sex=K`);
  await page.waitForSelector('.wstrzymane, .kafel-wartosc', { timeout: 30_000 });
  sprawdz(await page.locator('.wstrzymane').isVisible(), 'krzyżowanie filtrów zatrzymane');

  // Rozliczenia.
  await page.goto(`${baseUrl}/rozliczenia`);
  await page.waitForSelector('table', { timeout: 30_000 });
  const rozliczenia = await page.content();
  sprawdz(rozliczenia.includes('NZ/2026-09'), 'nota zbiorcza z linii A wystawiona');
  sprawdz(rozliczenia.includes('FV/2026-09'), 'faktura z linii C wystawiona');
  sprawdz(rozliczenia.includes('nie zawiera'), 'nota zbiorcza informuje o braku listy osób');
  sprawdz(rozliczenia.includes('przed interpretacją'), 'ostrzeżenie o stawce sprzed interpretacji');
  await zrzut(page, '04-rozliczenia');

  // Dziennik dostępu.
  await page.goto(`${baseUrl}/dziennik`);
  await page.waitForSelector('table', { timeout: 30_000 });
  const dziennik = await page.content();
  sprawdz(dziennik.includes('unitId=biuro'), 'dziennik zapisał filtry, nie tylko fakt wejścia');
  sprawdz(dziennik.includes('wstrzymano'), 'dziennik odnotował wstrzymane zapytania');
  await zrzut(page, '05-dziennik');

  // Sprawdzenie negatywne — na żadnej stronie nie ma identyfikatora uczestnika.
  const strony = [
    '/dashboard',
    '/dashboard?metric=rozklad_health_score',
    '/dashboard?metric=wyzwania',
    '/rozliczenia',
    '/dziennik',
  ];

  let wyciek = false;
  for (const sciezka of strony) {
    await page.goto(`${baseUrl}${sciezka}`);
    const tresc = await page.content();
    if (/psd-\d{4}/u.test(tresc)) {
      wyciek = true;
      kroki.push(`BŁĄD identyfikator uczestnika na stronie ${sciezka}`);
    }
  }
  sprawdz(!wyciek, 'żadna strona nie ujawnia identyfikatora uczestnika');

  // Rozdział organizacji: przełączenie zakładu zmienia dane.
  await page.goto(baseUrl);
  await page.check('input[value="zaklad-poludnie"]');
  await page.click('button[type="submit"]');
  // Kotwica musi być unikalna dla stanu docelowego — samo `h1` istnieje też
  // na stronie, z której wychodzimy, więc asercja trafiłaby na stary DOM.
  const przelaczone = await page
    .waitForSelector('h1:has-text("Południe")', { timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  sprawdz(przelaczone, 'przełączenie zakładu zmienia zakres danych');
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
