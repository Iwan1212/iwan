// src/services/supabase.ts
import { createClient } from '@supabase/supabase-js';

// Inicjalizacja klienta Supabase
export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
);
