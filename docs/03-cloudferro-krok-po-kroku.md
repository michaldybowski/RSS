# CloudFerro krok po kroku

Dokument 02 mówi **co** postawić. Ten mówi **w jakiej kolejności klikać
i wpisywać**, z punktem kontrolnym po każdym kroku.

Zasada na cały ten dokument: **po każdym kroku jest „Sprawdź"**. Jeśli to,
co widzisz, nie zgadza się z opisem — zatrzymaj się na tym kroku. Idąc dalej
z niedziałającym krokiem, zbierzesz trzy błędy naraz i żadnego nie da się
przypisać do przyczyny.

CloudFerro prowadzi kilka chmur (CREODIAS, CODE-DE, WAW3-1, WAW3-2) i wszystkie
stoją na OpenStacku z panelem **Horizon**. Nazwy w menu są więc te same, ale
**nazwy flavorów i obrazów różnią się między chmurami** — dlatego poniżej podaję
parametry (2 vCPU / 4 GB), a nie nazwy własne. Wybierasz najbliższy pasujący.

---

## Zanim zaczniesz — trzy rzeczy

1. **Konto CloudFerro z projektem**, w którym masz co najmniej: 1 instancję,
   2 vCPU, 4 GB RAM, 40 GB dysku i 1 floating IP w limitach (Horizon pokazuje je
   w *Project → Compute → Overview*).
2. **Komputer z terminalem** — macOS albo Linux mają go wbudowany, na Windowsie
   użyj PowerShella (ma `ssh`) albo WSL.
3. **Domena, którą kontrolujesz** — potrzebna dopiero w kroku 9, ale lepiej
   wiedzieć od razu, której użyjesz. W dokumencie piszę `longevity.example.pl`;
   podstaw swoją. Jeśli domeny nie masz, kroki 1–8 zrobisz i tak, a aplikacje
   otworzysz przez tunel SSH (opis w kroku 8).

---

## Krok 1. Klucz SSH

Hasła do serwera nie będzie — OpenStack wstrzykuje klucz publiczny przy
tworzeniu maszyny i logowanie hasłem jest wyłączone. To jest domyślne
i dobre; nie zmieniaj tego.

**Na swoim komputerze:**

```bash
ls ~/.ssh/id_ed25519.pub          # masz już klucz?
```

Jeśli plik nie istnieje:

```bash
ssh-keygen -t ed25519 -C "longevity-cloudferro"
# Enter przy pytaniu o ścieżkę; hasło do klucza — ustaw, warto
cat ~/.ssh/id_ed25519.pub
```

**W Horizonie:** *Project → Compute → Key Pairs → Import Public Key*.
Nazwa: `longevity`. Key Type: `SSH Key`. W pole Public Key wklejasz **całą
zawartość** `id_ed25519.pub` — jedna linia zaczynająca się od `ssh-ed25519`.

> Wklejasz plik **`.pub`**. Ten drugi, bez rozszerzenia, jest kluczem prywatnym
> i nie opuszcza Twojego komputera — nigdy, w żadne pole, w żadnym panelu.

**Sprawdź:** na liście Key Pairs jest wpis `longevity` z fingerprintem.

---

## Krok 2. Grupa zabezpieczeń

*Project → Network → Security Groups → Create Security Group*.
Nazwa: `longevity-demo`.

Wejdź w *Manage Rules*. Domyślnie są tam dwie reguły **egress** (wychodzące) —
zostaw je. Dodaj trzy wejściowe (*Add Rule*):

| Rule | Port | Remote | CIDR |
|---|---|---|---|
| SSH | 22 | CIDR | **Twój adres IP/32** |
| HTTP | 80 | CIDR | `0.0.0.0/0` |
| HTTPS | 443 | CIDR | `0.0.0.0/0` |

Swój adres sprawdzisz poleceniem `curl -4 ifconfig.me`. Wpisujesz go jako
`1.2.3.4/32`. Jeśli masz łącze ze zmiennym IP, wpisz `0.0.0.0/0` — ale wtedy
krok 6 (fail2ban) przestaje być opcjonalny.

**Czego tu nie ma i być nie może:** portów 3000–3006. Aplikacje słuchają
wyłącznie na `127.0.0.1`, a z zewnątrz wpuszcza je nginx. Otwarcie ich
w grupie zabezpieczeń obeszłoby hasło z kroku 10 i wystawiło panel HR wprost
do internetu.

**Sprawdź:** grupa `longevity-demo` ma dokładnie 3 reguły ingress.

---

## Krok 3. Maszyna wirtualna

*Project → Compute → Instances → Launch Instance*.

| Zakładka | Co ustawić |
|---|---|
| **Details** | Instance Name: `longevity-demo`. Count: 1 |
| **Source** | Boot Source: **Image**. Create New Volume: **Yes**, Volume Size: **40 GB**, Delete on Terminate: **No**. Obraz: **Ubuntu 24.04** |
| **Flavor** | najbliższy **2 vCPU / 4 GB RAM** |
| **Networks** | sieć prywatna projektu (zwykle jedna, np. `cloud_…_private`) |
| **Security Groups** | zaznacz `longevity-demo`, **odznacz `default`** |
| **Key Pair** | `longevity` z kroku 1 |

Launch Instance.

> **Delete on Terminate: No** to nie drobiazg. Przy „Yes" skasowanie instancji
> zabiera dysk razem z nią. Przy demo na danych syntetycznych to jeszcze nie
> tragedia; przyzwyczajenie zostaje na później, kiedy to już będzie tragedia.

**Sprawdź:** po ~2 minutach status instancji to `Active`, Power State `Running`.

---

## Krok 4. Adres publiczny

Maszyna ma na razie adres prywatny. *Instances → menu przy instancji →
Associate Floating IP*. Jeśli lista jest pusta, kliknij `+`, wybierz pulę
(zwykle `external` / `floating`) i *Allocate IP*.

**Sprawdź:** w kolumnie IP Address instancja ma dwa adresy — prywatny
i publiczny. Publiczny to ten, którym się dalej posługujesz. Zapisz go;
w dokumencie piszę `IP_SERWERA`.

---

## Krok 5. Pierwsze logowanie

```bash
ssh ubuntu@IP_SERWERA
```

Przy pierwszym połączeniu SSH pokaże fingerprint hosta i zapyta
`Are you sure you want to continue connecting?` — wpisz `yes`.

**Sprawdź:** znak zachęty wygląda tak: `ubuntu@longevity-demo:~$`.

*Nie łączy się?* Po kolei: instancja `Active`, floating IP przypisany,
reguła SSH w grupie ma Twój **aktualny** adres (`curl -4 ifconfig.me`),
w grupie instancji jest `longevity-demo`. To wyczerpuje typowe przyczyny.

---

## Krok 6. Podstawy systemu

Wszystko poniżej wykonujesz **na serwerze**, w sesji SSH.

```bash
sudo apt update && sudo apt -y upgrade
sudo apt install -y curl git nginx ufw fail2ban apache2-utils

sudo ufw allow 22/tcp && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
sudo ufw --force enable

curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v
```

Zapora działa tu **podwójnie**, razem z grupą zabezpieczeń z kroku 2. To nie
jest nadmiar: grupa zabezpieczeń chroni przed ruchem z zewnątrz, `ufw` chroni
także przed ruchem z innych maszyn w tej samej sieci projektu.

**Sprawdź:** `node -v` wypisuje `v22.…`, a `sudo ufw status` pokazuje trzy
reguły i `Status: active`.

---

## Krok 7. Kod i budowanie

```bash
sudo useradd -m -s /bin/bash longevity
sudo -u longevity -i                     # od tej chwili jesteś użytkownikiem longevity

git clone --branch longevity-only --single-branch \
  https://github.com/michaldybowski/RSS.git ~/longevity
cd ~/longevity

npm ci
npm run check
```

**Sprawdź:** na końcu `npm run check` widzisz `# pass 632` i `# fail 0`.
To jest najważniejszy punkt kontrolny w całym dokumencie: jeśli testy tu nie
przechodzą, nie ma sensu niczego uruchamiać — problem jest w środowisku
(najczęściej wersja Node), a nie w konfiguracji, którą będziesz robić dalej.

Dalej — budowanie i przeglądarka do PDF:

```bash
for a in panel hr trener audytor admin api lekarz; do
  npm run build --workspace @longevity/$a
done

npx playwright install chromium
exit                                     # wracasz do użytkownika ubuntu

sudo npx playwright install-deps chromium
sudo ln -sf "$(sudo -u longevity find /home/longevity/.cache/ms-playwright \
  -name chrome -type f -path '*chrome-linux*' | head -1)" /usr/local/bin/chromium
/usr/local/bin/chromium --version
```

> Dlaczego nie `apt install chromium-browser`: na Ubuntu 24.04 to pakiet
> przejściowy do snapa, a snap ma prywatny `/tmp`. Generator PDF zapisuje plik
> do katalogu tymczasowego i odczytuje go z powrotem — snapowy Chromium zapisze
> go u siebie i proces Node go nie znajdzie. Wyjaśnienie w dokumencie 02, 3.1.

**Sprawdź:** siedem razy `✓ Compiled successfully` i wersja Chromium na końcu.

---

## Krok 8. Usługi

Na serwerze, jako `ubuntu`:

```bash
sudo tee /etc/systemd/system/longevity@.service > /dev/null <<'EOF'
[Unit]
Description=Longevity — %i
After=network.target

[Service]
Type=simple
User=longevity
WorkingDirectory=/home/longevity/longevity/apps/%i
Environment=NODE_ENV=production
Environment=HOSTNAME=127.0.0.1
Environment=CHROMIUM_PATH=/usr/local/bin/chromium
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now longevity@{panel,hr,trener,audytor,admin,api,lekarz}
sleep 10
for p in 3000 3001 3002 3003 3004 3005 3006; do
  printf '%s → %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$p/)"
done
```

**Sprawdź:** siedem linii, każda z kodem `200` albo `307` (przekierowanie na
stronę wyboru roli). Port 3005 (API) na `/` może zwrócić `404` — to poprawne,
API nie ma strony głównej, ma punkty końcowe pod `/api/v1/…`.

*Usługa nie wstaje?* `sudo journalctl -u longevity@panel -n 40 --no-pager`.

**Możesz już zajrzeć do środka, bez domeny.** Na swoim komputerze:

```bash
ssh -L 3000:127.0.0.1:3000 -L 3004:127.0.0.1:3004 ubuntu@IP_SERWERA
```

i w przeglądarce `http://127.0.0.1:3000` (panel uczestnika) oraz `:3004`
(panel administratora). Tunel nie omija żadnego zabezpieczenia — jedzie przez
Twoje uwierzytelnione połączenie SSH. Jeśli demo ma zobaczyć tylko zespół
techniczny, na tym możesz poprzestać i pominąć kroki 9–10.

---

## Krok 9. DNS

U operatora domeny dodaj **jeden rekord**:

| Typ | Nazwa | Wartość |
|---|---|---|
| A | `*.longevity` | `IP_SERWERA` |

Czyli wildcard: `panel.longevity.example.pl`, `hr.longevity.example.pl`
i pozostałe pięć wskażą tę samą maszynę, a rozdzieli je nginx po nazwie hosta.

**Sprawdź** (poczekaj kilka minut, czasem dłużej):

```bash
dig +short panel.longevity.example.pl
```

Ma zwrócić `IP_SERWERA`. Dopóki nie zwraca — krok 10 nie ma sensu, bo certbot
i tak nie wystawi certyfikatu.

---

## Krok 10. nginx, hasło i certyfikat

Konfiguracja nginx jest gotowa w dokumencie 02, sekcja 4.2 — skopiuj ją do
`/etc/nginx/sites-available/longevity`, podmieniając `longevity.example.pl`
na swoją domenę. Potem:

```bash
sudo htpasswd -c /etc/nginx/.htpasswd demo      # zapyta o hasło
sudo ln -s /etc/nginx/sites-available/longevity /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
```

Certyfikat **wildcard** Let's Encrypt wystawia wyłącznie przez wyzwanie DNS —
nie da się go dostać przez port 80. Certbot poprosi o dodanie rekordu TXT
`_acme-challenge.longevity.example.pl` u operatora domeny i zaczeka:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot certonly --manual --preferred-challenges dns \
  -d '*.longevity.example.pl' -d 'longevity.example.pl'
sudo systemctl reload nginx
```

> Certyfikat z wyzwaniem `--manual` **nie odnowi się sam**. Na demo to bez
> znaczenia (90 dni), ale zanotuj to sobie. Trwałe rozwiązanie to wtyczka DNS
> Twojego operatora albo siedem osobnych certyfikatów przez port 80 — obie
> drogi robimy dopiero przy pilotażu.

**Sprawdź:**

```bash
curl -sI https://panel.longevity.example.pl/ | head -1   # HTTP/2 401
curl -sI -u demo:TWOJE_HASLO https://panel.longevity.example.pl/ | head -1
```

Pierwsze `401` jest **ważniejsze niż drugie**: potwierdza, że bez hasła nikt
tego nie zobaczy. Drugie ma dać `200` albo `307`.

---

## Krok 11. Przebiegi sprawdzające

Na serwerze, jako `longevity`. Każdy przebieg jest **jednorazowy** — zmienia
stan w pamięci procesu, więc usługę restartujemy przed każdym:

```bash
sudo systemctl restart longevity@panel && sleep 8
sudo -u longevity -i bash -c 'cd ~/longevity && \
  CHROMIUM_PATH=/usr/local/bin/chromium npm run panel:e2e -- --url http://127.0.0.1:3000'
```

Tak samo dla pozostałych: `hr:e2e` (3001), `trener:e2e` (3002),
`audytor:e2e` (3003), `admin:e2e` (3004), `api:kontrakt` (3005),
`lekarz:e2e` (3006) — razem **339 sprawdzeń**, tabela w dokumencie 02, sekcja 7.

**Sprawdź:** każdy przebieg kończy się linią `N/N sprawdzeń przeszło`
i żadnym wierszem `BŁĄD`.

---

## Krok 12. Zanim pokażesz to komukolwiek

Powiedz trzy zdania — nie po to, żeby się asekurować, tylko dlatego, że bez
nich ktoś wyciągnie z demo wnioski, których ono nie unosi:

1. **Restart usługi kasuje wszystko.** Zgody, zapisy do wyzwań, konsultacje
   i zamówienia żyją w pamięci procesu. Bazy jeszcze nie ma.
2. **Nie ma logowania.** Rolę wybiera się z listy, całość stoi za jednym hasłem
   z kroku 10. Docelowo OIDC z drugim składnikiem dla ról personelu.
3. **Dane są syntetyczne, a tryb rzeczywisty jest zablokowany technicznie.**
   Zestaw reguł ma status `draft` i nie da się tego odblokować konfiguracją —
   dopiero imienna akceptacja progów przez lekarza (decyzja 8).

Lista rzeczy do zamknięcia przed wejściem prawdziwych ludzi — umowa powierzenia
z CloudFerro, szyfrowany wolumen z przetestowanym odtworzeniem, relacja
HCPL–FDP, zakres IOD, DPIA, pentesty — jest w dokumencie 02, sekcja 6.

---

## Gdyby coś nie zadziałało

| Objaw | Gdzie patrzeć |
|---|---|
| SSH nie łączy | grupa zabezpieczeń: czy reguła 22 ma Twój **aktualny** adres |
| `npm ci` przerywa | pamięć — `free -h`; przy 4 GB zwykle wystarcza, przy 2 GB dodaj swap |
| Usługa restartuje się w kółko | `journalctl -u longevity@NAZWA -n 50 --no-pager` |
| nginx: `502 Bad Gateway` | usługa na danym porcie nie stoi — `systemctl status longevity@NAZWA` |
| nginx: `404` na wszystkim | zły `map $host` — nazwa hosta nie zgadza się z konfiguracją |
| Certbot: `NXDOMAIN` | rekord TXT jeszcze się nie rozpropagował; `dig +short TXT _acme-challenge.…` |
| PDF: „Wynik nie jest plikiem PDF" | `CHROMIUM_PATH` wskazuje snapa albo katalog — patrz krok 7 |
