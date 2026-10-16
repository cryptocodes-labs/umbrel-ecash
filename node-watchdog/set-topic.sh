#!/bin/bash
# Neemt de ntfy-topic over uit de app (naam of volledige link), laat zien wat
# er het afgelopen uur op staat, en zet hem in de instellingen van de bewaking.
# De topic verschijnt niet op het scherm en niet in een chat.
read -r -s -p "Plak de topic of link uit je ntfy-app (je ziet niets verschijnen) en druk Enter: " topic
echo
topic="${topic#https://}"; topic="${topic#http://}"; topic="${topic#ntfy.sh/}"; topic="${topic%/}"
topic="$(printf %s "$topic" | tr -d '[:space:]')"
if [ -z "$topic" ]; then echo "Niets ingevuld, niets veranderd."; exit 1; fi
echo "Topic ontvangen: begint met $(printf %s "$topic" | cut -c1-13)…, eindigt op …$(printf %s "$topic" | tail -c 4) ($(printf %s "$topic" | wc -c) tekens)."
echo
echo "Berichten op deze topic in het afgelopen uur:"
curl -s -m 10 "https://ntfy.sh/$topic/json?poll=1&since=1h" \
  | sed -n 's/.*"time":\([0-9]*\).*"message":"\([^"]*\)".*/  \2/p' | tail -n 5
echo
printf "NTFY_TOPIC=%s\n" "$topic" > /home/umbrel/node-watchdog/config
chmod 600 /home/umbrel/node-watchdog/config
if curl -s -m 10 -H "Title: Umbrel test 3" -H "Tags: tada" -d "Testmelding 3: de bewaking gebruikt nu de topic uit jouw app." "https://ntfy.sh/$topic" >/dev/null; then
  echo "Opgeslagen voor de bewaking, en testmelding 3 is verstuurd."
else
  echo "Opgeslagen, maar de testmelding kon niet weg (geen internet?)."
fi
