// src/services/validate.js

const MAX_LENGTH = 4000;

// Sprawdź czy wiadomość jest poprawna
function validateMessage(text) {
  if (!text || text.trim().length === 0) {
    return { valid: false, error: 'Wiadomość jest pusta' };
  }
  if (text.length > MAX_LENGTH) {
    return { valid: false, error: `Wiadomość za długa (max ${MAX_LENGTH} znaków)` };
  }
  return { valid: true, error: null };
}

module.exports = { validateMessage };
