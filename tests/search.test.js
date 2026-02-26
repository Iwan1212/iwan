// Testy budowania kontekstu z wyników wyszukiwania
// Mockujemy supabase bo nie potrzebujemy bazy do testów buildContext
jest.mock('../src/services/supabase', () => ({ supabase: {} }));
const { buildContextFromMessages } = require('../src/services/search');

describe('buildContextFromMessages', () => {
  it('zwraca pusty string gdy brak wyników', () => {
    expect(buildContextFromMessages([])).toBe('');
  });

  it('buduje kontekst z jednej wiadomości', () => {
    const messages = [{
      user_name: 'patryk',
      user_id: 'U123',
      message_text: 'Deploy o 15:00',
      created_at: '2026-02-25T15:00:00Z',
    }];
    const result = buildContextFromMessages(messages);
    expect(result).toContain('patryk');
    expect(result).toContain('Deploy o 15:00');
    expect(result).toContain('KONTEKST Z HISTORII SLACK');
  });

  it('używa user_id gdy brak user_name', () => {
    const messages = [{
      user_name: null,
      user_id: 'U999',
      message_text: 'Test',
      created_at: '2026-02-25T15:00:00Z',
    }];
    const result = buildContextFromMessages(messages);
    expect(result).toContain('U999');
  });

  it('buduje kontekst z wielu wiadomości', () => {
    const messages = [
      { user_name: 'ala', user_id: 'U1', message_text: 'Pierwsza', created_at: '2026-02-25T10:00:00Z' },
      { user_name: 'bob', user_id: 'U2', message_text: 'Druga', created_at: '2026-02-25T11:00:00Z' },
    ];
    const result = buildContextFromMessages(messages);
    expect(result).toContain('Pierwsza');
    expect(result).toContain('Druga');
  });
});
