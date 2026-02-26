// Testy konwersji Markdown → Slack mrkdwn
const { toSlackMarkdown } = require('../src/services/format');

describe('toSlackMarkdown', () => {
  it('konwertuje bold ** na *', () => {
    expect(toSlackMarkdown('To jest **ważne**')).toBe('To jest *ważne*');
  });

  it('konwertuje nagłówek h1 na bold', () => {
    expect(toSlackMarkdown('# Tytuł')).toBe('*Tytuł*');
  });

  it('konwertuje nagłówek h2 na bold', () => {
    expect(toSlackMarkdown('## Sekcja')).toBe('*Sekcja*');
  });

  it('konwertuje nagłówek h3 na bold', () => {
    expect(toSlackMarkdown('### Podsekcja')).toBe('*Podsekcja*');
  });

  it('konwertuje linki Markdown na Slack', () => {
    expect(toSlackMarkdown('[Google](https://google.com)')).toBe('<https://google.com|Google>');
  });

  it('zostawia inline code bez zmian', () => {
    expect(toSlackMarkdown('Użyj `npm start`')).toBe('Użyj `npm start`');
  });

  it('obsługuje tekst bez formatowania', () => {
    expect(toSlackMarkdown('Zwykły tekst')).toBe('Zwykły tekst');
  });

  it('obsługuje wiele formatowań naraz', () => {
    const input = '# Tytuł\n**Bold** i [link](https://x.com)';
    const expected = '*Tytuł*\n*Bold* i <https://x.com|link>';
    expect(toSlackMarkdown(input)).toBe(expected);
  });
});
