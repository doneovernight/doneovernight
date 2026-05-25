# DONEOVERNIGHT portal routing

The production `vercel.json` is prepared for a future `portal.doneovernight.com` domain.

- `doneovernight.com` remains the public marketing site.
- `doneovernight.com/workspace/` keeps working for the current client workspace.
- `doneovernight.com/workspace/@client-slug` rewrites to the same workspace app and resolves the slug in JavaScript/API.
- After mapping `portal.doneovernight.com` in Vercel, `/` on that host rewrites to `/workspace/`.
- `portal.doneovernight.com/@client-slug` rewrites to `/workspace/` and resolves the same slug.

Private workspace data is loaded through `/api/workspace-data`; slug routes only return task data when the matching portal/client record is active.
