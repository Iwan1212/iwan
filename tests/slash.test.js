// Testy parsowania komend slash /iwan
jest.mock('../src/services/supabase', () => ({ supabase: {} }));
jest.mock('../src/services/errors', () => ({ logError: jest.fn() }));
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
});
