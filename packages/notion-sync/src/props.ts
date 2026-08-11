/**
 * Odczyt właściwości ze znormalizowanej strony Notion.
 *
 * Każdy odczyt albo zwraca wartość we właściwym typie, albo dopisuje uwagę
 * do listy problemów. Rekord z choćby jedną uwagą nie trafia do cache —
 * import „na ile się da" dałby treść po części zaktualizowaną, a to gorsze
 * niż treść stara, bo nikt tego nie zauważy.
 */

import type { NotionPage, NotionValue, ParseIssue } from './types.ts';

export class PropertyReader {
  readonly issues: ParseIssue[] = [];

  constructor(private readonly page: NotionPage) {}

  private get<T extends NotionValue['type']>(
    property: string,
    expected: T,
  ): Extract<NotionValue, { type: T }> | undefined {
    const value = this.page.properties[property];

    if (value === undefined) {
      this.issues.push({ property, message: `Brak właściwości "${property}".` });
      return undefined;
    }

    if (value.type !== expected) {
      this.issues.push({
        property,
        message: `Właściwość "${property}" ma typ ${value.type}, oczekiwano ${expected}.`,
      });
      return undefined;
    }

    return value as Extract<NotionValue, { type: T }>;
  }

  text(property: string, options: { required?: boolean } = {}): string {
    const value = this.get(property, 'text');
    const text = value?.value.trim() ?? '';

    if (options.required === true && text.length === 0) {
      this.issues.push({ property, message: `Właściwość "${property}" jest wymagana.` });
    }
    return text;
  }

  number(property: string, options: { required?: boolean; min?: number } = {}): number | undefined {
    const value = this.get(property, 'number');
    if (value === undefined) return undefined;

    if (value.value === null) {
      if (options.required === true) {
        this.issues.push({ property, message: `Właściwość "${property}" jest wymagana.` });
      }
      return undefined;
    }

    if (options.min !== undefined && value.value < options.min) {
      this.issues.push({
        property,
        message: `Właściwość "${property}" musi być nie mniejsza niż ${options.min}.`,
      });
      return undefined;
    }

    return value.value;
  }

  select(property: string, allowed?: readonly string[]): string | undefined {
    const value = this.get(property, 'select');
    if (value === undefined || value.value === null) return undefined;

    if (allowed !== undefined && !allowed.includes(value.value)) {
      this.issues.push({
        property,
        message: `Wartość "${value.value}" w "${property}" jest spoza listy: ${allowed.join(', ')}.`,
      });
      return undefined;
    }

    return value.value;
  }

  requiredSelect(property: string, allowed?: readonly string[]): string {
    const value = this.select(property, allowed);
    if (value === undefined) {
      this.issues.push({ property, message: `Właściwość "${property}" jest wymagana.` });
      return '';
    }
    return value;
  }

  multiSelect(property: string, allowed?: readonly string[]): readonly string[] {
    const value = this.get(property, 'multi_select');
    if (value === undefined) return [];

    if (allowed !== undefined) {
      const unknown = value.value.filter((item) => !allowed.includes(item));
      if (unknown.length > 0) {
        this.issues.push({
          property,
          message: `Wartości spoza listy w "${property}": ${unknown.join(', ')}.`,
        });
        return [];
      }
    }

    return value.value;
  }

  checkbox(property: string): boolean {
    return this.get(property, 'checkbox')?.value ?? false;
  }

  date(property: string, options: { required?: boolean } = {}): string | undefined {
    const value = this.get(property, 'date');
    if (value === undefined) return undefined;

    if (value.value === null) {
      if (options.required === true) {
        this.issues.push({ property, message: `Właściwość "${property}" jest wymagana.` });
      }
      return undefined;
    }

    if (Number.isNaN(new Date(value.value).getTime())) {
      this.issues.push({ property, message: `Niepoprawna data w "${property}".` });
      return undefined;
    }

    return value.value;
  }

  relation(property: string): readonly string[] {
    return this.get(property, 'relation')?.value ?? [];
  }

  url(property: string): string | undefined {
    const value = this.get(property, 'url');
    if (value === undefined || value.value === null) return undefined;

    if (!/^https?:\/\//u.test(value.value)) {
      this.issues.push({ property, message: `Adres w "${property}" musi zaczynać się od http(s).` });
      return undefined;
    }

    return value.value;
  }

  get ok(): boolean {
    return this.issues.length === 0;
  }
}
