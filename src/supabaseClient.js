// src/supabaseClient.js
import { createClient } from '@supabase/supabase-js'

// ⚠️ Recomendado: mover a .env (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)
const supabaseUrl = 'https://tnfeknqvzenx...supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Cada dispositivo mantiene su propia sesión (no cierra a las demás)
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // multiTab: true, // opcional: sincroniza sesión entre pestañas del MISMO navegador
  },
  db: { schema: 'public' },
})
