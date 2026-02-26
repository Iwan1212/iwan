// src/services/errors.js
const { supabase } = require('./supabase');

// Zapisz błąd do Supabase + console.error
async function logError(source, message, details = null) {
  console.error(`[${source}] ${message}`, details || '');

  try {
    await supabase.from('error_logs').insert({
      source,
      message,
      details: details ? String(details) : null,
    });
  } catch (err) {
    console.error('Błąd zapisu do error_logs:', err.message);
  }
}

module.exports = { logError };
