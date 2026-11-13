-- First create your email/password user in Supabase Authentication > Users.
-- Replace the email below with that user's exact email, then run this script.
do $$
declare
  admin_email text := 'REPLACE_WITH_YOUR_EMAIL';
  admin_id uuid;
begin
  select id into admin_id from auth.users where lower(email) = lower(trim(admin_email));
  if admin_id is null then
    raise exception 'No Auth user found for %. Create the user in Authentication > Users first.', admin_email;
  end if;
  insert into public.dm_admins(user_id) values (admin_id) on conflict (user_id) do nothing;
end;
$$;
