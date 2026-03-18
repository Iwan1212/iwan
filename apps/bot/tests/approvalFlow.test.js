// Testy approval flow — zatwierdzanie dołączenia do kanału
jest.mock('../src/crawler/backfill', () => ({
  backfillChannel: jest.fn().mockResolvedValue(0),
}));
jest.mock('../src/services/errors', () => ({ logError: jest.fn() }));

// Ustaw SLACK_ADMIN_USER_ID przed importem modułu
process.env.SLACK_ADMIN_USER_ID = 'UADMIN';

const { sendApprovalRequest, setupApprovalActions, pendingApprovals } = require('../src/handlers/approvalFlow');
const { backfillChannel } = require('../src/crawler/backfill');

// Helper — stwórz mock app
function createMockApp() {
  return {
    client: {
      conversations: {
        info: jest.fn().mockResolvedValue({ channel: { name: 'general' } }),
        leave: jest.fn().mockResolvedValue({ ok: true }),
      },
      chat: {
        postMessage: jest.fn().mockResolvedValue({ ok: true }),
        update: jest.fn().mockResolvedValue({ ok: true }),
      },
    },
    action: jest.fn(),
  };
}

describe('sendApprovalRequest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pendingApprovals.clear();
  });

  it('wysyła DM z przyciskami do admina', async () => {
    const app = createMockApp();

    await sendApprovalRequest(app, 'C1', 'UINVITER');

    expect(app.client.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'UADMIN',
        text: expect.stringContaining('#general'),
        blocks: expect.arrayContaining([
          expect.objectContaining({ type: 'section' }),
          expect.objectContaining({
            type: 'actions',
            elements: expect.arrayContaining([
              expect.objectContaining({ action_id: 'approve_channel', value: 'C1' }),
              expect.objectContaining({ action_id: 'reject_channel', value: 'C1' }),
            ]),
          }),
        ]),
      })
    );
  });

  it('dodaje kanał do pending approvals', async () => {
    const app = createMockApp();

    await sendApprovalRequest(app, 'C1', 'UINVITER');

    expect(pendingApprovals.has('C1')).toBe(true);
    expect(pendingApprovals.get('C1')).toEqual({ channelId: 'C1', inviterId: 'UINVITER' });
  });

  it('obsługuje brak invitera', async () => {
    const app = createMockApp();

    await sendApprovalRequest(app, 'C1', undefined);

    expect(app.client.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('ktoś'),
      })
    );
  });
});

describe('setupApprovalActions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pendingApprovals.clear();
  });

  it('rejestruje handlery approve_channel i reject_channel', () => {
    const app = createMockApp();
    setupApprovalActions(app);

    expect(app.action).toHaveBeenCalledWith('approve_channel', expect.any(Function));
    expect(app.action).toHaveBeenCalledWith('reject_channel', expect.any(Function));
  });

  it('approve_channel — wysyła welcome i triggeruje backfill', async () => {
    const app = createMockApp();
    pendingApprovals.set('C1', { channelId: 'C1', inviterId: 'UINVITER' });

    setupApprovalActions(app);
    const approveHandler = app.action.mock.calls.find(c => c[0] === 'approve_channel')[1];

    const mockClient = {
      chat: {
        postMessage: jest.fn().mockResolvedValue({ ok: true }),
        update: jest.fn().mockResolvedValue({ ok: true }),
      },
    };

    await approveHandler({
      action: { value: 'C1' },
      body: {
        channel: { id: 'DADMIN' },
        message: {
          ts: '1.1',
          blocks: [{ text: { text: 'Zostałem dodany do *#general*' } }],
        },
      },
      client: mockClient,
    });

    // Wysłał welcome do kanału
    expect(mockClient.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'C1',
        text: expect.stringContaining('Iwan'),
      })
    );

    // Triggerował backfill
    expect(backfillChannel).toHaveBeenCalledWith(app, 'C1');

    // Zaktualizował DM admina
    expect(mockClient.chat.update).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'DADMIN',
        ts: '1.1',
        text: '✅ Zatwierdzono',
      })
    );

    // Usunął z pending
    expect(pendingApprovals.has('C1')).toBe(false);
  });

  it('reject_channel — opuszcza kanał', async () => {
    const app = createMockApp();
    pendingApprovals.set('C1', { channelId: 'C1', inviterId: 'UINVITER' });

    setupApprovalActions(app);
    const rejectHandler = app.action.mock.calls.find(c => c[0] === 'reject_channel')[1];

    const mockClient = {
      conversations: { leave: jest.fn().mockResolvedValue({ ok: true }) },
      chat: { update: jest.fn().mockResolvedValue({ ok: true }) },
    };

    await rejectHandler({
      action: { value: 'C1' },
      body: {
        channel: { id: 'DADMIN' },
        message: {
          ts: '1.1',
          blocks: [{ text: { text: 'Zostałem dodany do *#general*' } }],
        },
      },
      client: mockClient,
    });

    // Opuścił kanał
    expect(mockClient.conversations.leave).toHaveBeenCalledWith({ channel: 'C1' });

    // Zaktualizował DM admina
    expect(mockClient.chat.update).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'DADMIN',
        ts: '1.1',
        text: '❌ Odrzucono — opuściłem kanał',
      })
    );

    // Usunął z pending
    expect(pendingApprovals.has('C1')).toBe(false);
  });

  it('aktualizuje wiadomość admina po zatwierdzeniu', async () => {
    const app = createMockApp();
    pendingApprovals.set('C1', { channelId: 'C1', inviterId: 'UINVITER' });

    setupApprovalActions(app);
    const approveHandler = app.action.mock.calls.find(c => c[0] === 'approve_channel')[1];

    const mockClient = {
      chat: {
        postMessage: jest.fn().mockResolvedValue({ ok: true }),
        update: jest.fn().mockResolvedValue({ ok: true }),
      },
    };

    await approveHandler({
      action: { value: 'C1' },
      body: {
        channel: { id: 'DADMIN' },
        message: {
          ts: '1.1',
          blocks: [{ text: { text: 'Zostałem dodany do *#general*' } }],
        },
      },
      client: mockClient,
    });

    // Sprawdź że blocks zostały zaktualizowane (bez przycisków, z potwierdzeniem)
    const updateCall = mockClient.chat.update.mock.calls[0][0];
    expect(updateCall.blocks).toHaveLength(1);
    expect(updateCall.blocks[0].text.text).toContain('✅');
    expect(updateCall.blocks[0].text.text).toContain('Zatwierdzono');
  });

  it('aktualizuje wiadomość admina po odrzuceniu', async () => {
    const app = createMockApp();
    pendingApprovals.set('C1', { channelId: 'C1', inviterId: 'UINVITER' });

    setupApprovalActions(app);
    const rejectHandler = app.action.mock.calls.find(c => c[0] === 'reject_channel')[1];

    const mockClient = {
      conversations: { leave: jest.fn().mockResolvedValue({ ok: true }) },
      chat: { update: jest.fn().mockResolvedValue({ ok: true }) },
    };

    await rejectHandler({
      action: { value: 'C1' },
      body: {
        channel: { id: 'DADMIN' },
        message: {
          ts: '1.1',
          blocks: [{ text: { text: 'Zostałem dodany do *#general*' } }],
        },
      },
      client: mockClient,
    });

    // Sprawdź że blocks zostały zaktualizowane (bez przycisków, z odrzuceniem)
    const updateCall = mockClient.chat.update.mock.calls[0][0];
    expect(updateCall.blocks).toHaveLength(1);
    expect(updateCall.blocks[0].text.text).toContain('❌');
    expect(updateCall.blocks[0].text.text).toContain('Odrzucono');
  });
});
