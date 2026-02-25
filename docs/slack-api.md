# Slack mrkdwn — Cheatsheet

## Formatowanie tekstu
*bold* → pogrubienie
_italic_ → kursywa
~strikethrough~ → przekreślenie
`kod inline` → monospace

## Blok kodu
```
blok kodu
```

## Linki i wzmianki
<https://example.com|tekst linku> → link z tekstem
<@U123456789> → mention użytkownika
<#C123456789> → mention kanału

## Cytaty
> cytowany tekst

## Limity API
- conversations.history: max 200 wiadomości per call
- chat.postMessage: 1 sekunda między wiadomościami
- Socket Mode: auto-reconnect
