create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.pdfs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  file_url text not null,
  total_pages integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.chapters (
  id uuid primary key default gen_random_uuid(),
  pdf_id uuid not null references public.pdfs(id) on delete cascade,
  title text not null,
  start_page integer not null check (start_page > 0),
  end_page integer not null check (end_page >= start_page)
);

create table if not exists public.progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  completed boolean not null default false,
  completed_at timestamptz,
  unique (user_id, chapter_id)
);

create table if not exists public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pdf_id uuid not null references public.pdfs(id) on delete cascade,
  page_number integer not null check (page_number > 0),
  created_at timestamptz not null default now(),
  unique (user_id, pdf_id, page_number)
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pdf_id uuid not null references public.pdfs(id) on delete cascade,
  page_number integer not null check (page_number > 0),
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reading_position (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pdf_id uuid not null references public.pdfs(id) on delete cascade,
  last_page integer not null default 1 check (last_page > 0),
  updated_at timestamptz not null default now(),
  unique (user_id, pdf_id)
);

create table if not exists public.annotations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pdf_id uuid not null references public.pdfs(id) on delete cascade,
  page_number integer not null check (page_number > 0),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (user_id, pdf_id, page_number)
);

drop trigger if exists set_notes_updated_at on public.notes;
create trigger set_notes_updated_at
before update on public.notes
for each row execute function public.set_updated_at();

drop trigger if exists set_reading_position_updated_at on public.reading_position;
create trigger set_reading_position_updated_at
before update on public.reading_position
for each row execute function public.set_updated_at();

drop trigger if exists set_annotations_updated_at on public.annotations;
create trigger set_annotations_updated_at
before update on public.annotations
for each row execute function public.set_updated_at();

alter table public.pdfs enable row level security;
alter table public.chapters enable row level security;
alter table public.progress enable row level security;
alter table public.bookmarks enable row level security;
alter table public.notes enable row level security;
alter table public.reading_position enable row level security;
alter table public.annotations enable row level security;

create policy "pdfs_select_own"
on public.pdfs
for select
using (auth.uid() = user_id);

create policy "pdfs_insert_own"
on public.pdfs
for insert
with check (auth.uid() = user_id);

create policy "pdfs_update_own"
on public.pdfs
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "pdfs_delete_own"
on public.pdfs
for delete
using (auth.uid() = user_id);

create policy "chapters_select_own"
on public.chapters
for select
using (
  exists (
    select 1 from public.pdfs
    where pdfs.id = chapters.pdf_id
      and pdfs.user_id = auth.uid()
  )
);

create policy "chapters_write_own"
on public.chapters
for all
using (
  exists (
    select 1 from public.pdfs
    where pdfs.id = chapters.pdf_id
      and pdfs.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.pdfs
    where pdfs.id = chapters.pdf_id
      and pdfs.user_id = auth.uid()
  )
);

create policy "progress_select_own"
on public.progress
for select
using (auth.uid() = user_id);

create policy "progress_write_own"
on public.progress
for all
using (
  auth.uid() = user_id
  and exists (
    select 1
    from public.chapters
    join public.pdfs on pdfs.id = chapters.pdf_id
    where chapters.id = progress.chapter_id
      and pdfs.user_id = auth.uid()
  )
)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.chapters
    join public.pdfs on pdfs.id = chapters.pdf_id
    where chapters.id = progress.chapter_id
      and pdfs.user_id = auth.uid()
  )
);

create policy "bookmarks_select_own"
on public.bookmarks
for select
using (auth.uid() = user_id);

create policy "bookmarks_write_own"
on public.bookmarks
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "notes_select_own"
on public.notes
for select
using (auth.uid() = user_id);

create policy "notes_write_own"
on public.notes
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "reading_position_select_own"
on public.reading_position
for select
using (auth.uid() = user_id);

create policy "reading_position_write_own"
on public.reading_position
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "annotations_select_own"
on public.annotations
for select
using (auth.uid() = user_id);

create policy "annotations_write_own"
on public.annotations
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('pdf-files', 'pdf-files', false)
on conflict (id) do nothing;

create policy "storage_select_own"
on storage.objects
for select
using (
  bucket_id = 'pdf-files'
  and auth.uid()::text = split_part(name, '/', 1)
);

create policy "storage_insert_own"
on storage.objects
for insert
with check (
  bucket_id = 'pdf-files'
  and auth.uid()::text = split_part(name, '/', 1)
);

create policy "storage_update_own"
on storage.objects
for update
using (
  bucket_id = 'pdf-files'
  and auth.uid()::text = split_part(name, '/', 1)
)
with check (
  bucket_id = 'pdf-files'
  and auth.uid()::text = split_part(name, '/', 1)
);

create policy "storage_delete_own"
on storage.objects
for delete
using (
  bucket_id = 'pdf-files'
  and auth.uid()::text = split_part(name, '/', 1)
);
