"""
Comprehensive demo seed.
Creates admin + 5 buyers, 4 complete rounds with master items / bid lines / approved
deals, and 1 open round.  Run once:

    docker exec -it thinktls-backend python -m app.db.seed

Or from the repo root while the DB container is running:
    cd backend && python -m app.db.seed

Pass --force to wipe and re-seed existing data.
"""
import sys, os, math, random
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from app.db.session import SessionLocal
from app.models.user import User
from app.models.bid_round import BidRound
from app.models.master_item import MasterItem
from app.models.bid_file import BidFile
from app.models.bid_line import BidLine
from app.models.deal import Deal
from app.core.security import hash_password
from app.core.config import settings
from app.services.normalizer import normalize_part_number, normalize_description

FORCE = "--force" in sys.argv

# ─── Buyers ────────────────────────────────────────────────────────────────────

BUYERS_DEF = [
    dict(email="buyer1@acmecorp.com",     full_name="Alice Chen",    company_name="Acme Corp",            fluff_percentage=3.5),
    dict(email="buyer2@techco.com",       full_name="Bob Martinez",  company_name="TechCo Solutions",     fluff_percentage=4.0),
    dict(email="buyer3@globalit.com",     full_name="Carol Wu",      company_name="Global IT Partners",   fluff_percentage=3.0),
    dict(email="buyer4@datasphere.com",   full_name="David Kim",     company_name="DataSphere Inc",       fluff_percentage=4.5),
    dict(email="buyer5@cloudbridge.com",  full_name="Elena Rossi",   company_name="CloudBridge Systems",  fluff_percentage=3.5),
]

# ─── Round definitions ──────────────────────────────────────────────────────────
# bids row: list of prices, one per buyer (None = buyer didn't bid)
# buyer order is BUYERS_DEF indices 0-4

ROUNDS_DEF = [
    dict(
        name="Q1 2026 — Enterprise Laptops",
        commodity="laptops",
        customer="Horizon Financial Group",
        days_ago=90,
        reserve_price_enabled=True,
        master_items=[
            # (part_number, description, qty, reserve, [b0, b1, b2, b3, b4])
            ("DELL-LAT5540-I7-16-512",  "Dell Latitude 5540 i7-1365U 16GB 512GB SSD FHD",         25, 720,  [760, 785, 745, 770, None]),
            ("LEN-TPL14G4-R5-16-256",   "Lenovo ThinkPad L14 Gen4 Ryzen 5 7530U 16GB 256GB",      20, 580,  [620, None, 635, 610, 625]),
            ("HP-EB840G10-I5-8-256",    "HP EliteBook 840 G10 i5-1345U 8GB 256GB",                15, 650,  [680, 695, None, 685, 672]),
            ("DELL-LAT5440-I5-16-512",  "Dell Latitude 5440 i5-1345U 16GB 512GB",                 30, 680,  [720, 710, 730, None, 715]),
            ("LEN-TPX1C11-I7-16-512",   "Lenovo ThinkPad X1 Carbon Gen11 i7-1365U 16GB 512GB",   10, 1200, [1280, 1250, 1310, 1265, None]),
            ("HP-EB1040G10-I7-32-512",  "HP EliteBook 1040 G10 i7-1365U 32GB 512GB",               8, 1400, [1480, 1520, None, 1495, 1505]),
            ("DELL-PREC3480-I7-32-512", "Dell Precision 3480 i7-1365U 32GB 512GB Quadro",          5, 1350, [1420, None, 1445, 1390, 1410]),
            ("APPLE-MBP14-M3-16-512",   "Apple MacBook Pro 14-inch M3 16GB 512GB Space Gray",      6, 1600, [1680, 1720, 1650, None, 1695]),
            ("LEN-TPT14S-R7-16-512",    "Lenovo ThinkPad T14s Gen4 Ryzen 7 PRO 7840U 16GB 512GB", 12, 850,  [890, None, 920, 875, 905]),
            ("HP-PB445G10-R7-16-512",   "HP ProBook 445 G10 Ryzen 7 7730U 16GB 512GB",            18, 620,  [660, 640, 680, None, 650]),
            ("DELL-LAT5550-I7-16-1TB",  "Dell Latitude 5550 i7-1365U 16GB 1TB NVMe",              10, 850,  [None, 900, 880, 920, 895]),
            ("LEN-TPE14G5-R5-8-256",    "Lenovo ThinkPad E14 Gen5 Ryzen 5 7530U 8GB 256GB",       25, 520,  [555, 560, None, 540, 548]),
        ],
        exceptions=[
            ("DELL-LAT5540-I7-16-512", 2, 580),   # buyer2 below reserve — demo anomaly
        ],
    ),
    dict(
        name="Feb 2026 — Network Infrastructure",
        commodity="networking",
        customer="Redwood Capital Partners",
        days_ago=60,
        reserve_price_enabled=True,
        master_items=[
            ("CISCO-C9300-24T-A",       "Cisco Catalyst 9300 24-Port Data Switch C9300-24T-A",       4, 3200,  [3380, 3450, None, 3290, 3410]),
            ("CISCO-C9200-48P-A",       "Cisco Catalyst 9200 48-Port PoE+ Switch C9200-48P-A",       6, 2800,  [2950, 2880, None, None, 2990]),
            ("CISCO-AIR-AP3802I-B-K9",  "Cisco Aironet 3802I 802.11ac Wave 2 Access Point",         20, 640,   [680, 700, 690, None, 665]),
            ("UBNT-UAP-U6-PRO",         "Ubiquiti UniFi U6 Professional Access Point",              15, 190,   [210, None, 215, 205, 218]),
            ("CISCO-SG350-28P-K9",      "Cisco SG350-28P 28-Port Gigabit PoE Managed Switch",        8, 550,   [None, 580, 575, 565, 590]),
            ("FORT-FG-100F",            "Fortinet FortiGate 100F Next-Gen Firewall",                  2, 4200,  [4450, 4380, None, 4520, 4400]),
            ("CISCO-ISR4321-SEC-K9",    "Cisco ISR 4321 Router Security Bundle",                      3, 2900,  [3050, None, 3100, 2980, 3070]),
            ("UBNT-USW-PRO-24-POE",     "Ubiquiti UniFi Pro 24-Port PoE Managed Switch",             4, 750,   [790, 810, None, 785, 800]),
            ("CISCO-SF350-48P-K9",      "Cisco SF350-48P 48-Port 10/100 PoE Managed Switch",        5, 480,   [505, None, 520, 495, 510]),
            ("PALO-PA-820",             "Palo Alto Networks PA-820 Next-Gen Firewall",                1, 5800,  [6100, 5950, None, 6200, 6050]),
        ],
        exceptions=[
            ("CISCO-C9300-24T-A", 3, 2850),  # buyer3 below reserve
        ],
    ),
    dict(
        name="Mar 2026 — Storage Procurement",
        commodity="storage",
        customer="MedCore Health Systems",
        days_ago=45,
        reserve_price_enabled=True,
        master_items=[
            ("SGT-EXOS7E10-8TB-ST8000",  "Seagate Exos 7E10 8TB 3.5in 7200RPM SAS 512e/4Kn",      50, 170,  [None, 182, 178, 185, 175]),
            ("WD-GOLD-10TB-WD102KRYZ",   "WD Gold 10TB Enterprise SATA 6Gb/s 256MB Cache",         40, 210,  [220, 228, None, 222, 225]),
            ("SGT-IWP-12TB-ST12000",     "Seagate IronWolf Pro 12TB NAS 7200RPM SATA 256MB",       30, 260,  [275, None, 285, 270, 278]),
            ("WD-ULTRASTAR-16TB-HUS",    "WD Ultrastar DC HC550 16TB Enterprise SATA 7200RPM",     20, 340,  [None, 358, 365, 350, 355]),
            ("SGT-NYTRO-3732-1.92TB",    "Seagate Nytro 3732 1.92TB 2.5in SAS SSD",               10, 780,  [820, 840, None, 810, 835]),
            ("SAMSUNG-PM9A3-3.84TB",     "Samsung PM9A3 3.84TB U.2 PCIe 4.0 NVMe SSD",             8, 1450, [1520, None, 1560, 1490, 1540]),
            ("NETAPP-DS224C-12X4TB",     "NetApp DS224C 2U Disk Shelf 12x4TB SAS HDD",              2, 8500, [8900, 8750, None, 9100, 8800]),
            ("SYNOLOGY-RS3621XS-PLUS",   "Synology RackStation RS3621xs+ 12-Bay NAS",               3, 2800, [2950, 2920, None, 3050, 2980]),
        ],
        exceptions=[
            ("SGT-NYTRO-3732-1.92TB", 1, 650),  # buyer1 below reserve
        ],
    ),
    dict(
        name="Apr 2026 — Desktop Deployment",
        commodity="desktops",
        customer="Pacific Schools District",
        days_ago=20,
        reserve_price_enabled=False,
        master_items=[
            ("DELL-OPT7010-SFF-I5",    "Dell OptiPlex 7010 SFF i5-13500 8GB 256GB SSD",           40, 0, [560, 545, 570, None, 552]),
            ("HP-PD600G9-SFF-I7",      "HP ProDesk 600 G9 SFF i7-13700 16GB 512GB",               25, 0, [730, 745, None, 720, 738]),
            ("LEN-M90Q-I5-8-256",      "Lenovo ThinkCentre M90q Gen3 Tiny i5-13500T 8GB 256GB",   35, 0, [None, 490, 505, 480, 498]),
            ("DELL-OPT3000-SFF-I3",    "Dell OptiPlex 3000 SFF i3-12100 8GB 256GB",               60, 0, [385, None, 398, 380, 392]),
            ("HP-PD400G9-MT-I5",       "HP ProDesk 400 G9 MT i5-13500 8GB 512GB",                 20, 0, [640, 655, None, 628, 645]),
            ("APPLE-MAC-MINI-M2",      "Apple Mac Mini M2 8GB 256GB SSD",                          8, 0, [750, 780, None, 760, 770]),
            ("LEN-M70Q-I3-8-256",      "Lenovo ThinkCentre M70q Gen3 Tiny i3-12100T 8GB 256GB",   30, 0, [350, None, 368, 345, 358]),
            ("DELL-OPT7010-TOWER-I7",  "Dell OptiPlex 7010 Tower i7-13700 32GB 512GB",             15, 0, [850, 870, None, 840, 862]),
            ("HP-ELIT-800G9-TWR-I9",   "HP Elite 800 G9 Tower i9-13900 64GB 1TB NVMe",              5, 0, [1580, None, 1620, 1550, 1595]),
            ("ACER-VERIV-X6680G-I5",   "Acer Veriton X6680G SFF i5-11400 8GB 512GB",              20, 0, [300, 315, None, 295, 308]),
        ],
        exceptions=[],
    ),
]

OPEN_ROUND_DEF = dict(
    name="May 2026 — Server Expansion",
    commodity="servers",
    customer="Altitude Analytics",
    days_ago=5,
    reserve_price_enabled=True,
    master_items=[
        ("DELL-PE-R650XS-S4310",   "Dell PowerEdge R650xs 2U Intel Xeon Silver 4310 32GB 2x480GB SSD", 4, 8500),
        ("HP-DL380G10-S4214",      "HP ProLiant DL380 Gen10 Xeon Silver 4214R 64GB 8x600GB SAS",       3, 12000),
        ("DELL-PE-R750-G6338",     "Dell PowerEdge R750 2U Intel Xeon Gold 6338 128GB 4x1.92TB SSD",   2, 18500),
        ("SUPERM-SYS-2029P-C1R",   "Supermicro SuperServer 2029P-C1R Dual Xeon 256GB",                  1, 24000),
        ("HP-DL360G10-S4208",      "HP ProLiant DL360 Gen10 Xeon Silver 4208 32GB 8x300GB SAS",        6, 6800),
        ("DELL-PE-R450-S4310",     "Dell PowerEdge R450 1U Xeon Silver 4310 32GB 4x1.92TB SSD",        8, 7200),
        ("LENOVO-SR650V2-S4316",   "Lenovo ThinkSystem SR650 V2 Xeon Silver 4316 64GB",                 3, 11500),
        ("CISCO-UCSC-C220-M6",     "Cisco UCS C220 M6 Rack Server Xeon Gold 6338 128GB",                2, 22000),
        ("HP-DL20G10P-E2336",      "HP ProLiant DL20 Gen10 Plus Xeon E-2336 16GB",                      5, 3800),
        ("DELL-PE-R350-E2336",     "Dell PowerEdge R350 1U Xeon E-2336 16GB 2x480GB SSD",               5, 3600),
    ],
)


# ─── Helpers ───────────────────────────────────────────────────────────────────

def ts(days_ago: int, hour: int = 10) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days_ago, hours=-hour)


def seed():
    db = SessionLocal()
    try:
        if FORCE:
            print("--force: wiping existing data…")
            for model in (Deal, BidLine, BidFile, MasterItem, BidRound, User):
                db.query(model).delete()
            db.commit()
        else:
            if db.query(User).filter(User.email == settings.ADMIN_EMAIL).first():
                print("Demo data already exists. Pass --force to re-seed.")
                return

        # ── Admin ────────────────────────────────────────────────────────────
        admin = User(
            email=settings.ADMIN_EMAIL,
            hashed_password=hash_password(settings.ADMIN_PASSWORD),
            full_name="ThinkTLS Admin",
            role="admin",
            company_name="ThinkTLS",
        )
        db.add(admin)
        db.flush()

        # ── Buyers ───────────────────────────────────────────────────────────
        buyers: list[User] = []
        for bd in BUYERS_DEF:
            b = User(
                hashed_password=hash_password("buyer123"),
                role="buyer",
                is_active=True,
                fluff_enabled=True,
                total_rounds_participated=0,
                **bd,
            )
            db.add(b)
            buyers.append(b)
        db.flush()

        print(f"  Created admin + {len(buyers)} buyers")

        # ── Completed rounds ─────────────────────────────────────────────────
        all_deals: list[Deal] = []
        for rdef in ROUNDS_DEF:
            days = rdef["days_ago"]
            round_created = ts(days + 20)
            round_opened  = ts(days + 14)
            round_closed  = ts(days + 3)
            round_done    = ts(days)

            r = BidRound(
                name=rdef["name"],
                commodity=rdef["commodity"],
                customer=rdef["customer"],
                status="complete",
                reserve_price_enabled=rdef["reserve_price_enabled"],
                master_file_uploaded=True,
                total_line_items=len(rdef["master_items"]),
                created_at=round_created,
                submission_deadline=round_closed,
            )
            db.add(r)
            db.flush()

            # Assign all buyers to round
            from sqlalchemy import text
            for b in buyers:
                db.execute(
                    text("INSERT INTO round_buyers (round_id, buyer_id, invite_status, invited_at) VALUES (:rid, :bid, 'uploaded', :ts)"),
                    {"rid": r.id, "bid": b.id, "ts": round_opened},
                )

            # Master items
            masters: list[MasterItem] = []
            for row_num, item in enumerate(rdef["master_items"], start=1):
                pn, desc, qty, reserve, *_ = item
                mi = MasterItem(
                    bid_round_id=r.id,
                    part_number=pn,
                    part_number_normalized=normalize_part_number(pn),
                    description=desc,
                    quantity=qty,
                    reserve_price=reserve if rdef["reserve_price_enabled"] else None,
                    row_number=row_num,
                )
                db.add(mi)
                masters.append(mi)
            db.flush()

            # BidFiles — one per buyer
            bid_files: list[BidFile | None] = []
            for b in buyers:
                bf = BidFile(
                    bid_round_id=r.id,
                    buyer_id=b.id,
                    filename=f"bid_{b.company_name.replace(' ', '_')}_{rdef['commodity']}.xlsx",
                    file_path=f"/tmp/{r.id}_{b.id}.xlsx",
                    status="processed",
                    lines_parsed=len(rdef["master_items"]),
                    uploaded_at=round_closed - timedelta(hours=random.randint(2, 24)),
                )
                db.add(bf)
                bid_files.append(bf)
            db.flush()

            # Build exception set: (part_number, buyer_idx, price)
            exception_set = {
                (pn, bidx): price
                for pn, bidx, price in rdef.get("exceptions", [])
            }

            # BidLines + winner selection
            for mi, item in zip(masters, rdef["master_items"]):
                bids_list = item[4]  # [b0_price, b1_price, b2_price, b3_price, b4_price]
                lines: list[BidLine] = []

                for bidx, (b, bf) in enumerate(zip(buyers, bid_files)):
                    price = bids_list[bidx] if bidx < len(bids_list) else None
                    if price is None:
                        continue

                    exc_key = (mi.part_number, bidx)
                    is_exception = exc_key in exception_set
                    exc_price = exception_set.get(exc_key)

                    actual_price = exc_price if is_exception else price

                    bl = BidLine(
                        bid_file_id=bf.id,
                        bid_round_id=r.id,
                        buyer_id=b.id,
                        master_item_id=mi.id,
                        raw_part_number=mi.part_number,
                        normalized_part_number=mi.part_number_normalized,
                        description=mi.description,
                        unit_price=actual_price,
                        quantity=mi.quantity,
                        match_status="exception" if is_exception else "matched",
                        match_method="exact",
                        match_score=100.0,
                        exception_type="below_reserve" if is_exception else None,
                        exception_notes=(
                            f"Bid ${actual_price:.2f} is below reserve ${mi.reserve_price:.2f}"
                            if is_exception else None
                        ),
                        exception_resolved=False,
                        row_number=bidx + 1,
                    )
                    db.add(bl)
                    if not is_exception:
                        lines.append(bl)
                db.flush()

                if not lines:
                    continue

                # Winner = highest price, tiebreak = earliest upload
                lines.sort(key=lambda l: (-l.unit_price, bid_files[buyers.index(
                    next(b for b in buyers if b.id == l.buyer_id)
                )].uploaded_at))
                winner = lines[0]
                winner.is_winner = True
                winner.real_winning_price = winner.unit_price

                # Fluff losing lines
                for loser in lines[1:]:
                    lb = next((b for b in buyers if b.id == loser.buyer_id), None)
                    fluff_pct = lb.fluff_percentage if lb and lb.fluff_enabled else 0.0
                    loser.fluffed_loss_price = round(winner.unit_price * (1 + fluff_pct / 100), 4)

                qty = mi.quantity or winner.quantity or 1
                deal = Deal(
                    bid_round_id=r.id,
                    master_item_id=mi.id,
                    winning_buyer_id=winner.buyer_id,
                    winning_bid_line_id=winner.id,
                    part_number=mi.part_number,
                    description=mi.description,
                    quantity=qty,
                    winning_price=winner.unit_price,
                    total_value=round(winner.unit_price * qty, 2),
                    status="approved",
                    approved_by=settings.ADMIN_EMAIL,
                    approved_at=round_done,
                    razor_push_status="success",
                    razor_deal_id=f"RZ-{r.id:02d}-{mi.id:04d}",
                    razor_pushed_at=round_done + timedelta(minutes=15),
                )
                db.add(deal)
                all_deals.append(deal)

            db.flush()
            deal_count = len([d for d in all_deals if d.bid_round_id == r.id])
            print(f"  Round '{r.name}': {len(masters)} items, {deal_count} deals")

        db.commit()

        # ── Open round (no bids yet) ──────────────────────────────────────────
        open_days = OPEN_ROUND_DEF["days_ago"]
        deadline = datetime.now(timezone.utc) + timedelta(days=7)
        ro = BidRound(
            name=OPEN_ROUND_DEF["name"],
            commodity=OPEN_ROUND_DEF["commodity"],
            customer=OPEN_ROUND_DEF["customer"],
            status="open",
            reserve_price_enabled=OPEN_ROUND_DEF["reserve_price_enabled"],
            master_file_uploaded=True,
            total_line_items=len(OPEN_ROUND_DEF["master_items"]),
            submission_deadline=deadline,
            created_at=ts(open_days),
        )
        db.add(ro)
        db.flush()

        for b in buyers:
            db.execute(
                text("INSERT INTO round_buyers (round_id, buyer_id, invite_status, invited_at) VALUES (:rid, :bid, 'sent', :ts)"),
                {"rid": ro.id, "bid": b.id, "ts": ts(open_days - 1)},
            )

        for row_num, item in enumerate(OPEN_ROUND_DEF["master_items"], start=1):
            pn, desc, qty, reserve = item
            db.add(MasterItem(
                bid_round_id=ro.id,
                part_number=pn,
                part_number_normalized=normalize_part_number(pn),
                description=desc,
                quantity=qty,
                reserve_price=reserve,
                row_number=row_num,
            ))

        db.commit()
        print(f"  Open round '{ro.name}': {len(OPEN_ROUND_DEF['master_items'])} items, awaiting bids")

        # ── Update buyer stats ────────────────────────────────────────────────
        db.expire_all()
        from collections import defaultdict
        buyer_wins: dict[int, int] = defaultdict(int)
        buyer_bids: dict[int, int] = defaultdict(int)
        buyer_margin: dict[int, float] = defaultdict(float)
        buyer_last_win: dict[int, datetime] = {}

        for deal in db.query(Deal).filter(Deal.status == "approved").all():
            buyer_wins[deal.winning_buyer_id] += 1
            mi = db.query(MasterItem).filter(MasterItem.id == deal.master_item_id).first()
            if mi and mi.reserve_price:
                buyer_margin[deal.winning_buyer_id] += max(
                    0.0, (deal.winning_price - mi.reserve_price) * deal.quantity
                )
            if (
                deal.winning_buyer_id not in buyer_last_win
                or deal.approved_at > buyer_last_win[deal.winning_buyer_id]
            ):
                buyer_last_win[deal.winning_buyer_id] = deal.approved_at

        for bl in db.query(BidLine).filter(BidLine.match_status == "matched").all():
            buyer_bids[bl.buyer_id] += 1

        for b in buyers:
            bids = buyer_bids.get(b.id, 0)
            wins = buyer_wins.get(b.id, 0)
            margin = buyer_margin.get(b.id, 0.0)
            win_rate = round(wins / bids, 4) if bids > 0 else 0.0
            last_win = buyer_last_win.get(b.id)

            b.total_lines_bid = bids
            b.total_lines_won = wins
            b.win_rate = win_rate
            b.total_margin_contribution = round(margin, 2)
            b.total_rounds_participated = len(ROUNDS_DEF)
            if last_win:
                b.last_win_date = last_win
                b.last_bid_at = last_win - timedelta(hours=2)

            # Composite score
            w_comp = win_rate * 45.0
            a_comp = min(30.0, math.log1p(bids) / math.log1p(1_000) * 30.0)
            m_comp = min(15.0, math.log1p(max(0.0, margin)) / math.log1p(100_000) * 15.0)
            r_comp = 0.0
            if last_win:
                days_since = max(0, (datetime.now(timezone.utc) - last_win).days)
                r_comp = max(0.0, 10.0 - days_since / 30.0)
            b.buyer_score = round(min(100.0, max(0.0, w_comp + a_comp + m_comp + r_comp)), 2)

        db.commit()

        total_deal_value = sum(d.total_value for d in db.query(Deal).all())
        deal_count_all = db.query(Deal).count()
        print(f"\n✓ Seed complete:")
        print(f"  {len(ROUNDS_DEF)} complete rounds + 1 open round")
        print(f"  {deal_count_all} approved deals, total value ${total_deal_value:,.2f}")
        print(f"  Admin: {settings.ADMIN_EMAIL} / {settings.ADMIN_PASSWORD}")
        print(f"  Buyers: buyer1@acmecorp.com … buyer5@cloudbridge.com / buyer123")

    finally:
        db.close()


if __name__ == "__main__":
    seed()
