# Setup — running PIVOT on a new machine / new accounts

PIVOT is a **static, client-side site** (no build, no server, no runtime dependencies). It runs three ways, each with less/more setup:

| Mode | Accounts needed | You get |
|---|---|---|
| **Local** | none | Full demo in-memory; no login; state resets on refresh |
| **+ Supabase** | a Supabase account | Login + decisions/cases/audit **persist** across sessions & users |
| **+ GitHub Pages** | a GitHub account | A public URL anyone can open |

Everything environment-specific lives in **one file: `assets/config.js`**.

---

## 1. Get the code
```
git clone <your-repo-url> pivot-demo
cd pivot-demo
```
No `npm install` — there are **no runtime dependencies**. (npm is only used to *regenerate* the synthetic data.)

## 2. Run it locally (no accounts, instant)
Serve the folder statically:
```
python3 -m http.server 8137
# open http://localhost:8137
```
(or just open `index.html` — it needs internet for CDN fonts/icons/d3.)

With no Supabase configured it runs in **local mode**: no login, in-memory state. The whole demo works; only cross-session persistence is off. To *force* local mode, set `supabaseUrl: ""` in `assets/config.js`.

## 3. (Optional) Regenerate the synthetic data
```
npm run gen:data     # rewrites assets/data.js + src/data/dataset.json (deterministic, no network)
```
All data is synthetic — NPIs deliberately fail the NPI check digit; TINs use the `00-` prefix.

## 4. (Optional) Enable login + persistence — your OWN Supabase
1. Create a free project at **supabase.com** (under whichever account should own it).
2. **SQL Editor → New query →** paste the contents of **`supabase/schema.sql`** → **Run**. (Creates the `case_state`, `audit_log`, `case_closure` tables, RLS policies, realtime, and the `reset_demo()` function. Idempotent — safe to re-run.)
3. **Authentication → Users → Add user** for each demo login (email + password). Defaults the app expects: `analyst@example.com` and `supervisor@example.com`. (Use any emails you like — then update the `users` map in step 5.)
4. **Project Settings → API →** copy the **Project URL** and the **anon / publishable key**.
5. Paste them into **`assets/config.js`**:
   ```js
   window.PIVOT_CONFIG = {
     supabaseUrl: "https://YOUR-REF.supabase.co",
     supabaseAnonKey: "YOUR-PUBLISHABLE-ANON-KEY",   // public client key — safe to commit (RLS protects data)
     users: {
       "analyst@example.com":    { name: "Dana Whitmore", role: "analyst",    initials: "DW" },
       "supervisor@example.com": { name: "Karen Boyd",    role: "supervisor", initials: "KB" }
     }
   };
   ```
Now the app shows a login and persists decisions, case assignments, closures, and the audit trail across sessions and between the analyst/supervisor.

## 5. (Optional) Host it publicly — GitHub Pages
1. Create a repo under your GitHub account and push this folder.
2. **Repo → Settings → Pages → Source: Deploy from a branch → `main` → `/ (root)` → Save.**
3. ~1 minute later it's live at `https://<user>.github.io/<repo>/`.

Any static host works too (Netlify, Vercel, S3, an internal web server) — just serve the folder.

## 6. Reset the demo state
Use the in-app **Reset** action, or run `select public.reset_demo();` in the Supabase SQL Editor.

---

## Everything configurable, in one place — `assets/config.js`
- `supabaseUrl` / `supabaseAnonKey` — **blank = local mode**; filled = your Supabase.
- `users` — maps login emails → display name + role. Must match the users you created in Supabase Auth.

No secrets are committed: the anon key is a **public** client key, and Row-Level Security restricts the data to authenticated users.

## Swap seams (for going beyond the demo)
- `assets/provider.js` (`window.DP`) — reads the bundled JSON today; a Neo4j/real provider can return the same shapes. Also where the mocked **837 / CMS-pricing (Zellis) / Utilization (Milliman)** feeds live, ready to point at real services. See `DATA_SPEC.md`.
- `assets/ai.js` (`window.AI`) — deterministic today; swap for a live model behind a serverless proxy.
