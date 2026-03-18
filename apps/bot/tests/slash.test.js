// Testy parsowania komend slash /iwan
jest.mock('../src/services/supabase', () => ({ supabase: {} }));
jest.mock('../src/services/errors', () => ({ logError: jest.fn() }));
jest.mock('../src/services/users', () => ({ resolveUserNames: jest.fn() }));
const { parseCommand } = require('../src/handlers/slash');

describe('parseCommand', () => {
  it('parsuje komendę szukaj z frazą', () => {
    const { action, args } = parseCommand('szukaj deploy Railway');
    expect(action).toBe('szukaj');
    expect(args).toBe('deploy Railway');
  });

  it('parsuje komendę status', () => {
    const { action, args } = parseCommand('status');
    expect(action).toBe('status');
    expect(args).toBe('');
  });

  it('parsuje pustą komendę jako pomoc', () => {
    const { action, args } = parseCommand('');
    expect(action).toBe('');
    expect(args).toBe('');
  });

  it('ignoruje wielkość liter w akcji', () => {
    const { action } = parseCommand('SZUKAJ test');
    expect(action).toBe('szukaj');
  });

  it('trimuje białe znaki', () => {
    const { action, args } = parseCommand('  szukaj   hello world  ');
    expect(action).toBe('szukaj');
    expect(args).toBe('hello world');
  });

  it('parsuje komendę deal z nazwą', () => {
    const { action, args } = parseCommand('deal Acme Corp');
    expect(action).toBe('deal');
    expect(args).toBe('Acme Corp');
  });

  it('parsuje komendę deals bez argumentów', () => {
    const { action, args } = parseCommand('deals');
    expect(action).toBe('deals');
    expect(args).toBe('');
  });

  it('parsuje komendę deals z pipeline ID', () => {
    const { action, args } = parseCommand('deals 1,26');
    expect(action).toBe('deals');
    expect(args).toBe('1,26');
  });
});

describe('SLACK_ALLOWED_CHANNELS', () => {
  const originalEnv = process.env.SLACK_ALLOWED_CHANNELS;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.SLACK_ALLOWED_CHANNELS = originalEnv;
    } else {
      delete process.env.SLACK_ALLOWED_CHANNELS;
    }
    jest.resetModules();
  });

  it('blokuje komendy na niedozwolonym kanale', async () => {
    process.env.SLACK_ALLOWED_CHANNELS = 'C060MK0JBDL,C03Q6QS7K6K';
    jest.resetModules();
    const { setupSlashCommand } = require('../src/handlers/slash');

    let commandHandler;
    const mockApp = {
      command: (name, handler) => { commandHandler = handler; },
    };
    setupSlashCommand(mockApp);

    const respond = jest.fn();
    await commandHandler({
      command: { text: 'status', channel_id: 'C_NIEDOZWOLONY' },
      ack: jest.fn(),
      respond,
    });

    expect(respond).toHaveBeenCalledWith('Ta komenda działa tylko na wybranych kanałach.');
  });

  it('przepuszcza komendy na dozwolonym kanale', async () => {
    process.env.SLACK_ALLOWED_CHANNELS = 'C060MK0JBDL';
    jest.resetModules();
    const { setupSlashCommand } = require('../src/handlers/slash');

    let commandHandler;
    const mockApp = {
      command: (name, handler) => { commandHandler = handler; },
    };
    setupSlashCommand(mockApp);

    const respond = jest.fn();
    await commandHandler({
      command: { text: 'status', channel_id: 'C060MK0JBDL' },
      ack: jest.fn(),
      respond,
    });

    expect(respond).not.toHaveBeenCalledWith('Ta komenda działa tylko na wybranych kanałach.');
  });
});
