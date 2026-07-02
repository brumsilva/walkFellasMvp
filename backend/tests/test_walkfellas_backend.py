"""walkFellas backend E2E tests — covers auth, catalog, shift, sales, waste, restock, close, dashboard."""
import os
import pytest
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://real-time-inventory-7.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"


def _post(path, json=None, token=None):
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return requests.post(f"{API}{path}", json=json, headers=h, timeout=30)


def _get(path, token=None, params=None):
    h = {}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return requests.get(f"{API}{path}", headers=h, params=params, timeout=30)


# ---------- session-scoped tokens ----------
@pytest.fixture(scope="session")
def admin_token():
    r = _post("/auth/staff/login", {"email": "admin@walkfellas.io", "password": "admin123"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def sup_token():
    r = _post("/auth/staff/login", {"email": "sup@walkfellas.io", "password": "sup123"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def walker_login():
    r = _post("/auth/walker/login", {"event_code": "FEST01", "pin": "1234"})
    assert r.status_code == 200, r.text
    d = r.json()
    return {"token": d["access_token"], "user": d["user"]}


# ---------- Auth ----------
class TestAuth:
    def test_walker_login_valid(self):
        r = _post("/auth/walker/login", {"event_code": "FEST01", "pin": "1234"})
        assert r.status_code == 200
        d = r.json()
        assert d["role"] == "walker"
        assert d["user"]["name"] == "Jake Miller"

    def test_walker_login_invalid_pin(self):
        r = _post("/auth/walker/login", {"event_code": "FEST01", "pin": "0000"})
        assert r.status_code == 401

    def test_walker_login_invalid_event(self):
        r = _post("/auth/walker/login", {"event_code": "NOPE", "pin": "1234"})
        assert r.status_code == 401

    def test_staff_login_admin(self, admin_token):
        assert admin_token

    def test_staff_login_supervisor(self, sup_token):
        assert sup_token

    def test_staff_login_bad_password(self):
        r = _post("/auth/staff/login", {"email": "admin@walkfellas.io", "password": "wrong"})
        assert r.status_code == 401

    def test_me_no_token(self):
        r = _get("/auth/me")
        assert r.status_code == 401

    def test_me_with_token(self, admin_token):
        r = _get("/auth/me", token=admin_token)
        assert r.status_code == 200
        assert r.json()["role"] == "admin"


# ---------- Read endpoints ----------
class TestReads:
    def test_events(self, sup_token):
        r = _get("/events", token=sup_token)
        assert r.status_code == 200
        codes = [e["code"] for e in r.json()]
        assert "FEST01" in codes

    def test_products(self, walker_login):
        r = _get("/products", token=walker_login["token"])
        assert r.status_code == 200
        assert len(r.json()) >= 6

    def test_walkers(self, sup_token):
        r = _get("/walkers", token=sup_token)
        assert r.status_code == 200
        assert len(r.json()) >= 3

    def test_walkers_forbidden_for_walker(self, walker_login):
        r = _get("/walkers", token=walker_login["token"])
        assert r.status_code == 403


# ---------- E2E flow ----------
@pytest.fixture(scope="session")
def e2e_ctx(admin_token, sup_token, walker_login):
    # Get walker's own info and products
    walker = walker_login["user"]
    products = _get("/products", token=walker_login["token"]).json()
    # Pick 2 products
    p1, p2 = products[0], products[1]
    # Supervisor assigns bag (10 each)
    r = _post("/shifts/assign-bag", {
        "walker_id": walker["id"],
        "items": [{"product_id": p1["id"], "quantity": 10}, {"product_id": p2["id"], "quantity": 10}],
    }, token=sup_token)
    assert r.status_code == 200, r.text
    shift = r.json()
    return {"walker": walker, "walker_token": walker_login["token"], "sup_token": sup_token,
            "admin_token": admin_token, "p1": p1, "p2": p2, "shift": shift}


class TestE2E:
    def test_current_shift_open(self, e2e_ctx):
        r = _get("/shifts/current", token=e2e_ctx["walker_token"])
        assert r.status_code == 200
        d = r.json()
        assert d["shift"]["status"] == "open"
        assert d["stock"][e2e_ctx["p1"]["id"]] == 10

    def test_sale_deducts_stock(self, e2e_ctx):
        r = _post("/sales", {"items": [{"product_id": e2e_ctx["p1"]["id"], "quantity": 3}]},
                  token=e2e_ctx["walker_token"])
        assert r.status_code == 200, r.text
        sale = r.json()
        assert sale["total"] == round(e2e_ctx["p1"]["price"] * 3, 2)
        # verify via current shift
        cur = _get("/shifts/current", token=e2e_ctx["walker_token"]).json()
        assert cur["stock"][e2e_ctx["p1"]["id"]] == 7

    def test_sale_insufficient_stock(self, e2e_ctx):
        r = _post("/sales", {"items": [{"product_id": e2e_ctx["p1"]["id"], "quantity": 999}]},
                  token=e2e_ctx["walker_token"])
        assert r.status_code == 400

    def test_restock_flow(self, e2e_ctx):
        # walker requests
        r = _post("/restocks", {"items": [{"product_id": e2e_ctx["p1"]["id"], "quantity": 5}]},
                  token=e2e_ctx["walker_token"])
        assert r.status_code == 200
        rid = r.json()["id"]
        # sup lists pending
        lst = _get("/restocks", token=e2e_ctx["sup_token"], params={"status_filter": "pending"}).json()
        assert any(x["id"] == rid for x in lst)
        # sup approves with delivered items
        r2 = _post(f"/restocks/{rid}/approve",
                   {"delivered_items": [{"product_id": e2e_ctx["p1"]["id"], "quantity": 5}]},
                   token=e2e_ctx["sup_token"])
        assert r2.status_code == 200
        cur = _get("/shifts/current", token=e2e_ctx["walker_token"]).json()
        assert cur["stock"][e2e_ctx["p1"]["id"]] == 12  # 7 + 5

    def test_waste_flow(self, e2e_ctx):
        r = _post("/waste", {"product_id": e2e_ctx["p2"]["id"], "quantity": 2,
                             "category": "broken", "photo_b64": "data:image/png;base64,AAAA"},
                  token=e2e_ctx["walker_token"])
        assert r.status_code == 200
        wid = r.json()["id"]
        # stock deducted provisionally
        cur = _get("/shifts/current", token=e2e_ctx["walker_token"]).json()
        assert cur["stock"][e2e_ctx["p2"]["id"]] == 8
        # sup approves
        r2 = _post(f"/waste/{wid}/validate", {"approved": True}, token=e2e_ctx["sup_token"])
        assert r2.status_code == 200
        # Test reject: log another and reject → stock restored
        r3 = _post("/waste", {"product_id": e2e_ctx["p2"]["id"], "quantity": 1, "category": "spilled"},
                   token=e2e_ctx["walker_token"])
        wid2 = r3.json()["id"]
        cur1 = _get("/shifts/current", token=e2e_ctx["walker_token"]).json()
        assert cur1["stock"][e2e_ctx["p2"]["id"]] == 7
        r4 = _post(f"/waste/{wid2}/validate", {"approved": False, "notes": "unclear"}, token=e2e_ctx["sup_token"])
        assert r4.status_code == 200
        cur2 = _get("/shifts/current", token=e2e_ctx["walker_token"]).json()
        assert cur2["stock"][e2e_ctx["p2"]["id"]] == 8  # restored

    def test_close_shift_discrepancy(self, e2e_ctx):
        # Current expected: p1=12, p2=8. Physical: p1=11 (short 1), p2=8 (match)
        r = _post("/shifts/close", {"physical_count": [
            {"product_id": e2e_ctx["p1"]["id"], "quantity": 11},
            {"product_id": e2e_ctx["p2"]["id"], "quantity": 8},
        ]}, token=e2e_ctx["walker_token"])
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["total_discrepancy"] == 1
        rec = {x["product_id"]: x for x in d["reconciliation"]}
        assert rec[e2e_ctx["p1"]["id"]]["discrepancy"] == -1
        assert rec[e2e_ctx["p2"]["id"]]["discrepancy"] == 0

    def test_dashboard(self, e2e_ctx):
        r = _get("/dashboard/overview", token=e2e_ctx["admin_token"])
        assert r.status_code == 200
        d = r.json()
        for k in ["total_sales", "total_units_sold", "total_waste_units",
                  "total_discrepancy", "active_shifts", "pending_restocks", "pending_waste"]:
            assert k in d
        assert d["total_sales"] > 0


# ---------- Terminal webhook + suggestions ----------
class TestTerminalAndSuggestions:
    @pytest.fixture(scope="class")
    def open_shift_ctx(self, sup_token):
        """Assign a fresh bag to Jake Miller with 20 units of first product, log in as Jake."""
        walkers = _get("/walkers", token=sup_token).json()
        walker = next(w for w in walkers if w["name"] == "Jake Miller")
        products = _get("/products", token=sup_token, params={"event_id": walker["event_id"]}).json()
        p1 = products[0]
        p2 = products[1]
        assign = _post(
            "/shifts/assign-bag",
            {"walker_id": walker["id"], "items": [
                {"product_id": p1["id"], "quantity": 20},
                {"product_id": p2["id"], "quantity": 10},
            ]},
            token=sup_token,
        )
        assert assign.status_code == 200, assign.text
        w_login = _post("/auth/walker/login", {"event_code": "FEST01", "pin": "1234"})
        return {"walker": walker, "token": w_login.json()["access_token"], "p1": p1, "p2": p2}

    def test_terminal_webhook_requires_signature(self, open_shift_ctx):
        r = requests.post(
            f"{API}/payments/terminal-webhook",
            json={"transaction_id": "TX-NOSIG-1", "walker_id": open_shift_ctx["walker"]["id"],
                  "items": [{"product_id": open_shift_ctx["p1"]["id"], "quantity": 1}], "amount": 6.5},
            timeout=30,
        )
        assert r.status_code == 401

    def test_terminal_simulate_creates_sale(self, open_shift_ctx):
        r = _post(
            "/payments/simulate-terminal",
            {"items": [{"product_id": open_shift_ctx["p1"]["id"], "quantity": 3}], "amount": 19.5},
            token=open_shift_ctx["token"],
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] is True
        assert d["duplicate"] is False
        assert d["sale"]["payment_method"] == "terminal"
        assert d["sale"]["total"] == 19.5
        assert d["sale"]["terminal_transaction_id"].startswith("SIM-")

    def test_restock_suggestions_reflect_sales(self, open_shift_ctx):
        r = _get("/restocks/suggestions", token=open_shift_ctx["token"])
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["shift_id"] is not None
        # p1 should show a positive suggested_qty because we sold 3 units in <15min window
        s = next(x for x in d["suggestions"] if x["product_id"] == open_shift_ctx["p1"]["id"])
        assert s["sold_last_window"] >= 3
        assert s["suggested_qty"] > 0

    def test_terminal_insufficient_stock(self, open_shift_ctx):
        r = _post(
            "/payments/simulate-terminal",
            {"items": [{"product_id": open_shift_ctx["p1"]["id"], "quantity": 9999}], "amount": 100.0},
            token=open_shift_ctx["token"],
        )
        assert r.status_code == 400
