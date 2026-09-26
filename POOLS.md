# Cryptocode mining pools — hoe het staat (bijgewerkt 26 september 2026)

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

## Overig

- Umbrel draaide op 26 sep vast door een Ubuntu Desktop-VM (Machines, 4 cores/8 GB) naast de full nodes. VM gestopt (`virsh destroy umbrel-machine-ubuntu-desktop`, autostart uit). Geen VM's meer naast de nodes, of maximaal 2 cores/4 GB.
- Na een harde herstart moeten de nodes eerst bijwerken; ckpool meldt dan "Bitcoin Core is in initial sync" en komt vanzelf terug.
- LoneStrike-images staan op `:latest` van een externe ontwikkelaar (danhaus93-ops); `bch-rental` is vastgezet op de image-ID die op 26 sep draaide.
- **DOGE+LTC openbaar (LIVE sinds 26 sep):** nieuwe modus `PUBLIC_MERGED=1` in umbrel-dogecoin (`~/Documents/umbrel-dogecoin`, nog niet gecommit). Draait als **losse container `doge-public`** naast de bestaande app (die blijft 1.6.1, gelockt). Gebruikersnaam `LTC-adres.DOGE-adres[.rig]` (ltc1q… mag). De pool bouwt per miner zelf het DOGE-blok (getblocktemplate + auxpow via submitblock) omdat createauxblock maar één adres kan betalen: 99% miner / 1% fee op beide chains naar PAYOUT_ADDRESS (DFabbT3…) en LTC_PAYOUT_ADDRESS (LdAEjW…). Umbrel-poort 22559 (stratum), 22561 (dashboard, alleen LAN). Uitrol: `scripts/deploy-public-umbrel.sh`; VPS publiek 3335 → Umbrel 22559. Getest op regtest met echte dogecoind 1.14.9 + litecoind 0.21.4 (tests `test/public_*.js`); privé-modus byte-identiek gebleven.
- Andreas heeft op 26 sep akkoord gegeven om BTC en BCH openbaar te maken.
- 26 sep: externe test geslaagd — eigen miner via pool.cryptocodes.eu kwam binnen en stuurde shares. Rental-poorten 3337/3338 nog niet met een echte huurorder getest.
- 26 sep eindcontrole: `python3 ~/Documents/umbrel-dogecoin/scripts/check_pools.py` (leest het werk van alle publieke poorten zoals een miner het krijgt) gaf 5× OK, 99% miner / 1% fee. DOGE- en LTC-blok van de publieke pool door de mainnet-nodes als geldig beoordeeld via `sudo docker exec doge-public node /app/verify-proposal.js <LTC> <DOGE>`. Draai beide checks opnieuw na elke wijziging of update.
- `doge-public` herbouwen na codewijziging: bron naar `~/doge-public-src` kopiëren, `chmod -R a+rX ~/doge-public-src` (anders EACCES), dan `bash ~/deploy-public-umbrel.sh`. Wordt niet door de App Store bijgewerkt.
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
