/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /** Legacy name; used if VITE_SUPABASE_PUBLISHABLE_KEY is unset */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_SOCKET_SERVER_URL?: string;
  readonly VITE_PAGE_API_ORIGIN?: string;
  readonly VITE_AUTH_REDIRECT_TO?: string;
}
