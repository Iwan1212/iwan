// src/services/users.js

const { logError } = require('./errors');

const userCache = new Map();

// Pobierz nazwę użytkownika z Slack API (z cache)
async function getUserName(app, userId) {
  if (userCache.has(userId)) return userCache.get(userId);

  try {
    const result = await app.client.users.info({ user: userId });
    const name = result.user.real_name || result.user.name || userId;
    userCache.set(userId, name);
    return name;
  } catch (error) {
    logError('users', 'Błąd pobierania user info', error.message);
    return userId;
  }
}

// Zamień user_id na nazwy w liście wiadomości
async function resolveUserNames(app, messages) {
  for (const msg of messages) {
    if (!msg.user_name && msg.user_id) {
      msg.user_name = await getUserName(app, msg.user_id);
    }
  }
  return messages;
}

module.exports = { getUserName, resolveUserNames };
