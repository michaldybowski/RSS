/**
 * Renderer HTML — kanoniczna postać dokumentu.
 *
 * Ten sam plik służy trzem celom: podglądowi w panelu uczestnika, wydrukowi
 * i źródłu dla PDF. Dokument jest samowystarczalny: bez zewnętrznych arkuszy,
 * fontów i obrazów, bo PDF powstaje w przeglądarce bez dostępu do sieci,
 * a dokument medyczny nie może zależeć od tego, czy CDN akurat odpowiada.
 */

import type { DocumentModel, DocumentSection } from './model.ts';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

const STYLE = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body {
  margin: 0;
  font: 11pt/1.55 "Segoe UI", "Helvetica Neue", Arial, sans-serif;
  color: #1a1a1a;
  background: #fff;
}
.dokument { max-width: 190mm; margin: 0 auto; padding: 16mm 14mm; }
.dokument + .dokument { border-top: 1px solid #ddd; }
header { border-bottom: 2px solid #1a1a1a; padding-bottom: 8px; margin-bottom: 18px; }
.kod { font-size: 8.5pt; letter-spacing: .12em; text-transform: uppercase; color: #666; }
h1 { font-size: 18pt; margin: 4px 0 2px; }
.podtytul { color: #555; font-size: 10pt; margin: 0; }
h2 { font-size: 12pt; margin: 20px 0 6px; padding-bottom: 3px; border-bottom: 1px solid #e0e0e0; }
p { margin: 6px 0; }
ul { margin: 6px 0; padding-left: 20px; }
li { margin: 3px 0; }
table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 10pt; }
th, td { border: 1px solid #d8d8d8; padding: 5px 7px; text-align: left; vertical-align: top; }
th { background: #f4f4f4; font-weight: 600; }
dl { display: grid; grid-template-columns: max-content 1fr; gap: 3px 14px; margin: 6px 0; }
dt { color: #555; }
dd { margin: 0; font-weight: 600; }
.zastrzezenie {
  margin-top: 22px; padding: 10px 12px; border-left: 3px solid #999;
  background: #f7f7f7; font-size: 9.5pt; color: #333;
}
@page { size: A4; margin: 0; }
@media print {
  .dokument { page-break-after: always; padding: 14mm; }
  .dokument:last-child { page-break-after: auto; }
  h2 { break-after: avoid; }
  table, ul { break-inside: avoid; }
}
`;

function renderSection(section: DocumentSection): string {
  const parts: string[] = [`<h2>${escapeHtml(section.naglowek)}</h2>`];

  for (const paragraph of section.tresc ?? []) {
    parts.push(`<p>${escapeHtml(paragraph)}</p>`);
  }

  if (section.pary !== undefined && section.pary.length > 0) {
    const items = section.pary
      .map((pair) => `<dt>${escapeHtml(pair.etykieta)}</dt><dd>${escapeHtml(pair.wartosc)}</dd>`)
      .join('');
    parts.push(`<dl>${items}</dl>`);
  }

  if (section.tabela !== undefined) {
    const head = section.tabela.naglowki.map((cell) => `<th>${escapeHtml(cell)}</th>`).join('');
    const body = section.tabela.wiersze
      .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
      .join('');
    parts.push(`<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`);
  }

  if (section.punkty !== undefined && section.punkty.length > 0) {
    const items = section.punkty.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
    parts.push(`<ul>${items}</ul>`);
  }

  return parts.join('\n');
}

export function renderDocumentBody(model: DocumentModel): string {
  return [
    '<article class="dokument">',
    '<header>',
    `<div class="kod">${escapeHtml(model.kod)}</div>`,
    `<h1>${escapeHtml(model.tytul)}</h1>`,
    ...(model.podtytul !== undefined ? [`<p class="podtytul">${escapeHtml(model.podtytul)}</p>`] : []),
    '</header>',
    ...model.sekcje.map(renderSection),
    `<div class="zastrzezenie">${escapeHtml(model.zastrzezenie)}</div>`,
    '</article>',
  ].join('\n');
}

/** Jeden dokument lub cały pakiet w jednym pliku — każdy na osobnej stronie wydruku. */
export function renderHtml(models: readonly DocumentModel[], title: string): string {
  return [
    '<!DOCTYPE html>',
    '<html lang="pl">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title)}</title>`,
    `<style>${STYLE}</style>`,
    '</head>',
    '<body>',
    ...models.map(renderDocumentBody),
    '</body>',
    '</html>',
  ].join('\n');
}
