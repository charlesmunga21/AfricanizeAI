#!/usr/bin/env python3
"""Extract readable prose from every articles/**/*.html page into a flat JSON
corpus that demos/assistant.html embeds and searches entirely in the browser.

Not part of the site's runtime — run this by hand after adding or editing an
article, then commit the regenerated demos/js/assistant/corpus.json. There is
no Node/build toolchain in this repo (static hosting only, per the Demos
build spec), so this is a plain-stdlib script rather than an npm script.

Usage: python3 scripts/build_assistant_corpus.py
"""

import hashlib
import html
import json
import re
from html.parser import HTMLParser
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
ARTICLES_DIR = REPO_ROOT / "articles"
OUT_PATH = REPO_ROOT / "demos" / "js" / "assistant" / "corpus.json"

# Containers whose text is UI chrome or JS-rendered interactivity, not
# readable prose — skip everything inside these.
SKIP_CLASSES = {"viz", "quiz", "article-nav"}

# Block-level tags: a run of text always gets a boundary here, so we don't
# glue "no space" across e.g. </li><li> or </p><p>.
BLOCK_TAGS = {"p", "li", "pre", "h1", "h2", "div", "code"}

MAX_CHUNK_CHARS = 900

# Matches the sidebar link text exactly (see any article's <aside class="sidebar">)
# — humanizing the folder slug alone gets "Business" instead of "AI for Business",
# so known modules get their real display name and anything new falls back to
# humanize().
MODULE_LABELS = {
    "dsa/arrays": "Arrays",
    "dsa/binary-search": "Binary Search",
    "dsa/linked-lists": "Linked Lists",
    "cv/fundamentals": "Computer Vision Fundamentals",
    "ai/business": "AI for Business",
    "ai/creativity": "AI for Creativity",
    "systems/how-computers-work": "How Computers Work",
    "systems/networking-basics": "Networking Basics",
    "systems/operating-systems-basics": "Operating Systems Basics",
    "iot/hardware-meets-software": "Hardware Meets Software",
}


class ArticleParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []  # list of {"tag": str, "skip": bool}
        self.title = None
        self.sections = []  # list of {"heading": str|None, "text": str}
        self._cur_heading = None
        self._buf = []
        self._capturing_h1 = False
        self._capturing_h2 = False
        self._h_buf = []

    def _skipping(self):
        return any(f["skip"] for f in self.stack)

    def _in_article(self):
        return any(f["root"] for f in self.stack)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        skip = self._skipping()
        classes = set((attrs.get("class") or "").split())
        if tag == "div" and classes & SKIP_CLASSES:
            skip = True
        # A submodule page's prose lives in <article>; a module landing
        # page's intro lives in <section class="module-hero"> instead — both
        # count as the readable root, everything else (submodule-grid,
        # complexity-table, sidebar, nav) is chrome we don't index.
        root = tag == "article" or (tag == "section" and "module-hero" in classes)
        self.stack.append({"tag": tag, "skip": skip, "root": root})

        if not self._in_article():
            return
        if skip:
            return

        if tag == "h1" and self.title is None:
            self._capturing_h1 = True
            self._h_buf = []
        elif tag == "h2":
            self._flush_section()
            self._capturing_h2 = True
            self._h_buf = []
        elif tag in BLOCK_TAGS:
            self._buf.append(" ")

    def handle_endtag(self, tag):
        # Best-effort pop matching the most recent same-tag frame.
        closed_root = False
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i]["tag"] == tag:
                closed_root = self.stack[i]["root"]
                del self.stack[i:]
                break

        if tag == "h1" and self._capturing_h1:
            self.title = "".join(self._h_buf).strip()
            self._capturing_h1 = False
        elif tag == "h2" and self._capturing_h2:
            self._cur_heading = "".join(self._h_buf).strip()
            self._capturing_h2 = False
        elif closed_root:
            self._flush_section()

    def handle_data(self, data):
        if not self._in_article() or self._skipping():
            return
        if self._capturing_h1 or self._capturing_h2:
            self._h_buf.append(data)
        else:
            self._buf.append(data)

    def _flush_section(self):
        text = normalize_ws("".join(self._buf))
        if text:
            self.sections.append({"heading": self._cur_heading, "text": text})
        self._buf = []


def normalize_ws(s):
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


def humanize(slug):
    return " ".join(w.capitalize() for w in slug.split("-"))


def split_long(text, limit=MAX_CHUNK_CHARS):
    """Split on sentence boundaries, packing greedily up to `limit` chars."""
    if len(text) <= limit:
        return [text]
    sentences = re.split(r"(?<=[.!?])\s+", text)
    chunks, cur = [], ""
    for s in sentences:
        if cur and len(cur) + 1 + len(s) > limit:
            chunks.append(cur)
            cur = s
        else:
            cur = f"{cur} {s}".strip()
    if cur:
        chunks.append(cur)
    return chunks


def main():
    files = sorted(ARTICLES_DIR.glob("**/*.html"))
    chunks = []
    skipped = []

    for path in files:
        raw = path.read_text(encoding="utf-8")
        has_article = "<article>" in raw or "<article " in raw
        has_module_hero = 'class="module-hero"' in raw
        if not has_article and not has_module_hero:
            skipped.append(path)  # old flat-page redirect stub
            continue

        parser = ArticleParser()
        parser.feed(raw)

        rel = path.relative_to(REPO_ROOT).as_posix()
        parts = path.relative_to(ARTICLES_DIR).parts  # e.g. dsa/arrays/introduction.html
        area_module = "/".join(parts[:2]) if len(parts) >= 2 else parts[0]
        module = MODULE_LABELS.get(area_module, humanize(parts[-2] if len(parts) >= 2 else parts[0]))
        title = parser.title or humanize(path.stem)

        for section in parser.sections:
            for piece in split_long(section["text"]):
                if len(piece) < 40:
                    continue  # too short to be a meaningful retrieval unit
                chunks.append({
                    "id": len(chunks),
                    "url": rel,
                    "module": module,
                    "title": title,
                    "heading": section["heading"],
                    "text": piece,
                })

    # A content hash, not a manually bumped counter — the browser-side cache
    # keys embeddings on this, so editing an article automatically invalidates
    # the cached vectors instead of silently serving stale ones.
    digest = hashlib.sha1("".join(c["text"] for c in chunks).encode("utf-8")).hexdigest()[:12]

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(
        json.dumps({"version": digest, "chunks": chunks}, ensure_ascii=False, indent=1) + "\n",
        encoding="utf-8",
    )

    print(f"Parsed {len(files) - len(skipped)} article pages ({len(skipped)} redirect stubs skipped)")
    print(f"Wrote {len(chunks)} chunks -> {OUT_PATH.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
