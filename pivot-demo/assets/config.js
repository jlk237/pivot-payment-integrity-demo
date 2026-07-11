/* Runtime config — the ONE file to change per environment. See SETUP.md.
   - supabaseUrl / supabaseAnonKey: leave BLANK ("") to run in local/in-memory mode
     (no login, no persistence). Fill in your own Supabase project to enable login +
     cross-session persistence (run supabase/schema.sql on that project first).
   - The anon/publishable key is a PUBLIC client key — safe to commit (RLS protects data).
   - users: login email -> display name/role; must match the users you create in
     Supabase Authentication. */
window.PIVOT_CONFIG = {
  supabaseUrl: "https://ueiewicneajiyfptbkyc.supabase.co",
  supabaseAnonKey: "sb_publishable_1dNp_NoA1jBclugYpKfFtw_IZEglUZt",
  users: {
    "analyst@example.com": { name: "Dana Whitmore", role: "analyst", initials: "DW" },
    "supervisor@example.com": { name: "Karen Boyd", role: "supervisor", initials: "KB" }
  }
};
