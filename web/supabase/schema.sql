-- アリサ Web版 Supabase スキーマ
-- Supabase SQL Editor で実行する。Electron版 electron/services/db.ts の5テーブルを
-- Postgres 化し、user_id + RLS でマルチユーザー対応にしたもの。
-- ※ 公開サインアップは Supabase Auth 設定で必ず無効化すること（招待制）。

-- ===== receipts =====
create table if not exists public.receipts (
  id               bigint generated always as identity primary key,
  user_id          uuid not null references auth.users(id) on delete cascade,
  source_path      text not null,           -- Storage キー（原本）
  thumbnail_path   text,                     -- Storage キー（サムネ）
  ocr_raw          text,
  vendor           text,
  issued_on        date,
  amount           integer,
  tax_amount       integer,
  payment_method   text,
  account_category text,
  project_id       bigint,    -- FK は projects 作成後に下で付与
  memo             text,
  status           text not null default 'processing',
  confidence       real,
  error            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_receipts_user      on public.receipts(user_id);
create index if not exists idx_receipts_issued_on on public.receipts(issued_on);
create index if not exists idx_receipts_status    on public.receipts(status);

-- ===== projects =====
create table if not exists public.projects (
  id        bigint generated always as identity primary key,
  user_id   uuid not null references auth.users(id) on delete cascade,
  name      text not null,
  start_on  date,
  end_on    date,
  color     text,
  unique (user_id, name)        -- ユーザーごとに案件名ユニーク
);
create index if not exists idx_projects_user on public.projects(user_id);

-- receipts.project_id → projects.id（両テーブル作成後に付与）
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'receipts_project_id_fkey'
  ) then
    alter table public.receipts
      add constraint receipts_project_id_fkey
      foreign key (project_id) references public.projects(id) on delete set null;
  end if;
end $$;

-- ===== rules =====
create table if not exists public.rules (
  id               bigint generated always as identity primary key,
  user_id          uuid not null references auth.users(id) on delete cascade,
  keyword          text not null,
  account_category text,
  payment_method   text,
  priority         integer not null default 100
);
create index if not exists idx_rules_user on public.rules(user_id);

-- ===== settings =====
create table if not exists public.settings (
  id       bigint generated always as identity primary key,
  user_id  uuid not null references auth.users(id) on delete cascade,
  key      text not null,
  value    text,
  unique (user_id, key)
);

-- ===== api_usage =====
create table if not exists public.api_usage (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  occurred_at   timestamptz not null default now(),
  model         text not null,
  input_tokens  integer not null,
  output_tokens integer not null,
  estimated_yen real not null
);
create index if not exists idx_api_usage_user_time on public.api_usage(user_id, occurred_at);

-- ===== RLS（全テーブル: 自分の行のみ）=====
alter table public.receipts  enable row level security;
alter table public.projects  enable row level security;
alter table public.rules     enable row level security;
alter table public.settings  enable row level security;
alter table public.api_usage enable row level security;

do $$
declare t text;
begin
  foreach t in array array['receipts','projects','rules','settings','api_usage'] loop
    execute format($f$
      drop policy if exists %1$s_owner on public.%1$s;
      create policy %1$s_owner on public.%1$s
        for all
        using (user_id = auth.uid())
        with check (user_id = auth.uid());
    $f$, t);
  end loop;
end $$;

-- ===== Storage バケット（private）=====
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

-- Storage RLS: 自分の user_id フォルダ配下のみ（api.ts は `${uid}/originals|thumbs/...` に置く）
drop policy if exists receipts_storage_owner on storage.objects;
create policy receipts_storage_owner on storage.objects
  for all
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
