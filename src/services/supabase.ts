// src/services/supabase.js
const { createClient } = require('@supabase/supabase-js');

// Inicjalizacja klienta Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

module.exports = { supabase };
