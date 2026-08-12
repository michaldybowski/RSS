import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { escapeIcsText, foldLine, renderIcs, resolveTime } from '../src/ics.ts';
import { validPlan } from './fixtures.ts';

const OPTIONS = { weekStart: '2026-08-03', uidPrefix: 'req-1', weeks: 12 };

function lines(ics: string): string[] {
  return ics.split('\r\n');
}

describe('rozpoznawanie pory', () => {
  test('jawna godzina ma pierwszeństwo nad opisem', () => {
    assert.equal(resolveTime('rano, 06:15'), '0615');
    assert.equal(resolveTime('18.30'), '1830');
  });

  test('opisy słowne mapowane na godziny', () => {
    assert.equal(resolveTime('rano'), '0700');
    assert.equal(resolveTime('w przerwie obiadowej'), '1230');
    assert.equal(resolveTime('po pracy'), '1800');
    assert.equal(resolveTime('wieczorem'), '2000');
  });

  test('nierozpoznana pora dostaje wartość domyślną, nie błąd', () => {
    assert.equal(resolveTime('kiedy się da'), '0800');
  });

  test('niepoprawna godzina nie jest przyjmowana', () => {
    assert.equal(resolveTime('o 99:99'), '0800');
  });
});

describe('escapowanie i zawijanie', () => {
  test('znaki specjalne RFC 5545 są escapowane', () => {
    assert.equal(escapeIcsText('a;b,c\\d'), 'a\\;b\\,c\\\\d');
    assert.equal(escapeIcsText('linia1\nlinia2'), 'linia1\\nlinia2');
  });

  test('krótka linia nie jest zawijana', () => {
    assert.equal(foldLine('SUMMARY:Trening'), 'SUMMARY:Trening');
  });

  test('długa linia jest zawijana ze spacją kontynuacji', () => {
    const folded = foldLine(`SUMMARY:${'a'.repeat(200)}`);
    const parts = folded.split('\r\n');

    assert.ok(parts.length > 1);
    assert.ok(parts.slice(1).every((part) => part.startsWith(' ')));
    assert.ok(Buffer.from(parts[0]!, 'utf8').length <= 75);
  });

  test('zawijanie nie tnie znaku wielobajtowego w połowie', () => {
    // Polskie znaki zajmują dwa bajty — cięcie po bajcie rozsypałoby tekst.
    const folded = foldLine(`SUMMARY:${'ż'.repeat(100)}`);
    const rejoined = folded.split('\r\n ').join('');

    assert.equal(rejoined, `SUMMARY:${'ż'.repeat(100)}`);
    assert.ok(!rejoined.includes('�'));
  });
});

describe('kalendarz', () => {
  const ics = renderIcs(validPlan(), OPTIONS);

  test('ma poprawną strukturę', () => {
    assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
    assert.ok(ics.trimEnd().endsWith('END:VCALENDAR'));
    assert.ok(ics.includes('VERSION:2.0'));
  });

  test('linie kończą się CRLF', () => {
    assert.ok(!/[^\r]\n/u.test(ics));
  });

  test('jedno wydarzenie na pozycję harmonogramu', () => {
    const count = lines(ics).filter((line) => line === 'BEGIN:VEVENT').length;
    assert.equal(count, validPlan().harmonogram.length);
  });

  test('wydarzenia mają czas lokalny bez strefy', () => {
    // Zapisanie w UTC przesunęłoby plan o godzinę przy zmianie czasu.
    const dtstart = lines(ics).filter((line) => line.startsWith('DTSTART:'));
    assert.ok(dtstart.length > 0);
    assert.ok(dtstart.every((line) => !line.endsWith('Z')));
    assert.match(dtstart[0]!, /^DTSTART:\d{8}T\d{6}$/u);
  });

  test('DTSTAMP jest w UTC, jak wymaga standard', () => {
    assert.ok(lines(ics).filter((l) => l.startsWith('DTSTAMP:')).every((l) => l.endsWith('Z')));
  });

  test('dzień 1 wypada w podany początek tygodnia', () => {
    const pierwszy = lines(ics).find((line) => line.startsWith('DTSTART:'))!;
    assert.ok(pierwszy.startsWith('DTSTART:20260803T'));
  });

  test('dzień 7 wypada sześć dni później', () => {
    const wszystkie = lines(ics).filter((line) => line.startsWith('DTSTART:'));
    assert.ok(wszystkie.some((line) => line.startsWith('DTSTART:20260809T')));
  });

  test('powtarzanie tygodniowe ma ograniczoną liczbę wystąpień', () => {
    const rrule = lines(ics).filter((line) => line.startsWith('RRULE:'));
    assert.ok(rrule.length > 0);
    assert.ok(rrule.every((line) => line === 'RRULE:FREQ=WEEKLY;COUNT=12'));
  });

  test('długość wydarzenia bierze się z mikrocyklu', () => {
    const dtend = lines(ics).filter((line) => line.startsWith('DTEND:'));
    // Dzień 1 to trening 45-minutowy o 7:00.
    assert.ok(dtend.some((line) => line === 'DTEND:20260803T074500'));
  });

  test('identyfikatory są stabilne — ponowny import aktualizuje, nie duplikuje', () => {
    const drugi = renderIcs(validPlan(), OPTIONS);
    assert.equal(ics, drugi);
    assert.ok(ics.includes('UID:req-1-0@longevity.hcpl'));
  });

  test('polskie znaki w nazwie wydarzenia przechodzą', () => {
    const plan = validPlan();
    const zPolskimi = {
      ...plan,
      harmonogram: plan.harmonogram.map((item, index) =>
        index === 0 ? { ...item, czynnosc: 'Ćwiczenia oddechowe — wyciszenie' } : item,
      ),
    };

    const output = renderIcs(zPolskimi, OPTIONS);
    assert.ok(output.includes('Ćwiczenia oddechowe'));
  });
});
