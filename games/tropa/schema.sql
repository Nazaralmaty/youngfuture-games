-- «Тропа» — кооперативная игра на двоих. Выполнить один раз: Supabase → SQL Editor → Run.

create table if not exists tropa (
  id         bigserial primary key,
  step       int  not null unique,                        -- порядковый номер хода, 0,1,2…
  player     text not null check (player in ('e','d')),   -- e = Елжан, d = Диана
  kind       text not null check (kind in ('calm','wind','leap')),
  ok         boolean not null,                            -- шаг удался
  created_at timestamptz not null default now()
);

alter table tropa enable row level security;

-- Игроков ровно двое, вход по ссылке без авторизации, данные не чувствительные.
drop policy if exists tropa_anon_all on tropa;
create policy tropa_anon_all on tropa for all to anon using (true) with check (true);
