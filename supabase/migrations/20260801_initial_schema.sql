-- DP Select / DP Workflow application database.
-- Run this file once in Supabase: SQL Editor > New query > paste > Run.
-- Google Drive remains the photo/RAW store; result spreadsheets remain in Drive.

create table if not exists public.app_records (
  scope text not null default 'studio',
  collection text not null,
  record_id text not null,
  workspace_id text not null default '',
  payload jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (scope, collection, record_id)
);

create index if not exists app_records_collection_workspace_idx
  on public.app_records (collection, workspace_id, created_at);

alter table public.app_records enable row level security;

create or replace function public.set_app_records_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists app_records_updated_at on public.app_records;
create trigger app_records_updated_at
before update on public.app_records
for each row execute function public.set_app_records_updated_at();
