#!/usr/bin/env python3
"""flow-design-check: a PR that touches UI files must carry a filled-in "Design check:" section in its body.

Solves: Inbox Zero's Bulk Archive shipped a Refresh button with no loading signal (design-standards 4, "Every wait shows a
signal"). The skill existed but nothing made a builder or reviewer run it on UI changes; this makes the PR body prove it.

Inputs (env, never interpolated into a shell):
  PR_BODY        the pull request body
  CHANGED_FILES  the PR's changed file paths, one per line; when unset, fetched from the GitHub API using
                 GITHUB_TOKEN, REPO (owner/name) and PR_NUMBER (no gh CLI needed on the runner)
  FLOW_FILE      path to the repo's .flow marker (default ".flow"); optional key
                 design_ui_globs=glob,glob,...  replaces the default UI globs ("**" crosses folders, "*" does not)
Exit 0 = ok or no UI files touched; exit 1 = red, with one ::error line per problem and a one-line fix.
Python 3 stdlib only.
"""
import json
import os
import re
import sys
import urllib.request

DEFAULT_GLOBS = [
    "frontend/src/**",
    "apps/web/app/**",
    "apps/web/components/**",
    "**/*.tsx",
    "**/*.jsx",
    "**/*View.swift",
    "**/Views/**/*.swift",
    "**/*Screen.swift",
    "**/*Sheet.swift",
]
# Tests and previews of UI are not UI.
NOT_UI = re.compile(r"(\.test\.|\.spec\.|\.stories\.|(^|/)(__tests__|tests?|Tests|Previews?)/)")

# (label for the error line, regex that finds its line in the section)
ITEMS = [
    ("wait signal and no double-fire (design-standards 4)", re.compile(r"wait|double[- ]?fire|4", re.I)),
    ("every state: loading, empty, error, pressed, disabled", re.compile(r"\bstates?\b", re.I)),
    ("light and dark", re.compile(r"light|dark", re.I)),
    ("largest text and narrowest width", re.compile(r"largest|narrowest", re.I)),
    ("casing and caption rules", re.compile(r"casing|caption", re.I)),
    ("every number has a unit and a date", re.compile(r"\bunit|number", re.I)),
]
VERDICT = re.compile(r"(?<![A-Za-z])(pass|fixed|n\.?\s?a\.?)(?![A-Za-z])", re.I)
COMMENT = re.compile(r"<!--[\s\S]*?-->")
HEADING = re.compile(r"^[ \t>#*_-]*Design check[*_]*:?[*_]*", re.I)


def glob_regex(g):
    out, i = "", 0
    while i < len(g):
        if g.startswith("**/", i):
            out += "(?:.*/)?"; i += 3
        elif g.startswith("**", i):
            out += ".*"; i += 2
        elif g[i] == "*":
            out += "[^/]*"; i += 1
        elif g[i] == "?":
            out += "[^/]"; i += 1
        else:
            out += re.escape(g[i]); i += 1
    return re.compile("^" + out + "$")


def read_globs(flow_file):
    try:
        for line in open(flow_file, encoding="utf-8"):
            m = re.match(r"\s*design_ui_globs\s*=\s*(.*)", line)
            if m:
                globs = [x.strip() for x in m.group(1).split(",") if x.strip()]
                if globs:
                    return globs
    except OSError:
        pass
    return DEFAULT_GLOBS


def ui_files(files, globs):
    rx = [glob_regex(g) for g in globs]
    return [f for f in files if not NOT_UI.search(f) and any(r.match(f) for r in rx)]


def section_lines(text):
    """Lines under the 'Design check:' heading, up to the next markdown heading or blank-line-then-label."""
    lines = text.splitlines()
    for n, line in enumerate(lines):
        m = HEADING.match(line)
        if m:
            rest = line[m.end():].strip()
            body = [rest] if rest else []
            for nxt in lines[n + 1:]:
                if re.match(r"^\s*#{1,6}\s", nxt) or re.match(r"^\s*(Card|Solves|Size|Stages / kit case|Seen by Caleb):", nxt):
                    break
                body.append(nxt)
            return body
    return None


def answer(line):
    """The single verdict on a line, or None if absent, ambiguous (the template's 'pass / fixed / n.a.') or n.a. with no reason."""
    # drop the item label up to its colon so words inside it never read as a verdict
    tail = line.split(":", 1)[1] if ":" in line else line
    found = {re.sub(r"[^a-z]", "", v.group(1).lower()) for v in VERDICT.finditer(tail)}
    if len(found) != 1:
        return None
    v = found.pop()
    if v == "na":
        reason = VERDICT.sub("", tail, count=1)
        if not re.search(r"[A-Za-z0-9]{2,}", reason):
            return None
    return v


def check(body, files, globs):
    ui = ui_files(files, globs)
    if not ui:
        return [], []
    text = COMMENT.sub("", body or "")
    sec = section_lines(text)
    shown = ", ".join(ui[:3]) + (" and %d more" % (len(ui) - 3) if len(ui) > 3 else "")
    if sec is None:
        return ["PR touches UI files (%s) but the body has no 'Design check:' section. Load design-standards, then add "
                "'Design check:' with one line per item: pass, fixed or n.a. (with a reason)." % shown], ui
    bad = []
    for label, rx in ITEMS:
        hit = next((l for l in sec if ":" in l and rx.search(l.split(":", 1)[0])), None)
        if hit is None or answer(hit) is None:
            bad.append(label)
    if bad:
        return ["Design check is incomplete. Answer each as 'pass', 'fixed' or 'n.a. <why>': " + "; ".join(bad) + "."], ui
    return [], ui


def fetch_files():
    """Changed paths of the PR via the REST API (paginated, 100 per page)."""
    token, repo, num = (os.environ.get(k) for k in ("GITHUB_TOKEN", "REPO", "PR_NUMBER"))
    if not (token and repo and num):
        sys.exit("flow-design-check: set CHANGED_FILES, or GITHUB_TOKEN, REPO and PR_NUMBER")
    out, page = [], 1
    while True:
        req = urllib.request.Request(
            "https://api.github.com/repos/%s/pulls/%s/files?per_page=100&page=%d" % (repo, num, page),
            headers={"Authorization": "Bearer " + token, "Accept": "application/vnd.github+json"})
        with urllib.request.urlopen(req, timeout=30) as r:
            batch = json.load(r)
        out += [f["filename"] for f in batch]
        if len(batch) < 100:
            return out
        page += 1


def main():
    if os.environ.get("CHANGED_FILES") is not None:
        files = [l.strip() for l in os.environ["CHANGED_FILES"].splitlines() if l.strip()]
    else:
        files = fetch_files()
    errors, ui = check(os.environ.get("PR_BODY"), files, read_globs(os.environ.get("FLOW_FILE", ".flow")))
    for e in errors:
        print("::error title=Design check::" + e)
    if errors:
        sys.exit("Design check is red. Edit the PR description; this check re-runs on edit.")
    print("Design check ok." if ui else "No UI files touched; no Design check needed.")


if __name__ == "__main__":
    main()
