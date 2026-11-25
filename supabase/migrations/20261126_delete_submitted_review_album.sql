-- Lock the same album row before opening a round or deleting the album.
create or replace function public.insert_next_review_round(
  p_album_id text, p_previous_round_id text, p_round_id text, p_round jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform 1 from public.app_records
  where scope = 'studio' and collection = '_photo_review_albums' and record_id = p_album_id
  for update;
  if not found then
    return false;
  end if;

  if not exists (
    select 1 from (
      select record_id, payload from public.app_records
      where scope = 'studio' and collection = '_photo_review_rounds' and workspace_id = p_album_id
      order by record_id desc limit 1
    ) latest
    where record_id = p_previous_round_id and payload->>'submittedAt' is not null
  ) then
    return false;
  end if;

  insert into public.app_records (scope, collection, record_id, workspace_id, payload)
  values ('studio', '_photo_review_rounds', p_round_id, p_album_id, p_round);
  return true;
end;
$$;

create or replace function public.delete_submitted_review_album(p_album_id text, p_round_id text)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform 1 from public.app_records
  where scope = 'studio' and collection = '_photo_review_albums' and record_id = p_album_id
  for update;
  if not found then
    return true;
  end if;

  if not exists (
    select 1 from (
      select record_id, payload from public.app_records
      where scope = 'studio' and collection = '_photo_review_rounds' and workspace_id = p_album_id
      order by record_id desc limit 1
    ) latest
    where record_id = p_round_id and payload->>'submittedAt' is not null
  ) then
    return false;
  end if;

  delete from public.app_records
  where scope = 'studio' and (
    (collection = '_photo_review_albums' and record_id = p_album_id)
    or (collection = '_photo_review_rounds' and workspace_id = p_album_id)
  );
  return true;
end;
$$;

revoke execute on function public.insert_next_review_round(text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.delete_submitted_review_album(text, text) from public, anon, authenticated;
grant execute on function public.insert_next_review_round(text, text, text, jsonb) to service_role;
grant execute on function public.delete_submitted_review_album(text, text) to service_role;
