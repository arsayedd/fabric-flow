--
-- تقليد بيئة Supabase على Postgres محلي — **للاختبار بس.**
--
-- الملف ده مش migration ومابيروحش على السيرفر. Supabase بيجيب معاه
-- `auth.users` و`auth.uid()` و دور `authenticated`؛ المحلي مافيهومش،
-- فمن غير الشيم ده مش ممكن نشغّل السياسات ونشوفها بتمنع فعلًا.
--
-- `auth.uid()` هنا نفس تعريفها عند Supabase بالحرف: بتقرا `sub` من
-- ادعاءات الـJWT اللي الجلسة شايلاها. وده اللي بيخلي الاختبار يقلب
-- المستخدم بـ`set request.jwt.claims` زي ما الـAPI بيعمل بالظبط.
--

create schema if not exists auth;

create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text unique
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid;
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
end;
$$;

grant usage on schema public to authenticated, anon;
grant usage on schema auth to authenticated, anon;
grant select on auth.users to authenticated;
