/**
 * Pobieranie dokumentów.
 *
 * Wszystko generowane na żądanie z zapisanego wyniku — nie trzymamy plików
 * na dysku. Przy danych klasy K1 to jedno miejsce mniej, w którym mogłyby
 * zostać po zakończeniu sesji.
 */

import { buildBundle, ChromiumPdfEngine, renderBundleDocx, renderBundlePdf } from '@longevity/documents';

import { getSession } from '../../../lib/session.ts';

const TYPY = {
  html: 'text/html; charset=utf-8',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ics: 'text/calendar; charset=utf-8',
} as const;

type Format = keyof typeof TYPY;

function isFormat(value: string): value is Format {
  return value in TYPY;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ format: string }> },
): Promise<Response> {
  const { format } = await params;

  if (!isFormat(format)) {
    return new Response('Nieznany format dokumentu.', { status: 404 });
  }

  const session = await getSession();
  if (session.intake === undefined || session.assessment === undefined || session.result === undefined) {
    return new Response('Brak wyniku — wypełnij najpierw kwestionariusz.', { status: 409 });
  }

  const bundle = buildBundle({
    intake: session.intake,
    assessment: session.assessment,
    result: session.result,
    ics: { weekStart: '2026-08-03', uidPrefix: session.id, weeks: 12 },
  });

  const nazwa = `longevity-${format === 'ics' ? 'harmonogram' : 'dokumenty'}.${format}`;
  const naglowki = {
    'Content-Type': TYPY[format],
    'Content-Disposition': `${format === 'html' ? 'inline' : 'attachment'}; filename="${nazwa}"`,
    // Dokumenty zawierają dane zdrowotne — nie mogą trafić do pamięci podręcznej.
    'Cache-Control': 'no-store, private',
  };

  if (format === 'html') return new Response(bundle.html, { headers: naglowki });

  if (format === 'ics') {
    if (bundle.ics === undefined) {
      return new Response('Kalendarz jest dostępny dopiero po wygenerowaniu planu.', { status: 409 });
    }
    return new Response(bundle.ics, { headers: naglowki });
  }

  if (format === 'docx') {
    const docx = await renderBundleDocx(bundle);
    return new Response(new Uint8Array(docx), { headers: naglowki });
  }

  try {
    const pdf = await renderBundlePdf(bundle, new ChromiumPdfEngine());
    return new Response(new Uint8Array(pdf), { headers: naglowki });
  } catch (error) {
    // Brak przeglądarki nie może wyglądać jak uszkodzony plik.
    return new Response(
      `Nie udało się wygenerować PDF: ${error instanceof Error ? error.message : String(error)}. ` +
        'Pobierz wersję HTML i wydrukuj ją do PDF z przeglądarki.',
      { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
    );
  }
}
