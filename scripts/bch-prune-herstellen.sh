#!/bin/bash
#
# Houdt de BCH-node klein: zonder transactie-index en met 10 GB aan blokken
# (sinds 16-10-2026, van 275 GB naar 15 GB).
#
# Een update van de Bitcoin Cash Node-app zet in docker-compose.yml weer
# -txindex=1 en haalt -prune weg. De node start dan niet meer
# ("-reindex to go back to unpruned mode") tot dit script heeft gedraaid.
# Wordt aangeroepen vanuit ~/fees-herstellen.sh; los kan ook:
#   bash ~/bch-prune-herstellen.sh
#
# Waarom in docker-compose.yml en niet in bitcoin.conf: het BCH-dashboard
# herschrijft bitcoin.conf helemaal (Tor-instellingen), en -txindex=1 op de
# opdrachtregel zou een prune-regel in bitcoin.conf toch overrulen
# (BCHN init.cpp: "Prune mode is incompatible with -txindex").

N=${BCH_COMPOSE:-/home/umbrel/umbrel/app-data/bitcoin-cash-node/docker-compose.yml}
SUDO=${SUDO-sudo}

if grep -qE "^\s*- '?-prune=[0-9]+'?\s*$" "$N" && ! grep -qE "^\s*- '?-txindex=1'?\s*$" "$N"; then
  echo "BCH-node klein: ok"
  exit 0
fi

$SUDO cp -p "$N" "$N.voor-herstel"
if ! $SUDO python3 -I - "$N" <<'EOF'
import re, sys
p = sys.argv[1]
lines = open(p).read().split('\n')
has_prune = any(re.match(r"^\s*- '?-prune=\d+'?\s*$", l) for l in lines)
out, done = [], False
for l in lines:
    m = re.match(r"^(\s*)- ('?)-txindex=[01]\2\s*$", l)
    if m:
        ind, q = m.group(1), m.group(2)
        out.append(f"{ind}- {q}-txindex=0{q}")
        if not has_prune:
            out.append(f"{ind}- {q}-prune=10000{q}")
        done = True
        continue
    out.append(l)
if not done and not has_prune:
    # Geen txindex-regel meer: prune achter -dbcache zetten.
    out2 = []
    for l in out:
        out2.append(l)
        m = re.match(r"^(\s*)- ('?)-dbcache=\d+\2\s*$", l)
        if m and not done:
            out2.append(f"{m.group(1)}- {m.group(2)}-prune=10000{m.group(2)}")
            done = True
    out = out2
if not done and not has_prune:
    sys.exit("geen plek gevonden voor -prune; niets aangepast")
open(p, 'w').write('\n'.join(out))
EOF
then
  echo "LET OP: BCH-instellingen niet aangepast. Vraag Claude om te kijken."
  exit 1
fi

if ! python3 -I -c "import yaml,sys; c=yaml.safe_load(open(sys.argv[1]))['services']['bitcoind']['command']; assert '-prune=10000' in c and '-txindex=1' not in c" "$N"; then
  echo "LET OP: aangepaste BCH-instellingen kloppen niet; oude versie teruggezet."
  $SUDO cp -p "$N.voor-herstel" "$N"
  exit 1
fi
echo "BCH-instellingen teruggezet (geen txindex, 10 GB blokken)"

if [ -z "${GEEN_HERSTART:-}" ]; then
  $SUDO umbreld client apps.stop.mutate --appId bitcoin-cash-node >/dev/null
  $SUDO umbreld client apps.start.mutate --appId bitcoin-cash-node >/dev/null
  echo "BCH-node herstart"
fi
