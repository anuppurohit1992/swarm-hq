/* Swarm HQ runtime config. Public values only: the Supabase anon key is safe to publish (RLS protects data).
   NEVER put a service-role key, JWT secret or any other secret here.
   Leave SUPABASE_URL / SUPABASE_ANON_KEY empty to run in MOCK MODE (fictional data, simulated updates). */
window.SWARM_CONFIG = {
  SUPABASE_URL: '',        // e.g. 'https://abcdefghijklmnop.supabase.co'
  SUPABASE_ANON_KEY: '',   // the project's anon / publishable key
  SITE_URL: 'https://anuppurohit1992.github.io/swarm-hq/', // auth redirect target (whitelist it in Supabase Auth → URL configuration)
  // Google / GitHub sign-in buttons stay HIDDEN until set to true (after the OAuth client is configured in Supabase Auth).
  oauth: { google: false, github: false },
};
