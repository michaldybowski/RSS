# Longevity — portal i aplikacja mobilna

Platforma programu Długowieczności (HCPL / FDP).

## Stan

**Faza A — w toku.** Gotowy deterministyczny rdzeń: wyliczenia, czerwone flagi,
Health Score, klasyfikacja ryzyka oraz warstwa minimalizacji danych wysyłanych
do modelu językowego.

Prototyp działa **wyłącznie na danych syntetycznych**. Tryb `real` jest
zablokowany technicznie do czasu imiennej akceptacji reguł medycznych
(decyzja 8) i zamknięcia bramki z sekcji 12.6 specyfikacji.

## Uruchomienie

```bash
npm install
npm run check     # typecheck + testy
```

Wymagany Node 22+.

## Struktura

```
docs/                        specyfikacja techniczna
packages/core/               deterministyczny silnik reguł
  src/calculations.ts        BMI, WHR, BMR, TDEE, HOMA-IR
  src/redFlags.ts            13 czerwonych flag (specyfikacja 7.3)
  src/riskCategory.ts        ZIELONA / ŻÓŁTA / CZERWONA + reguła STOP
  src/healthScore.ts         6 składowych, wagi wersjonowane
  src/ruleset.ts             status zestawu reguł i blokada danych rzeczywistych
  src/assess.ts              etapy B-F pipeline'u
  src/synthetic.ts           generator danych syntetycznych
packages/model-payload/      minimalizacja danych do modelu (decyzja 3)
  src/forbidden.ts           lista pól zakazanych + skaner
  src/build.ts               budowa ładunku z białej listy
```

## Zasady, które kod egzekwuje

Trzy rzeczy są wymuszone technicznie, nie regulaminowo:

1. **Scoring jest deterministyczny.** Health Score, kategoria ryzyka i czerwone
   flagi liczone są regułami. Model językowy ich nie widzi jako pytania — dostaje
   je jako fakt i nie może zmienić (ADR-03).
2. **Kategoria CZERWONA zatrzymuje pipeline.** Plan nie jest generowany;
   powstaje wyłącznie raport ryzyk i skierowania.
3. **Minimalizacja jest testowana.** Ładunek dla modelu budowany jest z białej
   listy i dodatkowo skanowany przed wysyłką. Test kończy się niepowodzeniem,
   jeśli do modelu trafi imię, e-mail, PESEL, pełna data lub surowy wynik badania
   tam, gdzie wystarcza interpretacja.

## Dokumenty

| Dokument | Status |
|---|---|
| [01 — Specyfikacja techniczna](docs/01-specyfikacja-techniczna.md) | wersja 0.2 — decyzje 2–8 podjęte |

## Rejestr decyzji

| # | Decyzja | Rozstrzygnięcie |
|---|---|---|
| 1 | Wariant hostingu produkcyjnego | odroczona do prototypu |
| 2 | Zapis zwrotny do Notion | nie — synchronizacja jednokierunkowa |
| 3 | Dane do modelu językowego | pseudonimizacja i redukcja |
| 4 | Stawka VAT | parametr cennika w Notion |
| 5 | Testy penetracyjne | CyberC4HE / ekosystem HCPL |
| 6 | IOD | IOD HCPL, zakres rozszerzony na FDP |
| 7 | Repozytorium | nowe, dedykowane |
| 8 | Walidacja medyczna reguł | progi robocze + imienna akceptacja lekarza |
