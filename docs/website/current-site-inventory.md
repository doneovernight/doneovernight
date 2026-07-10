# Current DONEOVERNIGHT Site Inventory

Inventory date: 2026-07-10, Europe/Amsterdam  
Canonical repository: `https://github.com/doneovernight/doneovernight.git`  
Canonical production project: Vercel project `doneovernight` (`prj_dj9WlUTfSq6OgVZDCE5uCTEQ9mV5`)  
Production commit at inventory time: `30ffd31fb2a318d41cb29d0264369c157d5b4a43`  
Production branch reported by Vercel: `hotfix/commonpl4ce-performance-v1`

## Architecture

The public website is a static HTML/CSS/JavaScript application with Vercel serverless functions in `api/`. It is not the Next.js `command-center` repository. Vercel uses no framework preset, no custom build command, no output directory, and Node.js 24.x for functions.

The same Vercel project serves multiple hostnames through host-based routes and rewrites. Supabase supplies operational storage. Serverless handlers coordinate intake, workspaces, operators, HQ, Website OS, payment preparation, analytics events, email/webhook handoffs, and wallet preparation.

## Route inventory

### Primary public and editorial routes

`/`, `/how-it-works`, `/what-can-be-done-overnight`, `/services`, `/services/overnight-website-fix`, `/services/automation-setup`, `/services/brand-systems`, `/services/operational-systems`, `/capabilities`, `/capabilities/business-operating-systems`, `/capabilities/client-portals`, `/capabilities/customer-onboarding-systems`, `/capabilities/internal-operations-platforms`, `/capabilities/operator-systems`, `/capabilities/workspace-systems`, `/case-studies`, `/systems`, `/automation`, `/ai`, `/business`, `/architecture`, `/operators`, `/overnight-execution`, `/overnight-automation`, `/overnight-website-fixes`, `/amsterdam`, `/rotterdam`, `/journal`, `/library`, `/live`, `/resources`, `/products`, `/products/automation-pack`, `/products/builder-pack`, `/products/lead-operating-system`, `/products/prompt-pack`, `/products/repository`, `/products/restaurant-os`, `/don`, `/connect`.

### Legal and trust routes

`/trust`, `/enterprise`, `/privacy`, `/terms`, `/refund` plus `.html` compatibility redirects and Dutch compatibility aliases defined in `vercel.json`.

### Intake and completion routes

`/ask`, `/start`, `/task`, `/task/submitted`, `/thanks`, `/review`, `/pay`.

`/task` redirects to `https://ask.doneovernight.com`. The `ask.doneovernight.com` root is routed to `/ask/index.html`; `start.doneovernight.com` routes to `/start/index.html`; `pay.doneovernight.com` routes to `/pay/index.html`.

### Protected and operational routes

`/hq`, `/hq/login`, `/admin`, `/admin/mosyaamosya`, `/admin/mina`, `/admin/website-os/commonpl4ce`, `/operator`, `/operator-apply`, `/operator-onboarding`, `/portal`, `/workspace`, `/client-invite`, `/client-onboarding`, `/builder`.

Host surfaces:

- `admin.doneovernight.com` → Admin and Website OS routes;
- `operator.doneovernight.com` → operator workspace and application;
- `portal.doneovernight.com` → client portal/workspace;
- `client.doneovernight.com` → client onboarding;
- `ask.doneovernight.com` → private request intake;
- `start.doneovernight.com` → legacy start experience.

### Special, creator, client, and legacy routes

`/cp`, `/cp-book`, `/common-place`, `/commonpl4ce`, `/mosyaamosya`, `/mina`, `/romypeters`, `/SaiUniversity-Branding`, `/SaiUniversity-Preview`, `/workspace-assets/saiuniversity-preview`.

### Error and fallback routes

`/admin/not-found.html` is the admin-safe fallback. Filesystem handling and host-specific catch-all behavior are defined in `vercel.json`.

### Phase 1 protected preview

`/labs/don-assistant` is added on the feature branch only. It is HQ-session gated in deployed environments, localhost-enabled for testing, `noindex`, robots-disallowed, and excluded from `sitemap.xml`.

## API handler inventory

Twelve Vercel function entrypoints exist:

| Handler | Responsibility |
|---|---|
| `api/task-submit.js` | Primary intake plus multiplexed platform, HQ, payment, wallet, analytics, live-status, and dispatch actions. |
| `api/admin-clients.js` | Admin clients, creator connections, creator analytics, TikTok connection/runtime actions. |
| `api/admin-tasks.js` | Admin task reads and operational views. |
| `api/admin-update-task.js` | Admin task mutations and handoffs. |
| `api/admin-workspace-records.js` | Admin workspace records. |
| `api/client-invite.js` | Client invitation handling. |
| `api/client-onboarding.js` | Client onboarding and session activation. |
| `api/operator-apply.js` | Operator application, access, sessions, profile, and runtime actions. |
| `api/workspace-data.js` | Protected workspace data. |
| `api/workspace-link.js` | Workspace link/session handling. |
| `api/workspace-messages.js` | Protected workspace message operations. |
| `api/workspace-quotes.js` | Workspace quote data. |

Important rewrites include `/api/hq-login`, `/api/hq-logout`, `/api/hq-session`, `/api/platform-data`, `/api/platform-events`, `/api/track-event`, `/api/live-status`, `/api/builder-identity`, `/api/builder-wallet/{apple,google}`, `/api/payment-start`, `/api/payment-return`, `/api/dispatch-subscribe`, and creator-status routes. These are routed to the appropriate multiplexer in `vercel.json`.

## Form inventory

The repository contains 30 named form instances. Critical forms include:

- homepage `#intakeForm` → `/api/task-submit`;
- Ask and Start `#startTaskForm` and `#dispatchForm`;
- Task `#taskIntakeForm`;
- How It Works `#email-form` and `#viewer-form`;
- Live `#viewer-form`;
- HQ login `#hq-login-form`;
- Portal `#portalLoginForm`, legacy signup/gate/task forms;
- Client onboarding and invite `#onboardingForm`;
- Operator login, profile, and application forms;
- Workspace reply, request, task drawer, operation update, and referral forms;
- Admin task, workspace update, quote, and operator modal forms;
- COMMONPL4CE booking and newsletter forms;
- creator login, settings, and newsletter forms.

Phase 1 does not modify any existing form or handler.

## Assets and visual identity

Canonical identity assets:

- `assets/doneovernight-wordmark.svg`;
- `brand/doneovernight-black.png`;
- `brand/doneovernight-neutral.png`;
- `brand/doneovernight-white.png`;
- `assets/doneovernight-footer.css`;
- `favicon.ico`, `favicon.svg`, PNG favicons, Apple icon, PWA icons, and `manifest.webmanifest`.

The production homepage contains the canonical footer markup and `done overnight.` watermark. Phase 1 leaves the homepage, logo files, footer markup, and footer stylesheet unchanged. The lab references the existing SVG wordmark and footer watermark style.

Other asset families include creator media, COMMONPL4CE configuration, workspace/client project media, experience CSS/JS, language dictionaries, and PWA/service-worker assets.

## Analytics and events

Current analytics layers:

- Plausible (`doneovernight.com` domain);
- Vercel Web Analytics;
- Vercel Speed Insights;
- local first-party event wrapper in `assets/first-party-events.js`;
- platform event persistence through `/api/platform-events` and `/api/track-event` where used;
- COMMONPL4CE-scoped analytics and creator analytics on their owned surfaces.

The DON Assistant lab deliberately loads none of these analytics scripts and sends no assistant interaction events.

## SEO inventory

- `robots.txt` controls crawler access to private, operational, legacy, special, API, and lab routes.
- `sitemap.xml` lists intended public routes and excludes protected routes and the lab.
- Public pages use canonical tags, descriptions, Open Graph metadata, and, on major routes, Twitter metadata.
- The homepage contains Organization, WebSite, and Service structured data.
- `manifest.webmanifest`, favicons, PWA icons, and theme metadata are present.
- Lab and HQ routes use `noindex, nofollow`; the lab additionally uses `noarchive`.

## HQ integration

HQ uses an `HQ_ACCESS_TOKEN` login, a signed HTTP-only HQ session cookie, rate-limited login failures, `/api/hq-session` verification, and `/api/hq-logout`. The session response exposes operator, role, permissions, expiry, environment, and branch without exposing the token.

The Phase 1 lab checks `/api/hq-session` with same-origin credentials before rendering. It does not request platform data. Localhost is the only bypass so the static route can be tested without production credentials.

## Storage and external integrations

Referenced operational integrations include Supabase, Vercel, Plausible, Cloudflare Turnstile, Telegram, email/webhook flows, Resend, Stripe/payment-provider preparation, Apple Wallet, Google Wallet, TikTok creator connections/runtime services, n8n-compatible webhook endpoints, and the creator live-runtime worker.

No integration configuration or database schema is changed in Phase 1.

## Deployment inventory

| Item | Recorded value |
|---|---|
| Vercel team | `doneovernights-projects` / `team_poT2RkL0qD1tRiGKXsAOcBr3` |
| Project | `doneovernight` / `prj_dj9WlUTfSq6OgVZDCE5uCTEQ9mV5` |
| Production deployment | `dpl_GLXUhZqiY6ceDgZAN49JWjYzCeR7` |
| Production deployment URL | `doneovernight-pni2rp2ed-doneovernights-projects.vercel.app` |
| State | READY / PROMOTED |
| Production commit | `30ffd31fb2a318d41cb29d0264369c157d5b4a43` |
| Commit message | `Add English and Dutch Website OS interface` |
| Production source branch | `hotfix/commonpl4ce-performance-v1` |
| Runtime | Node.js 24.x, 12 serverless functions |
| Regions observed | functions in `iad1`; build created in `sfo1` |
| Web Analytics | enabled, data present |
| Speed Insights | enabled, data present |

No production deployment was created for Phase 1.

## Screenshot inventory

Baseline screenshots are stored under `outputs/don-assistant-baseline/`:

1. `production-home-desktop.png` — homepage, 1440×1000 viewport, full page.
2. `production-home-mobile.png` — homepage, 390×844 viewport, full page.
3. `production-how-it-works-desktop.png` — primary journey route.
4. `production-case-studies-desktop.png` — public proof route.
5. `production-hq-desktop.png` — internal HQ loading surface.
6. `production-ask-desktop.png` — intake subdomain.

Prototype screenshots are added after local visual verification and are not a production snapshot.
