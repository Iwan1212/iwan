// src/handlers/slash.js — obsługa komendy /iwan
const { searchSlackHistory, buildContextFromMessages } = require('../services/search');
const { resolveUserNames } = require('../services/users');

// Parsuj komendę: /iwan szukaj <fraza> lub /iwan status
function parseCommand(text) {
  const parts = text.trim().split(/\s+/);
  const action = (parts[0] || '').toLowerCase();
  const args = parts.slice(1).join(' ');
  return { action, args };
}

// Handler slash command /iwan
function setupSlashCommand(app) {
  app.command('/iwan', async ({ command, ack, respond }) => {
    await ack();

    const { action, args } = parseCommand(command.text);

    if (action === 'szukaj') {
      await handleSearch(app, command, args, respond);
    } else if (action === 'status') {
      await handleStatus(respond);
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

// /iwan (bez argumentów) — pokaż pomoc
async function handleHelp(respond) {
  await respond(
    `*Komendy Iwana:*\n` +
    `• \`/iwan szukaj <fraza>\` — szukaj w historii kanału\n` +
    `• \`/iwan status\` — status bota\n` +
    `• Lub po prostu napisz \`@Iwan <pytanie>\``
  );
}

module.exports = { setupSlashCommand, parseCommand };
