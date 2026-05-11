"""
Part number normalization: strip spaces/dashes/dots, uppercase.
Returns a clean string suitable for exact and fuzzy comparison.
"""
import re


def normalize_part_number(raw: str) -> str:
    if not raw:
        return ""
    s = str(raw).upper().strip()
    s = re.sub(r"[\s\-\.\#\_\/\\]", "", s)
    return s


def normalize_description(raw: str) -> str:
    if not raw:
        return ""
    return " ".join(str(raw).lower().split())
