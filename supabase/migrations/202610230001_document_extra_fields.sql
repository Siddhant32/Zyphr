alter table public.documents
  add column if not exists extra_fields text[] not null default '{}';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'documents_extra_fields_allowed'
      and conrelid = 'public.documents'::regclass
  ) then
    alter table public.documents
      add constraint documents_extra_fields_allowed
      check (
        cardinality(extra_fields) <= 4
        and extra_fields <@ array['branch', 'department', 'year', 'section']::text[]
      );
  end if;
end;
$$;

create or replace view public.published_documents
with (security_barrier = true)
as
  select id, title, subject, description, cover_image_path,
         experiment_count, tags, created_at, extra_fields
  from public.documents
  where published = true;
