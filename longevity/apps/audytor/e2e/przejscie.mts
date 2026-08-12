/**
 * Przejście przez panel audytora.
 *
 * Sprawdzenia skupiają się na warunkach wydania certyfikatu: audyt nie może
 * zostać zamknięty z brakami, a certyfikat nie może powstać z audytu, który
 * nie został zamknięty albo nie osiągnął progu.
 *
 * UWAGA: przebieg jest jednorazowy. Zamknięcie audytu i wydanie certyfikatu
 * są nieodwracalne, a prototyp trzyma stan w pamięci procesu — przed każdym
 * uruchomieniem serwer trzeba wystartować na nowo.
 */

import { chromium, type Page } from 'playwright';

const baseUrl = arg('--url') ?? 'http://127.0.0.1:3103';
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

/** Kryteria wymagające dowodu — z definicji schematu. */
const Z_DOWODEM = ['e1', 'e2', 'e3', 'p1', 'p2', 'p3', 'o1', 'o2', 'o3', 'o4'];
const WSZYSTKIE = [...Z_DOWODEM, 'e4', 'r1', 'r2', 'r3'];

async function zaznacz(page: Page, id: string, ocena: string): Promise<void> {
  await page.check(`input[name="oc_${id}"][value="${ocena}"]`);
}

/**
 * Zapis arkusza i czekanie na potwierdzenie w DOM.
 *
 * Samo kliknięcie wraca przed przeładowaniem, więc asercja trafiałaby na stan
 * sprzed zapisu i przechodziła albo padała z niewłaściwego powodu.
 */
async function zapisz(page: Page, potwierdzenie: string): Promise<void> {
  await page.click('button:has-text("Zapisz ustalenia")');
  await page.waitForSelector(potwierdzenie, { timeout: 30_000 });
}

/**
 * Potwierdzeniem zapisu nie może być stan pola, które sam zaznaczyłem —
 * `:checked` jest prawdziwe od razu po kliknięciu, więc oczekiwanie kończy się
 * przed przeładowaniem i asercja czyta poprzedni render.
 */

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: process.env.CHROMIUM_NO_SANDBOX === '1' ? ['--no-sandbox'] : [],
});
const context = await browser.newContext({ viewport: { width: 980, height: 1300 } });
const page = await context.newPage();

try {
  await page.goto(baseUrl);
  await page.check('input[value="aud-welenc"]');
  await page.click('button[type="submit"]');
  await page.waitForSelector('h1:has-text("Audyty")', { timeout: 30_000 });
  sprawdz((await page.content()).includes('Zakład Północ'), 'lista audytów otwarta');
  await zrzut(page, '01-audyty');

  // Cudzy audyt — tryb odczytu, nie ukryta strona.
  await page.goto(`${baseUrl}/audyty/a-poludnie-2026`);
  await page.waitForSelector('.karta', { timeout: 30_000 });
  const cudzy = await page.content();
  sprawdz(cudzy.includes('Arkusz jest widoczny w trybie odczytu'), 'cudzy audyt tylko do odczytu');
  sprawdz(
    (await page.locator('input[name^="oc_"]:not([disabled])').count()) === 0,
    'w cudzym audycie pola są nieaktywne',
  );
  sprawdz(!cudzy.includes('Zapisz ustalenia'), 'brak przycisku zapisu w cudzym audycie');
  await zrzut(page, '02-cudzy-audyt');

  // Własny audyt — częściowe wypełnienie.
  await page.goto(`${baseUrl}/audyty/a-polnoc-2026`);
  await page.waitForSelector('input[name="oc_e1"]', { timeout: 30_000 });

  await zaznacz(page, 'e1', 'spelnione');
  await zaznacz(page, 'e2', 'spelnione');
  await zapisz(page, 'label.dowod.wymagany');

  const czesciowe = await page.content();
  sprawdz(czesciowe.includes('Audyt nie jest gotowy'), 'niekompletny audyt blokuje zamknięcie');
  sprawdz(czesciowe.includes('ocena pozytywna bez dowodu'), 'brak dowodu jest nazwany wprost');
  sprawdz(czesciowe.includes('brak oceny'), 'brakujące oceny są wyliczone');
  sprawdz(!czesciowe.includes('Zamknij audyt'), 'przycisk zamknięcia niedostępny');
  await zrzut(page, '03-braki');

  // Komplet ocen, ale nadal bez dowodów.
  for (const id of WSZYSTKIE) await zaznacz(page, id, 'spelnione');
  await zapisz(page, '.wstrzymane li:nth-child(10)');
  sprawdz(
    !(await page.content()).includes('Zamknij audyt'),
    'komplet ocen bez dowodów nadal nie pozwala zamknąć',
  );

  // Dowody dla kryteriów, które ich wymagają.
  for (const id of Z_DOWODEM) await page.check(`input[name="dw_${id}"]`);
  await zapisz(page, 'button:has-text("Zamknij audyt")');
  sprawdz(true, 'komplet ocen i dowodów odblokowuje zamknięcie');

  const wynik = await page.locator('.poziom').first().innerText();
  sprawdz(wynik.includes('złoty'), `wynik pełny daje poziom złoty (${wynik})`);
  await zrzut(page, '04-gotowy');

  // Mapowanie ESRS.
  sprawdz((await page.content()).includes('S1-14'), 'mapowanie na ESRS widoczne');

  // Zamknięcie i wydanie certyfikatu.
  await page.click('button:has-text("Zamknij audyt")');
  await page.waitForSelector('button:has-text("Wydaj certyfikat")', { timeout: 30_000 });
  const zamkniety = await page.content();
  sprawdz(zamkniety.includes('zamknięty'), 'audyt oznaczony jako zamknięty');
  sprawdz(
    (await page.locator('input[name^="oc_"]:not([disabled])').count()) === 0,
    'zamknięty audyt nie przyjmuje zmian',
  );

  await page.click('button:has-text("Wydaj certyfikat")');
  await page.waitForSelector('.notka', { timeout: 30_000 });
  const zCertyfikatem = await page.content();
  sprawdz(zCertyfikatem.includes('PD/2026/0001'), 'certyfikat wydany z numerem');
  sprawdz(zCertyfikatem.includes('2028-09-24'), 'certyfikat ważny dwa lata');
  await zrzut(page, '05-certyfikat');

  // Rejestr publiczny.
  await page.goto(`${baseUrl}/rejestr?numer=PD/2026/0001`);
  await page.waitForSelector('.poziom', { timeout: 30_000 });
  const rejestr = await page.content();
  sprawdz(rejestr.includes('wazny'), 'rejestr potwierdza ważność');
  sprawdz(!rejestr.includes('Ergonomia stanowisk'), 'rejestr nie ujawnia ustaleń z audytu');
  await zrzut(page, '06-rejestr');

  await page.goto(`${baseUrl}/rejestr?numer=PD/2026/9999`);
  await page.waitForSelector('.blad', { timeout: 30_000 });
  sprawdz(
    (await page.locator('.blad').innerText()).includes('Nie znaleziono'),
    'nieznany numer daje jednoznaczną odpowiedź',
  );
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
