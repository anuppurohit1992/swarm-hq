/* Swarm HQ runtime config. PUBLIC values only: the project URL and the anon key are public by design
   (Row Level Security protects all data). NEVER put a service-role key, JWT secret, DB password or bot key here.
   Clear SUPABASE_URL / SUPABASE_ANON_KEY (or open the site with ?mock=1) to run in MOCK MODE with fictional data. */
window.SWARM_CONFIG = {
  SUPABASE_URL: 'https://tfvcxvfszlgrmmwtzsyu.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRmdmN4dmZzemxncm1td3R6c3l1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0NzU2ODQsImV4cCI6MjEwNzA1MTY4NH0.qIom6FI_it034fY0_ILp4EJl1xb4MCQG5QaJB_FGMtM', // role: anon
  SITE_URL: 'https://anuppurohit1992.github.io/swarm-hq/',
  // Google / GitHub sign-in buttons stay HIDDEN until set to true (after the OAuth client is configured in Supabase Auth).
  oauth: { google: false, github: false },
};
