-- Creator OS: allow Intro Audio uploads in the public creator-media bucket.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'creator-media',
  'creator-media',
  true,
  10000000,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'audio/mpeg',
    'audio/mp3',
    'audio/mpeg3',
    'audio/x-mpeg',
    'audio/x-mpeg-3',
    'audio/mp4',
    'audio/m4a',
    'audio/x-m4a',
    'audio/aac',
    'audio/aacp',
    'application/octet-stream'
  ]
)
on conflict (id) do update set
  public = true,
  file_size_limit = 10000000,
  allowed_mime_types = excluded.allowed_mime_types;
