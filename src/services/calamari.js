// src/services/calamari.js — integracja z Calamari API (urlopy i nieobecności)

const { logError } = require('./errors');

const CALAMARI_URL = (process.env.CALAMARI_URL || '').replace(/\/$/, '');
const CALAMARI_API_KEY = process.env.CALAMARI_API_KEY || '';

// Bazowy fetch do Calamari API (POST + Basic Auth)
async function calamariFetch(path, body = {}) {
  const auth = Buffer.from(`calamari:${CALAMARI_API_KEY}`).toString('base64');
  const res = await fetch(`${CALAMARI_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${auth}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Calamari ${path}: ${res.status}`);
  return res.json();
}

// Pobierz nieobecności w danym zakresie dat (zaakceptowane + oczekujące)
async function getAbsences(from, to) {
  const data = await calamariFetch('/api/leave/request/v1/find-advanced', { from, to });
  return (data || []).filter(r => r.status === 'ACCEPTED' || r.status === 'PENDING');
}

// Parsuj zakres dat z zapytania (reużywa logikę z workforce)
function buildCalamariDateRange(query) {
  const { buildDateRange } = require('./workforce');
  return buildDateRange(query);
}

// Zbuduj kontekst z nieobecności dla Claude
function buildContextFromCalamari(absences) {
  if (!absences || absences.length === 0) return '';

  const lines = [];
  const byPerson = {};

  for (const a of absences) {
    const email = a.employeeEmail || '?';
    const name = email.split('@')[0].replace('.', ' ');
    if (!byPerson[name]) byPerson[name] = [];
    byPerson[name].push({
      type: a.absenceTypeName || 'Nieobecność',
      from: a.from,
      to: a.to,
      days: a.entitlementAmount || 0,
      status: a.status,
    });
  }

  for (const [name, entries] of Object.entries(byPerson)) {
    const parts = entries.map(e => {
      const pending = e.status === 'PENDING' ? ' [OCZEKUJE NA AKCEPTACJĘ]' : '';
      return `${e.type} (${e.from} → ${e.to}, ${e.days}d)${pending}`;
    });
    lines.push(`  ${name}: ${parts.join(', ')}`);
  }

  const content = lines.join('\n').substring(0, 3000);
  return `\n\nKONTEKST Z CALAMARI (urlopy i nieobecności):\nUWAGA: Jeśli danej osoby NIE MA na liście — znaczy że nie ma żadnej zarejestrowanej nieobecności. Nie zgaduj i nie mieszaj danych między osobami.\n---\n${content}\n---\n`;
}

module.exports = { calamariFetch, getAbsences, buildCalamariDateRange, buildContextFromCalamari };
