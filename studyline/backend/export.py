#!/usr/bin/env python3
"""
StudyLine · выгрузка контента из прототипа в SQL для Supabase.

    python3 export.py > seed.sql

Читает `../100_dengey/index.html` — единственный источник правды по контенту —
и печатает INSERT-ы для sl_heroes, sl_questions и sl_epochs.

Почему парсер, а не ручной перенос: контент правится в прототипе (там его
видно на экране и проверяет `?test=1`), а база — производная. Как только
перенос делается руками, две копии расходятся в первый же день.

Скрипт сам себя проверяет и падает, если контент не сходится с ожиданиями:
не 6 вопросов в наборе, повтор имени героя, длина описания вне 300–650.
Лучше не залить ничего, чем залить брак.
"""
import re
import sys
import json
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "100_dengey" / "index.html"
EPN = 20
SUBJECTS = ["Математика", "Логика", "Қазақ тілі", "Орыс тілі",
            "Ағылшын тілі", "Жаратылыстану"]


def die(msg):
    sys.exit("ОШИБКА: " + msg)


def block(src, start_marker):
    """Кусок между `const X = [` и первым `\n];` — массивы в файле плоские."""
    i = src.index(start_marker)
    j = src.index("\n];", i)
    return src[i:j]


def q(s):
    """Строка для SQL: одинарные кавычки удваиваются."""
    return "'" + s.replace("'", "''") + "'"


def parse_heroes(src, arr):
    txt = block(src, "const %s = [" % arr)
    out = []
    for m in re.finditer(
            r'\{n:"((?:[^"\\]|\\.)*)",y:"((?:[^"\\]|\\.)*)",p:"((?:[^"\\]|\\.)*)",hue:(\d+),\s*'
            r'h:"((?:[^"\\]|\\.)*)",f:"((?:[^"\\]|\\.)*)",\s*'
            r'd:"((?:[^"\\]|\\.)*)"\}', txt):
        n, y, p, hue, h, f, d = m.groups()
        out.append(dict(name=n, years=y, place=p, hue=int(hue), hook=h, fact=f, descr=d))
    return out


def parse_questions(src):
    txt = block(src, "const QUIZ_SETS = [")
    out = []
    for m in re.finditer(
            r'\{s:"((?:[^"\\]|\\.)*)",\s*q:"((?:[^"\\]|\\.)*)",\s*'
            r'o:\[((?:[^\]])*)\],\s*a:(\d),\s*w:"((?:[^"\\]|\\.)*)"\}', txt):
        s, body, opts, a, w = m.groups()
        options = re.findall(r'"((?:[^"\\]|\\.)*)"', opts)
        out.append(dict(subject=s, body=body, options=options,
                        correct=int(a), explain=w))
    return out


def check_heroes(hs, track):
    if len(hs) % EPN:
        die("%s: %d героев — не кратно %d" % (track, len(hs), EPN))
    names = [h["name"] for h in hs]
    dup = {n for n in names if names.count(n) > 1}
    if dup:
        die("%s: имя повторяется — %s" % (track, ", ".join(sorted(dup))))
    for i, h in enumerate(hs, 1):
        if not 300 <= len(h["descr"]) <= 650:
            die("%s уровень %d (%s): описание %d знаков, нужно 300–650"
                % (track, i, h["name"], len(h["descr"])))
        if not 30 <= len(h["fact"]) <= 170:
            die("%s уровень %d (%s): факт %d знаков, нужно 30–170"
                % (track, i, h["name"], len(h["fact"])))
        if not 0 <= h["hue"] <= 360:
            die("%s уровень %d: hue вне 0–360" % (track, i))


def check_questions(qs):
    if len(qs) % 6:
        die("вопросов %d — не кратно 6" % len(qs))
    bodies = [x["body"] for x in qs]
    dup = {b for b in bodies if bodies.count(b) > 1}
    if dup:
        die("вопрос повторяется: " + "; ".join(list(dup)[:3]))
    for k in range(0, len(qs), 6):
        chunk = qs[k:k + 6]
        subs = [c["subject"] for c in chunk]
        if sorted(subs) != sorted(SUBJECTS):
            die("набор %d: предметы %s" % (k // 6 + 1, subs))
    for x in qs:
        if len(x["options"]) != 4 or len(set(x["options"])) != 4:
            die("варианты не четыре и не уникальные: " + x["body"][:50])
        if not 0 <= x["correct"] <= 3:
            die("индекс ответа вне 0–3: " + x["body"][:50])
        if len(x["explain"]) <= 15:
            die("слишком короткое объяснение: " + x["body"][:50])


def main():
    src = SRC.read_text(encoding="utf-8")
    hb = parse_heroes(src, "HEROES_B")
    hq = parse_heroes(src, "HEROES_Q")
    qs = parse_questions(src)

    check_heroes(hb, "b")
    check_heroes(hq, "q")
    check_questions(qs)
    if len(hb) != len(hq):
        die("ветки разной длины: b=%d, q=%d — прогресс при смене ветки поедет"
            % (len(hb), len(hq)))

    epochs = len(hb) // EPN
    print("-- Сгенерировано export.py из 100_dengey/index.html. Руками не править.")
    print("-- Героев: %d на ветку, эпох: %d, вопросов: %d"
          % (len(hb), epochs, len(qs)))
    print("begin;")
    print("delete from sl_heroes; delete from sl_questions; delete from sl_epochs;")

    # ── эпохи ──
    TITLES = {
        "b": [("Батырлар", "Ұлы Дала қорғандары"), ("Хандар", "Жошыдан Абылайға дейін"),
              ("Билер", "Төле, Қазыбек, Әйтеке"), ("Алаш зиялылары", "Бөкейханов, Байтұрсынов"),
              ("Жаңа заман", "Тоқтар, Талғат")],
        "q": [("Ұлы Дала қыздары", "Аналар мен арулар"), ("Ханымдар", "Дала ханшайымдары"),
              ("Ағартушылар", "Мектеп ашқандар"), ("Өнер иелері", "Ән, күй, сахна"),
              ("Жаңа заман", "Ғылым, ғарыш, спорт")],
    }
    for tr in ("b", "q"):
        for e in range(epochs):
            t, sub = TITLES[tr][e]
            print("insert into sl_epochs (id, track, title, subtitle, lvl_from, lvl_to) "
                  "values (%d, %s, %s, %s, %d, %d);"
                  % (e + 1, q(tr), q(t), q(sub), e * EPN + 1, (e + 1) * EPN))

    # ── герои ──
    for tr, hs in (("b", hb), ("q", hq)):
        for i, h in enumerate(hs, 1):
            print("insert into sl_heroes (track, level, name, years, place, hue, hook, fact, descr) "
                  "values (%s, %d, %s, %s, %s, %d, %s, %s, %s);"
                  % (q(tr), i, q(h["name"]), q(h["years"]), q(h["place"]),
                     h["hue"], q(h["hook"]), q(h["fact"]), q(h["descr"])))

    # ── вопросы ──
    for k, x in enumerate(qs):
        set_no = k // 6 + 1
        opts = "array[" + ",".join(q(o) for o in x["options"]) + "]"
        # Вторая эпоха заметно труднее — помечаем её как формат НИШ,
        # диагностика берёт из этого пула свои «сложные» вопросы.
        kind = "nish" if set_no > EPN else "base"
        print("insert into sl_questions (set_no, subject, body, options, correct_index, explain, kind) "
              "values (%d, %s, %s, %s, %d, %s, %s);"
              % (set_no, q(x["subject"]), q(x["body"]), opts,
                 x["correct"], q(x["explain"]), q(kind)))

    print("commit;")
    print("-- Проверка после заливки:")
    print("--   select count(*) from sl_questions;  -- ожидается %d" % len(qs))
    print("--   select count(*) from sl_heroes;     -- ожидается %d" % (len(hb) + len(hq)))
    print("--   select set_no, count(*) from sl_questions group by 1 having count(*) <> 6;")
    print("--     ^ должно вернуть 0 строк")


if __name__ == "__main__":
    main()
