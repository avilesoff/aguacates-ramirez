import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://tnfeknqvzenxsrluufhx.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRuZmVrbnF2emVueHNybHV1Zmh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzODIzODgsImV4cCI6MjA2ODk1ODM4OH0.WuivmX9fP-o7B6HflmwQ7aNL-YlulN2z18k4QVDUQRU';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
