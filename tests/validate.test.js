// Testy walidacji wiadomości
const { validateMessage } = require('../src/services/validate');

describe('validateMessage', () => {
  it('odrzuca pustą wiadomość (null)', () => {
    const result = validateMessage(null);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/pusta/i);
  });

  it('odrzuca pustą wiadomość (pusty string)', () => {
    const result = validateMessage('');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/pusta/i);
  });

  it('odrzuca wiadomość z samymi spacjami', () => {
    const result = validateMessage('   ');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/pusta/i);
  });

  it('odrzuca wiadomość dłuższą niż 4000 znaków', () => {
    const longText = 'a'.repeat(4001);
    const result = validateMessage(longText);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/długa/i);
  });

  it('akceptuje wiadomość o dokładnie 4000 znakach', () => {
    const text = 'a'.repeat(4000);
    const result = validateMessage(text);
    expect(result.valid).toBe(true);
    expect(result.error).toBeNull();
  });

  it('akceptuje normalną wiadomość', () => {
    const result = validateMessage('Co to jest JavaScript?');
    expect(result.valid).toBe(true);
    expect(result.error).toBeNull();
  });
});
