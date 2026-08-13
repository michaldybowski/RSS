/**
 * Przejście przez panel lekarza.
 *
 * Nacisk pada na dwie bramki, które w tym panelu są najważniejsze: konsultacja
 * należy do jednego lekarza, a Karta Pacjenta otwiera się wyłącznie za zgodą
 * uczestnika. Obie sprawdzamy również od strony negatywnej — z asercją, że
 * wartości z karty nie pojawiają się tam, gdzie karty być nie powinno.
 *
 * UWAGA: przebieg jest jednorazowy. Odnotowanie wizyty i podpis pod zleceniem
 * są nieodwracalne, a prototyp trzyma stan w pamięci procesu — przed każdym
 * uruchomieniem serwer trzeba wystartować na nowo.
 */

import { chromium, type Page } from 'playwright';

const baseUrl = arg('--url') ?? 'http://127.0.0.1:3106';
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

async function zaloguj(page: Page, lekarzId: string): Promise<void> {
  await page.goto(baseUrl);
  await page.check(`input[value="${lekarzId}"]`);
  await page.click('button[type="submit"]');
  await page.waitForSelector('h1:has-text("Grafik")', { timeout: 30_000 });
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: process.env.CHROMIUM_NO_SANDBOX === '1' ? ['--no-sandbox'] : [],
});
const context = await browser.newContext({ viewport: { width: 1000, height: 1300 } });
const page = await context.newPage();

try {
  // --- grafik ---------------------------------------------------------------
  await zaloguj(page, 'lek-1');
  const grafik = await page.content();
  sprawdz(grafik.includes('psd-8fa2'), 'grafik opisuje pacjentów pseudonimem');
  sprawdz(!grafik.includes('kons-t-3'), 'grafik nie pokazuje konsultacji innego lekarza');
  sprawdz(grafik.includes('pilny'), 'rodzaj terminu jest widoczny');
  await zrzut(page, '01-grafik');

  // --- cudza konsultacja ----------------------------------------------------
  await page.goto(`${baseUrl}/konsultacje/kons-t-3`);
  await page.waitForSelector('.blad', { timeout: 30_000 });
  const cudza = await page.content();
  sprawdz(cudza.includes('lekarz prowadzący'), 'cudza konsultacja otwiera się w trybie odczytu');
  sprawdz(cudza.includes('Karta niedostępna'), 'karta zamknięta w cudzej konsultacji');
  sprawdz(!cudza.includes('Odnotuj odbycie'), 'brak akcji w cudzej konsultacji');

  // --- konsultacja bez zgody uczestnika -------------------------------------
  await page.goto(`${baseUrl}/konsultacje/kons-t-2`);
  await page.waitForSelector('h1', { timeout: 30_000 });
  const bezZgody = await page.content();
  sprawdz(bezZgody.includes('nie udzielił zgody'), 'brak zgody nazwany wprost');
  sprawdz(
    bezZgody.includes('odrębna od zapisu na konsultację'),
    'rozdział zgody od rezerwacji wyjaśniony',
  );
  // Uczestnik u-102 ma ból w klatce piersiowej — ta flaga nie może wyciec.
  sprawdz(
    !bezZgody.includes('klatce piersiowej'),
    'bez zgody żadna wartość z karty nie trafia na stronę',
  );
  sprawdz(
    !bezZgody.includes('CZERWONA'),
    'bez zgody kategoria ryzyka też nie jest ujawniana',
  );
  // Konsultacja o 12:00 jeszcze się nie zaczęła.
  sprawdz(bezZgody.includes('jeszcze się nie zaczęła'), 'wizyty nie da się rozliczyć przed czasem');
  await zrzut(page, '02-bez-zgody');

  // --- konsultacja ze zgodą -------------------------------------------------
  await page.goto(`${baseUrl}/konsultacje/kons-t-1`);
  await page.waitForSelector('h2:has-text("Karta Pacjenta")', { timeout: 30_000 });
  const zeZgoda = await page.content();
  sprawdz(zeZgoda.includes('/ 100'), 'karta pokazuje Health Score');
  sprawdz(zeZgoda.includes('nie stanowi diagnozy'), 'karta niesie zastrzeżenie');
  sprawdz(zeZgoda.includes('0.1.0-draft'), 'wersja reguł jest podana lekarzowi');
  await zrzut(page, '03-karta');

  // --- przebieg i notatka ---------------------------------------------------
  await page.click('button:has-text("Odnotuj odbycie")');
  await page.waitForSelector('h2:has-text("Wnioski z konsultacji")', { timeout: 30_000 });
  sprawdz(true, 'rozpoczętą konsultację można oznaczyć jako odbytą');

  await page.fill('#tresc', 'Omówiono wyniki. Kontrola za trzy miesiące.');
  await page.fill('#zalecenia', 'Sen minimum 7 godzin\nSpacer 30 minut dziennie');
  await page.click('button:has-text("Zapisz wnioski")');
  await page.waitForSelector('.notka:has-text("Kontrola za trzy miesiące")', { timeout: 30_000 });
  sprawdz(true, 'notatka zapisana');

  // --- zlecenie badań -------------------------------------------------------
  const przedZleceniem = await page.content();
  sprawdz(
    !przedZleceniem.includes('podpisane przez'),
    'przed przygotowaniem propozycji nie ma dokumentu',
  );

  await page.click('button:has-text("Przygotuj propozycję z reguł")');
  await page.waitForSelector('button:has-text("Podpisz zlecenie")', { timeout: 30_000 });
  const propozycja = await page.content();
  sprawdz(propozycja.includes('Panel Bazowy'), 'każda pozycja niesie powód');
  sprawdz(
    !propozycja.includes('podpisane przez'),
    'propozycji nie da się wydrukować przed podpisem',
  );
  await zrzut(page, '04-propozycja');

  // Lekarz usuwa jedną pozycję przed podpisem.
  const pierwsza = await page.locator('input[name^="poz_"]').first();
  const nazwaPierwszej = (await pierwsza.getAttribute('name'))!.replace('poz_', '');
  await pierwsza.uncheck();

  await page.click('button:has-text("Podpisz zlecenie")');
  await page.waitForSelector('.notka:has-text("podpisane przez")', { timeout: 30_000 });
  const dokument = await page.content();

  sprawdz(dokument.includes('podpisane przez lek-1'), 'dokument wskazuje lekarza podpisującego');
  sprawdz(
    dokument.includes(`Usunięto przed podpisem: ${nazwaPierwszej}`),
    'usunięta pozycja jest odnotowana',
  );
  sprawdz(
    dokument.includes('decyzja i podpis należą do lekarza'),
    'dokument mówi, kto odpowiada za zakres',
  );
  await zrzut(page, '05-zlecenie');

  // --- ponowne rozpatrzenie -------------------------------------------------
  sprawdz(
    !dokument.includes('Podpisz zlecenie'),
    'podpisanego zlecenia nie da się rozpatrzyć drugi raz',
  );
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
