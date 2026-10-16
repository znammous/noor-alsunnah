"""Shared helpers for the isnad data pipeline."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
WORK = ROOT / "data" / "work"
SITE_DATA = ROOT / "site" / "data"

WORK.mkdir(parents=True, exist_ok=True)

# Arabic diacritics, tatweel, Quranic marks and invisible formatting characters.
_DIACRITICS = re.compile(r"[ؐ-ًؚ-ٰٟۖ-ۭـ‌-‏‪-‮⁦-⁩]")
_HONORIFICS = re.compile(r"[﵀-﷿ﷺﷻ]")  # ﷺ ﵁ ﵄ ...
_BRACKETS = re.compile(r"\[[^\]]*\]|\([^)]*\)")


def strip_diacritics(s: str) -> str:
    return _DIACRITICS.sub("", s or "")


def norm(s: str) -> str:
    """Normalise an Arabic name for matching: no diacritics, unified letters, single spaces."""
    s = strip_diacritics(s)
    s = _HONORIFICS.sub(" ", s)
    s = _BRACKETS.sub(" ", s)
    s = re.sub("[إأآٱ]", "ا", s)
    s = s.replace("ى", "ي").replace("ة", "ه").replace("ؤ", "و").replace("ئ", "ي")
    s = s.replace("ک", "ك").replace("ی", "ي")
    s = re.sub(r"[^ء-ي ]", " ", s)
    s = re.sub(r"\bبن\b", "ابن", s)
    return re.sub(r"\s+", " ", s).strip()


def name_tokens(s: str) -> list:
    """Tokens of a normalised name with the definite article and 'ابن/ابو' particles kept as-is."""
    return [t for t in norm(s).split() if t]


def dump(obj, path: Path, pretty=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        if pretty:
            json.dump(obj, f, ensure_ascii=False, indent=1)
        else:
            json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))


def load(path: Path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)
