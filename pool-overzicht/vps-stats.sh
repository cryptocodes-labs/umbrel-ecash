#!/bin/bash
# Zet https://pool.cryptocodes.eu/public/... op de VPS (Caddy, automatisch HTTPS).
# Stuurt ALLEEN /public/* door naar het pool-overzicht op de Umbrel. Mining-poorten
# (HAProxy 3333-3339) worden niet aangeraakt.
set -e
if sudo ss -tlnp | grep -qE ':(80|443) '; then
  echo "STOP: poort 80 of 443 is al in gebruik:"; sudo ss -tlnp | grep -E ':(80|443) '; exit 1
fi
UMB=$(grep -m1 -oE '100\.[0-9]+\.[0-9]+\.[0-9]+' /etc/haproxy/haproxy.cfg)
echo "Umbrel via: $UMB"
curl -sf "http://$UMB:22570/public/summary" >/dev/null || { echo "STOP: Umbrel-overzicht niet bereikbaar op $UMB:22570"; exit 1; }

sudo apt-get update -qq && sudo apt-get install -y -qq caddy
sudo tee /etc/caddy/Caddyfile >/dev/null <<EOF
pool.cryptocodes.eu {
	@pub path /public/*
	handle @pub {
		reverse_proxy $UMB:22570
	}
	handle {
		respond "Cryptocode solo pool - https://cryptocodes.eu/minen/solo-pool" 200
	}
}
EOF
sudo ufw allow 80/tcp >/dev/null && sudo ufw allow 443/tcp >/dev/null
sudo systemctl enable --now caddy && sudo systemctl reload caddy
sleep 15
curl -s https://pool.cryptocodes.eu/public/summary | head -c 300; echo
echo "Klaar als je hierboven JSON ziet met \"pools\"."
