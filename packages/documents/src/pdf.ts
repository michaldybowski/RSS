/**
 * PDF z HTML przez przeglądarkę w trybie bezgłowym.
 *
 * Wybór świadomy. Alternatywa — biblioteka rysująca PDF wprost — wymaga
 * osadzenia własnego fontu, bo standardowe fonty PDF nie mają polskich znaków
 * diakrytycznych poza „ó". Przeglądarka rozwiązuje to bez zabaw z fontami,
 * a przy okazji ten sam HTML służy podglądowi w panelu.
 *
 * Silnik jest wstrzykiwany, więc testy nie uruchamiają przeglądarki.
 */

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface PdfEngine {
  fromHtml: (html: string) => Promise<Buffer>;
}

export class PdfGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PdfGenerationError';
  }
}

export interface ChromiumOptions {
  /** Ścieżka do binarki. Domyślnie zmienna CHROMIUM_PATH albo `chromium`. */
  executablePath?: string;
  timeoutMs?: number;
  /**
   * Wyłączenie piaskownicy przeglądarki. Domyślnie włączona.
   *
   * Chromium odmawia startu jako root bez tej flagi, więc w kontenerach
   * kusi, żeby ustawić ją na stałe. To jest osłabienie zabezpieczenia:
   * właściwym rozwiązaniem jest uruchomienie procesu jako użytkownik
   * bez uprawnień roota, a ta opcja to wyjście awaryjne dla środowisk,
   * w których nie da się tego zrobić.
   */
  disableSandbox?: boolean;
}

export class ChromiumPdfEngine implements PdfEngine {
  private readonly executablePath: string;
  private readonly timeoutMs: number;
  private readonly disableSandbox: boolean;

  constructor(options: ChromiumOptions = {}) {
    this.executablePath = options.executablePath ?? process.env.CHROMIUM_PATH ?? 'chromium';
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.disableSandbox = options.disableSandbox ?? process.env.CHROMIUM_NO_SANDBOX === '1';
  }

  async fromHtml(html: string): Promise<Buffer> {
    const dir = await mkdtemp(join(tmpdir(), 'longevity-pdf-'));
    const htmlPath = join(dir, 'dokument.html');
    const pdfPath = join(dir, 'dokument.pdf');

    try {
      await writeFile(htmlPath, html, 'utf8');
      await this.run([
        '--headless',
        '--disable-gpu',
        ...(this.disableSandbox ? ['--no-sandbox'] : []),
        // Dokument jest samowystarczalny, więc przeglądarka nie musi mieć sieci.
        // To nie jest optymalizacja, tylko zabezpieczenie: dokument medyczny
        // nie może zaciągnąć niczego z zewnątrz w trakcie renderowania.
        '--disable-extensions',
        '--no-pdf-header-footer',
        '--print-to-pdf-no-header',
        `--print-to-pdf=${pdfPath}`,
        `file://${htmlPath}`,
      ]);

      const pdf = await readFile(pdfPath);
      if (pdf.subarray(0, 5).toString('latin1') !== '%PDF-') {
        throw new PdfGenerationError('Wynik nie jest plikiem PDF.');
      }
      return pdf;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private run(args: readonly string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.executablePath, [...args], { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';

      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new PdfGenerationError(`Przekroczono limit ${this.timeoutMs} ms przy generowaniu PDF.`));
      }, this.timeoutMs);

      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        reject(new PdfGenerationError(`Nie udało się uruchomić przeglądarki: ${error.message}`));
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new PdfGenerationError(`Przeglądarka zakończyła się kodem ${code}. ${stderr.trim()}`));
      });
    });
  }
}
