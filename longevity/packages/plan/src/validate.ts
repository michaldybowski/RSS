/**
 * Walidacja strukturalna odpowiedzi modelu (specyfikacja 8, krok H).
 *
 * Model zwraca tekst, nie obiekt. Zanim cokolwiek trafi do dokumentów
 * uczestnika, musi przejść przez ten moduł — odpowiedź niezgodna ze schematem
 * jest ponawiana z informacją zwrotną, a nie „naprawiana" po drodze.
 */

import type { MealGuideline, Plan, ScheduleItem, TrainingDay } from './plan.ts';

export interface StructureIssue {
  path: string;
  message: string;
}

export type Validated<T> = { ok: true; value: T } | { ok: false; issues: readonly StructureIssue[] };

const TYPY_DNIA = ['silowy', 'wytrzymalosciowy', 'mobilnosc', 'regeneracja', 'wolne'];

class Checker {
  readonly issues: StructureIssue[] = [];

  fail(path: string, message: string): void {
    this.issues.push({ path, message });
  }

  string(value: unknown, path: string, min = 1, max = 2000): string {
    if (typeof value !== 'string') {
      this.fail(path, 'oczekiwano tekstu');
      return '';
    }
    const trimmed = value.trim();
    if (trimmed.length < min) this.fail(path, `tekst krótszy niż ${min} znaków`);
    if (trimmed.length > max) this.fail(path, `tekst dłuższy niż ${max} znaków`);
    return trimmed;
  }

  stringList(value: unknown, path: string, min: number, max: number): readonly string[] {
    if (!Array.isArray(value)) {
      this.fail(path, 'oczekiwano listy');
      return [];
    }
    if (value.length < min) this.fail(path, `lista krótsza niż ${min} pozycji`);
    if (value.length > max) this.fail(path, `lista dłuższa niż ${max} pozycji`);
    return value.map((item, index) => this.string(item, `${path}[${index}]`, 3, 500));
  }

  integer(value: unknown, path: string, min: number, max: number): number {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      this.fail(path, 'oczekiwano liczby całkowitej');
      return min;
    }
    if (value < min || value > max) this.fail(path, `wartość poza zakresem ${min}-${max}`);
    return value;
  }

  object(value: unknown, path: string): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      this.fail(path, 'oczekiwano obiektu');
      return {};
    }
    return value as Record<string, unknown>;
  }

  array(value: unknown, path: string, min: number, max: number): readonly unknown[] {
    if (!Array.isArray(value)) {
      this.fail(path, 'oczekiwano listy');
      return [];
    }
    if (value.length < min) this.fail(path, `lista krótsza niż ${min} pozycji`);
    if (value.length > max) this.fail(path, `lista dłuższa niż ${max} pozycji`);
    return value;
  }

  enumValue(value: unknown, path: string, allowed: readonly string[]): string {
    if (typeof value !== 'string' || !allowed.includes(value)) {
      this.fail(path, `oczekiwano jednej z wartości: ${allowed.join(', ')}`);
      return allowed[0] ?? '';
    }
    return value;
  }
}

export function validatePlanStructure(raw: unknown): Validated<Plan> {
  const c = new Checker();
  const root = c.object(raw, '$');

  const zywienie = c.object(root.zywienie, '$.zywienie');
  const trening = c.object(root.trening, '$.trening');
  const sen = c.object(root.sen, '$.sen');
  const monitoring = c.object(root.monitoring, '$.monitoring');

  const plan: Plan = {
    podsumowanie: c.string(root.podsumowanie, '$.podsumowanie', 200, 800),
    zywienie: {
      zasady: c.stringList(zywienie.zasady, '$.zywienie.zasady', 3, 8),
      posilki: c
        .array(zywienie.posilki, '$.zywienie.posilki', 2, 6)
        .map((item, index) => meal(c, item, `$.zywienie.posilki[${index}]`)),
      uwagi: c.stringList(zywienie.uwagi ?? [], '$.zywienie.uwagi', 0, 5),
    },
    trening: {
      mikrocykl: c
        .array(trening.mikrocykl, '$.trening.mikrocykl', 7, 7)
        .map((item, index) => trainingDay(c, item, `$.trening.mikrocykl[${index}]`)),
      progresja: c.stringList(trening.progresja, '$.trening.progresja', 1, 5),
    },
    sen: {
      protokol: c.stringList(sen.protokol, '$.sen.protokol', 3, 8),
      celGodzin: c.string(sen.celGodzin, '$.sen.celGodzin', 2, 20),
    },
    harmonogram: c
      .array(root.harmonogram, '$.harmonogram', 5, 30)
      .map((item, index) => scheduleItem(c, item, `$.harmonogram[${index}]`)),
    monitoring: {
      wskazniki: c.stringList(monitoring.wskazniki, '$.monitoring.wskazniki', 2, 8),
      punktyKontrolne: c.stringList(monitoring.punktyKontrolne, '$.monitoring.punktyKontrolne', 2, 6),
    },
  };

  if (c.issues.length > 0) return { ok: false, issues: c.issues };

  // Dni mikrocyklu muszą pokrywać tydzień dokładnie raz — model potrafi
  // wygenerować siedem pozycji z numerami 1,1,2,3,4,5,6.
  const dni = plan.trening.mikrocykl.map((day) => day.dzien).sort((a, b) => a - b);
  if (dni.join(',') !== '1,2,3,4,5,6,7') {
    return {
      ok: false,
      issues: [{ path: '$.trening.mikrocykl', message: 'dni muszą pokrywać 1-7 dokładnie raz' }],
    };
  }

  return { ok: true, value: plan };
}

function meal(c: Checker, raw: unknown, path: string): MealGuideline {
  const item = c.object(raw, path);
  return {
    pora: c.string(item.pora, `${path}.pora`, 2, 40),
    opis: c.string(item.opis, `${path}.opis`, 10, 400),
    przyklady: c.stringList(item.przyklady, `${path}.przyklady`, 1, 6),
  };
}

function trainingDay(c: Checker, raw: unknown, path: string): TrainingDay {
  const item = c.object(raw, path);
  const typ = c.enumValue(item.typ, `${path}.typ`, TYPY_DNIA) as TrainingDay['typ'];
  const czasMin = c.integer(item.czasMin, `${path}.czasMin`, 0, 180);

  if (typ === 'wolne' && czasMin !== 0) {
    c.fail(`${path}.czasMin`, 'dzień wolny nie może mieć czasu trwania');
  }

  return {
    dzien: c.integer(item.dzien, `${path}.dzien`, 1, 7),
    typ,
    czasMin,
    bloki: typ === 'wolne' ? [] : c.stringList(item.bloki, `${path}.bloki`, 1, 8),
  };
}

function scheduleItem(c: Checker, raw: unknown, path: string): ScheduleItem {
  const item = c.object(raw, path);
  return {
    dzien: c.integer(item.dzien, `${path}.dzien`, 1, 7),
    pora: c.string(item.pora, `${path}.pora`, 2, 40),
    czynnosc: c.string(item.czynnosc, `${path}.czynnosc`, 3, 200),
    filar: c.string(item.filar, `${path}.filar`, 2, 60),
  };
}
