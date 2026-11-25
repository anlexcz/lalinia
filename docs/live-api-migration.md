# Live API migration

Public web remains team-neutral and has no Telegram link or button. Bot code may be public; token and chat ID are runtime environment secrets only.

API v1: https://podsveti.cz/la_linia/api/game_history. Single server poll every 45 seconds; never retry faster than 30 seconds. Public frontend polls our cache every 5 seconds. JSON atomic writes; no database. Keep existing gallery workflow until parity and deployment verification.

Audit: 398 stations, 328 edges, 5 teams; 500 historical captures matched gallery export by time/name/team/value. Official team IDs: 2 Los Bandidos, 3 Cosa Nostra, 4 Zemunski klan, 5 Spiriti, 6 Yakuza. Blank categories map to unspecified. API capture records have no ID: canonical key timestamp/station/team/value. Historical gallery IDs retained for checkpoint compatibility; persist ID mapping and detect historical changes before accepting them. Do not assume synthetic numeric IDs indicate chronology.

Rules: 120 tickets, 03:00 Europe/Prague reset, 15 minute protection, first bonus 2, terminus multiplier 2, max capture 9. Decay and area tables match repository. Train and metro semantics require regression checks. Official metro results need explicit integration.

Notification requirements: outbound only, no commands/webhook, team 3 configurable. Capture (remaining tickets), loss (retained decay informational), each actual decay (increment, next date/time or minimum), daily report at 03:01 for closed day. Use confirmed history to avoid announcing decay after a takeover. Persist deduplication and initial baseline; no historic flood. Telegram send timeout may have ambiguous delivery; do not claim exactly-once delivery.

Deployment gate: run legacy tests and adapter tests, compare all five scores and owners against checkpoint, handle backdated corrections and metro points, check restart and outage behavior. No production cutover until verified.
