# Zasady bezpieczeństwa MVP

## Zmienne środowiskowe
- NIGDY nie commituj .env
- Używaj .env.example z placeholderami
- Railway: zmienne w Project Settings → Variables

## Rate limiting
- Max 10 wiadomości na minutę na użytkownika
- Map w pamięci (ratelimit.js)

## Walidacja inputu
- Max 4000 znaków na wiadomość
- Trim whitespace
- Reject jeśli puste po trim

## Anti-bot loop
- Bot NIGDY nie odpowiada na wiadomości od botów
- Sprawdzaj event.bot_id

## Klasyfikacja spamu
- Claude Haiku klasyfikuje: pytanie-ogolne, pytanie-techniczne, small-talk, spam
- Spam → "Nie mogę pomóc z tym zapytaniem"

## Obsługa błędów API
- 429 (rate limit): czekaj i spróbuj znowu
- 500+ (server error): loguj, odpowiedz "Przepraszam, mam problem"
- Timeout: graceful failure
