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

create table if not exists public.papers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  file_name text not null,
  file_path text not null,
  file_size bigint not null check (file_size >= 0),
  page_count integer not null default 0 check (page_count >= 0),
  checksum text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, checksum)
);

create table if not exists public.paper_annotations (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references public.papers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  annotation_type text not null check (annotation_type in ('highlight', 'underline', 'note')),
  page_number integer not null check (page_number > 0),
  content text not null default '',
  selected_text text not null default '',
  position_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.node_paper_relations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  node_id text not null,
  paper_id uuid not null references public.papers(id) on delete cascade,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (document_id, node_id, paper_id)
);

create table if not exists public.annotation_node_relations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  annotation_id uuid not null references public.paper_annotations(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  node_id text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (annotation_id, document_id, node_id)
);

alter table public.profiles enable row level security;
alter table public.folders enable row level security;
alter table public.documents enable row level security;
alter table public.document_versions enable row level security;
alter table public.attachments enable row level security;
alter table public.papers enable row level security;
alter table public.paper_annotations enable row level security;
alter table public.node_paper_relations enable row level security;
alter table public.annotation_node_relations enable row level security;

drop policy if exists "profiles_owner_all" on public.profiles;
drop policy if exists "folders_owner_all" on public.folders;
drop policy if exists "documents_owner_all" on public.documents;
drop policy if exists "versions_owner_all" on public.document_versions;
drop policy if exists "attachments_owner_all" on public.attachments;
drop policy if exists "papers_owner_all" on public.papers;
drop policy if exists "paper_annotations_owner_all" on public.paper_annotations;
drop policy if exists "node_paper_relations_owner_all" on public.node_paper_relations;
drop policy if exists "annotation_node_relations_owner_all" on public.annotation_node_relations;

create policy "profiles_owner_all" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "folders_owner_all" on public.folders for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "documents_owner_all" on public.documents for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "versions_owner_all" on public.document_versions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "attachments_owner_all" on public.attachments for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "papers_owner_all" on public.papers for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "paper_annotations_owner_all" on public.paper_annotations for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id and exists (select 1 from public.papers where papers.id = paper_id and papers.user_id = auth.uid()));
create policy "node_paper_relations_owner_all" on public.node_paper_relations for all
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (select 1 from public.documents where documents.id = document_id and documents.user_id = auth.uid())
  and exists (select 1 from public.papers where papers.id = paper_id and papers.user_id = auth.uid())
);
create policy "annotation_node_relations_owner_all" on public.annotation_node_relations for all
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (select 1 from public.documents where documents.id = document_id and documents.user_id = auth.uid())
  and exists (select 1 from public.paper_annotations where paper_annotations.id = annotation_id and paper_annotations.user_id = auth.uid())
);

insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('papers', 'papers', false)
on conflict (id) do nothing;

drop policy if exists "attachment_objects_owner_select" on storage.objects;
drop policy if exists "attachment_objects_owner_insert" on storage.objects;
drop policy if exists "attachment_objects_owner_update" on storage.objects;
drop policy if exists "attachment_objects_owner_delete" on storage.objects;
drop policy if exists "paper_objects_owner_select" on storage.objects;
drop policy if exists "paper_objects_owner_insert" on storage.objects;
drop policy if exists "paper_objects_owner_update" on storage.objects;
drop policy if exists "paper_objects_owner_delete" on storage.objects;

create policy "attachment_objects_owner_select" on storage.objects for select
using (bucket_id = 'attachments' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "attachment_objects_owner_insert" on storage.objects for insert
with check (bucket_id = 'attachments' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "attachment_objects_owner_update" on storage.objects for update
using (bucket_id = 'attachments' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "attachment_objects_owner_delete" on storage.objects for delete
using (bucket_id = 'attachments' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "paper_objects_owner_select" on storage.objects for select
using (bucket_id = 'papers' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "paper_objects_owner_insert" on storage.objects for insert
with check (bucket_id = 'papers' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "paper_objects_owner_update" on storage.objects for update
using (bucket_id = 'papers' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "paper_objects_owner_delete" on storage.objects for delete
using (bucket_id = 'papers' and auth.uid()::text = (storage.foldername(name))[1]);

create index if not exists documents_user_updated_idx on public.documents(user_id, updated_at desc);
create index if not exists documents_content_gin_idx on public.documents using gin(content);
create index if not exists versions_document_created_idx on public.document_versions(document_id, created_at desc);
create index if not exists papers_user_updated_idx on public.papers(user_id, updated_at desc);
create index if not exists paper_annotations_paper_page_idx on public.paper_annotations(paper_id, page_number);
create index if not exists node_paper_relations_node_idx on public.node_paper_relations(document_id, node_id);
create index if not exists node_paper_relations_paper_idx on public.node_paper_relations(paper_id);
create index if not exists annotation_node_relations_annotation_idx on public.annotation_node_relations(annotation_id);
