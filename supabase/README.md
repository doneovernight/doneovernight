# Supabase Migration Policy

Creator OS migrations are infrastructure only.

Allowed in migrations:

- Tables
- Columns
- Indexes
- Constraints
- Policies
- Triggers
- Functions
- Storage bucket configuration
- Minimal creator bootstrap rows with only `id`, `slug`, `username`, `created_at`, and `updated_at`, using `ON CONFLICT DO NOTHING`

Not allowed in migrations:

- Display names
- Bios
- Emails
- Profile media
- Hero media
- Social links
- Theme choices
- Creator DNA
- FAQ content
- Runtime state
- Page Builder content
- Any other creator-editable content

Creator-editable values must flow through:

Creator Admin -> `saveCreator()` -> `public.creators`

If a future release requires data migration, use a dedicated data migration script and do not mix it with schema changes.
