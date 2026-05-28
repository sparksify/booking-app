import { createClient } from '@supabase/supabase-js';

/**
 * Server-side admin client — uses the service role key.
 * Only call this from API routes / getServerSideProps, never from the browser.
 */
export function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}

/**
 * Browser-safe anon client.
 * Created lazily and cached as a module singleton.
 */
let _client = null;
export function getSupabase() {
  if (!_client) {
    _client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
  }
  return _client;
}
