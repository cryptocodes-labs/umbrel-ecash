#!/bin/bash
# Maakt een nieuwe, willekeurige ntfy-topic voor de node-bewaking en zet hem
# in de instellingen. De naam verschijnt alleen hier in de terminal.
topic="cc-umbrel-$(tr -dc 'a-km-np-z2-9' < /dev/urandom | head -c 24)"
printf "NTFY_TOPIC=%s\n" "$topic" > /home/umbrel/node-watchdog/config
chmod 600 /home/umbrel/node-watchdog/config
echo
echo "Je nieuwe ntfy-topic (bewaar hem; wie hem kent kan je meldingen lezen):"
echo
echo "    $topic"
echo
echo "In de ntfy-app: + (abonneren) -> plak deze naam -> server ntfy.sh laten staan -> Abonneren."
echo "Laat Claude daarna weten dat je geabonneerd bent; dan volgt een testmelding."
