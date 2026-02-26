// Testy resolve'owania nazw użytkowników ze Slack API
jest.mock('../src/services/errors', () => ({ logError: jest.fn() }));

describe('getUserName', () => {
  beforeEach(() => jest.resetModules());

  it('pobiera nazwę z Slack API', async () => {
    jest.mock('../src/services/errors', () => ({ logError: jest.fn() }));
    const { getUserName } = require('../src/services/users');
    const app = {
      client: {
        users: {
          info: jest.fn().mockResolvedValue({
            user: { real_name: 'Patryk Kowalski', name: 'patryk' },
          }),
        },
      },
    };
    const name = await getUserName(app, 'U123');
    expect(name).toBe('Patryk Kowalski');
  });

  it('cachuje wynik — drugie wywołanie nie odpytuje API', async () => {
    jest.mock('../src/services/errors', () => ({ logError: jest.fn() }));
    const { getUserName } = require('../src/services/users');
    const app = {
      client: {
        users: {
          info: jest.fn().mockResolvedValue({
            user: { real_name: 'Ala', name: 'ala' },
          }),
        },
      },
    };
    await getUserName(app, 'U999');
    await getUserName(app, 'U999');
    expect(app.client.users.info).toHaveBeenCalledTimes(1);
  });

  it('zwraca userId gdy API zwraca błąd', async () => {
    jest.mock('../src/services/errors', () => ({ logError: jest.fn() }));
    const { getUserName } = require('../src/services/users');
    const app = {
      client: {
        users: {
          info: jest.fn().mockRejectedValue(new Error('user_not_found')),
        },
      },
    };
    const name = await getUserName(app, 'U404');
    expect(name).toBe('U404');
  });

  it('używa name gdy brak real_name', async () => {
    jest.mock('../src/services/errors', () => ({ logError: jest.fn() }));
    const { getUserName } = require('../src/services/users');
    const app = {
      client: {
        users: {
          info: jest.fn().mockResolvedValue({
            user: { real_name: '', name: 'bot-user' },
          }),
        },
      },
    };
    const name = await getUserName(app, 'U789');
    expect(name).toBe('bot-user');
  });
});

describe('resolveUserNames', () => {
  beforeEach(() => jest.resetModules());

  it('uzupełnia brakujące user_name w wiadomościach', async () => {
    jest.mock('../src/services/errors', () => ({ logError: jest.fn() }));
    const { resolveUserNames } = require('../src/services/users');
    const app = {
      client: {
        users: {
          info: jest.fn().mockResolvedValue({
            user: { real_name: 'Jan', name: 'jan' },
          }),
        },
      },
    };
    const messages = [
      { user_id: 'U1', user_name: null, message_text: 'Test' },
      { user_id: 'U2', user_name: 'Existing', message_text: 'Test2' },
    ];
    await resolveUserNames(app, messages);
    expect(messages[0].user_name).toBe('Jan');
    expect(messages[1].user_name).toBe('Existing');
  });
});
