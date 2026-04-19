"""
One-shot: remove HangarExecutive namespace and PageTitles.hangarExecutive key
from the 5 i18n JSON files, preserving the rest of the structure byte-for-byte
where possible.

Uses regex on the raw text (not JSON parse) to avoid reformatting the entire
file and producing a massive diff.
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MSG_DIR = ROOT / "messages"
LOCALES = ["es", "en", "fr", "de", "zh"]


def remove_pagetitles_key(text: str) -> tuple[str, bool]:
    """Remove the `"hangarExecutive": "..."` line from PageTitles."""
    pattern = re.compile(r'\n[ \t]*"hangarExecutive"\s*:\s*"[^"]*",?')
    new_text, n = pattern.subn("", text, count=1)
    return new_text, n > 0


def remove_namespace_block(text: str) -> tuple[str, bool]:
    """Remove the entire `"HangarExecutive": { ... },` top-level block.

    Uses a brace-balanced scan because the block contains `{placeholder}`
    inside strings.
    """
    marker = '"HangarExecutive"'
    idx = text.find(marker)
    if idx == -1:
        return text, False

    # Walk back to the start of the line (capture leading whitespace + newline)
    line_start = text.rfind("\n", 0, idx)
    if line_start == -1:
        line_start = 0

    # Find the opening `{` after the marker
    open_brace = text.find("{", idx)
    if open_brace == -1:
        return text, False

    # Scan forward, counting braces, ignoring braces inside strings
    depth = 0
    i = open_brace
    in_string = False
    escape = False
    while i < len(text):
        c = text[i]
        if in_string:
            if escape:
                escape = False
            elif c == "\\":
                escape = True
            elif c == '"':
                in_string = False
        else:
            if c == '"':
                in_string = True
            elif c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    break
        i += 1

    if depth != 0:
        return text, False

    # Consume trailing comma + whitespace up to the next line
    end = i + 1
    if end < len(text) and text[end] == ",":
        end += 1

    # The block is text[line_start:end]. Remove it.
    new_text = text[:line_start] + text[end:]
    return new_text, True


def clean_json_file(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    original = text

    text, removed_key = remove_pagetitles_key(text)
    text, removed_block = remove_namespace_block(text)

    if text == original:
        print(f"[skip] {path.name} — nothing to remove")
        return

    path.write_text(text, encoding="utf-8")
    bits = []
    if removed_key:
        bits.append("PageTitles.hangarExecutive")
    if removed_block:
        bits.append("HangarExecutive block")
    print(f"[ok]   {path.name} — removed: {', '.join(bits)}")


def clean_navigation_ts() -> None:
    nav = ROOT / "src" / "app" / "assets" / "header" / "navigation.ts"
    text = nav.read_text(encoding="utf-8")
    original = text

    # Replace the Hangar dropdown section with a direct link.
    # Matches both LF and CRLF just in case.
    dropdown_pattern = re.compile(
        r'\{\s*\r?\n'
        r'[ \t]*key:\s*"hangar",\s*\r?\n'
        r'[ \t]*label:\s*"Hangar",\s*\r?\n'
        r'[ \t]*items:\s*\[\s*\r?\n'
        r'[ \t]*\{\s*label:\s*"Hangar Manager",\s*href:\s*"/hangar"\s*\},\s*\r?\n'
        r'[ \t]*\{\s*label:\s*"Executive Hangar",\s*href:\s*"/hangar-executive"\s*\},\s*\r?\n'
        r'[ \t]*\],\s*\r?\n'
        r'[ \t]*\},'
    )
    replacement = (
        "{\n"
        '    key: "hangar",\n'
        '    label: "Hangar",\n'
        '    href: "/hangar",\n'
        "  },"
    )
    text, n1 = dropdown_pattern.subn(replacement, text, count=1)

    # Remove the hangar-executive NAV_MODULES line
    nav_module_pattern = re.compile(
        r'[ \t]*\{\s*key:\s*"hangar-executive",\s*label:\s*"Executive Hangar",\s*href:\s*"/hangar-executive"\s*\},\s*\r?\n'
    )
    text, n2 = nav_module_pattern.subn("", text, count=1)

    if text == original:
        print("[skip] navigation.ts — nothing to remove")
        return

    nav.write_text(text, encoding="utf-8")
    print(f"[ok]   navigation.ts — dropdown={n1}, nav_module={n2}")


def main() -> None:
    for locale in LOCALES:
        clean_json_file(MSG_DIR / f"{locale}.json")
    clean_navigation_ts()
    print("\nDone. Run `git diff --stat` to verify.")


if __name__ == "__main__":
    main()
