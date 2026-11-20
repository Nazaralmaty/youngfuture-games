-- Отбор и обучение менеджера по продажам (страница youngfuture-games/prodazhnik/).
-- Применение: psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 -f db/prodazhnik.sql  (повторный запуск безопасен).
--
-- Вход по номеру телефона без подтверждения (правило Елжана). Таблица закрыта RLS без политик:
-- браузер не читает и не пишет её напрямую, только через две функции ниже. Список кандидатов
-- снаружи получить нельзя; статус и заметки меняет только postgres (отбор идёт через psql).

create table if not exists public.hire_candidates (
  phone       text primary key check (phone ~ '^7[0-9]{10}$'),
  name        text check (length(name) <= 80),
  status      text not null default 'new'
              check (status in ('new','test_done','training','exam_done','interview','trial','hired','rejected','reserve')),
  data        jsonb not null default '{}'::jsonb,   -- анкета, тест, модули, экзамен — по разделам
  admin_notes text,                                  -- заметки отбора, кандидату не показываются
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.hire_candidates enable row level security;
revoke all on public.hire_candidates from anon, authenticated;

-- Прочитать свою запись (возобновить с того же места).
create or replace function public.hire_load(p_phone text)
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object('name', name, 'status', status, 'data', data)
  from public.hire_candidates where phone = p_phone;
$$;

-- Сохранить один раздел. Раздел из белого списка, размер ограничен, статус двигается только вперёд
-- и только до exam_done — дальше его ставит отбор.
create or replace function public.hire_save(p_phone text, p_name text, p_section text, p_value jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  st text;
  next_st text;
begin
  if p_phone !~ '^7[0-9]{10}$' then raise exception 'bad phone'; end if;
  if p_section not in ('anketa','test','modules','exam','events','trial') then raise exception 'bad section'; end if;
  if octet_length(p_value::text) > 200000 then raise exception 'too big'; end if;

  insert into public.hire_candidates(phone, name) values (p_phone, left(coalesce(p_name,''), 80))
  on conflict (phone) do nothing;

  select status into st from public.hire_candidates where phone = p_phone;
  next_st := case
    when p_section = 'test' and st = 'new' then 'test_done'
    when p_section = 'exam' and st in ('new','test_done','training') then 'exam_done'
    else st end;

  update public.hire_candidates
     set data = jsonb_set(data, array[p_section], p_value, true),
         name = coalesce(nullif(left(coalesce(p_name,''), 80), ''), name),
         status = next_st,
         updated_at = now()
   where phone = p_phone;

  return jsonb_build_object('status', next_st);
end $$;

revoke all on function public.hire_load(text) from public;
revoke all on function public.hire_save(text, text, text, jsonb) from public;
grant execute on function public.hire_load(text) to anon;
grant execute on function public.hire_save(text, text, text, jsonb) to anon;
