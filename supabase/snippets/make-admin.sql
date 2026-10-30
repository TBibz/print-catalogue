-- Make an account an admin. Change the email, then run in the SQL Editor.
-- Run 0001_init.sql first, and create the user in Authentication → Users.
update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'tbiberovic@googlemail.com');

-- Check it worked (should show role = admin):
select p.role, u.email
from public.profiles p
join auth.users u on u.id = p.id;
