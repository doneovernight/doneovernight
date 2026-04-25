# DONEOVERNIGHT — v5 · Deploy Bundle

**An overnight execution layer.** Submit before bed, wake up to results.

---

## Bundle contents

```
/site
├── index.html              ← Landing page (cinematic scroll stage)
├── trust.html              ← Trust page (how we work overnight)
├── enterprise.html         ← Enterprise (build overnight systems)
├── portal.html             ← Client portal (password: executed)
├── terms.html              ← Terms of Service
├── privacy.html            ← Privacy Policy
├── refund.html             ← Satisfaction Policy
├── shared.css              ← Shared design system for secondary pages
├── service-worker.js       ← PWA offline support
├── manifest.webmanifest    ← PWA install manifest
├── icon-192.png            ← PWA icon (Android home screen)
├── icon-512.png            ← PWA icon (splash screen)
├── icon-512-maskable.png   ← PWA icon (adaptive / masked)
├── icon-180.png            ← iOS apple-touch-icon
└── favicon.png             ← Browser tab icon
```

No build step. No dependencies. Just static files.

---

## Deploy in 5 minutes (Vercel)

1. Drag the `/site` folder into a new Vercel project (or run `vercel` in the folder)
2. Point the domain: `doneovernight.com` → Vercel
3. Set up email: Cloudflare Email Routing → forward `ask@doneovernight.com` to your inbox
4. Done. Live.

### Alternative hosts
- **Netlify** — drag and drop the folder
- **Cloudflare Pages** — connect Git or upload zip
- **Framer** — upload as custom code
- **Any static host** — the site is 100% static HTML/CSS/JS

---

## Navigation map

| Route              | Page                      | Notes                                     |
| ------------------ | ------------------------- | ----------------------------------------- |
| `/` or `/index.html` | Landing (cinematic)     | Hero → 07 phases → Proof → Trust → Intake |
| `/trust.html`      | Trust                     | 5-stage timeline, QC standards            |
| `/enterprise.html` | Enterprise                | Systems, engagement models, FAQ           |
| `/portal.html`     | Client portal             | Password-gated · `executed`               |
| `/terms.html`      | Terms of Service          | Legal                                     |
| `/privacy.html`    | Privacy Policy            | Legal · GDPR                              |
| `/refund.html`     | Satisfaction Policy       | Legal · what 100% means                   |

---

## Portal access

- **Password**: `executed`
- **Note**: This is a client-side prototype gate. Real production authentication requires a backend. The dashboard is fully designed and wired — swap the JS password check for a real auth endpoint when you're ready.

---

## PWA installation

The site works as a Progressive Web App:

- **Android / Chrome**: "Install app" button appears in the nav. One tap installs.
- **iOS Safari**: "Install app" button opens instructions for "Add to Home Screen".
- **Desktop Chrome/Edge**: Install icon appears in the address bar.

The service worker caches the shell for instant repeat loads and offline access to the marketing pages.

---

## Email forwarding setup

Set up `ask@doneovernight.com` → your inbox via Cloudflare Email Routing (free):

1. Add `doneovernight.com` to Cloudflare
2. Email → Email Routing → Enable
3. Create forwarding rule: `ask@doneovernight.com` → `your-real-inbox@gmail.com`
4. Verify the destination address

The site's intake form opens a `mailto:` with the submission pre-filled in subject and body.

---

## Updating copy

All copy is inline in the HTML. For fast edits:
- **Hero headline & subline** — `index.html` → search for `opening-display`
- **07 phases** — `index.html` → search for `data-phase="N"`
- **Proof cases** — `index.html` → search for `proof-card`
- **Last Night ticker** — `index.html` → search for `lastnight-list`
- **Pricing** — `index.html` → search for `tier-price`
- **Trust page** — `trust.html` → `timeline-step` blocks
- **Enterprise** — `enterprise.html` → `system` blocks

---

## What this replaces

- Slow freelancers
- Expensive accountants for small tasks
- Unfinished work
- Procrastination

---

*People expand their life by sending tasks.*
