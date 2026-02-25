# Anthropic Claude API — Przewodnik MVP

## Model
- Odpowiedzi: claude-sonnet-4-20250514 (max_tokens: 1024)
- Klasyfikacja: claude-haiku-4-5-20251001 (max_tokens: 50)

## System prompt Iwana
"Jesteś Iwan — przyjazny asystent AI zespołu. Odpowiadaj zwięźle, konkretnie, po polsku. Nie wymyślaj informacji których nie znasz."

## Format wywołania
messages: [{ role: 'user', content: '...' }]
system: 'system prompt + opcjonalny kontekst Slack'

## Obsługa błędów
- 429 → retry z exponential backoff
- 500+ → "Przepraszam, mam problem z odpowiedzią"
- timeout → graceful failure

## Ekonomia tokenów
- Input: ~$3/1M tokenów (Sonnet)
- Output: ~$15/1M tokenów (Sonnet)
- Haiku: ~10x taniej
- MVP 500 msg/mies → ~$1-3/mies
