"""walkFellas backend — mobile POS + distributed inventory operations."""
from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import OAuth2PasswordBearer
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from jose import jwt, JWTError
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Literal
from datetime import datetime, timedelta, timezone
from pathlib import Path
import os
import uuid
import secrets
import logging

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# Config
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ.get("DB_NAME", "walkfellas")
JWT_SECRET = os.environ.get("JWT_SECRET", "walkfellas-dev-secret-CHANGE-ME-in-prod")
JWT_ALGO = "HS256"
ACCESS_MIN = 12 * 60  # 12 hours (event-length shifts)
TERMINAL_SECRET = os.environ.get("TERMINAL_WEBHOOK_SECRET", "walkfellas-terminal-demo-secret")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/staff/login", auto_error=False)

app = FastAPI(title="walkFellas API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("walkfellas")


# ---------- Helpers ----------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return str(uuid.uuid4())


def hash_secret(v: str) -> str:
    return pwd.hash(v)


def verify_secret(v: str, h: str) -> bool:
    try:
        return pwd.verify(v, h)
    except Exception:
        return False


def make_token(user: dict) -> str:
    payload = {
        "sub": user["id"],
        "role": user["role"],
        "name": user.get("name", ""),
        "event_id": user.get("event_id", ""),
        "iat": now_utc(),
        "exp": now_utc() + timedelta(minutes=ACCESS_MIN),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


async def current_user(token: Optional[str] = Depends(oauth2)) -> dict:
    if not token:
        raise HTTPException(401, "Missing token")
    try:
        claims = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except JWTError:
        raise HTTPException(401, "Invalid token")
    user = await db.users.find_one({"id": claims["sub"]}, {"_id": 0, "password_hash": 0, "pin_hash": 0})
    if not user or user.get("status") != "active":
        raise HTTPException(401, "User inactive")
    return user


def require_roles(*roles):
    async def dep(user: dict = Depends(current_user)):
        if user["role"] not in roles:
            raise HTTPException(403, f"Requires role: {roles}")
        return user
    return dep


# ---------- Models ----------
class WalkerLogin(BaseModel):
    event_code: str
    pin: str


class StaffLogin(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    user: dict


class EventCreate(BaseModel):
    name: str
    venue: str
    code: str
    starts_at: Optional[datetime] = None


class ProductCreate(BaseModel):
    sku: str
    name: str
    price: float
    category: str = "beverage"
    event_id: str


class WalkerCreate(BaseModel):
    name: str
    event_id: str
    pin: str  # 4-6 digits


class StaffCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: Literal["supervisor", "admin"]


class BagAssignment(BaseModel):
    walker_id: str
    items: List[dict]  # [{product_id, quantity}]


class SaleItem(BaseModel):
    product_id: str
    quantity: int


class SaleCreate(BaseModel):
    items: List[SaleItem]
    payment_method: Literal["card", "cash", "mock_terminal"] = "mock_terminal"


class WasteCreate(BaseModel):
    product_id: str
    quantity: int
    category: Literal["broken", "spilled", "expired", "other"]
    photo_b64: Optional[str] = None
    notes: Optional[str] = None


class RestockCreate(BaseModel):
    items: List[SaleItem]


class RestockApprove(BaseModel):
    delivered_items: List[SaleItem]


class WasteValidate(BaseModel):
    approved: bool
    notes: Optional[str] = None


class CloseShift(BaseModel):
    physical_count: List[SaleItem]  # walker's final count per product


# ---------- Ledger helper ----------
async def record_movement(shift_id: str, product_id: str, qty: int, mtype: str, actor_id: str, ref: Optional[str] = None):
    await db.movements.insert_one({
        "id": new_id(),
        "shift_id": shift_id,
        "product_id": product_id,
        "quantity": qty,
        "type": mtype,  # initial | restock | sale | waste | return | adjustment
        "actor_id": actor_id,
        "ref_id": ref,
        "timestamp": now_utc().isoformat(),
    })


async def shift_stock_map(shift_id: str) -> dict:
    """Compute current stock per product from ledger."""
    stock: dict = {}
    async for m in db.movements.find({"shift_id": shift_id}, {"_id": 0}):
        pid = m["product_id"]
        sign = 1 if m["type"] in ("initial", "restock", "return_in") else -1
        stock[pid] = stock.get(pid, 0) + sign * int(m["quantity"])
    return stock


# ---------- Auth ----------
@api.post("/auth/walker/login", response_model=TokenOut)
async def walker_login(body: WalkerLogin):
    event = await db.events.find_one({"code": body.event_code.upper(), "active": True}, {"_id": 0})
    if not event:
        raise HTTPException(401, "Invalid event code or PIN")
    # Find any walker on this event whose PIN matches
    walker = None
    async for u in db.users.find({"event_id": event["id"], "role": "walker", "status": "active"}):
        if verify_secret(body.pin, u.get("pin_hash", "")):
            walker = u
            break
    if not walker:
        raise HTTPException(401, "Invalid event code or PIN")
    token = make_token(walker)
    safe = {k: v for k, v in walker.items() if k not in ("_id", "pin_hash", "password_hash")}
    return {"access_token": token, "role": "walker", "user": safe}


@api.post("/auth/staff/login", response_model=TokenOut)
async def staff_login(body: StaffLogin):
    user = await db.users.find_one({"email": body.email.lower(), "status": "active"}, {"_id": 0})
    if not user or user["role"] not in ("supervisor", "admin"):
        _ = verify_secret(body.password, "$2b$12$abcdefghijklmnopqrstuv")  # timing
        raise HTTPException(401, "Invalid credentials")
    if not verify_secret(body.password, user.get("password_hash", "")):
        raise HTTPException(401, "Invalid credentials")
    token = make_token(user)
    safe = {k: v for k, v in user.items() if k not in ("_id", "pin_hash", "password_hash")}
    return {"access_token": token, "role": user["role"], "user": safe}


@api.get("/auth/me")
async def me(user: dict = Depends(current_user)):
    return user


# ---------- Events (admin) ----------
@api.post("/events")
async def create_event(body: EventCreate, user=Depends(require_roles("admin"))):
    ev = body.dict()
    ev["code"] = ev["code"].upper()
    ev["id"] = new_id()
    ev["active"] = True
    ev["created_at"] = now_utc().isoformat()
    if ev.get("starts_at"):
        ev["starts_at"] = ev["starts_at"].isoformat()
    if await db.events.find_one({"code": ev["code"]}):
        raise HTTPException(400, "Event code already exists")
    await db.events.insert_one(ev)
    ev.pop("_id", None)
    return ev


@api.get("/events")
async def list_events(user=Depends(current_user)):
    events = await db.events.find({}, {"_id": 0}).to_list(1000)
    return events


# ---------- Products / Catalog ----------
@api.post("/products")
async def create_product(body: ProductCreate, user=Depends(require_roles("admin"))):
    p = body.dict()
    p["id"] = new_id()
    p["created_at"] = now_utc().isoformat()
    await db.products.insert_one(p)
    p.pop("_id", None)
    return p


@api.get("/products")
async def list_products(event_id: Optional[str] = None, user=Depends(current_user)):
    q = {}
    if event_id:
        q["event_id"] = event_id
    elif user["role"] == "walker":
        q["event_id"] = user["event_id"]
    return await db.products.find(q, {"_id": 0}).to_list(1000)


# ---------- Walker management ----------
@api.post("/walkers")
async def create_walker(body: WalkerCreate, user=Depends(require_roles("admin", "supervisor"))):
    if not (4 <= len(body.pin) <= 6) or not body.pin.isdigit():
        raise HTTPException(400, "PIN must be 4-6 digits")
    ev = await db.events.find_one({"id": body.event_id})
    if not ev:
        raise HTTPException(404, "Event not found")
    walker = {
        "id": new_id(),
        "role": "walker",
        "name": body.name,
        "event_id": body.event_id,
        "pin_hash": hash_secret(body.pin),
        "status": "active",
        "created_at": now_utc().isoformat(),
    }
    await db.users.insert_one(walker)
    return {"id": walker["id"], "name": walker["name"], "event_id": walker["event_id"], "pin_hint": body.pin[:1] + "***"}


@api.post("/staff")
async def create_staff(body: StaffCreate, user=Depends(require_roles("admin"))):
    if await db.users.find_one({"email": body.email.lower()}):
        raise HTTPException(400, "Email exists")
    u = {
        "id": new_id(),
        "role": body.role,
        "name": body.name,
        "email": body.email.lower(),
        "password_hash": hash_secret(body.password),
        "status": "active",
        "created_at": now_utc().isoformat(),
    }
    await db.users.insert_one(u)
    return {"id": u["id"], "email": u["email"], "role": u["role"]}


@api.get("/walkers")
async def list_walkers(event_id: Optional[str] = None, user=Depends(require_roles("admin", "supervisor"))):
    q = {"role": "walker"}
    if event_id:
        q["event_id"] = event_id
    return await db.users.find(q, {"_id": 0, "pin_hash": 0}).to_list(1000)


# ---------- Shifts ----------
@api.post("/shifts/assign-bag")
async def assign_bag(body: BagAssignment, user=Depends(require_roles("supervisor", "admin"))):
    walker = await db.users.find_one({"id": body.walker_id, "role": "walker"})
    if not walker:
        raise HTTPException(404, "Walker not found")
    # Close any open shift for this walker
    await db.shifts.update_many(
        {"walker_id": body.walker_id, "status": "open"},
        {"$set": {"status": "abandoned", "closed_at": now_utc().isoformat()}}
    )
    shift = {
        "id": new_id(),
        "walker_id": body.walker_id,
        "walker_name": walker["name"],
        "event_id": walker["event_id"],
        "supervisor_id": user["id"],
        "status": "open",
        "opened_at": now_utc().isoformat(),
    }
    await db.shifts.insert_one(shift)
    for it in body.items:
        await record_movement(shift["id"], it["product_id"], int(it["quantity"]), "initial", user["id"])
    shift.pop("_id", None)
    return shift


@api.get("/shifts/current")
async def current_shift(user: dict = Depends(current_user)):
    if user["role"] != "walker":
        raise HTTPException(403, "Walkers only")
    shift = await db.shifts.find_one({"walker_id": user["id"], "status": "open"}, {"_id": 0})
    if not shift:
        return {"shift": None, "stock": {}}
    stock = await shift_stock_map(shift["id"])
    return {"shift": shift, "stock": stock}


@api.get("/shifts/{shift_id}/movements")
async def shift_movements(shift_id: str, user=Depends(current_user)):
    return await db.movements.find({"shift_id": shift_id}, {"_id": 0}).sort("timestamp", -1).to_list(2000)


# ---------- Sales (walker) ----------
@api.post("/sales")
async def create_sale(body: SaleCreate, user=Depends(require_roles("walker"))):
    shift = await db.shifts.find_one({"walker_id": user["id"], "status": "open"})
    if not shift:
        raise HTTPException(400, "No open shift")
    stock = await shift_stock_map(shift["id"])
    # Validate stock
    for it in body.items:
        if stock.get(it.product_id, 0) < it.quantity:
            raise HTTPException(400, f"Insufficient stock for {it.product_id}")
    total = 0.0
    product_lookup = {p["id"]: p async for p in db.products.find({"event_id": user["event_id"]})}
    sale = {
        "id": new_id(),
        "shift_id": shift["id"],
        "walker_id": user["id"],
        "event_id": user["event_id"],
        "payment_method": body.payment_method,
        "items": [it.dict() for it in body.items],
        "timestamp": now_utc().isoformat(),
    }
    for it in body.items:
        p = product_lookup.get(it.product_id)
        if p:
            total += p["price"] * it.quantity
        await record_movement(shift["id"], it.product_id, it.quantity, "sale", user["id"], sale["id"])
    sale["total"] = round(total, 2)
    await db.sales.insert_one(sale)
    sale.pop("_id", None)
    return sale


# ---------- Waste (walker → supervisor validates) ----------
@api.post("/waste")
async def log_waste(body: WasteCreate, user=Depends(require_roles("walker"))):
    shift = await db.shifts.find_one({"walker_id": user["id"], "status": "open"})
    if not shift:
        raise HTTPException(400, "No open shift")
    w = body.dict()
    w["id"] = new_id()
    w["shift_id"] = shift["id"]
    w["walker_id"] = user["id"]
    w["walker_name"] = user["name"]
    w["event_id"] = user["event_id"]
    w["status"] = "pending"
    w["timestamp"] = now_utc().isoformat()
    await db.waste_logs.insert_one(w)
    # Provisionally record ledger — deducts on log; adjust on reject
    await record_movement(shift["id"], body.product_id, body.quantity, "waste", user["id"], w["id"])
    w.pop("_id", None)
    return w


@api.get("/waste")
async def list_waste(status_filter: Optional[str] = None, event_id: Optional[str] = None, user=Depends(current_user)):
    q = {}
    if user["role"] == "walker":
        q["walker_id"] = user["id"]
    if status_filter:
        q["status"] = status_filter
    if event_id:
        q["event_id"] = event_id
    return await db.waste_logs.find(q, {"_id": 0}).sort("timestamp", -1).to_list(500)


@api.post("/waste/{waste_id}/validate")
async def validate_waste(waste_id: str, body: WasteValidate, user=Depends(require_roles("supervisor", "admin"))):
    w = await db.waste_logs.find_one({"id": waste_id})
    if not w:
        raise HTTPException(404, "Not found")
    new_status = "approved" if body.approved else "rejected"
    await db.waste_logs.update_one(
        {"id": waste_id},
        {"$set": {"status": new_status, "validated_by": user["id"], "validated_at": now_utc().isoformat(), "supervisor_notes": body.notes}}
    )
    if not body.approved:
        # Reverse the waste deduction (put back into stock as adjustment)
        await record_movement(w["shift_id"], w["product_id"], w["quantity"], "return_in", user["id"], w["id"])
    return {"ok": True, "status": new_status}


# ---------- Restocks ----------
@api.post("/restocks")
async def request_restock(body: RestockCreate, user=Depends(require_roles("walker"))):
    shift = await db.shifts.find_one({"walker_id": user["id"], "status": "open"})
    if not shift:
        raise HTTPException(400, "No open shift")
    r = {
        "id": new_id(),
        "shift_id": shift["id"],
        "walker_id": user["id"],
        "walker_name": user["name"],
        "event_id": user["event_id"],
        "items": [it.dict() for it in body.items],
        "status": "pending",
        "created_at": now_utc().isoformat(),
    }
    await db.restocks.insert_one(r)
    r.pop("_id", None)
    return r


@api.get("/restocks")
async def list_restocks(status_filter: Optional[str] = None, event_id: Optional[str] = None, user=Depends(current_user)):
    q = {}
    if user["role"] == "walker":
        q["walker_id"] = user["id"]
    if status_filter:
        q["status"] = status_filter
    if event_id:
        q["event_id"] = event_id
    return await db.restocks.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)


@api.post("/restocks/{restock_id}/approve")
async def approve_restock(restock_id: str, body: RestockApprove, user=Depends(require_roles("supervisor", "admin"))):
    r = await db.restocks.find_one({"id": restock_id})
    if not r:
        raise HTTPException(404, "Not found")
    if r["status"] != "pending":
        raise HTTPException(400, "Already processed")
    await db.restocks.update_one(
        {"id": restock_id},
        {"$set": {"status": "delivered", "delivered_items": [it.dict() for it in body.delivered_items],
                  "delivered_by": user["id"], "delivered_at": now_utc().isoformat()}}
    )
    for it in body.delivered_items:
        await record_movement(r["shift_id"], it.product_id, it.quantity, "restock", user["id"], restock_id)
    return {"ok": True}


@api.post("/restocks/{restock_id}/reject")
async def reject_restock(restock_id: str, user=Depends(require_roles("supervisor", "admin"))):
    await db.restocks.update_one({"id": restock_id}, {"$set": {"status": "rejected", "delivered_by": user["id"], "delivered_at": now_utc().isoformat()}})
    return {"ok": True}


# ---------- Restock auto-suggestions (business enhancement) ----------
@api.get("/restocks/suggestions")
async def restock_suggestions(user=Depends(require_roles("walker"))):
    """Suggest restock quantities based on recent sales pace.

    Formula:
      rate_per_min = units_sold_in_last_15min / minutes_elapsed
      target_next_30min = ceil(rate_per_min * 30)
      suggestion = max(0, target_next_30min - current_stock)
    """
    from math import ceil
    shift = await db.shifts.find_one({"walker_id": user["id"], "status": "open"})
    if not shift:
        return {"shift_id": None, "suggestions": []}

    shift_id = shift["id"]
    opened_at = datetime.fromisoformat(shift["opened_at"])
    now = now_utc()
    total_minutes = max(1, int((now - opened_at).total_seconds() / 60))
    window_minutes = min(15, total_minutes)
    window_start = (now - timedelta(minutes=window_minutes)).isoformat()

    # Current stock per product
    stock = await shift_stock_map(shift_id)

    # Sales in the window (movements with type=sale)
    window_sales: dict = {}
    async for m in db.movements.find({
        "shift_id": shift_id,
        "type": "sale",
        "timestamp": {"$gte": window_start},
    }):
        pid = m["product_id"]
        window_sales[pid] = window_sales.get(pid, 0) + int(m["quantity"])

    products = {p["id"]: p async for p in db.products.find({"event_id": user["event_id"]})}
    suggestions = []
    for pid, prod in products.items():
        sold = window_sales.get(pid, 0)
        rate_per_min = sold / window_minutes if window_minutes > 0 else 0
        target = ceil(rate_per_min * 30)
        current = int(stock.get(pid, 0))
        suggested = max(0, target - current)
        suggestions.append({
            "product_id": pid,
            "sku": prod["sku"],
            "name": prod["name"],
            "current_stock": current,
            "sold_last_window": sold,
            "window_minutes": window_minutes,
            "rate_per_min": round(rate_per_min, 2),
            "suggested_qty": suggested,
        })
    # Sort: highest suggestion first
    suggestions.sort(key=lambda s: (-s["suggested_qty"], s["sku"]))
    return {"shift_id": shift_id, "window_minutes": window_minutes, "suggestions": suggestions}


# ---------- Payment terminal webhook (Phase 3 — simulated) ----------
class TerminalWebhook(BaseModel):
    transaction_id: str
    walker_id: str
    items: List[SaleItem]
    amount: float
    timestamp: Optional[str] = None
    terminal_id: Optional[str] = "TERMINAL-01"


from fastapi import Header


@api.post("/payments/terminal-webhook")
async def terminal_webhook(
    body: TerminalWebhook,
    x_terminal_signature: str = Header(default=""),
):
    """External payment terminal callback.

    Auth: shared secret in `X-Terminal-Signature` header.
    Idempotent by `transaction_id`. Auto-deducts stock via ledger.
    """
    if x_terminal_signature != TERMINAL_SECRET:
        raise HTTPException(401, "Invalid terminal signature")

    existing = await db.sales.find_one({"terminal_transaction_id": body.transaction_id}, {"_id": 0})
    if existing:
        return {"ok": True, "duplicate": True, "sale": existing}

    walker = await db.users.find_one({"id": body.walker_id, "role": "walker", "status": "active"})
    if not walker:
        raise HTTPException(404, "Walker not found")

    shift = await db.shifts.find_one({"walker_id": body.walker_id, "status": "open"})
    if not shift:
        raise HTTPException(400, "Walker has no open shift")

    stock = await shift_stock_map(shift["id"])
    for it in body.items:
        if stock.get(it.product_id, 0) < it.quantity:
            raise HTTPException(400, f"Insufficient stock for {it.product_id}")

    sale = {
        "id": new_id(),
        "shift_id": shift["id"],
        "walker_id": body.walker_id,
        "event_id": walker["event_id"],
        "payment_method": "terminal",
        "terminal_id": body.terminal_id,
        "terminal_transaction_id": body.transaction_id,
        "items": [it.dict() for it in body.items],
        "total": round(body.amount, 2),
        "timestamp": body.timestamp or now_utc().isoformat(),
    }
    for it in body.items:
        await record_movement(shift["id"], it.product_id, it.quantity, "sale", "terminal", sale["id"])
    await db.sales.insert_one(sale)
    sale.pop("_id", None)
    return {"ok": True, "duplicate": False, "sale": sale}


class TerminalSimReq(BaseModel):
    items: List[SaleItem]
    amount: float


@api.post("/payments/simulate-terminal")
async def simulate_terminal(body: TerminalSimReq, user=Depends(require_roles("walker"))):
    """Demo helper: walker's device simulates the terminal firing the webhook.

    In production, a real card terminal would POST to /payments/terminal-webhook
    directly with the shared secret. This endpoint lets the app demonstrate the
    same flow end-to-end without hardware.
    """
    transaction_id = f"SIM-{new_id()[:8].upper()}"
    body_dict = TerminalWebhook(
        transaction_id=transaction_id,
        walker_id=user["id"],
        items=body.items,
        amount=body.amount,
        timestamp=now_utc().isoformat(),
        terminal_id="SIM-TERMINAL",
    )
    # Invoke internally (bypass network) with correct signature
    return await terminal_webhook(body_dict, x_terminal_signature=TERMINAL_SECRET)


# ---------- Close shift + reconciliation ----------
@api.post("/shifts/close")
async def close_shift(body: CloseShift, user=Depends(require_roles("walker"))):
    shift = await db.shifts.find_one({"walker_id": user["id"], "status": "open"})
    if not shift:
        raise HTTPException(400, "No open shift")
    expected = await shift_stock_map(shift["id"])
    physical = {it.product_id: it.quantity for it in body.physical_count}
    all_pids = set(expected.keys()) | set(physical.keys())
    reconciliation = []
    total_discrepancy = 0
    for pid in all_pids:
        exp = int(expected.get(pid, 0))
        phy = int(physical.get(pid, 0))
        disc = phy - exp
        total_discrepancy += abs(disc)
        reconciliation.append({"product_id": pid, "expected": exp, "physical": phy, "discrepancy": disc})
        # Return whatever is physically returned as "return_in" (closes ledger)
        if phy > 0:
            await record_movement(shift["id"], pid, phy, "return_in", user["id"], "close-out")
        if disc != 0:
            await record_movement(shift["id"], pid, abs(disc), "discrepancy", user["id"], "close-out")
    await db.shifts.update_one(
        {"id": shift["id"]},
        {"$set": {
            "status": "closed_pending_review",
            "closed_at": now_utc().isoformat(),
            "reconciliation": reconciliation,
            "total_discrepancy": total_discrepancy,
        }}
    )
    return {"ok": True, "reconciliation": reconciliation, "total_discrepancy": total_discrepancy}


@api.post("/shifts/{shift_id}/confirm")
async def confirm_shift(shift_id: str, user=Depends(require_roles("supervisor", "admin"))):
    await db.shifts.update_one(
        {"id": shift_id},
        {"$set": {"status": "closed", "confirmed_by": user["id"], "confirmed_at": now_utc().isoformat()}}
    )
    return {"ok": True}


@api.get("/shifts")
async def list_shifts(event_id: Optional[str] = None, status_filter: Optional[str] = None, user=Depends(require_roles("supervisor", "admin"))):
    q = {}
    if event_id:
        q["event_id"] = event_id
    if status_filter:
        q["status"] = status_filter
    return await db.shifts.find(q, {"_id": 0}).sort("opened_at", -1).to_list(500)


# ---------- Dashboard (admin/supervisor) ----------
@api.get("/dashboard/overview")
async def dashboard(event_id: Optional[str] = None, user=Depends(require_roles("admin", "supervisor"))):
    q_ev = {"event_id": event_id} if event_id else {}
    # Sales aggregate
    total_sales = 0.0
    total_units_sold = 0
    async for s in db.sales.find(q_ev, {"_id": 0}):
        total_sales += float(s.get("total", 0))
        for it in s.get("items", []):
            total_units_sold += int(it.get("quantity", 0))
    # Waste
    total_waste_units = 0
    async for w in db.waste_logs.find({**q_ev, "status": {"$ne": "rejected"}}, {"_id": 0}):
        total_waste_units += int(w.get("quantity", 0))
    # Discrepancy
    total_discrepancy = 0
    async for s in db.shifts.find({**q_ev, "status": {"$in": ["closed", "closed_pending_review"]}}, {"_id": 0}):
        total_discrepancy += int(s.get("total_discrepancy", 0))
    # Active walkers
    active_shifts = await db.shifts.count_documents({**q_ev, "status": "open"})
    pending_restocks = await db.restocks.count_documents({**q_ev, "status": "pending"})
    pending_waste = await db.waste_logs.count_documents({**q_ev, "status": "pending"})
    return {
        "total_sales": round(total_sales, 2),
        "total_units_sold": total_units_sold,
        "total_waste_units": total_waste_units,
        "total_discrepancy": total_discrepancy,
        "active_shifts": active_shifts,
        "pending_restocks": pending_restocks,
        "pending_waste": pending_waste,
    }


@api.get("/dashboard/active-walkers")
async def active_walkers(event_id: Optional[str] = None, user=Depends(require_roles("admin", "supervisor"))):
    q = {"status": "open"}
    if event_id:
        q["event_id"] = event_id
    out = []
    async for s in db.shifts.find(q, {"_id": 0}):
        stock = await shift_stock_map(s["id"])
        units = sum(stock.values())
        out.append({**s, "current_units": units})
    return out


# ---------- Seed ----------
@api.post("/seed")
async def seed_data():
    """Idempotent seed for demo/testing."""
    # Admin
    admin_email = "admin@walkfellas.io"
    if not await db.users.find_one({"email": admin_email}):
        await db.users.insert_one({
            "id": new_id(), "role": "admin", "name": "Admin",
            "email": admin_email, "password_hash": hash_secret("admin123"),
            "status": "active", "created_at": now_utc().isoformat(),
        })
    # Supervisor
    sup_email = "sup@walkfellas.io"
    if not await db.users.find_one({"email": sup_email}):
        await db.users.insert_one({
            "id": new_id(), "role": "supervisor", "name": "Sarah Chen",
            "email": sup_email, "password_hash": hash_secret("sup123"),
            "status": "active", "created_at": now_utc().isoformat(),
        })
    # Event
    event = await db.events.find_one({"code": "FEST01"})
    if not event:
        event = {
            "id": new_id(), "name": "Summer Festival 2026",
            "venue": "Dublin Arena", "code": "FEST01",
            "active": True, "created_at": now_utc().isoformat(),
        }
        await db.events.insert_one(event)
    event_id = event["id"]
    # Products
    if await db.products.count_documents({"event_id": event_id}) == 0:
        catalog = [
            ("BEER-500", "Craft Lager 500ml", 6.50, "beer"),
            ("BEER-CIDER", "Cider 500ml", 7.00, "beer"),
            ("WINE-RED", "Red Wine Cup", 8.00, "wine"),
            ("WATER-500", "Water 500ml", 3.00, "water"),
            ("SODA-COLA", "Cola 330ml", 4.00, "soda"),
            ("SNACK-CHIPS", "Chips Pack", 5.00, "snack"),
        ]
        for sku, name, price, cat in catalog:
            await db.products.insert_one({
                "id": new_id(), "sku": sku, "name": name, "price": price,
                "category": cat, "event_id": event_id,
                "created_at": now_utc().isoformat(),
            })
    # Walker(s)
    if await db.users.count_documents({"role": "walker", "event_id": event_id}) == 0:
        for name, pin in [("Jake Miller", "1234"), ("Luca Rossi", "5678"), ("Maya Silva", "9012")]:
            await db.users.insert_one({
                "id": new_id(), "role": "walker", "name": name,
                "event_id": event_id, "pin_hash": hash_secret(pin),
                "status": "active", "created_at": now_utc().isoformat(),
            })
    return {"ok": True, "event_code": "FEST01"}


@api.get("/")
async def root():
    return {"service": "walkFellas", "version": "1.0"}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup():
    await db.events.create_index("code", unique=True)
    await db.users.create_index("email", unique=True, sparse=True)
    await db.users.create_index([("event_id", 1), ("role", 1)])
    await db.products.create_index([("event_id", 1), ("sku", 1)])
    await db.movements.create_index([("shift_id", 1), ("timestamp", -1)])
    # Auto-seed on startup
    try:
        await seed_data()
        log.info("Seed complete")
    except Exception as e:
        log.warning(f"Seed skipped: {e}")


@app.on_event("shutdown")
async def on_shutdown():
    client.close()
