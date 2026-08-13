# Uruchomienie testowe na CloudFerro

Instrukcja dla **środowiska demonstracyjnego** — do pokazania zespołowi
i partnerom, na danych syntetycznych. Nie jest to instrukcja pilotażu
z prawdziwymi uczestnikami; różnica jest opisana w sekcji „Czego to jeszcze
nie jest".

---

## 1. Dlaczego CloudFerro, a nie Bluehost

Bluehost odpadał z jednego powodu: dane klasy K1 (art. 9 RODO — zdrowie)
nie mogą trafić na hosting współdzielony bez kontroli nad lokalizacją
i bez umowy powierzenia. CloudFerro to infrastruktura w Polsce, z maszynami
wirtualnymi, które kontrolujecie — to zamyka **decyzję 1 ze specyfikacji**
w wariancie W2 (VPS w PL/DE).

Do środowiska demonstracyjnego wystarczy jedna maszyna. Do pilotażu
z ludźmi dochodzą rzeczy z sekcji 5.

---

## 2. Maszyna

| Parametr | Wartość na demo | Uwaga |
|---|---|---|
| vCPU | 2 | budowanie siedmiu aplikacji trwa ~3 min |
| RAM | 4 GB | siedem procesów Node ≈ 0,9 GB; build bywa pamięciożerny |
| Dysk | 40 GB SSD | repozytorium + `node_modules` ≈ 2 GB |
| System | Ubuntu 24.04 LTS | |
| Region | Polska | wymóg lokalizacji danych |

Grupa zabezpieczeń: wpuszczamy **22 (SSH), 80 i 443**. Porty aplikacji
(3000–3006) zostają zamknięte — aplikacje słuchają na `127.0.0.1`,
a ruch z zewnątrz idzie przez nginx.

---

## 3. Instalacja

```bash
# --- pakiety systemowe ---
sudo apt update && sudo apt install -y curl git nginx chromium-browser
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# --- kod ---
sudo useradd -m -s /bin/bash longevity
sudo -u longevity -i
git clone --branch longevity-only --single-branch \
  https://github.com/michaldybowski/RSS.git ~/longevity
cd ~/longevity

npm ci
npm run check          # 630 testów + typecheck — musi przejść przed startem

for a in panel hr trener audytor admin api lekarz; do
  npm run build --workspace @longevity/$a
done
```

`chromium-browser` jest potrzebny wyłącznie do generowania PDF w panelu
uczestnika. Bez niego panel działa, a pobieranie PDF zwraca błąd.

---

## 4. Usługi i nginx

### 4.1 systemd — jedna usługa na aplikację

Szablon `/etc/systemd/system/longevity@.service`:

```ini
[Unit]
Description=Longevity — %i
After=network.target

[Service]
Type=simple
User=longevity
WorkingDirectory=/home/longevity/longevity/apps/%i
Environment=NODE_ENV=production
Environment=HOSTNAME=127.0.0.1
Environment=CHROMIUM_PATH=/usr/bin/chromium-browser
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now longevity@{panel,hr,trener,audytor,admin,api,lekarz}
```

Porty są zapisane w `package.json` każdej aplikacji:

| Aplikacja | Port | Kto tego używa |
|---|---|---|
| `panel` | 3000 | uczestnik |
| `hr` | 3001 | pracodawca |
| `trener` | 3002 | trener warsztatów |
| `audytor` | 3003 | audytor Zdrowego Biura |
| `admin` | 3004 | operator platformy |
| `api` | 3005 | klient mobilny (Faza C) |
| `lekarz` | 3006 | lekarz konsultujący |

**Jedna instancja na aplikację.** Stan prototypu żyje w pamięci procesu,
więc drugi worker miałby własny, rozjechany świat. Nie włączajcie klastrowania
ani `PM2 -i max`.

### 4.2 nginx — subdomeny, nie ścieżki

Aplikacje Next.js zakładają, że stoją w katalogu głównym. Prefiksy ścieżek
(`/panel`, `/hr`) wymagałyby zmian w kodzie (`basePath`), więc na demo
prościej dać subdomeny. Rekord DNS: `*.longevity.example.pl` na IP maszyny.

```nginx
# /etc/nginx/sites-available/longevity
map $host $longevity_port {
    panel.longevity.example.pl    3000;
    hr.longevity.example.pl       3001;
    trener.longevity.example.pl   3002;
    audytor.longevity.example.pl  3003;
    admin.longevity.example.pl    3004;
    api.longevity.example.pl      3005;
    lekarz.longevity.example.pl   3006;
}

server {
    listen 443 ssl http2;
    server_name *.longevity.example.pl;

    ssl_certificate     /etc/letsencrypt/live/longevity.example.pl/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/longevity.example.pl/privkey.pem;

    # Prototyp nie ma prawdziwego logowania — rolę wybiera się z listy.
    # Do czasu wdrożenia OIDC całość stoi za hasłem na poziomie serwera.
    auth_basic           "Longevity — środowisko demonstracyjne";
    auth_basic_user_file /etc/nginx/.htpasswd;

    location / {
        proxy_pass http://127.0.0.1:$longevity_port;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo htpasswd -c /etc/nginx/.htpasswd demo
sudo certbot --nginx -d '*.longevity.example.pl' --preferred-challenges dns
sudo ln -s /etc/nginx/sites-available/longevity /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Rejestr certyfikatów w panelu audytora (`/rejestr`) jest z założenia publiczny —
certyfikat, którego nie da się sprawdzić, jest naklejką. Na demo zostawiamy go
jednak za wspólnym hasłem; wyłączenie `auth_basic` dla tej jednej ścieżki
ma sens dopiero przy prawdziwych certyfikatach.

---

## 5. Czego to jeszcze nie jest

Trzy rzeczy, które trzeba powiedzieć wprost, zanim ktokolwiek zobaczy to
środowisko:

1. **Stan żyje w pamięci procesu.** Restart usługi kasuje zgody, zapisy do
   wyzwań, konsultacje i zamówienia. Do pilotażu wchodzi PostgreSQL
   z szyfrowaniem kolumnowym dla klasy K1 — wskazany w specyfikacji 3.2.

2. **Nie ma prawdziwego uwierzytelniania.** Rolę wybiera się z listy na
   stronie startowej, a token API jest wpisany w kodzie. Stąd `auth_basic`
   na całości. Docelowo: OIDC z drugim składnikiem dla ról personelu.

3. **Wyłącznie dane syntetyczne.** Zestaw reguł ma status `draft`, więc
   ścieżka danych rzeczywistych jest **zablokowana technicznie** — nie
   proceduralnie. Nie da się jej odblokować konfiguracją, dopóki lekarz
   nie zaakceptuje progów imiennie (decyzja 8).

## 6. Zanim wejdą prawdziwi ludzie

Poza trzema punktami wyżej:

- **umowa powierzenia przetwarzania z CloudFerro** (art. 28 RODO),
- szyfrowany wolumen i kopie zapasowe z odtworzeniem przetestowanym raz,
- rozstrzygnięcie relacji HCPL–FDP: współadministrowanie czy powierzenie,
- rozszerzenie zakresu IOD i zgłoszenie do UODO,
- DPIA z udziałem IOD,
- testy penetracyjne (decyzja 5) — po wdrożeniu OIDC, nie przed,
- sposób weryfikacji tożsamości pacjenta przy konsultacji (patrz panel lekarza).

---

## 7. Sprawdzenie po wdrożeniu

Na maszynie, po uruchomieniu usług:

```bash
cd ~/longevity
npm run check                                   # 630 testów, typecheck

# każdy przebieg jest jednorazowy — usługę restartujemy przed sprawdzeniem
sudo systemctl restart longevity@panel
CHROMIUM_PATH=/usr/bin/chromium-browser CHROMIUM_NO_SANDBOX=0 \
  npm run panel:e2e -- --url http://127.0.0.1:3000
```

Analogicznie `hr:e2e`, `trener:e2e`, `audytor:e2e`, `admin:e2e`,
`lekarz:e2e` oraz `api:kontrakt` — razem 286 sprawdzeń.
