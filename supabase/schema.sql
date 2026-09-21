-- Run this file in the Supabase SQL editor. RLS remains enabled on every user-data table.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid references public.folders(id) on delete set null,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  folder_id uuid references public.folders(id) on delete set null,
  title text not null,
  content jsonb not null default '{}'::jsonb,
  markdown_cache text,
  version integer not null default 1 check (version > 0),
  is_favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.document_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  version integer not null,
  title text not null,
  content jsonb not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  node_id text not null,
  file_name text not null,
  mime_type text not null,
  size bigint not null,
  storage_path text not null,
  page_number integer,
  quote text,
  note text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.profiles enable row level security;
alter table public.folders enable row level security;
alter table public.documents enable row level security;
alter table public.document_versions enable row level security;
alter table public.attachments enable row level security;

create policy "profiles_owner_all" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "folders_owner_all" on public.folders for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "documents_owner_all" on public.documents for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "versions_owner_all" on public.document_versions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "attachments_owner_all" on public.attachments for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

create policy "attachment_objects_owner_select" on storage.objects for select
using (bucket_id = 'attachments' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "attachment_objects_owner_insert" on storage.objects for insert
with check (bucket_id = 'attachments' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "attachment_objects_owner_update" on storage.objects for update
using (bucket_id = 'attachments' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "attachment_objects_owner_delete" on storage.objects for delete
using (bucket_id = 'attachments' and auth.uid()::text = (storage.foldername(name))[1]);

create index if not exists documents_user_updated_idx on public.documents(user_id, updated_at desc);
create index if not exists documents_content_gin_idx on public.documents using gin(content);
create index if not exists versions_document_created_idx on public.document_versions(document_id, created_at desc);
