create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 160),
  subject text not null check (char_length(subject) between 1 and 100),
  description text not null default '' check (char_length(description) <= 2000),
  original_file_path text not null unique,
  cover_image_path text,
  experiment_count integer check (experiment_count is null or experiment_count between 0 and 1000),
  tags text[] not null default '{}',
  published boolean not null default false,
  generation_count bigint not null default 0 check (generation_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists documents_published_created_at_idx
  on public.documents (published, created_at desc);

drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

alter table public.documents enable row level security;

create or replace function public.is_zyphr_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'zyphr_admin')::boolean, false);
$$;

drop policy if exists "Public can read published practical metadata" on public.documents;
create policy "Public can read published practical metadata"
  on public.documents for select
  using (published = true);

drop policy if exists "Zyphr administrators can manage documents" on public.documents;
create policy "Zyphr administrators can manage documents"
  on public.documents for all
  to authenticated
  using (public.is_zyphr_admin())
  with check (public.is_zyphr_admin());

create or replace view public.published_documents
with (security_barrier = true)
as
  select id, title, subject, description, cover_image_path,
         experiment_count, tags, created_at
  from public.documents
  where published = true;

revoke all on table public.documents from anon, authenticated, public;
grant all on table public.documents to service_role;
grant select on public.published_documents to anon, authenticated;

create or replace function public.increment_generation_count(document_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.documents
  set generation_count = generation_count + 1
  where id = document_id and published = true;
$$;

revoke all on function public.increment_generation_count(uuid) from public, anon, authenticated;
grant execute on function public.increment_generation_count(uuid) to service_role;

create or replace function public.get_zyphr_dashboard_stats()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'total_documents', count(*),
    'published_documents', count(*) filter (where published),
    'unpublished_documents', count(*) filter (where not published),
    'total_generations', coalesce(sum(generation_count), 0)
  )
  from public.documents;
$$;

revoke all on function public.get_zyphr_dashboard_stats() from public, anon, authenticated;
grant execute on function public.get_zyphr_dashboard_stats() to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'practical-documents',
  'practical-documents',
  false,
  20971520,
  array['application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'practical-covers',
  'practical-covers',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set public = true,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Zyphr admins can manage original files" on storage.objects;
create policy "Zyphr admins can manage original files"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'practical-documents' and public.is_zyphr_admin())
  with check (bucket_id = 'practical-documents' and public.is_zyphr_admin());

drop policy if exists "Zyphr admins can manage cover images" on storage.objects;
create policy "Zyphr admins can manage cover images"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'practical-covers' and public.is_zyphr_admin())
  with check (bucket_id = 'practical-covers' and public.is_zyphr_admin());
