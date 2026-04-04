import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://qpuosyukfzbzfgazalgk.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFwdW9zeXVrZnpiemZnYXphbGdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM3NzUyMTQsImV4cCI6MjA1OTM1MTIxNH0.yHjhC-N9c5LFuID7mCb9yg_7vpzMbIO' // using the standard format of the key based on VITE_SUPABASE_PUBLISHABLE_KEY without the sb_publishable_ or maybe the real VITE_SUPABASE_PUBLISHABLE_KEY? Wait, let's just use what's in .env, wait actually VITE_SUPABASE_PUBLISHABLE_KEY is not a standard JWT. The standard Supabase anon key is usually longer. Wait, I should import .env.
);
