-- moff_Atlus: SVGエディタ撤去（データは保持） / moff.jp 限定 / 部門グループ / 共有ライブラリ / 管理者 / あいまい検索

-- ---------------------------------------------------------------
-- 1. SVG エディタ撤去
--    運用ルール（仕様.md 2.5「マイグレーションは追加系のみ」）に従い、documents テーブルと
--    svgs バケットは削除しない。アプリからは参照しなくなるが既存データは残る（RLS は所有者のみのまま）。
-- ---------------------------------------------------------------
-- 2. メンバー判定（moff.jp の Google ログインのみ）
--    - ドメイン判定は JWT の email（ユーザーが変更要求できる）ではなく、Google が
--      ログイン時に返した identity の email（auth.identities）で行う
--    - 同メールで事前登録されたパスワード等でのログインを通さないよう
--      「このセッションが OAuth 由来か」(amr) も必須にする
-- ---------------------------------------------------------------
create or replace function public.is_member()
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() -> 'amr', '[]'::jsonb) @> '[{"method": "oauth"}]'::jsonb
    and exists (
      select 1 from auth.identities i
      where i.user_id = auth.uid()
        and i.provider = 'google'
        and right(lower(i.identity_data ->> 'email'), 8) = '@moff.jp'
    );
$$;
revoke execute on function public.is_member() from public, anon;
grant execute on function public.is_member() to authenticated;

-- Auth Hook: moff.jp 以外のユーザー作成を拒否（config.toml [auth.hook.before_user_created]）
create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  email text := lower(coalesce(event -> 'user' ->> 'email', ''));
  provider text := event -> 'user' -> 'app_metadata' ->> 'provider';
begin
  if right(email, 8) = '@moff.jp' and coalesce(provider, 'google') = 'google' then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object(
    'error',
    jsonb_build_object('http_code', 403, 'message', 'moff.jp の Google アカウントのみ利用できます')
  );
end;
$$;
revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;

-- ---------------------------------------------------------------
-- 3. プロフィール / 管理者ロール
-- ---------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null default '',
  role text not null default 'member' check (role in ('member', 'admin')),
  created_at timestamptz not null default now()
);

-- 初期管理者。クライアントからは一切参照不可（grant なし + RLS 有効・ポリシーなし）。
create table public.admin_bootstrap (email text primary key);
alter table public.admin_bootstrap enable row level security;
revoke all on table public.admin_bootstrap from anon, authenticated;
insert into public.admin_bootstrap (email) values ('asai@moff.jp');

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    lower(coalesce(new.email, '')),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    case when exists (select 1 from public.admin_bootstrap b where b.email = lower(new.email))
      then 'admin' else 'member' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 既存ユーザーのバックフィル
insert into public.profiles (id, email, display_name, role)
select
  u.id,
  lower(coalesce(u.email, '')),
  coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', ''),
  case when exists (select 1 from public.admin_bootstrap b where b.email = lower(u.email))
    then 'admin' else 'member' end
from auth.users u
on conflict (id) do nothing;

create or replace function public.is_admin()
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select public.is_member() and exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  );
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

alter table public.profiles enable row level security;
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
create policy "profiles_member_select" on public.profiles for select to authenticated
  using ((select public.is_member()));

-- ロール変更は管理者のみ・RPC 経由のみ（直接 update は grant なし）。最後の管理者は降格不可。
create or replace function public.admin_set_role(target uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- 同時降格で管理者 0 人になる競合を防ぐ（権限判定もロック取得後に行う）
  lock table public.profiles in share row exclusive mode;
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if new_role not in ('member', 'admin') then
    raise exception 'invalid role' using errcode = '22023';
  end if;
  if new_role = 'member'
     and (select role from public.profiles where id = target) = 'admin'
     and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'last admin cannot be demoted' using errcode = '22023';
  end if;
  update public.profiles set role = new_role where id = target;
end;
$$;
revoke execute on function public.admin_set_role(uuid, text) from public, anon;
grant execute on function public.admin_set_role(uuid, text) to authenticated;

-- ---------------------------------------------------------------
-- 4. generators: 部門グループ・説明・タグ・入力制約・共有RLS
-- ---------------------------------------------------------------
alter table public.generators
  add column grp text not null default 'CD'
    check (grp in ('HR', 'CD', 'DS', 'AX', 'ID')),
  add column description text not null default ''
    check (char_length(description) <= 1000),
  add column tags text[] not null default '{}'
    check (cardinality(tags) <= 20);

-- 既存行に違反があってもマイグレーションを止めない（新規書込みからは強制）
alter table public.generators
  add constraint generators_name_len check (char_length(name) between 1 and 200) not valid,
  add constraint generators_slug_fmt check (slug ~ '^[a-z0-9-]{1,64}$') not valid,
  add constraint generators_params_obj check (jsonb_typeof(params) = 'object') not valid,
  add constraint generators_params_size check (pg_column_size(params) <= 1048576) not valid;

create index generators_grp_updated_idx on public.generators (grp, updated_at desc);

drop policy if exists "gen_own_select" on public.generators;
drop policy if exists "gen_own_insert" on public.generators;
drop policy if exists "gen_own_update" on public.generators;
drop policy if exists "gen_own_delete" on public.generators;

create policy "gen_member_select" on public.generators for select to authenticated
  using ((select public.is_member()));
create policy "gen_member_insert" on public.generators for insert to authenticated
  with check ((select public.is_member()) and (select auth.uid()) = user_id);
create policy "gen_owner_update" on public.generators for update to authenticated
  using ((select public.is_member()) and ((select auth.uid()) = user_id or (select public.is_admin())))
  with check ((select public.is_member()) and ((select auth.uid()) = user_id or (select public.is_admin())));
create policy "gen_owner_delete" on public.generators for delete to authenticated
  using ((select public.is_member()) and ((select auth.uid()) = user_id or (select public.is_admin())));

-- 所有者(user_id)・日時は書き換え不可: insert / update は列単位で許可
-- （created_at / updated_at を偽装して一覧・検索の先頭に固定されるのを防ぐ）
revoke insert, update on table public.generators from authenticated;
grant insert (user_id, slug, name, params, grp, description, tags) on table public.generators to authenticated;
grant update (slug, name, params, grp, description, tags) on table public.generators to authenticated;

-- ---------------------------------------------------------------
-- 5. あいまい検索（部分一致 + trigram 類似）。security invoker なので RLS が効く。
-- ---------------------------------------------------------------
create extension if not exists pg_trgm with schema extensions;

-- 表記ゆれ吸収: NFKC（全角英数→半角等）+ 小文字化 + カタカナ→ひらがな
create or replace function public.search_norm(t text)
returns text
language sql immutable
set search_path = ''
as $$
  select translate(lower(normalize(coalesce(t, ''), NFKC)),
    'ァアィイゥウェエォオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂッツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミムメモャヤュユョヨラリルレロヮワヰヱヲンヴヵヶ',
    'ぁあぃいぅうぇえぉおかがきぎくぐけげこごさざしじすずせぜそぞただちぢっつづてでとどなにぬねのはばぱひびぴふぶぷへべぺほぼぽまみむめもゃやゅゆょよらりるれろゎわゐゑをんゔゕゖ');
$$;

create or replace function public.search_generators(q text, grp_filter text default null)
returns table (
  id uuid,
  slug text,
  name text,
  grp text,
  description text,
  tags text[],
  user_id uuid,
  updated_at timestamptz,
  score real
)
language sql stable
security invoker
set search_path = ''
as $$
  with input as (
    select btrim(public.search_norm(q)) as q
  ),
  docs as (
    select
      g.*,
      public.search_norm(g.name || ' ' || g.description || ' ' || array_to_string(g.tags, ' ') || ' ' || g.slug) as body
    from public.generators g
    where grp_filter is null or g.grp = grp_filter
  ),
  scored as (
    select
      d.*,
      case
        when public.search_norm(d.name) = i.q then 3
        when strpos(d.body, i.q) > 0 then 2
        else extensions.word_similarity(i.q, d.body)
      end::real as score
    from docs d, input i
    where char_length(i.q) between 1 and 100
  )
  select s.id, s.slug, s.name, s.grp, s.description, s.tags, s.user_id, s.updated_at, s.score
  from scored s
  where s.score >= 0.3
  order by s.score desc, s.updated_at desc
  limit 100;
$$;
revoke execute on function public.search_generators(text, text) from public, anon;
grant execute on function public.search_generators(text, text) to authenticated;
