// src/services/validate.ts
import type { ValidationResult } from '../types/index.js';

const MAX_LENGTH = 4000;

// Sprawdź czy wiadomość jest poprawna
export function validateMessage(text: string): ValidationResult {
  if (!text || text.trim().length === 0) {
    return { valid: false, error: 'Wiadomość jest pusta' };
  }
  if (text.length > MAX_LENGTH) {
    return { valid: false, error: `Wiadomość za długa (max ${MAX_LENGTH} znaków)` };
  }
  return { valid: true, error: null };
}
