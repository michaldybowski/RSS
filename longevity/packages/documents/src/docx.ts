/**
 * Renderer DOCX — wersja edytowalna, dla lekarza.
 *
 * Dokument kwietniowy zakłada, że lekarz dostaje plan w formacie, który może
 * poprawić przed przekazaniem pacjentowi. PDF się do tego nie nadaje.
 */

import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

import type { DocumentModel, DocumentSection } from './model.ts';

function sectionParagraphs(section: DocumentSection): (Paragraph | Table)[] {
  const blocks: (Paragraph | Table)[] = [
    new Paragraph({ text: section.naglowek, heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 120 } }),
  ];

  for (const paragraph of section.tresc ?? []) {
    blocks.push(new Paragraph({ text: paragraph, spacing: { after: 120 } }));
  }

  for (const pair of section.pary ?? []) {
    blocks.push(
      new Paragraph({
        spacing: { after: 40 },
        children: [
          new TextRun({ text: `${pair.etykieta}: `, color: '555555' }),
          new TextRun({ text: pair.wartosc, bold: true }),
        ],
      }),
    );
  }

  if (section.tabela !== undefined) {
    blocks.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            tableHeader: true,
            children: section.tabela.naglowki.map(
              (cell) =>
                new TableCell({
                  shading: { fill: 'F2F2F2' },
                  children: [new Paragraph({ children: [new TextRun({ text: cell, bold: true })] })],
                }),
            ),
          }),
          ...section.tabela.wiersze.map(
            (row) =>
              new TableRow({
                children: row.map((cell) => new TableCell({ children: [new Paragraph(cell)] })),
              }),
          ),
        ],
      }),
    );
    blocks.push(new Paragraph({ text: '', spacing: { after: 120 } }));
  }

  for (const item of section.punkty ?? []) {
    blocks.push(new Paragraph({ text: item, bullet: { level: 0 }, spacing: { after: 40 } }));
  }

  return blocks;
}

function documentBlocks(model: DocumentModel): (Paragraph | Table)[] {
  return [
    new Paragraph({
      children: [new TextRun({ text: model.kod, size: 16, color: '777777', characterSpacing: 40 })],
    }),
    new Paragraph({ text: model.tytul, heading: HeadingLevel.HEADING_1, spacing: { after: 60 } }),
    ...(model.podtytul !== undefined
      ? [
          new Paragraph({
            children: [new TextRun({ text: model.podtytul, italics: true, color: '555555' })],
            spacing: { after: 240 },
          }),
        ]
      : []),
    ...model.sekcje.flatMap(sectionParagraphs),
    new Paragraph({
      spacing: { before: 360 },
      border: { left: { style: BorderStyle.SINGLE, size: 12, color: '999999', space: 8 } },
      children: [new TextRun({ text: model.zastrzezenie, size: 18, color: '333333' })],
    }),
  ];
}

export async function renderDocx(models: readonly DocumentModel[], title: string): Promise<Buffer> {
  const document = new Document({
    title,
    creator: 'HCPL Longevity',
    description: 'Dokument programu Longevity',
    sections: models.map((model, index) => ({
      properties: index > 0 ? { page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } } } : {},
      children: [
        ...(index > 0
          ? [new Paragraph({ text: '', pageBreakBefore: true, alignment: AlignmentType.LEFT })]
          : []),
        ...documentBlocks(model),
      ],
    })),
  });

  return Packer.toBuffer(document);
}
