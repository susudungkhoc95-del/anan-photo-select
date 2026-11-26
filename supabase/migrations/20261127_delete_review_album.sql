create or replace function public.delete_review_album(p_album_id text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- Serialize with insert_next_review_round, which locks this same row.
  perform 1 from public.app_records
  where scope = 'studio' and collection = '_photo_review_albums' and record_id = p_album_id
  for update;
  if not found then
    return;
  end if;

  delete from public.app_records
  where scope = 'studio' and (
    (collection = '_photo_review_albums' and record_id = p_album_id)
    or (collection = '_photo_review_rounds' and workspace_id = p_album_id)
  );
end;
$$;

revoke execute on function public.delete_review_album(text) from public, anon, authenticated;
grant execute on function public.delete_review_album(text) to service_role;
