# node-watchdog: docker-CLI (om containers te inspecteren en te herstarten),
# bash en curl. Niets anders.
FROM docker:27-cli
# hadolint ignore=DL3018
RUN apk add --no-cache bash curl coreutils
COPY watchdog.sh /usr/local/bin/watchdog.sh
RUN chmod +x /usr/local/bin/watchdog.sh
ENTRYPOINT ["/usr/local/bin/watchdog.sh"]
