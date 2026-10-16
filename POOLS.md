# Cryptocode mining pools — hoe het staat (bijgewerkt 16 oktober 2026)

Lees dit vóór je iets aan de pools, de Umbrel of de VPS verandert.

## Overzicht

| Publiek (pool.cryptocodes.eu) | VPS HAProxy → Umbrel | Pool | Fee | Openbaar |
|---|---|---|---|---|
| 3333 | → 100.111.67.28:3456 | BTC solo — Bassin-app, eigen ckpool-image | 1% → bc1qtr0j4w275ndkyrh5396rzdvmtakqymcp046cht | ja |
| 3338 | → :3338 | BTC solo **rental** — losse container `btc-rental` (mindiff 500k, startdiff 1M) | 1% → zelfde BTC-adres | ja |
| 3334 | → :3335 | BCH solo — LoneStrike Cash (asicseer-pool `-B`) | 1% → bitcoincash:qppus6ldc7esd8x4lfq6yk98metwm6mg6czuhu4k8p | ja |
| 3337 | → :3337 | BCH solo **rental** — losse container `bch-rental` (mindiff 500k, startdiff 1M) | 1% → zelfde BCH-adres | ja |
| 3335 | → :22559 | DOGE+LTC **publiek** — losse container `doge-public` (image cryptocode/doge-public:1.7.0, PUBLIC_MERGED=1), username `LTC.DOGE[.rig]` | 1% op LTC → LdAEjW… en 1% op DOGE → DFabbT3… | ja (live 26 sep) |
| 3339 | → :22562 | DOGE+LTC **publiek rental** — losse container `doge-public-rental` (zelfde image, START_DIFFICULTY 1048576, MIN 65536), username `LTC.DOGE[.rig]` | 1% op LTC en DOGE | ja (live 26 sep) |
| 3336 | → :22558 | DOGE+LTC rental (umbrel-dogecoin 1.6.1, LOCK_PAYOUT_ADDRESS=1) | – | alleen tijdens eigen huurorder |
| niet doorgestuurd | :22557 | DOGE+LTC thuispoort (app 1.6.1), gelockt op eigen adressen | – | nee |
| niet doorgestuurd | :33333 | LoneStrike SV2 — betaalt altijd één vast adres | – | nooit openbaar |

Nooit doorsturen: RPC-poorten 8332 (BTC/BCH), 9332 (LTC), 22555 (DOGE), dashboards.

Toegang: VPS `ssh -i ~/.ssh/id_ed25519_vps ubuntu@57.131.149.173` (Tailscale `pool-vps` 100.105.8.122), config in `/etc/haproxy/haproxy.cfg`, firewall `ufw`. Umbrel `ssh umbrel@192.168.1.149` (Tailscale 100.111.67.28). DNS pool.cryptocodes.eu → 57.131.149.173 (niet via Cloudflare-proxy, stratum werkt daar niet door).

## Hoe de 1% fee werkt

- **BTC:** standaard ckpool heeft geen operator-fee; de enige "donation" gaat naar een in de code vastgezet adres van de ckpool-ontwikkelaar. Daarom draait Bassin op een eigen build `cryptocode/ckpool-solo-fee:v1.1.1` (Dockerfile in `~/ckpool-fee` op de Umbrel) waarin dat adres vervangen is door ons BTC-adres, plus `"donation" : 1.0` in `~/umbrel/app-data/bassin/data/config/ckpool.conf`. Controle: `ckpool.log` moet `1.0 percent donation to bc1qtr0j…` tonen.
- **BCH:** asicseer-pool kent `pool_fee` (naar `bchaddress`), maar het startscript van LoneStrike schrijft bij elke start `0.0`. Daarom is `~/umbrel/app-data/sslabs-solostrike-cash/entrypoint-fee.sh` (kopie met 1.0) over `/entrypoint.sh` gemount in docker-compose.yml. `bch-rental` gebruikt een eigen kopie `~/bch-rental-entrypoint.sh`.

## ⚠️ Updates — dit gaat fout als je het vergeet

Een update van **Bassin** of **LoneStrike** in de Umbrel App Store zet `docker-compose.yml` terug:
- Bassin draait dan weer de officiële image, maar `donation: 1.0` blijft in de config staan → **1% gaat naar de ckpool-ontwikkelaar in plaats van naar ons.**
- LoneStrike draait dan weer met `pool_fee: 0.0` → geen fee.

**Na élke update van Bassin of LoneStrike:** log in op de Umbrel en draai `~/fees-herstellen.sh`. Dat zet beide terug, herstart en toont de controle (BTC `1.0 percent donation to bc1qtr0j…`, BCH en BCH rental `"pool_fee": 1.0`).
- Meldt het script "LET OP: update gebruikt docker-ckpool-solo:vX": de officiële ckpool is naar een nieuwe versie gegaan. Het script zet onze v1.1.1 terug; bouw daarna een nieuwe versie (in `~/ckpool-fee/Dockerfile` de `git checkout`-tag aanpassen, opnieuw bouwen met `--build-arg FEE_ADDR=bc1qtr0j4w275ndkyrh5396rzdvmtakqymcp046cht`, controleren dat de build faalt als het oude adres niet gevonden wordt) en herstart `bassin` én `btc-rental`.
- `btc-rental` en `bch-rental` zijn losse containers (`--restart unless-stopped`), niet uit de App Store. Die worden nooit automatisch bijgewerkt en een app-update raakt ze niet.
- **Nooit "Alles bijwerken"** in de Umbrel als Bassin of LoneStrike in de lijst staan: werk die apart bij en draai daarna `~/fees-herstellen.sh`. De AI-agent (Claude Code via Umbrel MCP) werkt Bassin en LoneStrike nooit bij.

## Overig

- Umbrel draaide op 26 sep vast door een Ubuntu Desktop-VM (Machines, 4 cores/8 GB) naast de full nodes. VM gestopt (`virsh destroy umbrel-machine-ubuntu-desktop`, autostart uit). Geen VM's meer naast de nodes, of maximaal 2 cores/4 GB.
- Na een harde herstart moeten de nodes eerst bijwerken; ckpool meldt dan "Bitcoin Core is in initial sync" en komt vanzelf terug.
- LoneStrike-images staan op `:latest` van een externe ontwikkelaar (danhaus93-ops); `bch-rental` is vastgezet op de image-ID die op 26 sep draaide.
- **DOGE+LTC openbaar (LIVE sinds 26 sep):** nieuwe modus `PUBLIC_MERGED=1` in umbrel-dogecoin (sinds 16 okt op `main` van cryptocodes-labs/umbrel-dogecoin-litecoin-merged: 1.7.0 = openbare modus, 1.8.0 = plus optioneel PEP). Draait als **losse container `doge-public`** naast de bestaande app (die blijft 1.6.1, gelockt). Gebruikersnaam `LTC-adres.DOGE-adres[.rig]` (ltc1q… mag). De pool bouwt per miner zelf het DOGE-blok (getblocktemplate + auxpow via submitblock) omdat createauxblock maar één adres kan betalen: 99% miner / 1% fee op beide chains naar PAYOUT_ADDRESS (DFabbT3…) en LTC_PAYOUT_ADDRESS (LdAEjW…). Umbrel-poort 22559 (stratum), 22561 (dashboard, alleen LAN). Uitrol: `scripts/deploy-public-umbrel.sh`; VPS publiek 3335 → Umbrel 22559. Getest op regtest met echte dogecoind 1.14.9 + litecoind 0.21.5.8 (CI: `test/merged_regtest.sh` draait alle `*_regtest`- en `public_*`-suites tegen de echte daemons); privé-modus byte-identiek gebleven.
- Andreas heeft op 26 sep akkoord gegeven om BTC en BCH openbaar te maken.
- 26 sep: externe test geslaagd — eigen miner via pool.cryptocodes.eu kwam binnen en stuurde shares. Rental-poorten 3337/3338 nog niet met een echte huurorder getest.
- 26 sep eindcontrole: `python3 ~/Documents/umbrel-dogecoin/scripts/check_pools.py` (leest het werk van alle publieke poorten zoals een miner het krijgt) gaf 5× OK, 99% miner / 1% fee. DOGE- en LTC-blok van de publieke pool door de mainnet-nodes als geldig beoordeeld via `sudo docker exec doge-public node /app/verify-proposal.js <LTC> <DOGE>`. Draai beide checks opnieuw na elke wijziging of update.
- `doge-public` herbouwen na codewijziging: bron (`images/stratum` van main) naar `~/doge-public-src` kopiëren, `chmod -R a+rX ~/doge-public-src` (anders EACCES), dan `sudo bash ~/deploy-public-umbrel.sh`. Wordt niet door de App Store bijgewerkt. Het script in de repo bouwt sinds 1.8.0 `cryptocode/doge-public:1.8.0` en neemt ook de `PEP_*`-instellingen uit de Solo-app over.
- 26 sep: doge-public en doge-public-rental draaien met MAX_CONNECTIONS(_PER_IP)=512: al het publieke verkeer komt via HAProxy van één IP binnen, de standaard 8 per IP gold dus voor iedereen samen. Env-bestanden: ~/doge-public/env en ~/doge-public-rental/env.
- Eigen MRR Scrypt-huur: pool 1 = doge.pool.cryptocodes.eu:3339 met username LdAEjW….DFabbT3….rental32 (99% + 1% fee, allebei naar ons), pool 2 (backup) = :3336 met DFabbT3….rental29 (privé, gelockt). Niet meer op 3335 met alleen een DOGE-adres: dat weigert de publieke pool.

## Pool-overzicht (één pagina voor alle pools)

- `pool-overzicht/` (server.js + install.sh), draait als container `pool-overzicht` op de Umbrel, poort **22570**: http://192.168.1.149:22570 , JSON op `/api` (basis voor stats op de website).
- Alleen-lezen: leest pool.status/users van Bassin en btc-rental, LoneStrike/bch-rental logs, en `/api/status` van doge-public, doge-public-rental en de privé DOGE-app.
- Installeren/vernieuwen: vanaf Mac `scp -r ~/Projects/umbrel-cryptocode/pool-overzicht umbrel@192.168.1.149:~/` en op de Umbrel `bash ~/pool-overzicht/install.sh`.
- De DOGE-app-dashboard toont alleen de privé pool (22557/22558/3336). Publieke/rental miners staan op 22561/22563 en op dit overzicht. BTC/BCH rentals staan niet in Bassin/LoneStrike (aparte containers) — wel hier.

## Publieke stats (live sinds 26-09-2026)

- VPS: Caddy op 80/443 (`/etc/caddy/Caddyfile`), alleen `https://pool.cryptocodes.eu/public/*` → Umbrel 100.111.67.28:22570. Andere paden geven een tekstregel. Mining-poorten (HAProxy) staan er los van.
- API: `/public/summary` (totalen per pool, geen adressen) en `/public/miner/<adres>` (één adres; merged = DOGE-adres). 30 s cache, 30 verzoeken/min per IP.
- Website: sectie "Live stats" op /minen/solo-pool (`src/components/SoloPoolStats.tsx`, 9 talen), CSP connect-src bevat pool.cryptocodes.eu. Live gecontroleerd op cryptocodes.eu en cryptocode.nl.

## Stand 16 oktober 2026 (nodes en apps)

- **Litecoin Node 0.21.5.8-1** (was 0.21.4). Verplicht voor pools: 0.21.5.6 en 0.21.5.7 brachten MWEB-softforks, actief sinds hoogte 3.154.440 en 3.172.640. Litecoin 24 (nu rc) doet een MWEB-database-upgrade die niet terug kan: eerst back-up.
- **Dogecoin Node 1.14.9-2**: alleen nieuwe image-adressen. Sinds de verhuizing naar de org staan alle images op `ghcr.io/cryptocodes-labs/…`; `ghcr.io/andreashetem-cloud/…` bestaat niet meer (een herinstallatie van een oude versie zou falen).
- **DOGE + LTC Solo 1.8.0** (privé, PEP uit). `doge-public` en `doge-public-rental` draaien nog hun 1.7.0-build tot de PEP-uitrol.
- **Pepecoin Node 1.1.0-1** geïnstalleerd (16 okt), nog niet aan de pool gekoppeld.
- **DBCACHE=450** op de DOGE- en LTC-node, via Umbrel-instellingen (eigen omgevingsvariabele, blijft bij updates). Scheelt weinig RAM: het geheugen van die nodes zit vooral in de blokindex.
- **BTC-node**: Bitcoin Core v31.1.0. **16 okt 16:24 (NL) segfault** in een RPC-thread; de Umbrel Bitcoin-app start bitcoind dan bewust niet opnieuw ("TODO … auto-restart", manager.ts) en blijft "ready" tonen. Bassin en btc-rental zaten 30 min zonder node, weigerden 1…/3…-adressen en hun `ckpool.log` groeide 5 MB/s. Opgelost met een herstart; nu bewaakt (zie hieronder). Enige crash sinds 3 okt, geen hardwarefouten.
- **BCH-node**: officiële Umbrel-app, BCHN v29.0.0; v29.2.0 is "strongly encouraged" — wachten op een update van de Umbrel-app.
- De ckpool-logboeken van Bassin en btc-rental zijn op 16 okt leeggemaakt (samen 18,8 GB spam); nuttige regels staan in `ckpool-tot-2026-10-16.log` ernaast.
- In de Umbrel zit een ongebruikte interne NVMe van 512 GB (`nvme0n1`, geen partities).

## PEP (Pepecoin) — klaar, nog niet live

- Pepecoin wordt als tweede extra munt naast DOGE onder dezelfde LTC-hashes gemined (chain merkle tree: DOGE 98 op plek 0, PEP 63 op plek 1). Zonder PEP-instellingen is alles byte-identiek aan 1.7.0.
- Aanzetten: in `~/umbrel/app-data/doge-dogecoin-solo/.env` `PEP_RPC_HOST=doge-pepecoin-node_pepecoind_1`, `PEP_RPC_PASSWORD=…` (dashboard van de Pepecoin Node) en `PEP_PAYOUT_ADDRESS=P…` (eigen Pepecoin Core-wallet, geen beursadres: coinbase-uitbetalingen worden door beurzen niet altijd verwerkt; rijp na 240 blokken). Daarna Solo-app herstarten en `doge-public` opnieuw uitrollen.
- Openbare poort: gebruikersnaam `LTC.DOGE[.PEP][.rig]`; met PEP-adres 99% van het eigen PEP-blok voor de miner, 1% voor ons. Een verkeerd getypt PEP-adres wordt geweigerd.
- Pepecoin uit of onbereikbaar: valt binnen seconden uit de jobs, LTC en DOGE lopen door (bewezen in CI met een gestopte pepecoind).
- Website: branch `feat/solo-pool-pep` in coin-bonus-finder (pagina, statskop, voorwaarden, 9 talen) pas mergen als PEP live is en 99/1 is nagemeten; de publieke stats-API moet dan een PEP-veld krijgen.

## Bewaking (node-watchdog)

- Losse container `node-watchdog` (bron: `node-watchdog/` in deze repo; op de Umbrel `~/node-watchdog`). Installeren of bijwerken: bestanden kopiëren en `sudo bash ~/node-watchdog/install.sh`.
- Elke minuut: BTC- en BCH-RPC bereikbaar, DOGE/LTC/PEP-healthcheck. 3 minuten geen antwoord terwijl de container draait → `docker restart` (hooguit 1× per 30 min per node). Bewust gestopte containers en de pools worden alleen gemeld, nooit herstart. ckpool-logboeken boven 2 GB worden leeggemaakt. Schijf onder 100 GB of CPU vanaf 92 °C: melding.
- Meldingen via ntfy (Android en iPhone). De topic staat alleen in `~/node-watchdog/config`; nieuwe maken met `bash ~/node-watchdog/new-topic.sh` (zonder tekens als l/1 en 0/o, die in de app op elkaar lijken).
- Logboek: `~/node-watchdog/watchdog.log`.

## Back-up

- Umbrel-back-up (Instellingen → Back-ups) naar de DigiEra 1 TB (USB aan de Umbrel), elk uur, versleuteld; wachtwoord in de wachtwoordbeheerder. eCash Solo Mining uitgesloten (179 GB); de blockchains sluiten de node-apps zelf uit, dus de back-up is ±1 GB.
- Wat buiten de apps staat (losse containers, scripts, fee-aanpassingen) zit niet vanzelf in de back-up. Er staat een kopie in Umbrel-bestanden **Home → Handwerk-backup**; na elke wijziging opnieuw kopiëren.

## Toegang

- Claude Code via Umbrel AI-agents (MCP): `http://umbrel.local/mcp`, token op de Mac in `~/.claude.json`. Machtigingen in Umbrel → Instellingen → AI-agents.
- SSH vanaf de Mac: `ssh -i ~/.ssh/id_ed25519_umbrel umbrel@192.168.1.149` (gebruik het IP: de oude `umbrel.local`-regels in known_hosts zijn van vóór umbrelOS 2.0). Docker vraagt sudo.
- De Umbrel draait op UTC; Nederlandse tijd is UTC+2 (zomer) / UTC+1 (winter).
