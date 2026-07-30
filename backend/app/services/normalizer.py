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


def format_part_number(raw: str) -> str:
    """Display form of a part number: uppercased, whitespace collapsed, punctuation kept.
    Part numbers are always shown UPPERCASE (broker convention). Idempotent."""
    if not raw:
        return ""
    return " ".join(str(raw).upper().split())


# Manufacturer / brand tokens -> their conventional capitalization.
_BRANDS = {
    "hp": "HP", "hpe": "HPE", "ibm": "IBM", "emc": "EMC", "wd": "WD", "sk": "SK",
    "hgst": "HGST", "netapp": "NetApp", "sandisk": "SanDisk", "lsi": "LSI", "amd": "AMD",
    "intel": "Intel", "dell": "Dell", "hitachi": "Hitachi", "toshiba": "Toshiba",
    "samsung": "Samsung", "kioxia": "Kioxia", "seagate": "Seagate", "cisco": "Cisco",
    "lenovo": "Lenovo", "micron": "Micron", "elpida": "Elpida", "riverbed": "Riverbed",
    "sun": "Sun", "oracle": "Oracle", "fujitsu": "Fujitsu", "nimble": "Nimble",
    "pure": "Pure", "crucial": "Crucial", "unbranded": "Unbranded", "generic": "Generic",
    "supermicro": "Supermicro", "nvidia": "Nvidia", "qlogic": "QLogic", "brocade": "Brocade",
}

# Acronyms / units that should render fully uppercase wherever they appear as a whole word.
_ACRONYMS = {
    "sas", "sata", "ssd", "hdd", "nvme", "pcie", "sff", "lff", "rpm", "scsi", "usb",
    "raid", "jbod", "fc", "sed", "fips", "ri", "wi", "ei", "mu", "mlc", "tlc", "slc",
    "emlc", "ecc", "rdimm", "udimm", "lrdimm", "sodimm", "dimm", "cpu", "gpu", "hba",
    "ddr", "ddr2", "ddr3", "ddr4", "ddr5", "pc2", "pc3", "pc4", "lp", "fh", "hh", "gb", "tb", "mb",
}


def _format_desc_word(w: str) -> str:
    low = w.lower()
    if low in _BRANDS:
        return _BRANDS[low]
    if low in _ACRONYMS:
        return w.upper()
    # Part-number-ish tokens (contain a digit) read best fully uppercase: "960gb" -> "960GB",
    # "kpm5xrug3t84" -> "KPM5XRUG3T84". Broker listings are uppercase-heavy by convention.
    if any(ch.isdigit() for ch in w):
        return w.upper()
    # Plain word: Title-case it (first letter up, rest down) so all-caps source normalizes too.
    return w.capitalize()


def normalize_description(raw: str) -> str:
    """Display form of a description with professional capitalization: brands proper-cased
    (Intel, HGST, NetApp), units/acronyms uppercased (SAS, SSD, TB, DDR4), part-number-like
    tokens uppercased, and remaining words title-cased. Idempotent, so it can be applied at
    parse time and again at render time on legacy lowercase data. Whitespace is collapsed."""
    if not raw:
        return ""
    words = str(raw).split()
    return " ".join(_format_desc_word(w) for w in words)
