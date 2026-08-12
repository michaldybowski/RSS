/**
 * Modele dokumentów — pakiet konsultacyjny (dokument kwietniowy, część III).
 *
 * Dokumenty są składane deterministycznie z oceny ryzyka i skierowań. Renderery
 * (HTML, DOCX, iCal) dostają gotowy model i tylko go ubierają — dzięki temu
 * treść merytoryczna jest jedna, niezależnie od formatu, w którym trafi
 * do uczestnika lub lekarza.
 */

import type { Assessment, ParticipantIntake } from '@longevity/core';
import type { Plan, Referrals } from '@longevity/plan';

export interface KeyValue {
  etykieta: string;
  wartosc: string;
}

export interface DocumentSection {
  naglowek: string;
  /** Akapity wprowadzające. */
  tresc?: readonly string[];
  punkty?: readonly string[];
  pary?: readonly KeyValue[];
  tabela?: { naglowki: readonly string[]; wiersze: readonly (readonly string[])[] };
}

export interface DocumentModel {
  kod: string;
  tytul: string;
  podtytul?: string;
  sekcje: readonly DocumentSection[];
  zastrzezenie: string;
}

export interface ConsultationPack {
  kartaPacjenta: DocumentModel;
  zlecenieBadan: DocumentModel;
  planPrzygotowania: DocumentModel;
  listaPytan: DocumentModel;
  planMonitoringu: DocumentModel;
}

export interface PackInput {
  intake: ParticipantIntake;
  assessment: Assessment;
  referrals: Referrals;
  disclaimer: string;
  /** Plan dołączany, gdy powstał. Przy kategorii CZERWONEJ go nie ma. */
  plan?: Plan;
}

const KATEGORIA_OPIS: Readonly<Record<Assessment['riskCategory'], string>> = {
  ZIELONA: 'Brak przeciwwskazań do samodzielnego rozpoczęcia programu.',
  ŻÓŁTA: 'Program wymaga modyfikacji i konsultacji przed rozpoczęciem.',
  CZERWONA: 'Wymagana ocena lekarska przed rozpoczęciem programu. Plan nie został wygenerowany.',
};

export function buildConsultationPack(input: PackInput): ConsultationPack {
  return {
    kartaPacjenta: kartaPacjenta(input),
    zlecenieBadan: zlecenieBadan(input),
    planPrzygotowania: planPrzygotowania(input),
    listaPytan: listaPytan(input),
    planMonitoringu: planMonitoringu(input),
  };
}

function kartaPacjenta({ intake, assessment, disclaimer }: PackInput): DocumentModel {
  const { derived } = assessment;

  const wyniki: (readonly string[])[] = [];
  const labs = intake.labs;
  if (labs?.glucoseMgDl !== undefined)
    wyniki.push(['Glukoza na czczo', `${labs.glucoseMgDl} mg/dl`, '70–99', ocena(labs.glucoseMgDl, 99)]);
  if (labs?.hba1cPct !== undefined)
    wyniki.push(['HbA1c', `${labs.hba1cPct} %`, '< 5,7', ocena(labs.hba1cPct, 5.7)]);
  if (derived.homaIr !== undefined)
    wyniki.push(['HOMA-IR', String(derived.homaIr), '< 2,5', ocena(derived.homaIr, 2.5)]);
  if (labs?.ldlMgDl !== undefined)
    wyniki.push(['LDL', `${labs.ldlMgDl} mg/dl`, '< 115', ocena(labs.ldlMgDl, 115)]);
  if (labs?.crpMgL !== undefined)
    wyniki.push(['CRP', `${labs.crpMgL} mg/l`, '< 3', ocena(labs.crpMgL, 3)]);

  const sekcje: DocumentSection[] = [
    {
      naglowek: 'Dane podstawowe',
      pary: [
        { etykieta: 'Wiek', wartosc: `${intake.ageYears} lat` },
        { etykieta: 'Płeć', wartosc: plec(intake.sex) },
        { etykieta: 'Masa ciała', wartosc: `${intake.anthropometry.weightKg} kg` },
        { etykieta: 'Wzrost', wartosc: `${intake.anthropometry.heightCm} cm` },
        { etykieta: 'BMI', wartosc: String(derived.bmi) },
        ...(derived.whr !== undefined
          ? [{ etykieta: 'WHR', wartosc: `${derived.whr} (${derived.whrCategory ?? '—'})` }]
          : []),
      ],
    },
    {
      naglowek: 'Kategoria ryzyka',
      tresc: [`${assessment.riskCategory} — ${KATEGORIA_OPIS[assessment.riskCategory]}`],
      punkty: assessment.flags.map((flag) => `${flag.code}: ${flag.message}`),
    },
    {
      naglowek: 'Choroby przewlekłe i leki',
      punkty: [
        ...(intake.history.chronicConditions.length > 0
          ? intake.history.chronicConditions
          : ['Brak zgłoszonych chorób przewlekłych']),
        ...kategorieLekow(intake),
      ],
    },
  ];

  if (wyniki.length > 0) {
    sekcje.push({
      naglowek: 'Kluczowe wyniki laboratoryjne',
      tabela: { naglowki: ['Parametr', 'Wynik', 'Zakres', 'Status'], wiersze: wyniki },
    });
  } else {
    sekcje.push({
      naglowek: 'Kluczowe wyniki laboratoryjne',
      tresc: ['Uczestnik nie przekazał wyników badań. Zlecenie w Dokumencie 2.'],
    });
  }

  return {
    kod: 'DOK-1',
    tytul: 'Karta Pacjenta',
    podtytul: 'Podsumowanie dla lekarza — do przeczytania w dwie minuty',
    sekcje,
    zastrzezenie: disclaimer,
  };
}

function zlecenieBadan({ referrals, disclaimer }: PackInput): DocumentModel {
  return {
    kod: 'DOK-2',
    tytul: 'Zlecenie badań diagnostycznych',
    podtytul: 'Panel bazowy oraz panele warunkowe wynikające z profilu',
    sekcje: [
      { naglowek: 'Panel Bazowy Longevity', punkty: referrals.panelBazowy },
      ...referrals.paneleWarunkowe.map((panel) => ({
        naglowek: `Panel warunkowy — ${panel.powod}`,
        punkty: panel.badania,
      })),
    ],
    zastrzezenie: disclaimer,
  };
}

function planPrzygotowania({ assessment, intake, disclaimer }: PackInput): DocumentModel {
  const naGlp1 = intake.medications.glp1OrGip;

  return {
    kod: 'DOK-3',
    tytul: 'Przygotowanie do konsultacji',
    podtytul: 'Co zrobić przed wizytą, żeby była maksymalnie efektywna',
    sekcje: [
      {
        naglowek: 'Tydzień przed wizytą',
        punkty: [
          'Wykonać badania z Dokumentu 2 — panel bazowy i panele warunkowe',
          'Zebrać dokumentację medyczną: poprzednie wyniki, wypisy, lista leków z dawkami',
          'Prowadzić dziennik przez 3–5 dni: sen, energia w skali 1–10, samopoczucie, dolegliwości',
          ...(naGlp1 ? ['Wykonać 5 dni pomiarów glukometrem: rano na czczo i 90 minut po obiedzie'] : []),
        ],
      },
      {
        naglowek: 'Dzień przed wizytą',
        punkty: [
          'Wydrukować Kartę Pacjenta (Dokument 1)',
          'Wydrukować listę pytań (Dokument 4)',
          'Skompletować wyniki badań',
        ],
      },
      {
        naglowek: 'Na wizytę zabrać',
        punkty: [
          'Kartę Pacjenta',
          'Wyniki badań',
          'Listę leków i suplementów',
          'Listę pytań',
          ...(assessment.generatePlan ? ['Wygenerowany plan — do omówienia z lekarzem'] : []),
          'Dziennik objawów',
        ],
      },
    ],
    zastrzezenie: disclaimer,
  };
}

function listaPytan({ referrals, disclaimer }: PackInput): DocumentModel {
  return {
    kod: 'DOK-4',
    tytul: 'Pytania do lekarza',
    podtytul: 'Wygenerowane na podstawie Twojego profilu',
    sekcje: [
      { naglowek: 'Pytania podstawowe', punkty: referrals.pytaniaUniwersalne },
      ...referrals.pytaniaWarunkowe.map((group) => ({
        naglowek: group.powod,
        punkty: group.pytania,
      })),
    ],
    zastrzezenie: disclaimer,
  };
}

function planMonitoringu({ intake, assessment, disclaimer }: PackInput): DocumentModel {
  const naGlp1 = intake.medications.glp1OrGip;
  const panelKwartalny = [
    'Morfologia',
    'Glukoza na czczo',
    'HbA1c',
    'Lipidogram',
    'Witamina D',
    'Ferrytyna',
    'TSH',
    'ALT, AST',
  ];

  return {
    kod: 'DOK-5',
    tytul: 'Plan monitoringu medycznego',
    podtytul: 'Harmonogram badań i wizyt na dwanaście miesięcy',
    sekcje: [
      {
        naglowek: 'Punkt wyjścia — przed rozpoczęciem',
        punkty: ['Panel bazowy i panele warunkowe z Dokumentu 2', 'Konsultacja lekarska z Kartą Pacjenta'],
      },
      {
        naglowek: 'Miesiąc 1',
        punkty: [
          'Masa ciała i obwód talii',
          'Samopoczucie w skali 1–10',
          ...(naGlp1 ? ['Kontrola glikemii glukometrem przez 3–5 dni'] : []),
          'Teleporada, jeśli pojawią się niepokojące objawy',
        ],
      },
      { naglowek: 'Miesiąc 3 — przegląd kwartalny', punkty: [...panelKwartalny, 'Ocena składu ciała', 'Wizyta lekarska — przegląd i korekta planu'] },
      {
        naglowek: 'Miesiąc 6 — przegląd półroczny',
        punkty: ['Pełny panel bazowy', 'Ocena składu ciała (DEXA)', 'Wizyta lekarska — ocena strategiczna'],
      },
      { naglowek: 'Miesiąc 9', punkty: [...panelKwartalny, 'Ocena składu ciała'] },
      {
        naglowek: 'Miesiąc 12 — przegląd roczny',
        punkty: [
          'Pełny panel rozszerzony',
          'DEXA',
          'Ocena kardiologiczna, jeśli są wskazania',
          'Wizyta lekarska — rewizja i cele na kolejny rok',
        ],
      },
      ...(assessment.riskCategory === 'CZERWONA'
        ? [
            {
              naglowek: 'Uwaga',
              tresc: [
                'Harmonogram obowiązuje po uzyskaniu zgody lekarza na rozpoczęcie programu. ' +
                  'Do tego czasu obowiązuje wyłącznie diagnostyka z Dokumentu 2.',
              ],
            },
          ]
        : []),
    ],
    zastrzezenie: disclaimer,
  };
}

const DNI = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela'];

/**
 * Kody typów dnia są bez znaków diakrytycznych, bo to identyfikatory.
 * W dokumencie dla uczestnika muszą wyglądać jak polskie słowa.
 */
const TYP_DNIA: Readonly<Record<Plan['trening']['mikrocykl'][number]['typ'], string>> = {
  silowy: 'siłowy',
  wytrzymalosciowy: 'wytrzymałościowy',
  mobilnosc: 'mobilność',
  regeneracja: 'regeneracja',
  wolne: 'wolne',
};

export function buildPlanDocument(plan: Plan, disclaimer: string): DocumentModel {
  const dni = DNI;

  return {
    kod: 'PLAN',
    tytul: 'Twój plan Longevity',
    sekcje: [
      { naglowek: 'Podsumowanie', tresc: [plan.podsumowanie] },
      { naglowek: 'Żywienie — zasady', punkty: plan.zywienie.zasady },
      {
        naglowek: 'Żywienie — posiłki',
        tabela: {
          naglowki: ['Pora', 'Opis', 'Przykłady'],
          wiersze: plan.zywienie.posilki.map((meal) => [meal.pora, meal.opis, meal.przyklady.join('; ')]),
        },
      },
      ...(plan.zywienie.uwagi.length > 0
        ? [{ naglowek: 'Żywienie — uwagi', punkty: plan.zywienie.uwagi }]
        : []),
      {
        naglowek: 'Trening — mikrocykl',
        tabela: {
          naglowki: ['Dzień', 'Typ', 'Czas', 'Bloki'],
          wiersze: plan.trening.mikrocykl.map((day) => [
            dni[day.dzien - 1] ?? String(day.dzien),
            TYP_DNIA[day.typ],
            day.czasMin > 0 ? `${day.czasMin} min` : '—',
            day.bloki.join('; ') || '—',
          ]),
        },
      },
      { naglowek: 'Trening — progresja', punkty: plan.trening.progresja },
      { naglowek: `Sen — cel ${plan.sen.celGodzin}`, punkty: plan.sen.protokol },
      {
        naglowek: 'Harmonogram tygodnia',
        tabela: {
          naglowki: ['Dzień', 'Pora', 'Czynność', 'Filar'],
          wiersze: plan.harmonogram.map((item) => [
            dni[item.dzien - 1] ?? String(item.dzien),
            item.pora,
            item.czynnosc,
            item.filar,
          ]),
        },
      },
      { naglowek: 'Monitoring — wskaźniki', punkty: plan.monitoring.wskazniki },
      { naglowek: 'Monitoring — punkty kontrolne', punkty: plan.monitoring.punktyKontrolne },
    ],
    zastrzezenie: disclaimer,
  };
}

function ocena(wartosc: number, gorna: number): string {
  return wartosc > gorna ? 'powyżej zakresu' : 'w zakresie';
}

function plec(sex: ParticipantIntake['sex']): string {
  return sex === 'K' ? 'kobieta' : sex === 'M' ? 'mężczyzna' : 'nie podano';
}

function kategorieLekow(intake: ParticipantIntake): string[] {
  const out: string[] = [];
  if (intake.medications.glp1OrGip) out.push('Leczenie z grupy GLP-1/GIP');
  if (intake.medications.hypertensionTreated) out.push('Leczenie nadciśnienia');
  if (intake.medications.psychotropics) out.push('Leki psychotropowe');
  if (intake.medications.thyroidHormones) out.push('Hormony tarczycy');
  return out.length > 0 ? out : ['Brak zgłoszonego leczenia stałego'];
}
