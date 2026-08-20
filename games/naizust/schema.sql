-- «Наизусть» — игра на двоих. Одна таблица, выполнить один раз в Supabase → SQL Editor → Run.

create table if not exists naizust (
  id          bigserial primary key,
  q_id        int  not null,                                  -- номер вопроса в списке
  player      text not null check (player in ('e','d')),       -- e = Елжан, d = Диана
  self_answer text not null,                                   -- как я ответил за себя
  guess       text not null,                                   -- как я думаю, ответит партнёр
  verdict     boolean,                                         -- я сужу догадку партнёра ОБО МНЕ: true = попал
  created_at  timestamptz not null default now(),
  unique (q_id, player)
);

alter table naizust enable row level security;

-- Игроков ровно двое, данные не чувствительные, вход по ссылке без авторизации.
-- Поэтому anon-ключу разрешено всё в пределах этой таблицы.
drop policy if exists naizust_anon_all on naizust;
create policy naizust_anon_all on naizust for all to anon using (true) with check (true);
