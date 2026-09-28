-- The lesson plans — the #ela and #history views, for the parent only.
--
-- The plans themselves never go in this repo (everything here is public).
-- They live in the Obsidian vault, and scripts/publish-literature.mjs copies
-- those two files into the private bucket below whenever they change.
--
-- Run once in the Supabase SQL editor. Nothing here touches an existing table
-- or policy: it is one new bucket and one new policy on storage.objects,
-- scoped to that bucket.

-- 1. The bucket. Private: nothing in it has a public URL.
insert into storage.buckets (id, name, public)
values ('literature', 'literature', false)
on conflict (id) do nothing;

-- 2. Reading it. Only a signed-in user whose app_metadata.role is 'parent'.
--    app_metadata, never user_metadata: a user can edit their own
--    user_metadata from the browser, but only the service role can set
--    app_metadata. Same claim the CNN 10 policies read.
--
--    There is no insert, update or delete policy, deliberately. The page only
--    reads; the publish script writes with the secret key, which bypasses RLS.
create policy "parent read literature" on storage.objects for select to authenticated
  using (
    bucket_id = 'literature'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'parent'
  );

-- 3. The parent flag, on the parent's account only. Put the email you sign in
--    with in place of the placeholder. Her account is left as it is.
--
--    update auth.users
--    set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"parent"}'
--    where email = 'YOUR-EMAIL-HERE';
--
--    Check it took:
--    select email, raw_app_meta_data from auth.users;
--
--    The role rides in the sign-in token, so a device already signed in won't
--    see it until the token refreshes (within the hour). Signing out and back
--    in picks it up at once.
