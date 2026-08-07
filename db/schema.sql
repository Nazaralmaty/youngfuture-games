-- ═══════════════════════════════════════════════════════════════════════════
-- YoungFuture / StudyLine — схема базы для HTML5-игр
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Как применить: Supabase → SQL Editor → New query → вставить целиком → Run.
-- Скрипт безопасно запускать повторно (ничего не удаляет и не дублирует).
--
-- Логика доступа: игры — статические файлы, их anon-ключ виден всем.
-- Поэтому вся защита живёт здесь, в правилах RLS: игрок может писать
-- только свои результаты и читать только свой профиль.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. Профили ─────────────────────────────────────────────────────────────
-- Аккаунт принадлежит РОДИТЕЛЮ (вход по почте), внутри — данные ребёнка.
-- Данные ребёнка минимальны: имя и класс. Без фамилии, школы и телефона.

create table if not exists public.players (
  id            uuid primary key references auth.users on delete cascade,
  parent_phone  text,                                  -- WhatsApp для куратора
  child_name    text not null check (length(trim(child_name)) between 1 and 40),
  child_class   text check (length(child_class) <= 10),
  locale        text default 'kk',
  created_at    timestamptz not null default now()
);

comment on table  public.players       is 'Профиль: аккаунт родителя + данные ребёнка';
comment on column public.players.parent_phone is 'WhatsApp родителя — канал куратора, не логин';


-- ── 2. Сыгранные партии ────────────────────────────────────────────────────
-- Одна строка на каждую завершённую игру. Лидерборд считается отсюда.

create table if not exists public.game_sessions (
  id           bigint generated always as identity primary key,
  player_id    uuid not null references public.players on delete cascade,
  game         text not null check (length(game) between 1 and 40),
  difficulty   text check (difficulty in ('easy','medium','hard')),
  score        int  not null default 0 check (score between 0 and 100000),
  correct      int  not null default 0 check (correct >= 0),
  mistakes     int  not null default 0 check (mistakes >= 0),
  max_combo    int  not null default 0 check (max_combo >= 0),
  duration_sec int  not null default 0 check (duration_sec between 0 and 86400),
  source       text not null default 'web' check (source in ('web','studyline')),
  created_at   timestamptz not null default now()
);

comment on column public.game_sessions.source is 'web = браузер, studyline = внутри приложения';

create index if not exists game_sessions_board_idx
  on public.game_sessions (game, created_at desc, score desc);
create index if not exists game_sessions_player_idx
  on public.game_sessions (player_id, created_at desc);


-- ── 3. Правила доступа (RLS) ───────────────────────────────────────────────
-- Без этого anon-ключ открыл бы всю базу любому. Включаем обязательно.

alter table public.players       enable row level security;
alter table public.game_sessions enable row level security;

-- Профиль: вижу и меняю только свой
drop policy if exists players_select_own on public.players;
create policy players_select_own on public.players
  for select using (auth.uid() = id);

drop policy if exists players_insert_own on public.players;
create policy players_insert_own on public.players
  for insert with check (auth.uid() = id);

drop policy if exists players_update_own on public.players;
create policy players_update_own on public.players
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Результаты: пишу и читаю только свои. Изменить или удалить нельзя вообще —
-- политик update/delete нет, значит история партий неизменяема.
drop policy if exists sessions_select_own on public.game_sessions;
create policy sessions_select_own on public.game_sessions
  for select using (auth.uid() = player_id);

drop policy if exists sessions_insert_own on public.game_sessions;
create policy sessions_insert_own on public.game_sessions
  for insert with check (auth.uid() = player_id);


-- ── 4. Защита от накрутки ──────────────────────────────────────────────────
-- Игрок всё ещё может завысить СВОЙ счёт, вызвав API напрямую. Полностью это
-- лечится только проверкой на сервере. Здесь — дешёвый барьер: не больше
-- 60 партий в час с одного аккаунта, чтобы нельзя было залить лидерборд.

create or replace function public.check_session_rate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count int;
begin
  select count(*) into recent_count
  from public.game_sessions
  where player_id = new.player_id
    and created_at > now() - interval '1 hour';

  if recent_count >= 60 then
    raise exception 'Тым көп ойын. Біраз демалыңыз 🙂';
  end if;

  return new;
end;
$$;

drop trigger if exists game_sessions_rate_limit on public.game_sessions;
create trigger game_sessions_rate_limit
  before insert on public.game_sessions
  for each row execute function public.check_session_rate();


-- ── 5. Недельный лидерборд ─────────────────────────────────────────────────
-- Обнуляется каждый понедельник — новички всегда могут догнать.
-- security definer: функция читает чужие строки в обход RLS, но наружу отдаёт
-- ТОЛЬКО имя ребёнка и счёт. Ни почты, ни телефона, ни класса.

create or replace function public.weekly_leaderboard(p_game text, p_limit int default 10)
returns table (place bigint, child_name text, best_score int, is_me boolean)
language sql
stable
security definer
set search_path = public
as $$
  with weekly as (
    select s.player_id, max(s.score) as best
    from public.game_sessions s
    where s.game = p_game
      and s.created_at >= date_trunc('week', now())
    group by s.player_id
  )
  select row_number() over (order by w.best desc, p.child_name) as place,
         p.child_name,
         w.best::int as best_score,
         (w.player_id = auth.uid()) as is_me
  from weekly w
  join public.players p on p.id = w.player_id
  order by w.best desc, p.child_name
  limit greatest(1, least(p_limit, 50));
$$;

-- Своё место отдельно — если игрок не попал в топ, он всё равно видит себя.
create or replace function public.my_weekly_rank(p_game text)
returns table (place bigint, best_score int, total_players bigint)
language sql
stable
security definer
set search_path = public
as $$
  with weekly as (
    select s.player_id, max(s.score) as best
    from public.game_sessions s
    where s.game = p_game
      and s.created_at >= date_trunc('week', now())
    group by s.player_id
  ), ranked as (
    select player_id, best, row_number() over (order by best desc) as place
    from weekly
  )
  select r.place, r.best::int, (select count(*) from weekly)
  from ranked r
  where r.player_id = auth.uid();
$$;

-- Supabase выдаёт роли anon права на новые функции по умолчанию, поэтому
-- одного revoke от PUBLIC не хватает — отзываем у anon отдельно и явно.
-- Иначе любой, кто откроет исходник игры, смог бы выгрузить имена всех детей.
revoke all on function public.weekly_leaderboard(text, int) from public, anon;
revoke all on function public.my_weekly_rank(text)          from public, anon;
grant execute on function public.weekly_leaderboard(text, int) to authenticated;
grant execute on function public.my_weekly_rank(text)          to authenticated;


-- ── 6. Телефон как основной идентификатор ──────────────────────────────────
-- Родитель входит по номеру и паролю. Почта не спрашивается и не показывается:
-- внутри Supabase номер превращается в технический адрес 7700...@yf.games.
-- Домен нероутируемый — письма туда не уходят, подтверждение не нужно.
-- SMS тоже не нужны: номер не подтверждается, это просто логин и контакт.
--
-- Отсюда два требования: номер обязателен и уникален.

update public.players set parent_phone = 'no_phone_' || left(id::text, 8)
  where parent_phone is null;

alter table public.players alter column parent_phone set not null;

create unique index if not exists players_phone_uidx
  on public.players (parent_phone);


-- ── 7. Номер узла арены ────────────────────────────────────────────────────
-- Игры с картой (sort_arena — «Логика аренасы») пишут не просто «сыграл»,
-- а «прошёл тапсырму N». Без этой колонки сервер не может считать
-- прогрессию по карте: номер уходил только внутрь JSON-поля details,
-- по которому не построить ни индекс, ни агрегат.
--
-- Nullable специально: у аркад без карты (math_arcade и т.п.) узла нет.

alter table public.game_sessions
  add column if not exists level int;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'game_sessions_level_range') then
    alter table public.game_sessions
      add constraint game_sessions_level_range check (level is null or level between 1 and 100);
  end if;
end $$;

comment on column public.game_sessions.level is
  'Номер узла карты арены (тапсырма). NULL для игр без карты.';

-- Прогресс ребёнка по конкретной игре: максимальный пройденный узел.
create index if not exists game_sessions_level_idx
  on public.game_sessions (player_id, game, level desc)
  where level is not null;


-- ── 8. Лиды колеса фортуны (НИШ ҚТЛ логика) ──────────────────────────────
-- Без логина: играть можно сразу, лид собирается только перед спином
-- колеса фортуны (games/nis_ktl_logika.html). Пишет напрямую через anon-ключ,
-- без db/games-db.js — там завязка на полноценный auth-флоу, здесь не нужна.

create table if not exists public.wheel_leads (
  id            bigint generated always as identity primary key,
  game          text not null check (length(game) between 1 and 40),
  parent_phone  text not null check (length(parent_phone) between 5 and 20),
  child_name    text check (length(child_name) <= 40),
  prize_tier    text not null check (prize_tier in ('discount','netflix','main')),
  prize_label   text not null,
  coins         int not null default 0,
  correct       int not null default 0,
  contacted     boolean not null default false,
  created_at    timestamptz not null default now()
);

comment on table public.wheel_leads is 'Лиды с колеса фортуны — заявки на диагностику и редкие призы';

-- Один номер — один спин (даже если очистить localStorage и открыть заново).
create unique index if not exists wheel_leads_phone_uidx on public.wheel_leads (parent_phone);

alter table public.wheel_leads enable row level security;

drop policy if exists wheel_leads_insert_anon on public.wheel_leads;
create policy wheel_leads_insert_anon on public.wheel_leads
  for insert to anon with check (true);

-- Никакого select для anon — лиды читает команда через Supabase-дашборд/service role.


-- ── 9. Колесо фортуны: подписки вместо AirPods (НИШ ҚТЛ логика) ───────────
-- Клиент убрал физический приз (AirPods, тир main) и Netflix как отдельный
-- тир — теперь редкий исход объединяет несколько подписок (Netflix,
-- Kinopoisk, Яндекс Плюс) под одним тиром 'rare' с общим шансом ~2%.
-- Конкретное название сервиса остаётся в prize_label (уже text, менять
-- не нужно) — так при добавлении новой подписки constraint трогать не надо.

-- Сначала снимаем старый constraint, чтобы update ниже не упирался в него.
alter table public.wheel_leads drop constraint if exists wheel_leads_prize_tier_check;

update public.wheel_leads set prize_tier = 'rare'
  where prize_tier in ('netflix','main');

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'wheel_leads_prize_tier_check') then
    alter table public.wheel_leads
      add constraint wheel_leads_prize_tier_check check (prize_tier in ('discount','rare'));
  end if;
end $$;


-- ── 10. Приз решает сервер, не клиент ──────────────────────────────────────
-- Раньше игра сама кидала кубик в браузере (Math.random()) и просто постила
-- готовый prize_tier/prize_label в таблицу — anon-политика была
-- «with check (true)», то есть любой curl мог записать себе prize_tier:'rare'
-- без единого сыгранного раунда. Теперь всё решает эта функция: клиент
-- присылает только телефон/имя/класс/монеты, а тир и приз выбирает сервер.

-- Новые поля: класс ребёнка (та же форма, что у players.child_class) и
-- источник трафика — без них до сих пор нечем было сегментировать лиды.
alter table public.wheel_leads add column if not exists child_class text check (length(child_class) <= 10);
alter table public.wheel_leads add column if not exists utm_source text;
alter table public.wheel_leads add column if not exists utm_campaign text;

-- coins/correct клэмпятся внутри функции, но диапазон на колонке — страховка
-- на случай, если insert-политика когда-нибудь снова приоткроется по ошибке.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'wheel_leads_coins_range') then
    alter table public.wheel_leads add constraint wheel_leads_coins_range check (coins between 0 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'wheel_leads_correct_range') then
    alter table public.wheel_leads add constraint wheel_leads_correct_range check (correct between 0 and 10);
  end if;
end $$;

-- Главное: закрываем прямой insert от анонима. Дальше строки создаёт только
-- spin_wheel() ниже — она security definer и работает в обход RLS.
drop policy if exists wheel_leads_insert_anon on public.wheel_leads;

create or replace function public.spin_wheel(
  p_game text, p_phone text, p_child_name text, p_child_class text,
  p_coins int, p_correct int, p_utm_source text default null, p_utm_campaign text default null
)
returns table(tier text, prize_id text, prize_label text, is_duplicate boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tier text; v_id text; v_label text;
begin
  if random() < 0.98 then
    v_tier := 'discount'; v_id := 'discount'; v_label := '70% ЖЕҢІЛДІК';
  else
    v_tier := 'rare';
    v_id := (array['netflix','kinopoisk','yandexplus'])[floor(random()*3)+1];
    v_label := case v_id
      when 'netflix' then 'NETFLIX'
      when 'kinopoisk' then 'KINOPOISK'
      else 'ЯНДЕКС ПЛЮС'
    end;
  end if;

  begin
    insert into public.wheel_leads
      (game, parent_phone, child_name, child_class, prize_tier, prize_label,
       coins, correct, utm_source, utm_campaign)
    values
      (p_game, p_phone, p_child_name, p_child_class, v_tier, v_label,
       least(greatest(coalesce(p_coins,0),0),100),
       least(greatest(coalesce(p_correct,0),0),10),
       p_utm_source, p_utm_campaign);
  exception when unique_violation then
    return query select null::text, null::text, null::text, true;
    return;
  end;

  return query select v_tier, v_id, v_label, false;
end;
$$;

-- Здесь наоборот, в отличие от weekly_leaderboard: доступ нужен именно anon,
-- в игре нет логина. PUBLIC на всякий случай отзываем явно.
revoke all on function public.spin_wheel(text,text,text,text,int,int,text,text) from public;
grant execute on function public.spin_wheel(text,text,text,text,int,int,text,text) to anon;


-- ── Готово ─────────────────────────────────────────────────────────────────
-- Проверка: select * from public.weekly_leaderboard('math_arcade', 10);
-- Проверка: select max(level) from public.game_sessions where game = 'sort_arena';
-- Проверка: select * from public.wheel_leads order by created_at desc limit 5;
-- Проверка: select * from public.spin_wheel('nis_ktl_logika','77000000000','Тест','5',100,10);
