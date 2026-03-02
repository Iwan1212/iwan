// src/handlers/slash.js — obsługa komendy /iwan
const { searchSlackHistory, buildContextFromMessages } = require('../services/search');
const { searchNotion, getPageTitle, getPageText } = require('../services/notion');
const { getTimeline, getEmployees, getProjects, buildDateRange, getUtilPercent, getAllocPercent } = require('../services/workforce');
const { resolveUserNames } = require('../services/users');
const { logError } = require('../services/errors');

// Parsuj komendę: /iwan szukaj <fraza> lub /iwan status
function parseCommand(text) {
  const parts = text.trim().split(/\s+/);
  const action = (parts[0] || '').toLowerCase();
  const args = parts.slice(1).join(' ');
  return { action, args };
}

const ALLOWED_CHANNELS = (process.env.SLACK_ALLOWED_CHANNELS || '').split(',').filter(Boolean);

// Handler slash command /iwan
function setupSlashCommand(app) {
  app.command('/iwan', async ({ command, ack, respond }) => {
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
    } else {
      await handleHelp(respond);
    }
  });
}

// /iwan szukaj <fraza> — wyszukaj w historii kanału
async function handleSearch(app, command, query, respond) {
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
async function handleNotion(query, respond) {
  if (!query) {
    await respond('Użycie: `/iwan notion <fraza>`');
    return;
  }

  const pages = await searchNotion(query);

  if (pages.length === 0) {
    await respond(`Nie znalazłem nic w Notion dla: *${query}*`);
    return;
  }

  const lista = [];
  for (const page of pages.slice(0, 5)) {
    const title = getPageTitle(page);
    const text = await getPageText(page.id);
    const preview = text ? text.substring(0, 150) : '(brak treści)';
    lista.push(`• *${title}*: ${preview}`);
  }

  await respond(`Wyniki z Notion dla *${query}* (${pages.length}):\n${lista.join('\n')}`);
}

// /iwan status — pokaż status bota
async function handleStatus(respond) {
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
async function handleTeam(teamName, respond) {
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
    const employees = Array.isArray(data) ? data : (data.employees || data.data || []);

    const lowerTeam = teamName.toLowerCase();
    const teamMembers = employees.filter(e => {
      const t = (e.team || e.department || '').toLowerCase();
      return t.includes(lowerTeam);
    });

    if (teamMembers.length === 0) {
      await respond(`Nie znalazłem zespołu *${teamName}* w Workforce Planner.`);
      return;
    }

    const lines = teamMembers.map(emp => {
      const name = emp.name || `${emp.first_name || ''} ${emp.last_name || ''}`.trim();
      const assignments = emp.assignments || [];
      const utilization = emp.utilization || {};
      const utilVals = Object.values(utilization).map(getUtilPercent);
      const avgUtil = utilVals.length > 0
        ? Math.round(utilVals.reduce((a, b) => a + b, 0) / utilVals.length)
        : 0;

      if (assignments.length === 0) {
        return `• *${name}*: bench (0%)`;
      }
      const projs = assignments.map(a => {
        const proj = a.project_name || a.project || '?';
        const alloc = getAllocPercent(a);
        return `${proj} (${alloc}%)`;
      }).join(', ');
      const marker = avgUtil > 100 ? ' ⚠️' : '';
      return `• *${name}*: ${projs} — ${avgUtil}%${marker}`;
    });

    await respond(`*Team ${teamName}:*\n${lines.join('\n')}`);
  } catch (error) {
    logError('slash-team', 'Błąd pobierania danych zespołu', error.message);
    await respond('Błąd pobierania danych z Workforce Planner.');
  }
}

// /iwan kto-wolny [miesiąc] — kto jest dostępny
async function handleKtoWolny(args, respond) {
  if (!process.env.WP_API_URL) {
    await respond('Workforce Planner nie jest skonfigurowany.');
    return;
  }

  try {
    const query = args || '';
    const { startDate, endDate } = buildDateRange(query || 'teraz');

    const data = await getTimeline(startDate, endDate);
    const employees = Array.isArray(data) ? data : (data.employees || data.data || []);

    const free = employees.filter(emp => {
      const assignments = emp.assignments || [];
      const utilization = emp.utilization || {};
      const utilVals = Object.values(utilization).map(getUtilPercent);
      const avgUtil = utilVals.length > 0
        ? utilVals.reduce((a, b) => a + b, 0) / utilVals.length
        : 0;
      return assignments.length === 0 || avgUtil < 30;
    });

    if (free.length === 0) {
      await respond(`Wszyscy zajęci w okresie ${startDate} — ${endDate}.`);
      return;
    }

    const lines = free.map(emp => {
      const name = emp.name || `${emp.first_name || ''} ${emp.last_name || ''}`.trim();
      const team = emp.team || emp.department || '';
      const utilization = emp.utilization || {};
      const utilVals = Object.values(utilization).map(getUtilPercent);
      const avgUtil = utilVals.length > 0
        ? Math.round(utilVals.reduce((a, b) => a + b, 0) / utilVals.length)
        : 0;
      return `• *${name}* (${team}) — ${avgUtil}%`;
    });

    await respond(`*Wolni/dostępni (${startDate} — ${endDate}):*\n${lines.join('\n')}`);
  } catch (error) {
    logError('slash-kto-wolny', 'Błąd pobierania wolnych', error.message);
    await respond('Błąd pobierania danych z Workforce Planner.');
  }
}

// /iwan overbooking — lista przeciążonych
async function handleOverbooking(respond) {
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
    const employees = Array.isArray(data) ? data : (data.employees || data.data || []);

    const overbooked = [];
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
    logError('slash-overbooking', 'Błąd pobierania overbookingu', error.message);
    await respond('Błąd pobierania danych z Workforce Planner.');
  }
}

// /iwan projekty — aktywne projekty z ludźmi
async function handleProjekty(respond) {
  if (!process.env.WP_API_URL) {
    await respond('Workforce Planner nie jest skonfigurowany.');
    return;
  }

  try {
    const projects = await getProjects();
    const projectList = Array.isArray(projects) ? projects : (projects.data || projects.projects || []);

    if (projectList.length === 0) {
      await respond('Brak aktywnych projektów w Workforce Planner.');
      return;
    }

    const lines = projectList.slice(0, 15).map(p => {
      const name = p.name || p.project_name || '?';
      const members = p.members || p.employees || [];
      const count = Array.isArray(members) ? members.length : 0;
      const status = p.status || '';
      return `• *${name}*${status ? ` (${status})` : ''} — ${count} osób`;
    });

    await respond(`*Aktywne projekty:*\n${lines.join('\n')}`);
  } catch (error) {
    logError('slash-projekty', 'Błąd pobierania projektów', error.message);
    await respond('Błąd pobierania danych z Workforce Planner.');
  }
}

// /iwan (bez argumentów) — pokaż pomoc
async function handleHelp(respond) {
  await respond(
    `*Komendy Iwana:*\n` +
    `• \`/iwan szukaj <fraza>\` — szukaj w historii kanału\n` +
    `• \`/iwan notion <fraza>\` — szukaj w Notion\n` +
    `• \`/iwan team <nazwa>\` — utylizacja zespołu (np. Frontend)\n` +
    `• \`/iwan kto-wolny [miesiąc]\` — kto jest dostępny\n` +
    `• \`/iwan overbooking\` — lista przeciążonych\n` +
    `• \`/iwan projekty\` — aktywne projekty\n` +
    `• \`/iwan status\` — status bota\n` +
    `• Lub po prostu napisz \`@Iwan <pytanie>\``
  );
}

module.exports = { setupSlashCommand, parseCommand };
