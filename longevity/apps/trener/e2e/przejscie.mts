/**
 * Przejście przez panel trenera.
 *
 * Panel operuje na jedynej imiennej liście w systemie, więc oprócz sprawdzeń
 * funkcjonalnych są tu dwa negatywne: czy na liście nie ma pełnych nazwisk
 * i czy trener nie otworzy cudzego warsztatu po samym adresie.
 */

import { chromium, type Page } from 'playwright';

const baseUrl = arg('--url') ?? 'http://127.0.0.1:3102';
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

const PELNE_NAZWISKA = [
  'Kowalska',
  'Nowak',
  'Wójcik',
  'Zielińska',
  'Lewandowski',
  'Kamińska',
  'Szymański',
  'Woźniak',
  'Dąbrowska',
  'Mazur',
  'Krawczyk',
  'Piotrowski',
];

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: process.env.CHROMIUM_NO_SANDBOX === '1' ? ['--no-sandbox'] : [],
});
const context = await browser.newContext({ viewport: { width: 960, height: 1200 } });
const page = await context.newPage();

try {
  await page.goto(baseUrl);
  await zrzut(page, '01-wybor-trenera');

  await page.check('input[value="t-kowal"]');
  await page.click('button[type="submit"]');
  await page.waitForSelector('.warsztat-wiersz', { timeout: 30_000 });

  const warsztaty = await page.locator('.warsztat-wiersz').count();
  sprawdz(warsztaty === 4, `trener widzi wyłącznie swoje warsztaty (${warsztaty} z 5)`);
  sprawdz(!(await page.content()).includes('Aktywność w ciągu dnia'), 'cudzy warsztat nie jest listowany');
  await zrzut(page, '02-warsztaty');

  const stany = await page.locator('.stan').allInnerTexts();
  sprawdz(stany.includes('zakończony'), 'warsztat po terminie oznaczony jako zakończony');
  sprawdz(stany.includes('w trakcie'), 'warsztat trwający oznaczony');
  sprawdz(stany.includes('odwołany'), 'warsztat odwołany oznaczony');

  // Warsztat przed startem — obecność zablokowana z wyjaśnieniem.
  await page.goto(`${baseUrl}/warsztaty/w-stres-09`);
  await page.waitForSelector('.lista-obecnosci', { timeout: 30_000 });
  sprawdz(await page.locator('.wstrzymane').isVisible(), 'przed startem obecność jest zablokowana');
  sprawdz(
    (await page.locator('.wstrzymane').innerText()).includes('nie jest listą obecności'),
    'blokada jest wyjaśniona',
  );
  sprawdz(
    (await page.locator('input[type="radio"][disabled]').count()) > 0,
    'pola wyboru są nieaktywne',
  );
  await zrzut(page, '03-przed-startem');

  // Warsztat zakończony — odnotowanie obecności.
  await page.goto(`${baseUrl}/warsztaty/w-erg-09`);
  await page.waitForSelector('.lista-obecnosci', { timeout: 30_000 });

  const lista = await page.content();
  const wyciekle = PELNE_NAZWISKA.filter((nazwisko) => lista.includes(nazwisko));
  sprawdz(wyciekle.length === 0, `lista nie pokazuje pełnych nazwisk${wyciekle.length > 0 ? ` (${wyciekle.join(', ')})` : ''}`);
  sprawdz(lista.includes('Anna K.'), 'lista pokazuje imię z inicjałem');

  const etykiety = await page.locator('.osoba-etykieta').allInnerTexts();
  const anny = etykiety.filter((etykieta) => etykieta.startsWith('Anna'));
  sprawdz(anny.length >= 2, 'na liście są osoby o tym samym imieniu');

  const kody = await page.locator('.osoba-kod').allInnerTexts();
  sprawdz(new Set(kody).size === kody.length, 'kody uczestników są unikalne');
  await zrzut(page, '04-lista-obecnosci');

  // Zaznaczamy obecność i zapisujemy.
  const pozycje = await page.locator('.lista-obecnosci li').count();
  for (let i = 0; i < pozycje; i += 1) {
    const wartosc = i < pozycje - 2 ? 'obecny' : 'nieobecny';
    await page.locator('.lista-obecnosci li').nth(i).locator(`input[value="${wartosc}"]`).check();
  }
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);

  await page.goto(`${baseUrl}/warsztaty`);
  await page.waitForSelector('.warsztat-wiersz', { timeout: 30_000 });
  sprawdz((await page.content()).includes('frekwencja'), 'frekwencja policzona po zapisaniu listy');

  // Poprawka odnotowanej obecności zostawia ślad.
  await page.goto(`${baseUrl}/warsztaty/w-erg-09`);
  await page.waitForSelector('.lista-obecnosci', { timeout: 30_000 });
  await page.locator('.lista-obecnosci li').first().locator('input[value="nieobecny"]').check();
  await page.click('button[type="submit"]');
  await page.waitForSelector('.karta h2', { timeout: 30_000 });
  sprawdz((await page.content()).includes('Poprawki'), 'poprawka zostawia ślad w rejestrze');
  await zrzut(page, '05-poprawka');

  // Rozliczenie.
  await page.goto(`${baseUrl}/rozliczenie`);
  await page.waitForSelector('table', { timeout: 30_000 });
  const rozliczenie = await page.content();
  sprawdz(rozliczenie.includes('czeka na listę obecności'), 'pozycja bez obecności jest wstrzymana');
  sprawdz(rozliczenie.includes('odwołany'), 'warsztat odwołany widoczny w rozliczeniu');
  sprawdz(
    !PELNE_NAZWISKA.some((nazwisko) => rozliczenie.includes(nazwisko)),
    'rozliczenie nie zawiera danych osobowych uczestników',
  );
  await zrzut(page, '06-rozliczenie');

  // Cudzy warsztat po adresie — odmowa, nie pusta lista.
  await page.goto(`${baseUrl}/warsztaty/w-obcy-09`);
  await page.waitForSelector('h1', { timeout: 30_000 });
  const obcy = await page.content();
  sprawdz(obcy.includes('Brak dostępu'), 'cudzy warsztat kończy się odmową');
  sprawdz(
    !PELNE_NAZWISKA.some((nazwisko) => obcy.includes(nazwisko)),
    'strona odmowy nie ujawnia listy',
  );
  await zrzut(page, '07-odmowa');
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
