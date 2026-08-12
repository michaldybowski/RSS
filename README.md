# Longevity — portal i aplikacja mobilna

Platforma programu Długowieczności (HCPL / FDP).

## Stan

**Faza A — zamknięta.** Silnik reguł, minimalizacja danych, kwestionariusz,
model zgód, synchronizator Notion, pipeline planu, generowanie dokumentów
i panel uczestnika.

**Faza B — w toku.** Gotowe: autoryzacja w kontekście organizacji, agregacja
dashboardu HR z progiem k-anonimowości, rozliczenia A/B/C/G/M, prawa osoby
i retencja, panel HR, warsztaty i obecności, panel trenera, audyt Zdrowe Biuro
z certyfikacją, panel audytora, panel administratora oraz wyzwania
i gamifikacja. Zostaje: biblioteka i Akademia.

Prototyp działa **wyłącznie na danych syntetycznych**. Tryb `real` jest
zablokowany technicznie do czasu imiennej akceptacji reguł medycznych
(decyzja 8) i zamknięcia bramki z sekcji 12.6 specyfikacji.

## Uruchomienie

```bash
npm install
npm run check     # typecheck + testy

# Pełna droga na danych syntetycznych: kwestionariusz -> plan -> dokumenty
CHROMIUM_PATH=/ścieżka/do/chrome npm run demo -- --out ./out

# Panel uczestnika
npm run panel:build && npm start --workspace @longevity/panel

# Przejście przez panel jak użytkownik (panel musi działać)
CHROMIUM_PATH=/ścieżka/do/chrome npm run panel:e2e -- --url http://127.0.0.1:3000

# Panel HR
npm run hr:build && npm start --workspace @longevity/hr
CHROMIUM_PATH=/ścieżka/do/chrome npm run hr:e2e -- --url http://127.0.0.1:3001

# Panel trenera
npm run trener:build && npm start --workspace @longevity/trener
CHROMIUM_PATH=/ścieżka/do/chrome npm run trener:e2e -- --url http://127.0.0.1:3002

# Panel audytora (przebieg e2e jest jednorazowy — serwer na świeżo)
npm run audytor:build && npm start --workspace @longevity/audytor
CHROMIUM_PATH=/ścieżka/do/chrome npm run audytor:e2e -- --url http://127.0.0.1:3003

# Panel administratora (przebieg e2e jest jednorazowy — serwer na świeżo)
npm run admin:build && npm start --workspace @longevity/admin
CHROMIUM_PATH=/ścieżka/do/chrome npm run admin:e2e -- --url http://127.0.0.1:3004
```

Wymagany Node 22+. PDF powstaje przez Chromium w trybie bezgłowym; bez
`CHROMIUM_PATH` demo generuje HTML, DOCX i iCal, a PDF pomija.
W kontenerze działającym jako root potrzebne jest dodatkowo
`CHROMIUM_NO_SANDBOX=1` — właściwym rozwiązaniem jest jednak uruchomienie
procesu jako użytkownik bez uprawnień roota.

## Struktura

```
apps/hr/                     panel HR — agregaty i rozliczenia
  app/dashboard/             metryki z filtrami i jawnym wstrzymaniem wyniku
  app/rozliczenia/           dokumenty wg linii finansowania
  app/dziennik/              dziennik dostępu z zapisem filtrów
  lib/zapytania.ts           jedyne wejście do danych: autoryzacja + audit log
apps/trener/                 panel trenera — warsztaty i obecności
  app/warsztaty/             lista własnych warsztatów ze stanem i frekwencją
  app/warsztaty/[id]/        lista obecności; blokada przed rozpoczęciem
  app/rozliczenie/           pozycje wstrzymane bez listy obecności
apps/audytor/                panel audytora — Zdrowe Biuro i certyfikacja
  app/audyty/[id]/           arkusz kryteriów z wynikiem i listą braków
  app/rejestr/               publiczna weryfikacja numeru certyfikatu
apps/admin/                  panel administratora — utrzymanie systemu
  app/synchronizacja/        zapowiedź różnic, potwierdzenie źródeł krytycznych
  app/rodo/                  wnioski osób; metadane pakietu zamiast treści
  app/retencja/              zadania wymagalne i ich wykonanie
  app/stan/                  wersje reguł i warunki przed produkcją
  lib/operacje.ts            jedyne wejście: autoryzacja + audit log
apps/panel/                  panel uczestnika (Next.js, ADR-04/05)
  app/                       krok 0, kwestionariusz, podsumowanie, wynik
  app/wyzwania/              katalog z powodem wstrzymania, punkty, ranking
  app/wyzwania/[id]/         wpis dzienny, passa, historia pomiarów
  app/dokumenty/[format]/    pobieranie HTML, PDF, DOCX, iCal
  lib/session.ts             stan sesji — WYŁĄCZNIE prototyp, do wymiany
  middleware.ts              ustanowienie sesji przed renderowaniem
  e2e/przejscie.mts          przejście przez panel w przeglądarce
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
packages/questionnaire/      kwestionariusz wstępny
  src/definition.ts          10 domen, logika warunkowa, walidacja
  src/conditions.ts          ewaluator warunków widoczności
  src/validate.ts            walidacja odpowiedzi (Etap 1 pipeline'u)
  src/normalize.ts           odpowiedzi → wejście silnika reguł
packages/consent/            model zgód (specyfikacja 12.1-12.3)
  src/definitions.ts         katalog zgód z podstawą prawną i skutkiem wycofania
  src/ledger.ts              rejestr zdarzeń tylko do dopisywania
  src/gates.ts               bramki operacji, tryb generowania planu
packages/documents/          generowanie dokumentów
  src/model.ts               5 dokumentów pakietu konsultacyjnego + plan
  src/html.ts                kanoniczny HTML: podgląd, wydruk, źródło PDF
  src/pdf.ts                 PDF przez Chromium; silnik wstrzykiwany
  src/docx.ts                wersja edytowalna dla lekarza
  src/ics.ts                 kalendarz RFC 5545
packages/plan/               pipeline generowania planu (specyfikacja 8)
  src/plan.ts                schemat planu i zastrzeżenie platformy
  src/validate.ts            walidacja strukturalna odpowiedzi modelu
  src/guardrails.ts          bariery merytoryczne + informacja zwrotna
  src/referrals.ts           zlecenie badań i pytania do lekarza z reguł
  src/pipeline.ts            orkiestracja, ponowienia, kolejka ręczna
packages/access/             autoryzacja w kontekście organizacji (4.1)
  src/authorize.ts           domyślna odmowa; każde "wolno" z jawnej reguły
packages/analytics/          agregacja dashboardu HR (specyfikacja 10)
  src/anonymity.ts           próg k, reguła dopełnienia, zaokrąglanie
  src/dashboard.ts           metryki z kontrolą progu
  src/audit.ts               rejestr wejść, wykrywanie serii zawężających
packages/billing/            rozliczenia A/B/C/G/M (specyfikacja 13)
  src/money.ts               arytmetyka na groszach, VAT bez ułamków dziesiętnych
  src/zfss.ts                progi dopłat per organizacja
  src/run.ts                 przebieg: obciążenia -> dokumenty
packages/gdpr/               prawa osoby i retencja (12.3-12.4)
  src/audit.ts               log tylko do dopisywania, po pseudonimie
  src/retention.ts           trzy punkty odniesienia, sweeper zadań
  src/export.ts              pakiet art. 15 i 20
  src/erasure.ts             usunięcie w trzech kategoriach + potwierdzenie
  src/wnioski.ts             rejestr wniosków, termin 30 dni, pakiet za tokenem
  src/etykiety.ts            nazwy rodzajów rekordów po polsku
packages/workshops/          warsztaty on-site
  src/enrollment.ts          zapisy, lista rezerwowa, awans po zwolnieniu
  src/attendance.ts          obecności, lista dla trenera, frekwencja
  src/settlement.ts          rozliczenie trenera
packages/challenges/         wyzwania i gamifikacja (specyfikacja 9)
  src/kwalifikacja.ts        kto może wziąć udział i dlaczego nie
  src/pomiary.ts             okno wsteczne, zakresy, jeden dzień = jedna wartość
  src/punkty.ts              próg zamiast licznika, limit dobowy, passa
  src/postep.ts              próg ukończenia 80%, podsumowanie uczestnika
  src/ranking.ts             ranking zespołowy powyżej progu k, własna pozycja
packages/audit/              audyt i certyfikacja (specyfikacja 11)
  src/scoring.ts             wagi, "nie dotyczy" poza mianownikiem, ESRS S1
  src/workflow.ts            warunki zamknięcia, wydanie i weryfikacja
packages/notion-sync/        synchronizacja Notion -> cache (ADR-02)
  src/types.ts               kontrakt czytnika: jedna metoda, tylko odczyt
  src/sources.ts             mapowanie 6 baz Notion na rekordy cache
  src/props.ts               odczyt właściwości z raportowaniem problemów
  src/rateLimit.ts           odstępy między żądaniami i ponowienia
  src/sync.ts                orkiestracja: tryb pełny i przyrostowy
  src/preview.ts             zapowiedź różnic bez zapisu; źródła krytyczne
```

## Zasady, które kod egzekwuje

Wymuszone technicznie, nie regulaminowo:

1. **Scoring jest deterministyczny.** Health Score, kategoria ryzyka i czerwone
   flagi liczone są regułami. Model językowy ich nie widzi jako pytania — dostaje
   je jako fakt i nie może zmienić (ADR-03).
2. **Kategoria CZERWONA zatrzymuje pipeline.** Plan nie jest generowany;
   powstaje wyłącznie raport ryzyk i skierowania.
3. **Minimalizacja jest testowana.** Ładunek dla modelu budowany jest z białej
   listy i dodatkowo skanowany przed wysyłką. Test kończy się niepowodzeniem,
   jeśli do modelu trafi imię, e-mail, PESEL, pełna data lub surowy wynik badania
   tam, gdzie wystarcza interpretacja.
4. **Zgoda jest odwoływalna zawsze**, także ta wymagana do działania programu.
   Wycofanie zgody na wearables nie blokuje planu; wycofanie zgody na AI
   przełącza na ścieżkę ręczną, nie odcina uczestnika od programu.
5. **Zmiana treści zgody wymusza ponowne zebranie.** Zgoda udzielona na starszą
   wersję nie przenosi się na nową — inaczej „zgodziłem się" znaczyłoby coś
   innego niż to, co osoba przeczytała.
6. **Synchronizacja z Notion jest jednokierunkowa.** Kontrakt czytnika ma jedną
   metodę i jest to odczyt. Import przyrostowy nigdy nie archiwizuje rekordów
   nieobecnych w wyniku — tylko import pełny, bo tam brak rekordu naprawdę
   oznacza usunięcie.
7. **Model nie może przekroczyć swoich uprawnień.** Plan przechodzi przez
   bariery merytoryczne: bez diagnozy, bez nazw i dawek leków, bez obietnic
   efektu, w granicach zadeklarowanej dostępności czasowej i ograniczeń
   z kategorii ryzyka. Naruszenie wraca do modelu jako instrukcja, nie jest
   poprawiane po cichu.
8. **Trzy nieudane próby to kolejka ręczna, nie plan byle jaki.** Zlecenie badań
   i pytania do lekarza powstają z reguł, więc specjalista dostaje komplet
   materiału nawet wtedy, gdy model zawiódł.
9. **HR nie dosięgnie danych pojedynczej osoby** — także we własnej organizacji.
   Imienna lista uczestników nie jest dostępna dla żadnej roli, a administrator
   nie jest wytrychem do danych zdrowotnych.
10. **Agregat chroni też dopełnieniem.** Filtr obejmujący 11 z 12 osób jest
    blokowany, bo dwunastą osobę da się wtedy wskazać przez różnicę.
11. **Usunięcie danych nie kasuje audit logu ani dokumentów księgowych.**
    Rozdział pseudonimu od tożsamości sprawia, że jedno nie wyklucza drugiego;
    potwierdzenie mówi osobie wprost, co zostało i na jakiej podstawie.
12. **Obecności nie da się odnotować przed rozpoczęciem warsztatu.** Lista
    wypełniona z góry nie jest listą obecności, tylko listą zapisów.
13. **Jedyna imienna lista w systemie** to lista zapisanych na jeden warsztat,
    widoczna dla jednego trenera — i pokazuje imię z inicjałem, nie pełne dane.
14. **Certyfikatu nie da się wydać na skróty.** Audyt zamyka się dopiero po
    ocenieniu wszystkich kryteriów i załączeniu dowodów tam, gdzie standard ich
    wymaga; certyfikat powstaje wyłącznie z zamkniętego audytu powyżej progu.
15. **Cennik i progi ZFŚS nie wjeżdżają bez obejrzenia zmian.** Import tych
    dwóch źródeł wymaga potwierdzenia zapowiedzi różnic — pomyłka w Notion
    przekłada się stamtąd wprost na kwoty na notach.
16. **Realizacja wniosku RODO to nie odczyt danych.** Administrator uruchamia
    eksport i wykonuje usunięcie, ale pakiet jest zapieczętowany: panel dostaje
    metadane, treść otwiera osoba tokenem przekazanym poza panelem.
17. **Gamifikacja nie popycha do tego, co odradza ocena ryzyka.** Wyzwania
    wysiłkowe są zamknięte przy kategorii CZERWONEJ i przy flagach wykluczających
    wysiłek — ale sen, nawodnienie i nawyki zostają dostępne, bo odcięcie takiej
    osoby od całego programu byłoby drugą szkodą. Wyzwanie niedostępne widać
    na liście razem z powodem; nie znika bez słowa.
18. **Punkty nagradzają regularność, nie wyczyn.** Przekroczenie celu nie daje
    dodatkowych punktów, dobowa suma ze wszystkich wyzwań jest ograniczona,
    a passy nie kasuje jeden dzień przerwy — passa, którą kończy dzień choroby,
    uczy ćwiczyć na chorobie. Punktów nie da się wymienić na pieniądze ani na
    zniżkę na świadczenie: typ nagrody nie ma takiego wariantu.
19. **Rankingu imiennego nie ma.** Uczestnik poznaje własną pozycję jako liczbę;
    zestawienia zespołowe obejmują tylko zespoły powyżej progu k-anonimowości
    i pokazują średnią, nie sumę. Zespół poniżej progu nie jest wymieniony
    nawet z nazwy.

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
