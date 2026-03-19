// Testy authorizedExecutor — ACL wrapper + audit
jest.mock('../src/services/supabase', () => ({ supabase: {} }));
jest.mock('../src/services/errors', () => ({ logError: jest.fn() }));

// Mock bazowych executorów
const mockBaseExecutors = {
  read_thread: jest.fn().mockResolvedValue('watek content'),
  read_channel: jest.fn().mockResolvedValue('kanal content'),
  search_slack_history: jest.fn().mockResolvedValue('slack results'),
  search_notion: jest.fn().mockResolvedValue('notion results'),
  search_workforce: jest.fn().mockResolvedValue('workforce results'),
  search_calamari: jest.fn().mockResolvedValue('calamari results'),
  search_calendar: jest.fn().mockResolvedValue('calendar results'),
  create_event: jest.fn().mockResolvedValue('event created'),
  search_pipedrive: jest.fn().mockResolvedValue('pipedrive results'),
  deal_status: jest.fn().mockResolvedValue('deal info'),
  create_deal_note: jest.fn().mockResolvedValue('note created'),
  create_deal_activity: jest.fn().mockResolvedValue('activity created'),
  send_slack_message: jest.fn().mockResolvedValue('Wiadomosc wyslana na kanal C_TARGET.'),
};

jest.mock('../src/services/toolExecutor', () => ({
  createToolExecutors: jest.fn(() => ({ ...mockBaseExecutors })),
}));

// Mock membership / classification
const mockCanUserAccessChannel = jest.fn();
const mockGetChannelLabel = jest.fn();

jest.mock('../src/services/channelClassification', () => ({
  canUserAccessChannel: (...args) => mockCanUserAccessChannel(...args),
  getChannelLabel: (...args) => mockGetChannelLabel(...args),
}));

jest.mock('../src/services/membership', () => ({
  isUserInChannel: jest.fn(),
}));

// Mock audit
const mockLogToolExecution = jest.fn();
jest.mock('../src/services/audit', () => ({
  logToolExecution: (...args) => mockLogToolExecution(...args),
}));

// Mock notion
const mockSearchNotion = jest.fn();
const mockBuildContextFromNotion = jest.fn();
const mockFilterNotionResults = jest.fn();

jest.mock('../src/services/notion', () => ({
  searchNotion: (...args) => mockSearchNotion(...args),
  buildContextFromNotion: (...args) => mockBuildContextFromNotion(...args),
  filterNotionResults: (...args) => mockFilterNotionResults(...args),
}));

jest.mock('../src/services/cache', () => ({
  getCache: jest.fn().mockResolvedValue(null),
  setCache: jest.fn(),
  withCache: jest.fn(async (_k, _t, fn) => fn()),
  CACHE_TTL: { NOTION_SEARCH: 1800, NOTION_PAGE: 3600 },
}));

const { createAuthorizedExecutors } = require('../src/services/authorizedExecutor');

const mockApp = {};
const channelId = 'C_SOURCE';
const threadTs = '1234.5678';
const userId = 'U_USER';

describe('createAuthorizedExecutors', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanUserAccessChannel.mockResolvedValue(true);
    mockGetChannelLabel.mockResolvedValue(null);
    mockSearchNotion.mockResolvedValue([]);
    mockBuildContextFromNotion.mockResolvedValue('');
    mockFilterNotionResults.mockReturnValue([]);
  });

  it('zwraca obiekt z tymi samymi kluczami co bazowe executory', () => {
    const executors = createAuthorizedExecutors(mockApp, channelId, threadTs, userId);
    const keys = Object.keys(mockBaseExecutors);
    for (const key of keys) {
      expect(executors).toHaveProperty(key);
    }
  });

  // --- send_slack_message ---

  describe('send_slack_message', () => {
    it('przepuszcza wiadomosc gdy user ma dostep do kanalu docelowego', async () => {
      mockCanUserAccessChannel.mockResolvedValue(true);

      const executors = createAuthorizedExecutors(mockApp, channelId, threadTs, userId);
      const result = await executors.send_slack_message({ channel: 'C_TARGET', text: 'Hello' });

      expect(mockCanUserAccessChannel).toHaveBeenCalledWith(mockApp, userId, channelId, 'C_TARGET');
      expect(result).toContain('Wiadomosc wyslana');
    });

    it('blokuje wiadomosc gdy user NIE ma dostepu do kanalu', async () => {
      mockCanUserAccessChannel.mockResolvedValue(false);

      const executors = createAuthorizedExecutors(mockApp, channelId, threadTs, userId);
      const result = await executors.send_slack_message({ channel: 'C_RESTRICTED', text: 'Hello' });

      expect(result).toContain('Blokada');
      expect(result).toContain('C_RESTRICTED');
      // Bazowy executor NIE powinien byc wywolany
      expect(mockBaseExecutors.send_slack_message).not.toHaveBeenCalled();
    });

    it('loguje blokade z resultStatus denied', async () => {
      mockCanUserAccessChannel.mockResolvedValue(false);

      const executors = createAuthorizedExecutors(mockApp, channelId, threadTs, userId);
      await executors.send_slack_message({ channel: 'C_RESTRICTED', text: 'Secret' });

      // Powinny byc 2 wywolania: denied log + audit wrapper log
      const deniedCall = mockLogToolExecution.mock.calls.find(
        call => call[0].resultStatus === 'denied',
      );
      expect(deniedCall).toBeDefined();
      expect(deniedCall[0].toolName).toBe('send_slack_message');
      expect(deniedCall[0].userId).toBe(userId);
    });
  });

  // --- search_notion (filtrowanie) ---

  describe('search_notion', () => {
    it('filtruje wyniki Notion z leadership access', async () => {
      mockGetChannelLabel.mockResolvedValue('leadership');
      const pages = [{ id: 'p1' }, { id: 'p2' }];
      mockSearchNotion.mockResolvedValue(pages);
      mockFilterNotionResults.mockReturnValue(pages);
      mockBuildContextFromNotion.mockResolvedValue('notion context');

      const executors = createAuthorizedExecutors(mockApp, channelId, threadTs, userId);
      const result = await executors.search_notion({ query: 'budget Q4' });

      expect(mockSearchNotion).toHaveBeenCalledWith('budget Q4');
      expect(mockFilterNotionResults).toHaveBeenCalledWith(pages, true);
      expect(result).toBe('notion context');
    });

    it('filtruje wyniki Notion BEZ leadership access', async () => {
      mockGetChannelLabel.mockResolvedValue('growth');
      const allPages = [{ id: 'p1' }, { id: 'p2' }];
      const filteredPages = [{ id: 'p1' }];
      mockSearchNotion.mockResolvedValue(allPages);
      mockFilterNotionResults.mockReturnValue(filteredPages);
      mockBuildContextFromNotion.mockResolvedValue('filtered context');

      const executors = createAuthorizedExecutors(mockApp, channelId, threadTs, userId);
      const result = await executors.search_notion({ query: 'budget Q4' });

      expect(mockFilterNotionResults).toHaveBeenCalledWith(allPages, false);
      expect(mockBuildContextFromNotion).toHaveBeenCalledWith(filteredPages);
      expect(result).toBe('filtered context');
    });

    it('traktuje null label jako brak leadership access', async () => {
      mockGetChannelLabel.mockResolvedValue(null);
      mockSearchNotion.mockResolvedValue([]);
      mockFilterNotionResults.mockReturnValue([]);

      const executors = createAuthorizedExecutors(mockApp, channelId, threadTs, userId);
      await executors.search_notion({ query: 'test' });

      expect(mockFilterNotionResults).toHaveBeenCalledWith([], false);
    });
  });

  // --- audit wrapper ---

  describe('audit wrapper', () => {
    it('loguje success po udanym wywolaniu narzedzia', async () => {
      const executors = createAuthorizedExecutors(mockApp, channelId, threadTs, userId);
      await executors.read_thread({});

      const successCall = mockLogToolExecution.mock.calls.find(
        call => call[0].resultStatus === 'success',
      );
      expect(successCall).toBeDefined();
      expect(successCall[0].toolName).toBe('read_thread');
      expect(successCall[0].userId).toBe(userId);
      expect(successCall[0].channelId).toBe(channelId);
      expect(successCall[0].durationMs).toBeGreaterThanOrEqual(0);
    });

    it('loguje error gdy executor rzuca wyjatek', async () => {
      // Nadpisz bazowy executor zeby rzucil blad
      mockBaseExecutors.search_workforce.mockRejectedValueOnce(new Error('API timeout'));

      const executors = createAuthorizedExecutors(mockApp, channelId, threadTs, userId);

      await expect(executors.search_workforce({ query: 'test' })).rejects.toThrow('API timeout');

      const errorCall = mockLogToolExecution.mock.calls.find(
        call => call[0].resultStatus === 'error',
      );
      expect(errorCall).toBeDefined();
      expect(errorCall[0].toolName).toBe('search_workforce');
      expect(errorCall[0].resultSummary).toContain('API timeout');
    });

    it('loguje kazde narzedzie (nie tylko send_slack_message)', async () => {
      const executors = createAuthorizedExecutors(mockApp, channelId, threadTs, userId);

      await executors.read_channel({ count: 50 });
      await executors.search_pipedrive({ query: 'Acme' });

      const toolNames = mockLogToolExecution.mock.calls.map(c => c[0].toolName);
      expect(toolNames).toContain('read_channel');
      expect(toolNames).toContain('search_pipedrive');
    });

    it('przekazuje input do audit logu', async () => {
      const executors = createAuthorizedExecutors(mockApp, channelId, threadTs, userId);
      await executors.search_pipedrive({ query: 'Acme Corp' });

      const call = mockLogToolExecution.mock.calls.find(
        c => c[0].toolName === 'search_pipedrive',
      );
      expect(call[0].toolInput).toEqual({ query: 'Acme Corp' });
    });
  });

  // --- passthrough narzedzia ---

  describe('passthrough (read_thread, read_channel, itd.)', () => {
    it('deleguje read_thread do bazowego executora', async () => {
      const executors = createAuthorizedExecutors(mockApp, channelId, threadTs, userId);
      const result = await executors.read_thread({});

      expect(result).toBe('watek content');
      expect(mockBaseExecutors.read_thread).toHaveBeenCalled();
    });

    it('deleguje search_pipedrive do bazowego executora', async () => {
      const executors = createAuthorizedExecutors(mockApp, channelId, threadTs, userId);
      const result = await executors.search_pipedrive({ query: 'test' });

      expect(result).toBe('pipedrive results');
    });

    it('deleguje create_event do bazowego executora', async () => {
      const executors = createAuthorizedExecutors(mockApp, channelId, threadTs, userId);
      const result = await executors.create_event({ title: 'Meeting', start_datetime: '2026-03-20T10:00' });

      expect(result).toBe('event created');
    });
  });
});
