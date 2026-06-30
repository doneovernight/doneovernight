# DONEOVERNIGHT v1.0 Freeze Report

Status: implemented, committed, pushed, deployed, and production-verified.

Scope: legal/policy copy, SEO/indexing hygiene, route decision documentation, wallet/product honesty, and platform readiness reporting. No new product features were added.

## Files Changed

- `privacy.html`
- `terms.html`
- `refund.html`
- `trust.html`
- `enterprise.html`
- `robots.txt`
- `how-it-works/index.html`
- `library/index.html`
- `experience/experience.js`
- `api/task-submit.js`
- `docs/apple-wallet-founder-pass.md`
- `outputs/doneovernight-v1-freeze-report.md`

## Legal Pages Updated

### `/privacy`

Updated from a task-only privacy policy to a platform-aware policy covering:

- Journey IDs and Builder IDs.
- How It Works journey answers and progress.
- Builder Profiles, Builder Cards, and wallet pass preparation records.
- Viewer Build submissions.
- Resource/product interest.
- Page, share, follow, progress, and email events.
- Language selection, browser language, and lightweight language detection.
- localStorage return-visitor memory.
- HQ/Admin internal processing.
- Supabase storage.
- n8n/Outlook/webhook email processing.
- Telegram/internal ops notifications where configured.
- Plausible, Vercel Analytics, and Speed Insights.
- HQ session cookies.
- Public vs private platform areas.
- Future Apple/Google Wallet delivery.
- Payment/product interest where relevant.

Also softened inherited absolute AI retention language into a more accurate operational statement.

### `/terms`

Updated from task-only terms to platform terms covering:

- Public platform access.
- Builder identity records.
- Viewer Build submissions and public idea handling.
- Future products/resources marked as prepared, building, coming soon, or notify me.
- Wallet pass preparation vs signed installable passes.
- Private areas and unauthorized access.
- Client work scope, payment terms, IP, confidentiality, revisions, liability, and governing law.

### `/refund`

Updated to clarify:

- Satisfaction policy applies to scoped paid client work.
- Products, resources, wallet passes, Builder access, and platform modules marked as prepared/building/coming soon/notify me are not purchases unless checkout or invoice is completed.
- Future paid products should show their refund terms before payment.

### `/trust`

Updated to:

- Remove stale public metric-style claims.
- Replace them with stable trust pillars.
- Explain HQ vs Admin at a trust level.
- Cover platform records and Supabase/operational storage.
- Align retention language with the updated privacy policy.

### `/enterprise`

Updated to:

- Reflect platform/client workflow positioning.
- Add a concise HQ/Admin explanation:
  - HQ = platform intelligence, live status, Builder ecosystem signals, analytics.
  - Admin = clients, tasks, operators, email flows, internal operations.

## SEO / Metadata Changes

- Updated meta descriptions for `/privacy`, `/terms`, `/refund`, `/trust`, and `/enterprise`.
- Preserved canonical URLs.
- Preserved public indexability for legal/trust/enterprise routes.
- Kept `/builder` noindex because Builder Home is private-feeling and identity-based.
- Did not add `/builder` to `sitemap.xml`.
- Confirmed `sitemap.xml` parses as valid XML.

## Robots / Sitemap Changes

### `robots.txt`

Added crawler blocks for private, internal, or legacy/special surfaces:

- `/hq`
- `/hq/`
- `/pay`
- `/pay/`
- `/start`
- `/start/`
- `/cp`
- `/cp/`
- `/common-place`
- `/common-place/`
- `/commonpl4ce`
- `/commonpl4ce/`
- `/romypeters`
- `/romypeters/`
- `/SaiUniversity-Branding`
- `/SaiUniversity-Branding/`
- `/SaiUniversity-Preview`
- `/SaiUniversity-Preview/`

Already protected/disallowed routes remain covered:

- `/admin`
- `/client-invite`
- `/client-onboarding`
- `/operator`
- `/operator-apply`
- `/operator-onboarding`
- `/portal`
- `/review`
- `/workspace`
- `/api`
- submitted/thanks routes

### `sitemap.xml`

No sitemap changes were needed. Current sitemap already includes the intended public routes and excludes `/builder`, `/hq`, Admin, operator, workspace, and API routes.

## Route Decisions

| Route | Decision | Reason |
|---|---|---|
| `/` | Keep live/indexed | Primary public website. |
| `/how-it-works` | Keep live/indexed | Main interactive journey. |
| `/builder` | Keep live/noindex | Builder Home is identity/private-feeling. |
| `/library` | Keep live/indexed | Public library room with Builder-unlocked copy clarified. |
| `/resources` | Keep live/indexed | Public resource interest route. |
| `/journal` | Keep live/indexed | Public build journal. |
| `/products` and `/products/*` | Keep live/indexed | Product roadmap; copy already labels building/coming soon/notify. |
| `/case-studies` | Keep live/indexed | Public proof/editorial route. |
| `/don` | Keep live/indexed | Founder QR/NFC public business-card destination. |
| `/connect` | Keep live/indexed | Public connect route. |
| `/live` | Keep live/indexed | Public live status route. |
| `/systems`, `/automation`, `/ai`, `/business`, `/architecture`, `/operators` | Keep live/indexed | Topic SEO architecture. |
| `/services/*`, `/capabilities/*` | Keep live/indexed | SEO/service architecture. |
| `/trust`, `/enterprise`, `/privacy`, `/terms`, `/refund` | Keep live/indexed | Required public policy/trust pages. |
| `/hq`, `/hq/login` | Keep live/noindex/disallowed | Protected internal platform intelligence. |
| `/admin` / `admin.doneovernight.com` | Keep internal/protected/disallowed | Operations, clients, tasks, operators. |
| `/operator`, `/operator-apply`, `/operator-onboarding` | Keep internal/apply/disallowed | Operator operations and applications. |
| `/workspace`, `/portal`, `/client-onboarding`, `/client-invite` | Keep internal/client/disallowed | Client/workspace surfaces. |
| `/pay` | Keep prepared/disallowed | Payment surface should not be indexed until fully activated. |
| `/ask` / `ask.doneovernight.com` | Keep live | Primary request intake. |
| `/task` | Redirect/legacy safe | Main-domain route redirects to ask. |
| `/start` | Keep legacy/disallowed | Older start experience; not identity layer. |
| `/cp`, `/common-place`, `/commonpl4ce` | Keep legacy/special/disallowed | Special project route; not core SEO. |
| `/romypeters` | Keep special/disallowed | Special project/client route. |
| `SaiUniversity-*` | Keep present/disallowed | Imported/special project folders; not core public SEO. |

## Wallet Copy Changes

- Public journey buttons changed from:
  - `Add to Apple Wallet`
  - `Add to Google Wallet`
- To:
  - `Apple Wallet prepared`
  - `Google Wallet prepared`

Updated public/API wording to say wallet delivery is prepared and Apple/Google credentials are required before installable passes can be issued.

HQ still uses the wallet endpoint, but the visible action now says `Signed Founder Pass` only when Apple signing is configured. Missing-credential behavior remains honest.

## Library / Product Copy Changes

- `/library` now explains that public rooms are visible now and Builder/operator access unlocks only when those systems are ready.
- Product pages were reviewed and already use `Building`, `Planning`, `Coming Soon`, `Draft`, `Research`, `Notify Me`, and `Join Waitlist` style language.
- No payment/download promises were added.

## Verification

Local checks run:

```sh
node --check experience/experience.js
node --check api/task-submit.js
node --check lib/builder-wallet.js
python3 -c "import xml.etree.ElementTree as ET; ET.parse('sitemap.xml'); print('sitemap xml ok')"
test -s robots.txt
rg -n "Add to Apple Wallet|Add to Google Wallet|Wallet support coming soon|Download Wallet Pass|Download Founder Pass|100% satisfaction|98\\.4|1,842|1,800" . -g '*.html' -g '*.js' -g '*.md' -g '!outputs/doneovernight-full-platform-audit.md'
```

Results:

- JS syntax checks passed.
- Sitemap XML parsed successfully.
- Robots file exists and is non-empty.
- Stale wallet/metric wording scan returned no matches.

Production deployment:

- Production was deployed through Vercel and aliased to `https://doneovernight.com`.
- The final deployment URL/ID is intentionally not hardcoded in this report because report-only commits create a new deployment ID.

Production route smoke checks:

```text
200 https://doneovernight.com/
200 https://doneovernight.com/how-it-works
200 https://doneovernight.com/builder
200 https://doneovernight.com/library
200 https://doneovernight.com/resources
200 https://doneovernight.com/journal
200 https://doneovernight.com/products
200 https://doneovernight.com/case-studies
200 https://doneovernight.com/don
200 https://doneovernight.com/connect
200 https://doneovernight.com/live
200 https://doneovernight.com/privacy
200 https://doneovernight.com/terms
200 https://doneovernight.com/refund
200 https://doneovernight.com/trust
200 https://doneovernight.com/enterprise
200 https://doneovernight.com/hq
200 https://doneovernight.com/hq/login
200 https://admin.doneovernight.com
200 https://ask.doneovernight.com
200 https://doneovernight.com/robots.txt
200 https://doneovernight.com/sitemap.xml
```

Production API sanity:

- `/api/platform-data?view=live` returned `ok:true` and platform data from production. When no manual `live_status` row is present, the API keeps the calm placeholder state and still surfaces real journal/deployment records where available.
- `/api/builder-wallet/apple?type=founder` returned honest missing-certificate behavior:
  - `configured:false`
  - `status:"wallet_certificates_required"`
  - missing Apple Wallet certificate env vars listed
  - no fake `.pkpass`
  - wallet storage saved a preparation row

Production content checks confirmed:

- `/privacy` includes Builder IDs, Supabase, wallet passes, and localStorage language.
- `/terms` includes Platform access, Viewer Builds/public ideas, and Wallet passes.
- `/refund` includes Platform products and "not paid purchases" clarification.
- `/how-it-works` shows `Apple Wallet prepared`, `Google Wallet prepared`, and credential-required wallet copy.
- `/library` shows public vs Builder/operator access clarification.
- `robots.txt` includes `/hq`, `/start`, `/cp`, and SaiUniversity disallows.

Browser note: direct browser automation was not available in this session. Production verification was performed through route, API, and deployed-content HTTP checks.

## Policies Needing Human / Legal Review

These pages are now more accurate, but they should still be reviewed by a legal professional before broad public launch:

- `/privacy`
- `/terms`
- `/refund`

Specific review points:

- GDPR controller/processor language.
- Retention periods for platform records.
- AI/tooling processor statements.
- Viewer Build idea/IP handling.
- Wallet pass identity records.
- Payment/product terms once payments go live.

## Remaining Risks

- n8n/Outlook workflow behavior was not changed or audited in this sprint.
- Supabase schema was not changed.
- No manual SQL was required.
- Product/payment flows remain prepared, not fully activated.
- Legacy/special routes remain in the repo; they are now crawler-disallowed but not deleted.
- `robots.txt` disallow is crawler guidance, not access control.

## Recommended Next Sprint

1. Legal review of updated Privacy, Terms, and Refund pages.
2. Credentialed n8n/Outlook workflow audit.
3. Admin/client/operator security/RLS audit.
4. Apple Wallet certificate completion.
5. Decide long-term fate of legacy/special routes:
   - `/start`
   - `/cp`
   - `/romypeters`
   - `SaiUniversity-*`
6. Add automated smoke tests for routes and critical APIs.

## Manual SQL

No manual SQL is required for this sprint.
