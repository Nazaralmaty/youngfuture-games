-- StudyLine · «100 деңгей» и диагностика — банк вопросов и прогресс на сервере
--
-- Запускать в Supabase → SQL Editor → New query → Run.
--
-- ЗАЧЕМ ЭТА СХЕМА. Сегодня все 240 вопросов вместе с индексом верного ответа
-- лежат в исходнике страницы, а прогресс подставляется параметром в адресной
-- строке. Пока это так, «100 деңгей» нельзя дать чужому ребёнку по ссылке.
--
-- ГЛАВНОЕ РЕШЕНИЕ, ради которого всё остальное: индекс верного ответа
-- НИКОГДА не уходит клиенту. Клиент получает вопрос и четыре варианта,
-- отправляет свой выбор, сервер возвращает «верно/неверно + объяснение».
-- Поэтому `correct_index` живёт в таблице, закрытой RLS наглухо, а наружу
-- смотрит вью `questions_public` без этого поля.
--
-- Авторизация — по номеру телефона, как во всей платформе (Supabase Auth
-- phone provider). auth.uid() ниже — это пользователь-ребёнок.

-- ══════════════════════════════════════════════════════════════════════════
-- 1. СПРАВОЧНИКИ
-- ══════════════════════════════════════════════════════════════════════════

-- Ветка: батыры или девушки Великой степи. Уровни одни и те же, меняется
-- только то, кого ребёнок открывает — поэтому это справочник, а не два дерева.
create table if not exists sl_tracks (
  code       text primary key check (code in ('b', 'q')),
  title      text not null,
  one        text not null            -- «батыр» / «кейіпкер», для подписей
);

insert into sl_tracks (code, title, one) values
  ('b', 'Батырлар дәуірі',    'батыр'),
  ('q', 'Ұлы Дала қыздары',   'кейіпкер')
on conflict (code) do nothing;

-- Эпоха = 20 уровней. `is_open` НЕ выставляется руками: приложение считает
-- готовность из количества героев, а здесь поле нужно, чтобы уметь закрыть
-- эпоху принудительно (например, нашли ошибку в контенте).
create table if not exists sl_epochs (
  id         smallint primary key,     -- 1..5
  track      text not null references sl_tracks(code) on delete cascade,
  title      text not null,
  subtitle   text not null,
  lvl_from   smallint not null,
  lvl_to     smallint not null,
  is_open    boolean not null default true,
  unique (track, id)
);

-- ══════════════════════════════════════════════════════════════════════════
-- 2. ГЕРОИ
-- Читаются всеми: имя, годы и биография — это и есть продукт, скрывать нечего.
-- Единственное, что закрыто, — герой уровня, который ребёнок ещё не открыл;
-- это решается на клиенте (карточка под туманом не отдаёт ни имени, ни факта)
-- и здесь дублировать не нужно: биография героя не секрет, а контент.
-- ══════════════════════════════════════════════════════════════════════════
create table if not exists sl_heroes (
  track      text     not null references sl_tracks(code) on delete cascade,
  level      smallint not null check (level between 1 and 100),
  name       text     not null,
  years      text     not null,
  place      text     not null,        -- «Талас · Дулат»
  hue        smallint not null check (hue between 0 and 360),
  hook       text     not null,        -- ілмек, 4-7 слов
  fact       text     not null check (char_length(fact) between 30 and 170),
  descr      text     not null check (char_length(descr) between 300 and 650),
  primary key (track, level)
);

-- Полное имя внутри ветки уникально. Один и тот же человек не может стоять
-- на двух уровнях — ровно эта ошибка («Айғаным ханым» в двух эпохах) уже была.
create unique index if not exists sl_heroes_name_uniq on sl_heroes (track, name);

-- ══════════════════════════════════════════════════════════════════════════
-- 3. ВОПРОСЫ
-- `correct_index` и `explain` — закрытая часть. Наружу смотрит вью без них.
-- ══════════════════════════════════════════════════════════════════════════
create table if not exists sl_questions (
  id            bigint generated always as identity primary key,
  set_no        smallint not null check (set_no between 1 and 100),
  subject       text     not null check (subject in
                  ('Математика','Логика','Қазақ тілі','Орыс тілі','Ағылшын тілі','Жаратылыстану')),
  body          text     not null,
  options       text[]   not null check (array_length(options, 1) = 4),
  correct_index smallint not null check (correct_index between 0 and 3),
  explain       text     not null check (char_length(explain) > 15),
  -- 'base' — школьная программа, 'nish' — формат НИШ. Диагностика различает
  -- «не знает предмет» и «знает, но не тянет формат» — это разные диагнозы.
  kind          text     not null default 'base' check (kind in ('base','nish')),
  is_active     boolean  not null default true,
  created_at    timestamptz not null default now()
);

-- Один и тот же вопрос не должен попасть в банк дважды. Ловит ровно тот брак,
-- который уже находили руками: четыре почти одинаковых вопроса про Present
-- Continuous в разных наборах.
create unique index if not exists sl_questions_body_uniq on sl_questions (body);
create index if not exists sl_questions_set_idx on sl_questions (set_no, subject);

-- В каждом наборе ровно шесть вопросов и шесть разных предметов.
-- Проверяется триггером, а не надеждой на аккуратность импорта.
create or replace function sl_check_set() returns trigger language plpgsql as $$
declare n int; s int;
begin
  select count(*), count(distinct subject) into n, s
    from sl_questions where set_no = new.set_no and is_active;
  if n > 6 then
    raise exception 'В наборе % уже 6 вопросов', new.set_no;
  end if;
  if n <> s then
    raise exception 'В наборе % предмет повторяется', new.set_no;
  end if;
  return new;
end $$;

drop trigger if exists sl_questions_set_guard on sl_questions;
create trigger sl_questions_set_guard
  after insert or update on sl_questions
  for each row execute function sl_check_set();

-- ── Вью для клиента: БЕЗ correct_index и БЕЗ explain ──────────────────────
-- Объяснение тоже закрыто: по нему нередко видно ответ.
create or replace view sl_questions_public as
  select id, set_no, subject, body, options, kind
    from sl_questions
   where is_active;

-- ══════════════════════════════════════════════════════════════════════════
-- 4. ПРОГРЕСС
-- Одна строка на ребёнка. Уровень поднимает ТОЛЬКО функция ниже — прямой
-- update клиенту запрещён, иначе `?done=40` просто переедет в другое место.
-- ══════════════════════════════════════════════════════════════════════════
create table if not exists sl_progress (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  track      text     not null default 'b' references sl_tracks(code),
  done       smallint not null default 0 check (done between 0 and 100),
  xp         int      not null default 0 check (xp >= 0),
  streak     smallint not null default 0,
  best       smallint not null default 0,
  last_day   date,
  qseq       smallint not null default 0,
  updated_at timestamptz not null default now()
);

-- «Золотые» уровни — 6 из 6. Отдельной таблицей, потому что их нужно
-- показывать в отчёте родителю и считать по каждой ветке отдельно.
create table if not exists sl_perfect (
  user_id uuid     not null references auth.users(id) on delete cascade,
  track   text     not null references sl_tracks(code),
  level   smallint not null,
  primary key (user_id, track, level)
);

-- По предметам: сколько верных из скольких. Отчёт родителю собирается отсюда.
create table if not exists sl_subject_stats (
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null,
  right_n int  not null default 0,
  total_n int  not null default 0,
  primary key (user_id, subject)
);

-- Каждая сдача теста — отдельная строка. Нужна не для отчёта, а чтобы
-- через месяц можно было ответить на вопрос «какой вопрос дети валят чаще
-- всего» и переписать именно его.
create table if not exists sl_attempts (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  question_id bigint not null references sl_questions(id),
  chosen      smallint not null check (chosen between 0 and 3),
  is_right    boolean not null,
  answered_at timestamptz not null default now()
);
create index if not exists sl_attempts_q_idx on sl_attempts (question_id, is_right);
create index if not exists sl_attempts_u_idx on sl_attempts (user_id, answered_at desc);

-- ══════════════════════════════════════════════════════════════════════════
-- 5. ПРОВЕРКА ОТВЕТА — единственный путь, которым ребёнок узнаёт правду
-- ══════════════════════════════════════════════════════════════════════════
-- security definer: функция читает закрытую таблицу от имени владельца,
-- а вызывающий клиент к ней доступа не имеет.
create or replace function sl_answer(p_question bigint, p_chosen smallint)
returns table (is_right boolean, correct_index smallint, explain text)
language plpgsql security definer set search_path = public as $$
declare q sl_questions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Не авторизован';
  end if;
  select * into q from sl_questions where id = p_question and is_active;
  if not found then
    raise exception 'Вопрос не найден';
  end if;
  if p_chosen < 0 or p_chosen > 3 then
    raise exception 'Неверный вариант';
  end if;

  insert into sl_attempts (user_id, question_id, chosen, is_right)
  values (auth.uid(), p_question, p_chosen, p_chosen = q.correct_index);

  insert into sl_subject_stats (user_id, subject, right_n, total_n)
  values (auth.uid(), q.subject, case when p_chosen = q.correct_index then 1 else 0 end, 1)
  on conflict (user_id, subject) do update
    set right_n = sl_subject_stats.right_n + excluded.right_n,
        total_n = sl_subject_stats.total_n + 1;

  -- Верный индекс возвращается ТОЛЬКО вместе с ответом на конкретный вопрос,
  -- на который ребёнок уже ответил. Скачать им весь банк нельзя.
  return query select p_chosen = q.correct_index, q.correct_index, q.explain;
end $$;

-- ══════════════════════════════════════════════════════════════════════════
-- 6. ЗАКРЫТИЕ УРОВНЯ — сервер решает, открылся уровень или нет
-- ══════════════════════════════════════════════════════════════════════════
-- p_answers: массив пар (question_id, chosen) за одну сдачу теста.
-- Порог: обычный уровень — 4 из 6, дәуір сынағы (каждый 20-й) — 6 из 8.
create or replace function sl_finish_test(p_answers jsonb)
returns table (opened smallint, right_n smallint, total_n smallint, is_boss boolean)
language plpgsql security definer set search_path = public as $$
declare
  pr        sl_progress%rowtype;
  rec       jsonb;
  q         sl_questions%rowtype;
  n_right   smallint := 0;
  n_total   smallint := 0;
  boss      boolean;
  need      smallint;
  next_lvl  smallint;
begin
  if auth.uid() is null then raise exception 'Не авторизован'; end if;

  insert into sl_progress (user_id) values (auth.uid()) on conflict do nothing;
  select * into pr from sl_progress where user_id = auth.uid() for update;

  next_lvl := pr.done + 1;
  boss     := (next_lvl % 20) = 0;
  need     := case when boss then 6 else 4 end;

  for rec in select * from jsonb_array_elements(p_answers) loop
    select * into q from sl_questions
      where id = (rec->>'question_id')::bigint and is_active;
    if not found then continue; end if;
    n_total := n_total + 1;
    if (rec->>'chosen')::smallint = q.correct_index then n_right := n_right + 1; end if;
  end loop;

  if n_total = 0 then raise exception 'Пустая сдача'; end if;

  -- XP начисляется всегда, даже за провал: возвращение ценнее результата.
  update sl_progress set
    xp   = xp + n_right * 10 + case when n_right >= need then 20 else 0 end,
    qseq = case when boss then 0 else qseq + 1 end,
    -- Стрик: сегодня уже считали — не растим; вчера — +1; иначе с единицы.
    streak = case
      when last_day = current_date then streak
      when last_day = current_date - 1 then streak + 1
      else 1 end,
    best = greatest(best, case
      when last_day = current_date then streak
      when last_day = current_date - 1 then streak + 1
      else 1 end),
    last_day = current_date,
    done = case when n_right >= need and done < 100 then done + 1 else done end,
    updated_at = now()
  where user_id = auth.uid();

  if n_right >= need and pr.done < 100 then
    if n_right = n_total then
      insert into sl_perfect (user_id, track, level)
      values (auth.uid(), pr.track, next_lvl) on conflict do nothing;
    end if;
    return query select next_lvl, n_right, n_total, boss;
  else
    return query select 0::smallint, n_right, n_total, boss;
  end if;
end $$;

-- ══════════════════════════════════════════════════════════════════════════
-- 7. RLS — по умолчанию закрыто всё
-- ══════════════════════════════════════════════════════════════════════════
alter table sl_questions     enable row level security;
alter table sl_heroes        enable row level security;
alter table sl_progress      enable row level security;
alter table sl_perfect       enable row level security;
alter table sl_subject_stats enable row level security;
alter table sl_attempts      enable row level security;
alter table sl_tracks        enable row level security;
alter table sl_epochs        enable row level security;

-- sl_questions: ни одной политики на select. Значит, читать таблицу напрямую
-- не может НИКТО, кроме service_role. Клиент видит только вью без ответов.
-- (Это не забытая строка — это и есть защита. Не добавлять сюда политику.)

drop policy if exists sl_heroes_read on sl_heroes;
create policy sl_heroes_read on sl_heroes for select to authenticated using (true);

drop policy if exists sl_tracks_read on sl_tracks;
create policy sl_tracks_read on sl_tracks for select to authenticated using (true);

drop policy if exists sl_epochs_read on sl_epochs;
create policy sl_epochs_read on sl_epochs for select to authenticated using (true);

-- Прогресс: ребёнок видит и создаёт только свой. UPDATE НЕ РАЗРЕШЁН вообще —
-- уровень поднимает только sl_finish_test(). Без этого `?done=40` просто
-- переехал бы в тело запроса.
drop policy if exists sl_progress_read on sl_progress;
create policy sl_progress_read on sl_progress for select to authenticated
  using (user_id = auth.uid());
drop policy if exists sl_progress_insert on sl_progress;
create policy sl_progress_insert on sl_progress for insert to authenticated
  with check (user_id = auth.uid());

-- Единственное, что ребёнку можно менять самому, — выбранная ветка.
-- Прогресс при смене не теряется, поэтому это безопасно.
create or replace function sl_set_track(p_track text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Не авторизован'; end if;
  if p_track not in ('b','q') then raise exception 'Неизвестная ветка'; end if;
  insert into sl_progress (user_id, track) values (auth.uid(), p_track)
    on conflict (user_id) do update set track = excluded.track, updated_at = now();
end $$;

drop policy if exists sl_perfect_read on sl_perfect;
create policy sl_perfect_read on sl_perfect for select to authenticated
  using (user_id = auth.uid());

drop policy if exists sl_stats_read on sl_subject_stats;
create policy sl_stats_read on sl_subject_stats for select to authenticated
  using (user_id = auth.uid());

drop policy if exists sl_attempts_read on sl_attempts;
create policy sl_attempts_read on sl_attempts for select to authenticated
  using (user_id = auth.uid());

-- Вью наследует RLS базовой таблицы, поэтому явно разрешаем читать её
-- как security_invoker = off (владелец видит sl_questions).
alter view sl_questions_public set (security_invoker = off);
grant select on sl_questions_public to authenticated;
grant execute on function sl_answer(bigint, smallint)   to authenticated;
grant execute on function sl_finish_test(jsonb)         to authenticated;
grant execute on function sl_set_track(text)            to authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- 8. ПРОВЕРКА ПОСЛЕ ЗАЛИВКИ — выполнить и посмотреть глазами
-- ══════════════════════════════════════════════════════════════════════════
-- Ожидаем: 0 строк. Если что-то вернулось — политика утекает.
--
--   set role authenticated;
--   select * from sl_questions limit 1;         -- должно быть 0 строк
--   select * from sl_questions_public limit 1;  -- должна быть 1 строка
--   reset role;
--
-- И главное — в ответе вью не должно быть колонки correct_index:
--   select column_name from information_schema.columns
--    where table_name = 'sl_questions_public';
