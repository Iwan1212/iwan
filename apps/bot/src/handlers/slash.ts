// src/handlers/slash.ts — obsługa komendy /iwan
import { searchSlackHistory, buildContextFromMessages } from '../services/search.js';
import { searchNotion, getPageTitle, getPageText } from '../services/notion.js';
import { getTimeline, getProjects, buildDateRange, getUtilPercent, getAllocPercent } from '../services/workforce.js';
import { searchDeals, getDeal, getDealNotes, getActiveDeals, buildContextFromDeal, isPipedriveEnabled } from '../services/pipedrive.js';
import { ACTIVE_PIPELINES } from '../services/dealConfig.js';
import { resolveUserNames } from '../services/users.js';
import { logError } from '../services/errors.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SlackApp = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RespondFn = (...args: any[]) => Promise<void>;

// Parsuj komendę: /iwan szukaj <fraza> lub /iwan status
export function parseCommand(text: string): { action: string; args: string } {
  const parts = text.trim().split(/\s+/);
  const action = (parts[0] || '').toLowerCase();
  const args = parts.slice(1).join(' ');
  return { action, args };
}

const ALLOWED_CHANNELS = (process.env.SLACK_ALLOWED_CHANNELS || '').split(',').filter(Boolean);

// Handler slash command /iwan
export function setupSlashCommand(app: SlackApp): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.command('/iwan', async ({ command, ack, respond }: any) => {
    await ack();

    // Ogranicz do dozwolonych kanałów (jeśli lista ustawiona)
    if (ALLOWED_CHANNELS.length > 0 && !ALLOWED_CHANNELS.includes(command.channel_id)) {
      await respond('Ta komenda działa tylko na wybranych kanałach.');
      return;
    }

    const { action, args } = parseCommand(command.text);

    if (action === 'szukaj') {
      await handleSearch(app, command, args, respond);
    } else if (action === 'notion') {
      await handleNotion(args, respond);
    } else if (action === 'status') {
      await handleStatus(respond);
    } else if (action === 'team') {
      await handleTeam(args, respond);
    } else if (action === 'kto-wolny') {
      await handleKtoWolny(args, respond);
    } else if (action === 'overbooking') {
      await handleOverbooking(respond);
    } else if (action === 'projekty') {
      await handleProjekty(respond);
    } else if (action === 'deal') {
      await handleDeal(args, respond);
    } else if (action === 'deals') {
      await handleDeals(args, respond);
    } else {
      await handleHelp(respond);
    }
  });
}

// /iwan szukaj <fraza> — wyszukaj w historii kanału
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSearch(app: SlackApp, command: any, query: string, respond: RespondFn): Promise<void> {
  if (!query) {
    await respond('Użycie: `/iwan szukaj <fraza>`');
    return;
  }

  const wyniki = await searchSlackHistory(query, command.channel_id);
  await resolveUserNames(app, wyniki);

  if (wyniki.length === 0) {
    await respond(`Nie znalazłem nic dla: *${query}*`);
    return;
  }

  const lista = wyniki.slice(0, 5).map(msg => {
    const date = new Date(msg.created_at).toLocaleDateString('pl-PL');
    const author = msg.user_name || msg.user_id;
    return `• [${date}] *${author}*: ${msg.message_text.substring(0, 150)}`;
  }).join('\n');

  await respond(`Wyniki dla *${query}* (${wyniki.length}):\n${lista}`);
}

// /iwan notion <fraza> — wyszukaj w Notion
async function handleNotion(query: string, respond: RespondFn): Promise<void> {
  if (!query) {
    await respond('Użycie: `/iwan notion <fraza>`');
    return;
  }

  const pages = await searchNotion(query);

  if (pages.length === 0) {
    await respond(`Nie znalazłem nic w Notion dla: *${query}*`);
    return;
  }

  const lista: string[] = [];
  for (const page of pages.slice(0, 5)) {
    const title = getPageTitle(page);
    const text = await getPageText(page.id);
    const preview = text ? text.substring(0, 150) : '(brak treści)';
    lista.push(`• *${title}*: ${preview}`);
  }

  await respond(`Wyniki z Notion dla *${query}* (${pages.length}):\n${lista.join('\n')}`);
}

// /iwan status — pokaż status bota
async function handleStatus(respond: RespondFn): Promise<void> {
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const mem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);

  await respond(
    `*Status Iwana:*\n` +
    `• Uptime: ${hours}h ${minutes}m\n` +
    `• Pamięć: ${mem} MB\n` +
    `• Node: ${process.version}`
  );
}

// /iwan team <nazwa> — utylizacja zespołu
async function handleTeam(teamName: string, respond: RespondFn): Promise<void> {
  if (!teamName) {
    await respond('Użycie: `/iwan team <nazwa>` (np. Frontend, Backend, QA)');
    return;
  }

  if (!process.env.WP_API_URL) {
    await respond('Workforce Planner nie jest skonfigurowany.');
    return;
  }

  try {
    const now = new Date();
    const endDate = new Date(now);
    endDate.setMonth(endDate.getMonth() + 1);
    const startStr = now.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    const data = await getTimeline(startStr, endStr);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const employees: any[] = Array.isArray(data) ? data : ((data as any).employees || (data as any).data || []);

    const lowerTeam = teamName.toLowerCase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const teamMembers = employees.filter((e: any) => {
      const t = (e.team || e.department || '').toLowerCase();
      return t.includes(lowerTeam);
    });

    if (teamMembers.length === 0) {
      await respond(`Nie znalazłem zespołu *${teamName}* w Workforce Planner.`);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lines = teamMembers.map((emp: any) => {
      const name = emp.name || `${emp.first_name || ''} ${emp.last_name || ''}`.trim();
      const assignments = emp.assignments || [];
      const utilization = emp.utilization || {};
      const utilVals = Object.values(utilization).map(getUtilPercent);
      const avgUtil = utilVals.length > 0
        ? Math.round(utilVals.reduce((a: number, b: number) => a + b, 0) / utilVals.length)
        : 0;

      if (assignments.length === 0) {
        return `• *${name}*: bench (0%)`;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const projs = assignments.map((a: any) => {
        const proj = a.project_name || a.project || '?';
        const alloc = getAllocPercent(a);
        return `${proj} (${alloc}%)`;
      }).join(', ');
      const marker = avgUtil > 100 ? ' ⚠️' : '';
      return `• *${name}*: ${projs} — ${avgUtil}%${marker}`;
    });

    await respond(`*Team ${teamName}:*\n${lines.join('\n')}`);
  } catch (error) {
    logError('slash-team', 'Błąd pobierania danych zespołu', (error as Error).message);
    await respond('Błąd pobierania danych z Workforce Planner.');
  }
}

// /iwan kto-wolny [miesiąc] — kto jest dostępny
async function handleKtoWolny(args: string, respond: RespondFn): Promise<void> {
  if (!process.env.WP_API_URL) {
    await respond('Workforce Planner nie jest skonfigurowany.');
    return;
  }

  try {
    const query = args || '';
    const { startDate, endDate } = buildDateRange(query || 'teraz');

    const data = await getTimeline(startDate, endDate);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const employees: any[] = Array.isArray(data) ? data : ((data as any).employees || (data as any).data || []);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const free = employees.filter((emp: any) => {
      const assignments = emp.assignments || [];
      const utilization = emp.utilization || {};
      const utilVals = Object.values(utilization).map(getUtilPercent);
      const avgUtil = utilVals.length > 0
        ? utilVals.reduce((a: number, b: number) => a + b, 0) / utilVals.length
        : 0;
      return assignments.length === 0 || avgUtil < 30;
    });

    if (free.length === 0) {
      await respond(`Wszyscy zajęci w okresie ${startDate} — ${endDate}.`);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lines = free.map((emp: any) => {
      const name = emp.name || `${emp.first_name || ''} ${emp.last_name || ''}`.trim();
      const team = emp.team || emp.department || '';
      const utilization = emp.utilization || {};
      const utilVals = Object.values(utilization).map(getUtilPercent);
      const avgUtil = utilVals.length > 0
        ? Math.round(utilVals.reduce((a: number, b: number) => a + b, 0) / utilVals.length)
        : 0;
      return `• *${name}* (${team}) — ${avgUtil}%`;
    });

    await respond(`*Wolni/dostępni (${startDate} — ${endDate}):*\n${lines.join('\n')}`);
  } catch (error) {
    logError('slash-kto-wolny', 'Błąd pobierania wolnych', (error as Error).message);
    await respond('Błąd pobierania danych z Workforce Planner.');
  }
}

// /iwan overbooking — lista przeciążonych
async function handleOverbooking(respond: RespondFn): Promise<void> {
  if (!process.env.WP_API_URL) {
    await respond('Workforce Planner nie jest skonfigurowany.');
    return;
  }

  try {
    const now = new Date();
    const endDate = new Date(now);
    endDate.setMonth(endDate.getMonth() + 2);
    const startStr = now.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    const data = await getTimeline(startStr, endStr);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const employees: any[] = Array.isArray(data) ? data : ((data as any).employees || (data as any).data || []);

    const overbooked: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const emp of employees) {
      const name = emp.name || `${emp.first_name || ''} ${emp.last_name || ''}`.trim();
      const team = emp.team || emp.department || '';
      const utilization = emp.utilization || {};

      for (const [month, val] of Object.entries(utilization)) {
        const pct = getUtilPercent(val);
        if (pct > 100) {
          overbooked.push(`• *${name}* (${team}) — ${month}: ${pct}%`);
        }
      }
    }

    if (overbooked.length === 0) {
      await respond('Brak overbookingu — nikt nie jest przeciążony! 🎉');
      return;
    }

    await respond(`*Overbooking (${startStr} — ${endStr}):*\n${overbooked.join('\n')}`);
  } catch (error) {
    logError('slash-overbooking', 'Błąd pobierania overbookingu', (error as Error).message);
    await respond('Błąd pobierania danych z Workforce Planner.');
  }
}

// /iwan projekty — aktywne projekty z ludźmi
async function handleProjekty(respond: RespondFn): Promise<void> {
  if (!process.env.WP_API_URL) {
    await respond('Workforce Planner nie jest skonfigurowany.');
    return;
  }

  try {
    const projects = await getProjects();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const projectList: any[] = Array.isArray(projects) ? projects : ((projects as any).data || (projects as any).projects || []);

    if (projectList.length === 0) {
      await respond('Brak aktywnych projektów w Workforce Planner.');
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lines = projectList.slice(0, 15).map((p: any) => {
      const name = p.name || p.project_name || '?';
      const members = p.members || p.employees || [];
      const count = Array.isArray(members) ? members.length : 0;
      const status = p.status || '';
      return `• *${name}*${status ? ` (${status})` : ''} — ${count} osób`;
    });

    await respond(`*Aktywne projekty:*\n${lines.join('\n')}`);
  } catch (error) {
    logError('slash-projekty', 'Błąd pobierania projektów', (error as Error).message);
    await respond('Błąd pobierania danych z Workforce Planner.');
  }
}

// /iwan deal <nazwa> — status deala z Pipedrive
async function handleDeal(dealName: string, respond: RespondFn): Promise<void> {
  if (!dealName) {
    await respond('Użycie: `/iwan deal <nazwa>` (np. `/iwan deal Acme`)');
    return;
  }
  if (!isPipedriveEnabled()) {
    await respond('Pipedrive nie jest skonfigurowany.');
    return;
  }

  try {
    const deals = await searchDeals(dealName);
    if (deals.length === 0) {
      await respond(`Nie znalazłem deala: *${dealName}*`);
      return;
    }

    // Weź najlepszy match (pierwszy otwarty lub pierwszy w ogóle)
    const match = deals.find(d => d.status === 'open') || deals[0];
    const deal = await getDeal(match.id);
    if (!deal) {
      await respond(`Nie udało się pobrać danych deala *${match.title}*.`);
      return;
    }

    const notes = await getDealNotes(match.id);
    const ownerName = deal.owner_name || deal.user_id?.name || '?';
    const orgName = deal.org_name || deal.org_id?.name || '';

    const lines = [
      `*${deal.title}*${orgName ? ` (${orgName})` : ''}`,
      `• Status: ${deal.status}`,
      `• Wartość: ${deal.value || '?'} ${deal.currency || ''}`,
      `• Owner: ${ownerName}`,
    ];

    if (notes.length > 0) {
      lines.push('', '*Ostatnie notatki:*');
      for (const note of notes.slice(0, 3)) {
        const content = (note.content || '').replace(/<[^>]+>/g, ' ').trim();
        const preview = content.length > 200 ? content.substring(0, 200) + '...' : content;
        lines.push(`• ${preview}`);
      }
    }

    await respond(lines.join('\n'));
  } catch (error) {
    logError('slash-deal', 'Błąd pobierania deala', (error as Error).message);
    await respond('Błąd pobierania danych z Pipedrive.');
  }
}

// /iwan deals [pipeline_id] — lista aktywnych deali
async function handleDeals(args: string, respond: RespondFn): Promise<void> {
  if (!isPipedriveEnabled()) {
    await respond('Pipedrive nie jest skonfigurowany.');
    return;
  }

  try {
    const pipelineIds = args ? args.split(',').map(Number).filter(Boolean) : [];
    const pipelines = pipelineIds.length > 0 ? pipelineIds : ACTIVE_PIPELINES;
    const deals = await getActiveDeals(pipelines);

    if (deals.length === 0) {
      await respond('Brak aktywnych deali w Pipedrive.');
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lines = deals.slice(0, 20).map((d: any) => {
      const ownerName = d.owner_name || d.user_id?.name || '?';
      const orgName = d.org_name || d.org_id?.name || '';
      const value = d.value ? ` — ${d.value} ${d.currency || ''}` : '';
      return `• *${d.title}*${orgName ? ` (${orgName})` : ''}${value} [${ownerName}]`;
    });

    const total = deals.length > 20 ? ` (pokazuję 20/${deals.length})` : '';
    await respond(`*Aktywne deale${total}:*\n${lines.join('\n')}`);
  } catch (error) {
    logError('slash-deals', 'Błąd pobierania deali', (error as Error).message);
    await respond('Błąd pobierania danych z Pipedrive.');
  }
}

// /iwan (bez argumentów) — pokaż pomoc
async function handleHelp(respond: RespondFn): Promise<void> {
  await respond(
    `*Komendy Iwana:*\n` +
    `• \`/iwan szukaj <fraza>\` — szukaj w historii kanału\n` +
    `• \`/iwan notion <fraza>\` — szukaj w Notion\n` +
    `• \`/iwan team <nazwa>\` — utylizacja zespołu (np. Frontend)\n` +
    `• \`/iwan kto-wolny [miesiąc]\` — kto jest dostępny\n` +
    `• \`/iwan overbooking\` — lista przeciążonych\n` +
    `• \`/iwan projekty\` — aktywne projekty\n` +
    `• \`/iwan deal <nazwa>\` — status deala z Pipedrive\n` +
    `• \`/iwan deals\` — lista aktywnych deali\n` +
    `• \`/iwan status\` — status bota\n` +
    `• Lub po prostu napisz \`@Iwan <pytanie>\``
  );
}
