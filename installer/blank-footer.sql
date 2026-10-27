
-- ================= BLANK INSTALL FINISH =================
-- Removes sample content and replaces the shipped default owner passcode with a fresh random one.
delete from public.packages;
delete from public.gym_rules;

create temp table _first_login as
  select lpad((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint % 900000 + 100000)::text, 6, '0') as code;
update public.owner_credentials         set passcode_hash = extensions.crypt((select code from _first_login), extensions.gen_salt('bf')), updated_at = now();
update public.selling_owner_credentials set passcode_hash = extensions.crypt((select code from _first_login), extensions.gen_salt('bf')), updated_at = now();

-- >>> Copy this number now: it is your first Owner passcode. Change it inside the app (Owner → Settings). <<<
select code as "YOUR FIRST OWNER PASSCODE" from _first_login;
