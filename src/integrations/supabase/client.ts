// Supabase browser client (Vite env). Publishable key: VITE_SUPABASE_PUBLISHABLE_KEY or VITE_SUPABASE_ANON_KEY.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
const SUPABASE_PUBLISHABLE_KEY = String(
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || ''
).trim();

if (import.meta.env.DEV && (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY)) {
  console.error(
    '[supabase] Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or legacy VITE_SUPABASE_ANON_KEY) in .env'
  );
}

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});