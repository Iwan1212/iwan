// src/services/models.ts — centralne stałe modeli AI
export const MODEL_SONNET = 'claude-sonnet-4-5-20250929' as const;
export const MODEL_HAIKU = 'claude-haiku-4-5-20251001' as const;

// Mapowanie tier → model
export const MODEL_MAP = {
  fast: MODEL_HAIKU,
  smart: MODEL_SONNET,
} as const;
