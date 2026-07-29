#!/usr/bin/env python3
"""
build_game.py — собирает готовую игру из шаблона и банка слов.

Заменяет ту же переменную, что и старый n8n-бот (`var WORDS=[…]` или `var BANK=[…]`),
поэтому совместим со всем, что уже опубликовано.

  build_game.py templates/arcade.html db/words/b1.json -o games/arcade_b1.html
  build_game.py templates/arcade.html db/words/b1.json --levels b1,b2 -o games/hard.html
  build_game.py --extract games/arcade-mrxd0v09734re.html -o db/words/из_игры.json
  build_game.py --rebuild games/arcade-mrxd0v09734re.html --template templates/arcade.html
"""

import argparse
import json
import os
import re
import sys

VAR_RE = re.compile(r"var (WORDS|BANK)\s*=\s*\[[\s\S]*?\];")


def die(msg):
    print("ОШИБКА: " + msg, file=sys.stderr)
    sys.exit(1)


def read(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def extract_bank(html, path="<html>"):
    match = VAR_RE.search(html)
    if not match:
        die(f"{path}: не найдено ни `var WORDS=[…]`, ни `var BANK=[…]`")
    raw = match.group(0)
    body = raw[raw.index("["):raw.rindex("]") + 1]
    try:
        return match.group(1), json.loads(body)
    except json.JSONDecodeError:
        # банк написан JS-литералом (ключи без кавычек) — приводим к JSON
        fixed = re.sub(r"([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:", r'\1"\2":', body)
        fixed = re.sub(r",\s*([}\]])", r"\1", fixed)
        try:
            return match.group(1), json.loads(fixed)
        except json.JSONDecodeError as exc:
            die(f"{path}: банк не разбирается как JSON ({exc})")


def normalize(items, levels=None):
    """Приводит записи к тому же виду, что и старый инжектор: слова или вопросы."""
    out, seen = [], set()
    for item in items:
        if not isinstance(item, dict):
            continue
        if levels:
            lvl = str(item.get("lvl") or item.get("level") or "").lower()
            if lvl and lvl not in levels:
                continue
        if item.get("en") and item.get("kk"):
            entry = {"en": str(item["en"]).strip().lower(), "kk": str(item["kk"]).strip()}
            if item.get("e"):
                entry["e"] = str(item["e"])
            key = entry["en"]
        elif item.get("q") and item.get("a"):
            entry = {"q": str(item["q"]).strip(),
                     "o": [str(x) for x in item.get("o", [])],
                     "a": str(item["a"]).strip()}
            if item.get("kk"):
                entry["kk"] = str(item["kk"])
            if item.get("sub"):
                entry["sub"] = str(item["sub"])
            key = entry["q"]
        else:
            continue
        if key in seen:
            continue
        seen.add(key)
        # уровень сохраняем — играм он не мешает, а конструктору нужен
        if item.get("lvl") or item.get("level"):
            entry["lvl"] = str(item.get("lvl") or item.get("level")).lower()
        out.append(entry)
    return out


def inject(template_html, bank, path="<template>"):
    match = VAR_RE.search(template_html)
    if not match:
        die(f"{path}: в шаблоне нет `var WORDS=[…]` / `var BANK=[…]`")
    name = match.group(1)
    payload = "var %s=%s;" % (name, json.dumps(bank, ensure_ascii=False))
    return template_html[:match.start()] + payload + template_html[match.end():]


def longest(bank):
    words = [b.get("en") or b.get("q") or "" for b in bank]
    return max(words, key=len) if words else ""


def main():
    parser = argparse.ArgumentParser(description="сборка игры из шаблона и банка слов")
    parser.add_argument("template", nargs="?", help="HTML-шаблон")
    parser.add_argument("bank", nargs="?", help="JSON с банком слов")
    parser.add_argument("-o", "--out", help="куда записать результат")
    parser.add_argument("--levels", help="оставить только эти уровни, через запятую: a1,a2,b1")
    parser.add_argument("--extract", metavar="HTML", help="вытащить банк из готовой игры в JSON")
    parser.add_argument("--rebuild", metavar="HTML", help="пересобрать игру из свежего шаблона, сохранив её банк")
    parser.add_argument("--template", dest="tpl", help="шаблон для --rebuild")
    args = parser.parse_args()

    if args.extract:
        _, bank = extract_bank(read(args.extract), args.extract)
        text = json.dumps(bank, ensure_ascii=False, indent=2)
        if args.out:
            with open(args.out, "w", encoding="utf-8") as fh:
                fh.write(text + "\n")
            print(f"вытащено {len(bank)} записей → {args.out}")
        else:
            print(text)
        return

    if args.rebuild:
        if not args.tpl:
            die("--rebuild требует --template")
        _, bank = extract_bank(read(args.rebuild), args.rebuild)
        result = inject(read(args.tpl), bank, args.tpl)
        out = args.out or args.rebuild
        with open(out, "w", encoding="utf-8") as fh:
            fh.write(result)
        print(f"пересобрано {out}: {len(bank)} записей из свежего {args.tpl}")
        return

    if not args.template or not args.bank:
        die("нужны шаблон и банк (или --extract / --rebuild)")

    raw = json.loads(read(args.bank))
    items = raw.get("words") if isinstance(raw, dict) else raw
    levels = {x.strip().lower() for x in args.levels.split(",")} if args.levels else None
    bank = normalize(items, levels)
    if not bank:
        die("после фильтрации не осталось ни одной записи")

    result = inject(read(args.template), bank, args.template)
    out = args.out or os.path.join("games", os.path.basename(args.template))
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(result)
    print(f"собрано {out}: {len(bank)} записей, самое длинное — «{longest(bank)}»")


if __name__ == "__main__":
    main()
