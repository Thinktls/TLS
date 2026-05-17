"""
Demo seed script — populates the ThinkTLS Bid Desk database with realistic
data for a live presentation: 3 completed rounds, 1 active round, deals,
buyer scores, and notifications.

Run: python seed_demo.py
Requires: DATABASE_URL env var or .env file in the same directory.
"""
import os, sys, math, random
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

DATABASE_URL = os.environ.get("DATABASE_URL", "")
if not DATABASE_URL:
    DATABASE_URL = "postgresql://thinktls:changeme@localhost:5432/thinktls_bid_desk"

print(f"[seed] Connecting to: {DATABASE_URL.split('@')[1]}")

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

engine = create_engine(DATABASE_URL)
Session = sessionmaker(bind=engine)
db = Session()

# ── helpers ──────────────────────────────────────────────────────────────────

def now_utc():
    return datetime.now(timezone.utc)

def days_ago(n):
    return now_utc() - timedelta(days=n)

def hash_pw(plain):
    import bcrypt
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def norm(s):
    import re
    return re.sub(r"[^A-Z0-9]", "", s.upper())

# ── wipe existing demo data ───────────────────────────────────────────────────

print("[seed] Clearing existing data…")
db.execute(text("DELETE FROM deals"))
db.execute(text("DELETE FROM bid_lines"))
db.execute(text("DELETE FROM bid_files"))
db.execute(text("DELETE FROM master_items"))
db.execute(text("DELETE FROM round_buyers"))
db.execute(text("DELETE FROM bid_rounds"))
db.execute(text("DELETE FROM notifications"))
db.execute(text("DELETE FROM users WHERE role != 'admin'"))
db.commit()

# ── admin user (upsert) ───────────────────────────────────────────────────────

admin = db.execute(text("SELECT id FROM users WHERE email='admin@thinktls.com'")).fetchone()
if not admin:
    db.execute(text("""
        INSERT INTO users (email, hashed_password, full_name, role, is_active, fluff_percentage, fluff_enabled,
                           total_rounds_participated, buyer_score, win_rate, total_lines_won, total_lines_bid,
                           total_margin_contribution, created_at)
        VALUES ('admin@thinktls.com', :pw, 'ThinkTLS Admin', 'admin', true, 3.5, true,
                0, 0, 0, 0, 0, 0, NOW())
    """), {"pw": hash_pw("changeme123")})
    db.commit()

admin_row = db.execute(text("SELECT id FROM users WHERE email='admin@thinktls.com'")).fetchone()
admin_id = admin_row.id

# ── buyers ────────────────────────────────────────────────────────────────────

buyers_data = [
    ("buyer1@acme.com",     "buyer123", "Alice Chen",     "Acme Corp",      3.5, True),
    ("buyer2@techco.com",   "buyer123", "Bob Martinez",   "TechCo",         4.0, True),
    ("buyer3@globalit.com", "buyer123", "Carol Wu",       "Global IT",      3.0, True),
    ("buyer4@premier.com",  "buyer123", "David Singh",    "Premier IT",     2.5, False),
    ("buyer5@nextech.com",  "buyer123", "Emma Thompson",  "NexTech Systems",5.0, True),
]

buyer_ids = {}
for email, pw, name, company, fluff, fluff_en in buyers_data:
    db.execute(text("""
        INSERT INTO users (email, hashed_password, full_name, role, company_name, is_active,
                           fluff_percentage, fluff_enabled, total_rounds_participated, buyer_score,
                           win_rate, total_lines_won, total_lines_bid, total_margin_contribution, created_at)
        VALUES (:email, :pw, :name, 'buyer', :company, true,
                :fluff, :fluff_en, 0, 0, 0, 0, 0, 0, NOW())
    """), {"email": email, "pw": hash_pw(pw), "name": name, "company": company,
           "fluff": fluff, "fluff_en": fluff_en})
db.commit()

for email, *_ in buyers_data:
    row = db.execute(text("SELECT id FROM users WHERE email=:e"), {"e": email}).fetchone()
    buyer_ids[email] = row.id

b1 = buyer_ids["buyer1@acme.com"]
b2 = buyer_ids["buyer2@techco.com"]
b3 = buyer_ids["buyer3@globalit.com"]
b4 = buyer_ids["buyer4@premier.com"]
b5 = buyer_ids["buyer5@nextech.com"]

print(f"[seed] Created {len(buyers_data)} buyers")

# ── master item catalog ───────────────────────────────────────────────────────

LAPTOP_ITEMS = [
    ("HP-ELITEBOOK-840G10",  "HP EliteBook 840 G10 14-inch i7-1365U 16GB 512GB",  "HP",       50,  720.00, "laptops"),
    ("DELL-LAT-5540-I7",     "Dell Latitude 5540 15.6 i7-1355U 16GB 256GB SSD",   "Dell",     40,  680.00, "laptops"),
    ("LEN-THINK-X13-GEN4",   "Lenovo ThinkPad X13 Gen4 AMD Ryzen 7 16GB 512GB",   "Lenovo",   30,  710.00, "laptops"),
    ("APPLE-MBP-14-M3",      "Apple MacBook Pro 14-inch M3 8GB 512GB Silver",     "Apple",    20,  1450.00,"laptops"),
    ("HP-PROBOOK-450G10",    "HP ProBook 450 G10 15.6 i5-1335U 8GB 256GB",        "HP",       60,  520.00, "laptops"),
    ("DELL-XPS-13-9340",     "Dell XPS 13 9340 13.4 i7-1360P 16GB 512GB",        "Dell",     15,  1100.00,"laptops"),
    ("LEN-THINKBOOK-16-G6",  "Lenovo ThinkBook 16 G6 IRL i5-1335U 16GB 512GB",   "Lenovo",   45,  590.00, "laptops"),
    ("MS-SURFACE-PRO9",      "Microsoft Surface Pro 9 i7 16GB 256GB Platinum",    "Microsoft",10,  1200.00,"laptops"),
    ("HP-ELITEBOOK-865-G10", "HP EliteBook 865 G10 16-inch AMD Ryzen 7 PRO 32GB","HP",        25,  960.00, "laptops"),
    ("DELL-VOSTRO-3520",     "Dell Vostro 3520 15.6 i5-1235U 8GB 256GB",         "Dell",     80,  410.00, "laptops"),
]

SERVER_ITEMS = [
    ("HP-PROLIANT-DL380-G10","HP ProLiant DL380 Gen10 2x Xeon Silver 4214R 64GB","HP",        5,   4800.00,"servers"),
    ("DELL-POWEREDGE-R750",  "Dell PowerEdge R750 2U Xeon Gold 6330 128GB 2TB",  "Dell",      3,   7200.00,"servers"),
    ("LEN-THINKSYS-SR650",   "Lenovo ThinkSystem SR650 V3 Xeon 6330 64GB",       "Lenovo",    4,   5500.00,"servers"),
    ("HP-PROLIANT-ML350-G10","HP ProLiant ML350 Gen10 Xeon Silver 4210 32GB",    "HP",        6,   3100.00,"servers"),
    ("DELL-POWEREDGE-R450",  "Dell PowerEdge R450 1U Xeon Silver 4310 32GB",     "Dell",      8,   2800.00,"servers"),
]

NETWORKING_ITEMS = [
    ("CISCO-C9200L-24P",     "Cisco Catalyst 9200L 24-Port PoE+ Switch",         "Cisco",     10,  2100.00,"networking"),
    ("HP-ARUBA-2530-48G",    "HP Aruba 2530 48G PoE+ Switch JL357A",             "HP",        8,   1450.00,"networking"),
    ("CISCO-ISR4331-K9",     "Cisco ISR 4331 Integrated Services Router",        "Cisco",     4,   2800.00,"networking"),
    ("FORTINET-FG-100F",     "Fortinet FortiGate 100F Next-Gen Firewall",        "Fortinet",  3,   3200.00,"networking"),
    ("UBIQUITI-USW-48-PRO",  "Ubiquiti UniFi Switch 48-Port 500W PoE",           "Ubiquiti",  6,   890.00, "networking"),
]

# ── ROUND 1: Completed laptops round (45 days ago) ───────────────────────────

print("[seed] Creating Round 1 (completed laptops)…")
r1 = db.execute(text("""
    INSERT INTO bid_rounds (name, commodity, status, submission_deadline, reserve_price_enabled,
                            master_file_uploaded, total_line_items, customer, created_by_id, created_at, updated_at)
    VALUES ('Q1 2026 Laptop Refresh — ACME Bank', 'laptops', 'complete',
            :deadline, true, true, 10, 'ACME National Bank', :admin, :created, :updated)
    RETURNING id
"""), {"deadline": days_ago(40), "admin": admin_id,
       "created": days_ago(50), "updated": days_ago(2)}).fetchone()
r1_id = r1.id

# Assign all 5 buyers
for bid in [b1, b2, b3, b4, b5]:
    db.execute(text("""
        INSERT INTO round_buyers (round_id, buyer_id, invited_at, invite_status)
        VALUES (:rid, :bid, :ts, 'uploaded')
    """), {"rid": r1_id, "bid": bid, "ts": days_ago(50)})

# Master items for round 1
r1_masters = {}
for i, (pn, desc, mfr, qty, res, cat) in enumerate(LAPTOP_ITEMS):
    row = db.execute(text("""
        INSERT INTO master_items (bid_round_id, part_number, part_number_normalized, description,
                                  manufacturer, quantity, reserve_price, category, row_number, created_at)
        VALUES (:rid, :pn, :pnn, :desc, :mfr, :qty, :res, :cat, :rn, :ts)
        RETURNING id
    """), {"rid": r1_id, "pn": pn, "pnn": norm(pn), "desc": desc, "mfr": mfr,
           "qty": qty, "res": res, "cat": cat, "rn": i+1, "ts": days_ago(48)}).fetchone()
    r1_masters[pn] = row.id

db.commit()

# Buyer bids for round 1 — create bid files then bid lines
def create_bid_file(rid, buyer_id, lines_count, ts_days_ago):
    row = db.execute(text("""
        INSERT INTO bid_files (bid_round_id, buyer_id, filename, file_path, file_size_bytes,
                               status, lines_parsed, lines_matched, uploaded_at, processed_at)
        VALUES (:rid, :bid, :fn, :fp, :sz, 'processed', :lp, :lp, :ts, :ts)
        RETURNING id
    """), {"rid": rid, "bid": buyer_id,
           "fn": f"bid_round{rid}_buyer{buyer_id}.xlsx",
           "fp": f"/uploads/round{rid}/buyer{buyer_id}.xlsx",
           "sz": random.randint(8000, 25000),
           "lp": lines_count, "ts": days_ago(ts_days_ago)}).fetchone()
    return row.id

# Round 1 bidding: all items, realistic price competition
r1_prices = {
    "HP-ELITEBOOK-840G10":  {b1: 745.00, b2: 738.00, b3: 752.00, b4: 741.00, b5: 760.00},
    "DELL-LAT-5540-I7":     {b1: 702.00, b2: 695.00, b3: 710.00, b4: 698.00, b5: 720.00},
    "LEN-THINK-X13-GEN4":   {b1: 725.00, b2: 730.00, b3: 718.00, b4: 722.00, b5: 735.00},
    "APPLE-MBP-14-M3":      {b1: 1480.00,b2: 1470.00,b3: 1490.00,b4: None,   b5: 1510.00},
    "HP-PROBOOK-450G10":    {b1: 538.00, b2: 532.00, b3: 545.00, b4: 530.00, b5: 550.00},
    "DELL-XPS-13-9340":     {b1: 1125.00,b2: 1110.00,b3: 1140.00,b4: None,   b5: 1150.00},
    "LEN-THINKBOOK-16-G6":  {b1: 608.00, b2: 602.00, b3: 615.00, b4: 605.00, b5: 622.00},
    "MS-SURFACE-PRO9":      {b1: 1230.00,b2: 1220.00,b3: None,   b4: None,   b5: 1240.00},
    "HP-ELITEBOOK-865-G10": {b1: 985.00, b2: 975.00, b3: 992.00, b4: 980.00, b5: None},
    "DELL-VOSTRO-3520":     {b1: 425.00, b2: 420.00, b3: 428.00, b4: 418.00, b5: 432.00},
}

# Which buyer wins each item (lowest price)
r1_winners = {}
for pn, prices in r1_prices.items():
    valid = {bid: p for bid, p in prices.items() if p is not None}
    winner_bid = min(valid, key=lambda k: valid[k])
    r1_winners[pn] = (winner_bid, valid[winner_bid])

r1_bid_file_ids = {}
for buyer_id in [b1, b2, b3, b4, b5]:
    items_bid = sum(1 for pn, prices in r1_prices.items() if prices.get(buyer_id) is not None)
    r1_bid_file_ids[buyer_id] = create_bid_file(r1_id, buyer_id, items_bid, 43)

# Create bid lines
r1_line_ids = {}
for pn, prices in r1_prices.items():
    master_id = r1_masters[pn]
    win_buyer, win_price = r1_winners[pn]
    for buyer_id, price in prices.items():
        if price is None:
            continue
        is_win = (buyer_id == win_buyer)
        # Compute fluff price for losers
        fluff_row = db.execute(text("SELECT fluff_percentage, fluff_enabled FROM users WHERE id=:id"),
                               {"id": buyer_id}).fetchone()
        fluff_pct = fluff_row.fluff_percentage if fluff_row.fluff_enabled else 0.0
        fluffed = round(win_price * (1 + fluff_pct / 100), 2) if not is_win else None

        # Get master qty
        master_qty = next(item[3] for item in LAPTOP_ITEMS if item[0] == pn)
        line = db.execute(text("""
            INSERT INTO bid_lines (bid_file_id, bid_round_id, buyer_id, master_item_id,
                                   raw_part_number, normalized_part_number, description,
                                   unit_price, quantity, total_price,
                                   match_method, match_score, match_status,
                                   is_winner, real_winning_price, fluffed_loss_price,
                                   z_score, is_anomaly, created_at)
            VALUES (:fid, :rid, :bid, :mid,
                    :pn, :pnn, :desc,
                    :price, :qty, :total,
                    'exact', 100.0, 'matched',
                    :win, :rwp, :fluffed,
                    :z, false, :ts)
            RETURNING id
        """), {
            "fid": r1_bid_file_ids[buyer_id], "rid": r1_id, "bid": buyer_id, "mid": master_id,
            "pn": pn, "pnn": norm(pn), "desc": next(i[1] for i in LAPTOP_ITEMS if i[0] == pn),
            "price": price, "qty": master_qty, "total": round(price * master_qty, 2),
            "win": is_win, "rwp": win_price if is_win else None, "fluffed": fluffed,
            "z": round(random.uniform(-1.5, 1.5), 3),
            "ts": days_ago(43),
        }).fetchone()
        if is_win:
            r1_line_ids[pn] = line.id

db.commit()

# Create deals for round 1
print("[seed] Creating deals for Round 1…")
for pn, (win_buyer, win_price) in r1_winners.items():
    master_id = r1_masters[pn]
    line_id = r1_line_ids[pn]
    master_qty = next(i[3] for i in LAPTOP_ITEMS if i[0] == pn)
    master_desc = next(i[1] for i in LAPTOP_ITEMS if i[0] == pn)
    db.execute(text("""
        INSERT INTO deals (bid_round_id, master_item_id, winning_buyer_id, winning_bid_line_id,
                           part_number, description, quantity, winning_price, total_value,
                           razor_push_status, approved_by, approved_at, status, created_at)
        VALUES (:rid, :mid, :bid, :lid,
                :pn, :desc, :qty, :price, :total,
                'pending', 'admin@thinktls.com', :approved, 'approved', :created)
    """), {
        "rid": r1_id, "mid": master_id, "bid": win_buyer, "lid": line_id,
        "pn": pn, "desc": master_desc, "qty": master_qty,
        "price": win_price, "total": round(win_price * master_qty, 2),
        "approved": days_ago(38), "created": days_ago(39),
    })

db.commit()

# ── ROUND 2: Completed servers round (25 days ago) ───────────────────────────

print("[seed] Creating Round 2 (completed servers)…")
r2 = db.execute(text("""
    INSERT INTO bid_rounds (name, commodity, status, submission_deadline, reserve_price_enabled,
                            master_file_uploaded, total_line_items, customer, created_by_id, created_at, updated_at)
    VALUES ('Q1 2026 Server Procurement — City Finance', 'servers', 'complete',
            :deadline, true, true, 5, 'City Finance Group', :admin, :created, :updated)
    RETURNING id
"""), {"deadline": days_ago(20), "admin": admin_id,
       "created": days_ago(30), "updated": days_ago(5)}).fetchone()
r2_id = r2.id

for bid in [b1, b2, b3, b5]:
    db.execute(text("INSERT INTO round_buyers (round_id, buyer_id, invited_at, invite_status) VALUES (:rid, :bid, :ts, 'uploaded')"),
               {"rid": r2_id, "bid": bid, "ts": days_ago(30)})

r2_masters = {}
for i, (pn, desc, mfr, qty, res, cat) in enumerate(SERVER_ITEMS):
    row = db.execute(text("""
        INSERT INTO master_items (bid_round_id, part_number, part_number_normalized, description,
                                  manufacturer, quantity, reserve_price, category, row_number, created_at)
        VALUES (:rid, :pn, :pnn, :desc, :mfr, :qty, :res, :cat, :rn, :ts)
        RETURNING id
    """), {"rid": r2_id, "pn": pn, "pnn": norm(pn), "desc": desc, "mfr": mfr,
           "qty": qty, "res": res, "cat": cat, "rn": i+1, "ts": days_ago(28)}).fetchone()
    r2_masters[pn] = row.id

db.commit()

r2_prices = {
    "HP-PROLIANT-DL380-G10": {b1: 4950.00, b2: 4920.00, b3: 4980.00, b5: 5010.00},
    "DELL-POWEREDGE-R750":   {b1: 7450.00, b2: 7380.00, b3: None,     b5: 7520.00},
    "LEN-THINKSYS-SR650":    {b1: 5650.00, b2: 5600.00, b3: 5680.00,  b5: 5720.00},
    "HP-PROLIANT-ML350-G10": {b1: 3200.00, b2: None,    b3: 3180.00,  b5: 3250.00},
    "DELL-POWEREDGE-R450":   {b1: 2880.00, b2: 2850.00, b3: 2920.00,  b5: 2900.00},
}

r2_winners = {}
for pn, prices in r2_prices.items():
    valid = {bid: p for bid, p in prices.items() if p is not None}
    winner_bid = min(valid, key=lambda k: valid[k])
    r2_winners[pn] = (winner_bid, valid[winner_bid])

r2_bid_file_ids = {}
for buyer_id in [b1, b2, b3, b5]:
    items_bid = sum(1 for pn, prices in r2_prices.items() if prices.get(buyer_id) is not None)
    r2_bid_file_ids[buyer_id] = create_bid_file(r2_id, buyer_id, items_bid, 22)

r2_line_ids = {}
for pn, prices in r2_prices.items():
    master_id = r2_masters[pn]
    win_buyer, win_price = r2_winners[pn]
    for buyer_id, price in prices.items():
        if price is None:
            continue
        is_win = (buyer_id == win_buyer)
        fluff_row = db.execute(text("SELECT fluff_percentage, fluff_enabled FROM users WHERE id=:id"), {"id": buyer_id}).fetchone()
        fluff_pct = fluff_row.fluff_percentage if fluff_row.fluff_enabled else 0.0
        fluffed = round(win_price * (1 + fluff_pct / 100), 2) if not is_win else None
        master_qty = next(item[3] for item in SERVER_ITEMS if item[0] == pn)
        line = db.execute(text("""
            INSERT INTO bid_lines (bid_file_id, bid_round_id, buyer_id, master_item_id,
                                   raw_part_number, normalized_part_number, description,
                                   unit_price, quantity, total_price, match_method, match_score,
                                   match_status, is_winner, real_winning_price, fluffed_loss_price,
                                   z_score, is_anomaly, created_at)
            VALUES (:fid, :rid, :bid, :mid, :pn, :pnn, :desc, :price, :qty, :total,
                    'exact', 100.0, 'matched', :win, :rwp, :fluffed, :z, false, :ts)
            RETURNING id
        """), {
            "fid": r2_bid_file_ids[buyer_id], "rid": r2_id, "bid": buyer_id, "mid": master_id,
            "pn": pn, "pnn": norm(pn), "desc": next(i[1] for i in SERVER_ITEMS if i[0] == pn),
            "price": price, "qty": master_qty, "total": round(price * master_qty, 2),
            "win": is_win, "rwp": win_price if is_win else None, "fluffed": fluffed,
            "z": round(random.uniform(-1.2, 1.2), 3), "ts": days_ago(22),
        }).fetchone()
        if is_win:
            r2_line_ids[pn] = line.id

db.commit()

for pn, (win_buyer, win_price) in r2_winners.items():
    master_id = r2_masters[pn]
    line_id = r2_line_ids[pn]
    master_qty = next(i[3] for i in SERVER_ITEMS if i[0] == pn)
    master_desc = next(i[1] for i in SERVER_ITEMS if i[0] == pn)
    db.execute(text("""
        INSERT INTO deals (bid_round_id, master_item_id, winning_buyer_id, winning_bid_line_id,
                           part_number, description, quantity, winning_price, total_value,
                           razor_push_status, approved_by, approved_at, status, created_at)
        VALUES (:rid, :mid, :bid, :lid, :pn, :desc, :qty, :price, :total,
                'success', 'admin@thinktls.com', :approved, 'pushed_to_razor', :created)
    """), {
        "rid": r2_id, "mid": master_id, "bid": win_buyer, "lid": line_id,
        "pn": pn, "desc": master_desc, "qty": master_qty,
        "price": win_price, "total": round(win_price * master_qty, 2),
        "approved": days_ago(18), "created": days_ago(19),
    })

db.commit()

# ── ROUND 3: Completed networking round (10 days ago) ────────────────────────

print("[seed] Creating Round 3 (completed networking)…")
r3 = db.execute(text("""
    INSERT INTO bid_rounds (name, commodity, status, submission_deadline, reserve_price_enabled,
                            master_file_uploaded, total_line_items, customer, created_by_id, created_at, updated_at)
    VALUES ('Q2 2026 Network Upgrade — Metro Health', 'networking', 'complete',
            :deadline, true, true, 5, 'Metro Health Authority', :admin, :created, :updated)
    RETURNING id
"""), {"deadline": days_ago(7), "admin": admin_id,
       "created": days_ago(15), "updated": days_ago(1)}).fetchone()
r3_id = r3.id

for bid in [b2, b3, b4, b5]:
    db.execute(text("INSERT INTO round_buyers (round_id, buyer_id, invited_at, invite_status) VALUES (:rid, :bid, :ts, 'uploaded')"),
               {"rid": r3_id, "bid": bid, "ts": days_ago(14)})

r3_masters = {}
for i, (pn, desc, mfr, qty, res, cat) in enumerate(NETWORKING_ITEMS):
    row = db.execute(text("""
        INSERT INTO master_items (bid_round_id, part_number, part_number_normalized, description,
                                  manufacturer, quantity, reserve_price, category, row_number, created_at)
        VALUES (:rid, :pn, :pnn, :desc, :mfr, :qty, :res, :cat, :rn, :ts)
        RETURNING id
    """), {"rid": r3_id, "pn": pn, "pnn": norm(pn), "desc": desc, "mfr": mfr,
           "qty": qty, "res": res, "cat": cat, "rn": i+1, "ts": days_ago(13)}).fetchone()
    r3_masters[pn] = row.id

db.commit()

r3_prices = {
    "CISCO-C9200L-24P":   {b2: 2180.00, b3: 2150.00, b4: 2200.00, b5: 2220.00},
    "HP-ARUBA-2530-48G":  {b2: 1510.00, b3: 1490.00, b4: None,    b5: 1530.00},
    "CISCO-ISR4331-K9":   {b2: 2900.00, b3: None,    b4: 2880.00, b5: 2920.00},
    "FORTINET-FG-100F":   {b2: 3310.00, b3: 3280.00, b4: 3320.00, b5: None},
    "UBIQUITI-USW-48-PRO":{b2: 920.00,  b3: 910.00,  b4: 930.00,  b5: 895.00},
}

r3_winners = {}
for pn, prices in r3_prices.items():
    valid = {bid: p for bid, p in prices.items() if p is not None}
    winner_bid = min(valid, key=lambda k: valid[k])
    r3_winners[pn] = (winner_bid, valid[winner_bid])

r3_bid_file_ids = {}
for buyer_id in [b2, b3, b4, b5]:
    items_bid = sum(1 for pn, prices in r3_prices.items() if prices.get(buyer_id) is not None)
    r3_bid_file_ids[buyer_id] = create_bid_file(r3_id, buyer_id, items_bid, 9)

r3_line_ids = {}
for pn, prices in r3_prices.items():
    master_id = r3_masters[pn]
    win_buyer, win_price = r3_winners[pn]
    for buyer_id, price in prices.items():
        if price is None:
            continue
        is_win = (buyer_id == win_buyer)
        fluff_row = db.execute(text("SELECT fluff_percentage, fluff_enabled FROM users WHERE id=:id"), {"id": buyer_id}).fetchone()
        fluff_pct = fluff_row.fluff_percentage if fluff_row.fluff_enabled else 0.0
        fluffed = round(win_price * (1 + fluff_pct / 100), 2) if not is_win else None
        master_qty = next(item[3] for item in NETWORKING_ITEMS if item[0] == pn)
        line = db.execute(text("""
            INSERT INTO bid_lines (bid_file_id, bid_round_id, buyer_id, master_item_id,
                                   raw_part_number, normalized_part_number, description,
                                   unit_price, quantity, total_price, match_method, match_score,
                                   match_status, is_winner, real_winning_price, fluffed_loss_price,
                                   z_score, is_anomaly, created_at)
            VALUES (:fid, :rid, :bid, :mid, :pn, :pnn, :desc, :price, :qty, :total,
                    'fuzzy', 94.5, 'matched', :win, :rwp, :fluffed, :z, false, :ts)
            RETURNING id
        """), {
            "fid": r3_bid_file_ids[buyer_id], "rid": r3_id, "bid": buyer_id, "mid": master_id,
            "pn": pn, "pnn": norm(pn), "desc": next(i[1] for i in NETWORKING_ITEMS if i[0] == pn),
            "price": price, "qty": master_qty, "total": round(price * master_qty, 2),
            "win": is_win, "rwp": win_price if is_win else None, "fluffed": fluffed,
            "z": round(random.uniform(-0.8, 0.8), 3), "ts": days_ago(9),
        }).fetchone()
        if is_win:
            r3_line_ids[pn] = line.id

db.commit()

for pn, (win_buyer, win_price) in r3_winners.items():
    master_id = r3_masters[pn]
    line_id = r3_line_ids[pn]
    master_qty = next(i[3] for i in NETWORKING_ITEMS if i[0] == pn)
    master_desc = next(i[1] for i in NETWORKING_ITEMS if i[0] == pn)
    db.execute(text("""
        INSERT INTO deals (bid_round_id, master_item_id, winning_buyer_id, winning_bid_line_id,
                           part_number, description, quantity, winning_price, total_value,
                           razor_push_status, approved_by, approved_at, status, created_at)
        VALUES (:rid, :mid, :bid, :lid, :pn, :desc, :qty, :price, :total,
                'pending', 'admin@thinktls.com', :approved, 'approved', :created)
    """), {
        "rid": r3_id, "mid": master_id, "bid": win_buyer, "lid": line_id,
        "pn": pn, "desc": master_desc, "qty": master_qty,
        "price": win_price, "total": round(win_price * master_qty, 2),
        "approved": days_ago(5), "created": days_ago(6),
    })

db.commit()

# ── ROUND 4: Currently OPEN (laptops + peripherals) ──────────────────────────

print("[seed] Creating Round 4 (open — live demo round)…")
DESKTOP_ITEMS = [
    ("HP-ELITEDESK-800-G9",  "HP EliteDesk 800 G9 SFF i7-12700 16GB 512GB",     "HP",       30,  680.00, "desktops"),
    ("DELL-OPTIPLEX-7010",   "Dell OptiPlex 7010 SFF i5-12500 16GB 256GB",       "Dell",     40,  520.00, "desktops"),
    ("LEN-THINKCENTRE-M70Q", "Lenovo ThinkCentre M70q Gen4 i5-13400T 8GB 256GB","Lenovo",   25,  440.00, "desktops"),
    ("HP-ELITEDISPLAY-E27Q", "HP E27q G5 QHD 27-inch Monitor USB-C",            "HP",       60,  280.00, "peripherals"),
    ("DELL-27-MONITOR-P2723D","Dell 27 USB-C Hub Monitor P2723DE",               "Dell",     50,  310.00, "peripherals"),
    ("LEN-THINKPAD-DOCK-G2", "Lenovo ThinkPad Universal Thunderbolt 4 Dock",    "Lenovo",   35,  180.00, "peripherals"),
    ("HP-USB-C-DOCK-G5",     "HP USB-C Dock G5 5TW10AA",                        "HP",       40,  175.00, "peripherals"),
    ("LOGITECH-MK850-BUNDLE","Logitech MK850 Performance Wireless Keyboard+Mouse","Logitech",80, 85.00,  "peripherals"),
]

r4 = db.execute(text("""
    INSERT INTO bid_rounds (name, commodity, status, submission_deadline, reserve_price_enabled,
                            master_file_uploaded, total_line_items, customer, created_by_id, created_at, updated_at)
    VALUES ('Q2 2026 Desktop Refresh — TechStart Inc', 'desktops', 'open',
            :deadline, true, true, 8, 'TechStart Inc', :admin, :created, :updated)
    RETURNING id
"""), {"deadline": now_utc() + timedelta(days=5), "admin": admin_id,
       "created": days_ago(3), "updated": days_ago(0)}).fetchone()
r4_id = r4.id

for bid in [b1, b2, b3, b4, b5]:
    status = "uploaded" if bid in [b1, b2] else "sent"
    db.execute(text("INSERT INTO round_buyers (round_id, buyer_id, invited_at, invite_status) VALUES (:rid, :bid, :ts, :s)"),
               {"rid": r4_id, "bid": bid, "ts": days_ago(3), "s": status})

r4_masters = {}
for i, (pn, desc, mfr, qty, res, cat) in enumerate(DESKTOP_ITEMS):
    row = db.execute(text("""
        INSERT INTO master_items (bid_round_id, part_number, part_number_normalized, description,
                                  manufacturer, quantity, reserve_price, category, row_number, created_at)
        VALUES (:rid, :pn, :pnn, :desc, :mfr, :qty, :res, :cat, :rn, :ts)
        RETURNING id
    """), {"rid": r4_id, "pn": pn, "pnn": norm(pn), "desc": desc, "mfr": mfr,
           "qty": qty, "res": res, "cat": cat, "rn": i+1, "ts": days_ago(2)}).fetchone()
    r4_masters[pn] = row.id

db.commit()

# b1 and b2 have already submitted bids for the open round
r4_prices_b1 = {
    "HP-ELITEDESK-800-G9": 705.00, "DELL-OPTIPLEX-7010": 540.00,
    "LEN-THINKCENTRE-M70Q": 460.00, "HP-ELITEDISPLAY-E27Q": 295.00,
    "DELL-27-MONITOR-P2723D": 325.00, "LEN-THINKPAD-DOCK-G2": 190.00,
    "HP-USB-C-DOCK-G5": 185.00, "LOGITECH-MK850-BUNDLE": 90.00,
}
r4_prices_b2 = {
    "HP-ELITEDESK-800-G9": 695.00, "DELL-OPTIPLEX-7010": 535.00,
    "LEN-THINKCENTRE-M70Q": 455.00, "HP-ELITEDISPLAY-E27Q": 290.00,
    "DELL-27-MONITOR-P2723D": 320.00, "LEN-THINKPAD-DOCK-G2": 188.00,
    "HP-USB-C-DOCK-G5": 182.00, "LOGITECH-MK850-BUNDLE": 88.00,
}

for buyer_id, prices in [(b1, r4_prices_b1), (b2, r4_prices_b2)]:
    fid = create_bid_file(r4_id, buyer_id, len(prices), 1)
    for pn, price in prices.items():
        master_id = r4_masters[pn]
        master_qty = next(i[3] for i in DESKTOP_ITEMS if i[0] == pn)
        db.execute(text("""
            INSERT INTO bid_lines (bid_file_id, bid_round_id, buyer_id, master_item_id,
                                   raw_part_number, normalized_part_number, description,
                                   unit_price, quantity, total_price, match_method, match_score,
                                   match_status, is_winner, z_score, is_anomaly, created_at)
            VALUES (:fid, :rid, :bid, :mid, :pn, :pnn, :desc, :price, :qty, :total,
                    'exact', 100.0, 'matched', false, :z, false, :ts)
        """), {
            "fid": fid, "rid": r4_id, "bid": buyer_id, "mid": master_id,
            "pn": pn, "pnn": norm(pn), "desc": next(i[1] for i in DESKTOP_ITEMS if i[0] == pn),
            "price": price, "qty": master_qty, "total": round(price * master_qty, 2),
            "z": round(random.uniform(-1.0, 1.0), 3), "ts": days_ago(1),
        })

db.commit()
print(f"[seed] Round 4 (open): {r4_id}")

# ── RECALCULATE buyer scores ──────────────────────────────────────────────────

print("[seed] Recalculating buyer scores…")

def recalc_buyer(buyer_id):
    lines = db.execute(text("""
        SELECT bl.is_winner, bl.unit_price, bl.quantity, bl.master_item_id, bl.created_at,
               mi.reserve_price
        FROM bid_lines bl
        LEFT JOIN master_items mi ON mi.id = bl.master_item_id
        WHERE bl.buyer_id = :bid AND bl.match_status = 'matched'
    """), {"bid": buyer_id}).fetchall()

    lines_bid = len(lines)
    lines_won = sum(1 for l in lines if l.is_winner)
    win_rate = round(lines_won / lines_bid, 4) if lines_bid > 0 else 0.0

    margin_total = 0.0
    last_win = None
    for l in lines:
        if l.is_winner:
            if l.reserve_price and l.unit_price:
                margin_total += max(0.0, l.unit_price - l.reserve_price) * (l.quantity or 1)
            if last_win is None or (l.created_at and l.created_at > last_win):
                last_win = l.created_at

    # Composite score
    win_c = win_rate * 45.0
    act_c = min(30.0, math.log1p(lines_bid) / math.log1p(1000) * 30.0)
    mar_c = min(15.0, math.log1p(max(0.0, margin_total)) / math.log1p(100000) * 15.0)
    rec_c = 0.0
    if last_win and lines_won > 0:
        lw = last_win if last_win.tzinfo else last_win.replace(tzinfo=timezone.utc)
        days_since = max(0, (now_utc() - lw).days)
        rec_c = max(0.0, 10.0 - days_since / 30.0)
    score = round(min(100.0, max(0.0, win_c + act_c + mar_c + rec_c)), 2)

    db.execute(text("""
        UPDATE users SET win_rate=:wr, total_lines_won=:lw, total_lines_bid=:lb,
                         total_margin_contribution=:mc, buyer_score=:score,
                         score_updated_at=NOW(), last_win_date=:lwd,
                         total_rounds_participated=:rp
        WHERE id=:bid
    """), {
        "wr": win_rate, "lw": lines_won, "lb": lines_bid,
        "mc": round(margin_total, 2), "score": score, "bid": buyer_id,
        "lwd": last_win, "rp": db.execute(text(
            "SELECT COUNT(DISTINCT bid_round_id) FROM bid_lines WHERE buyer_id=:bid"
        ), {"bid": buyer_id}).scalar() or 0,
    })

for buyer_id in [b1, b2, b3, b4, b5]:
    recalc_buyer(buyer_id)

db.commit()

# ── NOTIFICATIONS ─────────────────────────────────────────────────────────────

print("[seed] Creating notifications…")
notifications = [
    ("Bids received for Q2 2026 Desktop Refresh",
     "Alice Chen (Acme Corp) and Bob Martinez (TechCo) have submitted bids — 3 buyers still pending.",
     "info", f"/admin/rounds/{r4_id}"),
    ("Round Complete: Q2 2026 Network Upgrade",
     "5 deals approved and pushed to Razor ERP. Total value: $72,350.",
     "success", f"/admin/rounds/{r3_id}"),
    ("New round created: Q2 2026 Desktop Refresh",
     "5 buyers invited. Deadline in 5 days.",
     "info", f"/admin/rounds/{r4_id}"),
    ("Deals exported to Razor ERP — Q1 2026 Server Procurement",
     "5 deals pushed successfully. Razor deal IDs confirmed.",
     "success", f"/admin/rounds/{r2_id}"),
    ("Bid anomaly detected",
     "2 bid lines flagged as price anomalies (z-score > 2.5) in Round 1. Review required.",
     "warning", f"/admin/rounds/{r1_id}/exceptions"),
]

for title, body, cat, link in notifications:
    db.execute(text("""
        INSERT INTO notifications (title, body, category, link, read, recipient_role, created_at)
        VALUES (:t, :b, :c, :l, false, 'admin', NOW() - INTERVAL '1 hour')
    """), {"t": title, "b": body, "c": cat, "l": link})

db.commit()

# ── SUMMARY ───────────────────────────────────────────────────────────────────

print()
print("=" * 62)
print("  DEMO SEED COMPLETE")
print("=" * 62)

deals_row = db.execute(text("SELECT COUNT(*), SUM(total_value) FROM deals")).fetchone()
rounds_row = db.execute(text("SELECT status, COUNT(*) FROM bid_rounds GROUP BY status")).fetchall()

print(f"  Rounds: {', '.join(f'{r[0]}={r[1]}' for r in rounds_row)}")
print(f"  Deals: {deals_row[0]} total, ${deals_row[1]:,.0f} total value")
print()
print("  Buyer scores:")
buyers = db.execute(text("""
    SELECT full_name, company_name, buyer_score, win_rate, total_lines_won, total_lines_bid
    FROM users WHERE role='buyer' ORDER BY buyer_score DESC
""")).fetchall()
for b in buyers:
    print(f"    {b.full_name:20s} ({b.company_name:18s})  score={b.buyer_score:5.1f}  "
          f"W/L={b.total_lines_won}/{b.total_lines_bid}  "
          f"rate={b.win_rate:.1%}")
print()
print("  Demo accounts:")
print("    Admin : admin@thinktls.com   / changeme123")
print("    Buyer1: buyer1@acme.com      / buyer123  (Alice Chen)")
print("    Buyer2: buyer2@techco.com    / buyer123  (Bob Martinez)")
print("    Buyer3: buyer3@globalit.com  / buyer123  (Carol Wu)")
print("    Buyer4: buyer4@premier.com   / buyer123  (David Singh)")
print("    Buyer5: buyer5@nextech.com   / buyer123  (Emma Thompson)")
print()
print("  URLs:")
print("    Frontend : http://localhost:3000")
print("    API docs : http://localhost:8000/docs")
print("=" * 62)

db.close()
