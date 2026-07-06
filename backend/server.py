"\"\"\"walkFellas backend — mobile POS + distributed inventory operations.
Data layer: Supabase PostgreSQL via PostgREST REST API.
\"\"\"
from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Request, Header
from fastapi.security import OAuth2PasswordBearer
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
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

import revolut_service as revolut
from supabase_db import SupabaseDB

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / \".env\")

# Config
SUPABASE_URL = os.environ[\"SUPABASE_URL\"]
SUPABASE_KEY = os.environ[\"SUPABASE_SERVICE_KEY\"]
JWT_SECRET = os.environ.get(\"JWT_SECRET\", \"walkfellas-dev-secret-CHANGE-ME-in-prod\")
JWT_ALGO = \"HS256\"
ACCESS_MIN = 12 * 60  # 12 hours (event-length shifts)
TERMINAL_SECRET = os.environ.get(\"TERMINAL_WEBHOOK_SECRET\", \"walkfellas-terminal-demo-secret\")
TERMS_VERSION = os.environ.get(\"TERMS_VERSION\", \"2026.1\")

db = SupabaseDB(SUPABASE_URL, SUPABASE_KEY)

pwd = CryptContext(schemes=[\"bcrypt\"], deprecated=\"auto\")
oauth2 = OAuth2PasswordBearer(tokenUrl=\"/api/auth/staff/login\", auto_error=False)

app = FastAPI(title=\"walkFellas API\")
api = APIRouter(prefix=\"/api\")

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(\"walkfellas\")


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
        \"sub\": user[\"id\"],
        \"role\": user[\"role\"],
        \"name\": user.get(\"name\", \"\"),
        \"event_id\": user.get(\"event_id\", \"\"),
        \"iat\": now_utc(),
        \"exp\": now_utc() + timedelta(minutes=ACCESS_MIN),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


async def current_user(token: Optional[str] = Depends(oauth2)) -> dict:
    if not token:
        raise HTTPException(401, \"Missing token\")
    try:
        claims = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except JWTError:
        raise HTTPException(401, \"Invalid token\")
    user = await db.find_one(\"users\", {\"id\": claims[\"sub\"]}, exclude=[\"password_hash\", \"pin_hash\"])
    if not user or user.get(\"status\") != \"active\":
        raise HTTPException(401, \"User inactive\")
    return user


def require_roles(*roles):
    async def dep(user: dict = Depends(current_user)):
        if user[\"role\"] not in roles:
            raise HTTPException(403, f\"Requires role: {roles}\")
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
    token_type: str = \"bearer\"
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
    category: str = \"beverage\"
    event_id: str


class WalkerCreate(BaseModel):
    name: str
    event_id: str
    pin: str  # 4-6 digits
    terminal_code: Optional[str] = None


class TerminalAssign(BaseModel):
    terminal_code: str
    revolut_terminal_id: Optional[str] = None


class StaffCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: Literal[\"supervisor\", \"admin\"]


class BagAssignment(BaseModel):
    walker_id: str
    items: List[dict]  # [{product_id, quantity}]


class SaleItem(BaseModel):
    product_id: str
    quantity: int


class SaleCreate(BaseModel):
    items: List[SaleItem]
    payment_method: Literal[\"card\", \"cash\", \"mock_terminal\"] = \"mock_terminal\"


class WasteCreate(BaseModel):
    product_id: str
    quantity: int
    category: Literal[\"broken\", \"spilled\", \"expired\", \"other\"]
    photo_b64: Optional[str] = None
    notes: Optional[str] = None


class RestockCreate(BaseModel):
    items: List[SaleItem]


class RestockApprove(BaseModel):
    delivered_items: List[SaleItem]


class RevolutChargeCreate(BaseModel):
    items: List[SaleItem]
    amount: float


class WasteValidate(BaseModel):
    approved: bool
    notes: Optional[str] = None


class CloseShift(BaseModel):
    physical_count: List[SaleItem]


# ---------- Ledger helper ----------
async def record_movement(shift_id: str, product_id: str, qty: int, mtype: str, actor_id: str, ref: Optional[str] = None):
    await db.insert_one(\"movements\", {
        \"id\": new_id(),
        \"shift_id\": shift_id,
        \"product_id\": product_id,
        \"quantity\": qty,
        \"type\": mtype,
        \"actor_id\": actor_id,
        \"ref_id\": ref,
        \"timestamp\": now_utc().isoformat(),
    })


async def shift_stock_map(shift_id: str) -> dict:
    \"\"\"Compute current stock per product from ledger.\"\"\"
    movements = await db.find(\"movements\", {\"shift_id\": shift_id})
    stock: dict = {}
    for m in movements:
        pid = m[\"product_id\"]
        sign = 1 if m[\"type\"] in (\"initial\", \"restock\", \"return_in\") else -1
        stock[pid] = stock.get(pid, 0) + sign * int(m[\"quantity\"])
    return stock


# ---------- Auth ----------
@api.post(\"/auth/walker/login\", response_model=TokenOut)
async def walker_login(body: WalkerLogin):
    event = await db.find_one(\"events\", {\"code\": body.event_code.upper(), \"active\": True})
    if not event:
        raise HTTPException(401, \"Invalid event code or PIN\")
    walkers = await db.find(\"users\", {\"event_id\": event[\"id\"], \"role\": \"walker\", \"status\": \"active\"})
    walker = None
    for u in walkers:
        if verify_secret(body.pin, u.get(\"pin_hash\", \"\")):
            walker = u
            break
    if not walker:
        raise HTTPException(401, \"Invalid event code or PIN\")
    token = make_token(walker)
    safe = {k: v for k, v in walker.items() if k not in (\"pin_hash\", \"password_hash\")}
    return {\"access_token\": token, \"role\": \"walker\", \"user\": safe}


@api.post(\"/auth/staff/login\", response_model=TokenOut)
async def staff_login(body: StaffLogin):
    user = await db.find_one(\"users\", {\"email\": body.email.lower(), \"status\": \"active\"})
    if not user or user[\"role\"] not in (\"supervisor\", \"admin\"):
        _ = verify_secret(body.password, \"$2b$12$abcdefghijklmnopqrstuv\")
        raise HTTPException(401, \"Invalid credentials\")
    if not verify_secret(body.password, user.get(\"password_hash\", \"\")):
        raise HTTPException(401, \"Invalid credentials\")
    token = make_token(user)
    safe = {k: v for k, v in user.items() if k not in (\"pin_hash\", \"password_hash\")}
    return {\"access_token\": token, \"role\": user[\"role\"], \"user\": safe}


@api.get(\"/auth/me\")
async def me(user: dict = Depends(current_user)):
    return user


@api.post(\"/auth/walker/accept-terms\")
async def accept_walker_terms(user: dict = Depends(require_roles(\"walker\"))):
    accepted_at = now_utc().isoformat()
    await db.update_one(\"users\", {\"id\": user[\"id\"]}, {
        \"terms_accepted_at\": accepted_at,
        \"terms_version\": TERMS_VERSION,
    })
    return {\"ok\": True, \"terms_accepted_at\": accepted_at, \"terms_version\": TERMS_VERSION}


# ---------- Events (admin) ----------
@api.post(\"/events\")
async def create_event(body: EventCreate, user=Depends(require_roles(\"admin\"))):
    ev = body.dict()
    ev[\"code\"] = ev[\"code\"].upper()
    ev[\"id\"] = new_id()
    ev[\"active\"] = True
    ev[\"created_at\"] = now_utc().isoformat()
    if ev.get(\"starts_at\"):
        ev[\"starts_at\"] = ev[\"starts_at\"].isoformat()
    if await db.find_one(\"events\", {\"code\": ev[\"code\"]}):
        raise HTTPException(400, \"Event code already exists\")
    await db.insert_one(\"events\", ev)
    return ev


@api.get(\"/events\")
async def list_events(user=Depends(current_user)):
    return await db.find(\"events\")


class EventUpdate(BaseModel):
    name: Optional[str] = None
    venue: Optional[str] = None
    code: Optional[str] = None


@api.put(\"/events/{event_id}\")
async def update_event(event_id: str, body: EventUpdate, user=Depends(require_roles(\"admin\"))):
    ev = await db.find_one(\"events\", {\"id\": event_id})
    if not ev:
        raise HTTPException(404, \"Event not found\")
    updates = {k: v for k, v in body.dict().items() if v is not None}
    if \"code\" in updates:
        updates[\"code\"] = updates[\"code\"].upper()
        clash = await db.find_one(\"events\", {\"code\": updates[\"code\"], \"id\": {\"$ne\": event_id}})
        if clash:
            raise HTTPException(400, \"Event code already exists\")
    if updates:
        await db.update_one(\"events\", {\"id\": event_id}, updates)
    return await db.find_one(\"events\", {\"id\": event_id})


# ---------- Products / Catalog ----------
@api.post(\"/products\")
async def create_product(body: ProductCreate, user=Depends(require_roles(\"admin\"))):
    p = body.dict()
    p[\"id\"] = new_id()
    p[\"created_at\"] = now_utc().isoformat()
    await db.insert_one(\"products\", p)
    return p


@api.get(\"/products\")
async def list_products(event_id: Optional[str] = None, user=Depends(current_user)):
    q: dict = {}
    if event_id:
        q[\"event_id\"] = event_id
    elif user[\"role\"] == \"walker\":
        q[\"event_id\"] = user[\"event_id\"]
    return await db.find(\"products\", q if q else None)


class ProductUpdate(BaseModel):
    sku: Optional[str] = None
    name: Optional[str] = None
    price: Optional[float] = None
    category: Optional[str] = None


@api.put(\"/products/{product_id}\")
async def update_product(product_id: str, body: ProductUpdate, user=Depends(require_roles(\"admin\"))):
    p = await db.find_one(\"products\", {\"id\": product_id})
    if not p:
        raise HTTPException(404, \"Product not found\")
    updates = {k: v for k, v in body.dict().items() if v is not None}
    if \"sku\" in updates:
        updates[\"sku\"] = updates[\"sku\"].upper()
    if updates:
        await db.update_one(\"products\", {\"id\": product_id}, updates)
    return await db.find_one(\"products\", {\"id\": product_id})


# ---------- Walker management ----------
@api.post(\"/walkers\")
async def create_walker(body: WalkerCreate, user=Depends(require_roles(\"admin\", \"supervisor\"))):
    if not (4 <= len(body.pin) <= 6) or not body.pin.isdigit():
        raise HTTPException(400, \"PIN must be 4-6 digits\")
    ev = await db.find_one(\"events\", {\"id\": body.event_id})
    if not ev:
        raise HTTPException(404, \"Event not found\")
    walker = {
        \"id\": new_id(),
        \"role\": \"walker\",
        \"name\": body.name,
        \"event_id\": body.event_id,
        \"pin_hash\": hash_secret(body.pin),
        \"terminal_code\": body.terminal_code.upper() if body.terminal_code else None,
        \"terms_accepted_at\": None,
        \"terms_version\": None,
        \"status\": \"active\",
        \"created_at\": now_utc().isoformat(),
    }
    await db.insert_one(\"users\", walker)
    return {\"id\": walker[\"id\"], \"name\": walker[\"name\"], \"event_id\": walker[\"event_id\"], \"pin_hint\": body.pin[:1] + \"***\"}


@api.post(\"/staff\")
async def create_staff(body: StaffCreate, user=Depends(require_roles(\"admin\"))):
    if await db.find_one(\"users\", {\"email\": body.email.lower()}):
        raise HTTPException(400, \"Email exists\")
    u = {
        \"id\": new_id(),
        \"role\": body.role,
        \"name\": body.name,
        \"email\": body.email.lower(),
        \"password_hash\": hash_secret(body.password),
        \"status\": \"active\",
        \"created_at\": now_utc().isoformat(),
    }
    await db.insert_one(\"users\", u)
    return {\"id\": u[\"id\"], \"email\": u[\"email\"], \"role\": u[\"role\"]}


@api.get(\"/walkers\")
async def list_walkers(event_id: Optional[str] = None, user=Depends(require_roles(\"admin\", \"supervisor\"))):
    q: dict = {\"role\": \"walker\"}
    if event_id:
        q[\"event_id\"] = event_id
    return await db.find(\"users\", q, exclude=[\"pin_hash\"])


@api.put(\"/walkers/{walker_id}/terminal\")
async def assign_terminal(walker_id: str, body: TerminalAssign, user=Depends(require_roles(\"admin\", \"supervisor\"))):
    walker = await db.find_one(\"users\", {\"id\": walker_id, \"role\": \"walker\"})
    if not walker:
        raise HTTPException(404, \"Walker not found\")
    updates: dict = {\"terminal_code\": body.terminal_code.upper()}
    if body.revolut_terminal_id:
        updates[\"revolut_terminal_id\"] = body.revolut_terminal_id
    await db.update_one(\"users\", {\"id\": walker_id}, updates)
    return {\"ok\": True, **updates}


# ---------- Shifts ----------
@api.post(\"/shifts/assign-bag\")
async def assign_bag(body: BagAssignment, user=Depends(require_roles(\"supervisor\", \"admin\"))):
    walker = await db.find_one(\"users\", {\"id\": body.walker_id, \"role\": \"walker\"})
    if not walker:
        raise HTTPException(404, \"Walker not found\")
    await db.update_many(
        \"shifts\",
        {\"walker_id\": body.walker_id, \"status\": \"open\"},
        {\"status\": \"abandoned\", \"closed_at\": now_utc().isoformat()},
    )
    shift = {
        \"id\": new_id(),
        \"walker_id\": body.walker_id,
        \"walker_name\": walker[\"name\"],
        \"event_id\": walker[\"event_id\"],
        \"supervisor_id\": user[\"id\"],
        \"status\": \"open\",
        \"opened_at\": now_utc().isoformat(),
    }
    await db.insert_one(\"shifts\", shift)
    for it in body.items:
        await record_movement(shift[\"id\"], it[\"product_id\"], int(it[\"quantity\"]), \"initial\", user[\"id\"])
    return shift


@api.get(\"/shifts/current\")
async def current_shift(user: dict = Depends(current_user)):
    if user[\"role\"] != \"walker\":
        raise HTTPException(403, \"Walkers only\")
    shift = await db.find_one(\"shifts\", {\"walker_id\": user[\"id\"], \"status\": \"open\"})
    if not shift:
        return {\"shift\": None, \"stock\": {}}
    stock = await shift_stock_map(shift[\"id\"])
    return {\"shift\": shift, \"stock\": stock}


@api.get(\"/shifts/{shift_id}/movements\")
async def shift_movements(shift_id: str, user=Depends(current_user)):
    return await db.find(\"movements\", {\"shift_id\": shift_id}, order_by=\"timestamp.desc\", limit=2000)


# ---------- Sales (walker) ----------
@api.post(\"/sales\")
async def create_sale(body: SaleCreate, user=Depends(require_roles(\"walker\"))):
    shift = await db.find_one(\"shifts\", {\"walker_id\": user[\"id\"], \"status\": \"open\"})
    if not shift:
        raise HTTPException(400, \"No open shift\")
    stock = await shift_stock_map(shift[\"id\"])
    for it in body.items:
        if stock.get(it.product_id, 0) < it.quantity:
            raise HTTPException(400, f\"Insufficient stock for {it.product_id}\")
    total = 0.0
    products = await db.find(\"products\", {\"event_id\": user[\"event_id\"]})
    product_lookup = {p[\"id\"]: p for p in products}
    sale = {
        \"id\": new_id(),
        \"shift_id\": shift[\"id\"],
        \"walker_id\": user[\"id\"],
        \"event_id\": user[\"event_id\"],
        \"payment_method\": body.payment_method,
        \"items\": [it.dict() for it in body.items],
        \"timestamp\": now_utc().isoformat(),
    }
    for it in body.items:
        p = product_lookup.get(it.product_id)
        if p:
            total += float(p[\"price\"]) * it.quantity
        await record_movement(shift[\"id\"], it.product_id, it.quantity, \"sale\", user[\"id\"], sale[\"id\"])
    sale[\"total\"] = round(total, 2)
    await db.insert_one(\"sales\", sale)
    return sale


# ---------- Waste (walker → supervisor validates) ----------
@api.post(\"/waste\")
async def log_waste(body: WasteCreate, user=Depends(require_roles(\"walker\"))):
    shift = await db.find_one(\"shifts\", {\"walker_id\": user[\"id\"], \"status\": \"open\"})
    if not shift:
        raise HTTPException(400, \"No open shift\")
    w = body.dict()
    w[\"id\"] = new_id()
    w[\"shift_id\"] = shift[\"id\"]
    w[\"walker_id\"] = user[\"id\"]
    w[\"walker_name\"] = user[\"name\"]
    w[\"event_id\"] = user[\"event_id\"]
    w[\"status\"] = \"pending\"
    w[\"timestamp\"] = now_utc().isoformat()
    await db.insert_one(\"waste_logs\", w)
    await record_movement(shift[\"id\"], body.product_id, body.quantity, \"waste\", user[\"id\"], w[\"id\"])
    return w


@api.get(\"/waste\")
async def list_waste(status_filter: Optional[str] = None, event_id: Optional[str] = None, user=Depends(current_user)):
    q: dict = {}
    if user[\"role\"] == \"walker\":
        q[\"walker_id\"] = user[\"id\"]
    if status_filter:
        q[\"status\"] = status_filter
    if event_id:
        q[\"event_id\"] = event_id
    return await db.find(\"waste_logs\", q if q else None, order_by=\"timestamp.desc\", limit=500)


@api.post(\"/waste/{waste_id}/validate\")
async def validate_waste(waste_id: str, body: WasteValidate, user=Depends(require_roles(\"supervisor\", \"admin\"))):
    w = await db.find_one(\"waste_logs\", {\"id\": waste_id})
    if not w:
        raise HTTPException(404, \"Not found\")
    new_status = \"approved\" if body.approved else \"rejected\"
    await db.update_one(\"waste_logs\", {\"id\": waste_id}, {
        \"status\": new_status,
        \"validated_by\": user[\"id\"],
        \"validated_at\": now_utc().isoformat(),
        \"supervisor_notes\": body.notes,
    })
    if not body.approved:
        await record_movement(w[\"shift_id\"], w[\"product_id\"], w[\"quantity\"], \"return_in\", user[\"id\"], w[\"id\"])
    return {\"ok\": True, \"status\": new_status}


# ---------- Restocks ----------
@api.post(\"/restocks\")
async def request_restock(body: RestockCreate, user=Depends(require_roles(\"walker\"))):
    shift = await db.find_one(\"shifts\", {\"walker_id\": user[\"id\"], \"status\": \"open\"})
    if not shift:
        raise HTTPException(400, \"No open shift\")
    r = {
        \"id\": new_id(),
        \"shift_id\": shift[\"id\"],
        \"walker_id\": user[\"id\"],
        \"walker_name\": user[\"name\"],
        \"event_id\": user[\"event_id\"],
        \"items\": [it.dict() for it in body.items],
        \"status\": \"pending\",
        \"created_at\": now_utc().isoformat(),
    }
    await db.insert_one(\"restocks\", r)
    return r


@api.get(\"/restocks\")
async def list_restocks(status_filter: Optional[str] = None, event_id: Optional[str] = None, user=Depends(current_user)):
    q: dict = {}
    if user[\"role\"] == \"walker\":
        q[\"walker_id\"] = user[\"id\"]
    if status_filter:
        q[\"status\"] = status_filter
    if event_id:
        q[\"event_id\"] = event_id
    return await db.find(\"restocks\", q if q else None, order_by=\"created_at.desc\", limit=500)


@api.post(\"/restocks/{restock_id}/approve\")
async def approve_restock(restock_id: str, body: RestockApprove, user=Depends(require_roles(\"supervisor\", \"admin\"))):
    r = await db.find_one(\"restocks\", {\"id\": restock_id})
    if not r:
        raise HTTPException(404, \"Not found\")
    if r[\"status\"] != \"pending\":
        raise HTTPException(400, \"Already processed\")
    await db.update_one(\"restocks\", {\"id\": restock_id}, {
        \"status\": \"delivered\",
        \"delivered_items\": [it.dict() for it in body.delivered_items],
        \"delivered_by\": user[\"id\"],
        \"delivered_at\": now_utc().isoformat(),
    })
    for it in body.delivered_items:
        await record_movement(r[\"shift_id\"], it.product_id, it.quantity, \"restock\", user[\"id\"], restock_id)
    return {\"ok\": True}


@api.post(\"/restocks/{restock_id}/reject\")
async def reject_restock(restock_id: str, user=Depends(require_roles(\"supervisor\", \"admin\"))):
    await db.update_one(\"restocks\", {\"id\": restock_id}, {
        \"status\": \"rejected\",
        \"delivered_by\": user[\"id\"],
        \"delivered_at\": now_utc().isoformat(),
    })
    return {\"ok\": True}


# ---------- Restock auto-suggestions ----------
@api.get(\"/restocks/suggestions\")
async def restock_suggestions(user=Depends(require_roles(\"walker\"))):
    from math import ceil
    shift = await db.find_one(\"shifts\", {\"walker_id\": user[\"id\"], \"status\": \"open\"})
    if not shift:
        return {\"shift_id\": None, \"suggestions\": []}

    shift_id = shift[\"id\"]
    opened_at = datetime.fromisoformat(shift[\"opened_at\"])
    now = now_utc()
    total_minutes = max(1, int((now - opened_at).total_seconds() / 60))
    window_minutes = min(15, total_minutes)
    window_start = (now - timedelta(minutes=window_minutes)).isoformat()

    stock = await shift_stock_map(shift_id)

    all_movements = await db.find(\"movements\", {
        \"shift_id\": shift_id,
        \"type\": \"sale\",
        \"timestamp\": {\"$gte\": window_start},
    })
    window_sales: dict = {}
    for m in all_movements:
        pid = m[\"product_id\"]
        window_sales[pid] = window_sales.get(pid, 0) + int(m[\"quantity\"])

    products_list = await db.find(\"products\", {\"event_id\": user[\"event_id\"]})
    products = {p[\"id\"]: p for p in products_list}
    suggestions = []
    for pid, prod in products.items():
        sold = window_sales.get(pid, 0)
        rate_per_min = sold / window_minutes if window_minutes > 0 else 0
        target = ceil(rate_per_min * 30)
        current = int(stock.get(pid, 0))
        suggested = max(0, target - current)
        suggestions.append({
            \"product_id\": pid,
            \"sku\": prod[\"sku\"],
            \"name\": prod[\"name\"],
            \"current_stock\": current,
            \"sold_last_window\": sold,
            \"window_minutes\": window_minutes,
            \"rate_per_min\": round(rate_per_min, 2),
            \"suggested_qty\": suggested,
        })
    suggestions.sort(key=lambda s: (-s[\"suggested_qty\"], s[\"sku\"]))
    return {\"shift_id\": shift_id, \"window_minutes\": window_minutes, \"suggestions\": suggestions}


# ---------- Payment terminal webhook (Phase 3 — simulated) ----------
class TerminalWebhook(BaseModel):
    transaction_id: str
    walker_id: str
    items: List[SaleItem]
    amount: float
    timestamp: Optional[str] = None
    terminal_id: Optional[str] = \"TERMINAL-01\"


@api.post(\"/payments/terminal-webhook\")
async def terminal_webhook(
    body: TerminalWebhook,
    x_terminal_signature: str = Header(default=\"\"),
):
    if x_terminal_signature != TERMINAL_SECRET:
        raise HTTPException(401, \"Invalid terminal signature\")

    existing = await db.find_one(\"sales\", {\"terminal_transaction_id\": body.transaction_id})
    if existing:
        return {\"ok\": True, \"duplicate\": True, \"sale\": existing}

    walker = await db.find_one(\"users\", {\"id\": body.walker_id, \"role\": \"walker\", \"status\": \"active\"})
    if not walker:
        raise HTTPException(404, \"Walker not found\")

    shift = await db.find_one(\"shifts\", {\"walker_id\": body.walker_id, \"status\": \"open\"})
    if not shift:
        raise HTTPException(400, \"Walker has no open shift\")

    stock = await shift_stock_map(shift[\"id\"])
    for it in body.items:
        if stock.get(it.product_id, 0) < it.quantity:
            raise HTTPException(400, f\"Insufficient stock for {it.product_id}\")

    sale = {
        \"id\": new_id(),
        \"shift_id\": shift[\"id\"],
        \"walker_id\": body.walker_id,
        \"event_id\": walker[\"event_id\"],
        \"payment_method\": \"terminal\",
        \"terminal_id\": body.terminal_id,
        \"terminal_transaction_id\": body.transaction_id,
        \"items\": [it.dict() for it in body.items],
        \"total\": round(body.amount, 2),
        \"timestamp\": body.timestamp or now_utc().isoformat(),
    }
    for it in body.items:
        await record_movement(shift[\"id\"], it.product_id, it.quantity, \"sale\", \"terminal\", sale[\"id\"])
    await db.insert_one(\"sales\", sale)
    return {\"ok\": True, \"duplicate\": False, \"sale\": sale}


class TerminalSimReq(BaseModel):
    items: List[SaleItem]
    amount: float


@api.post(\"/payments/simulate-terminal\")
async def simulate_terminal(body: TerminalSimReq, user=Depends(require_roles(\"walker\"))):
    transaction_id = f\"SIM-{new_id()[:8].upper()}\"
    body_dict = TerminalWebhook(
        transaction_id=transaction_id,
        walker_id=user[\"id\"],
        items=body.items,
        amount=body.amount,
        timestamp=now_utc().isoformat(),
        terminal_id=\"SIM-TERMINAL\",
    )
    return await terminal_webhook(body_dict, x_terminal_signature=TERMINAL_SECRET)


# ---------- Revolut Terminal integration ----------
@api.get(\"/admin/revolut/status\")
async def revolut_status(user=Depends(require_roles(\"admin\", \"supervisor\"))):
    return {\"configured\": revolut.is_configured(), \"env\": revolut.REVOLUT_ENV}


@api.post(\"/admin/revolut/sync-terminals\")
async def sync_terminals(user=Depends(require_roles(\"admin\"))):
    if not revolut.is_configured():
        raise HTTPException(400, \"Revolut Merchant API not configured yet\")
    try:
        terminals = await revolut.list_terminals()
    except Exception as e:
        raise HTTPException(502, f\"Revolut sync failed: {e}\")
    count = 0
    for t in terminals:
        tid = t.get(\"id\") or t.get(\"terminal_id\")
        if not tid:
            continue
        await db.upsert(\"revolut_terminals\", {
            \"revolut_terminal_id\": tid,
            \"label\": t.get(\"name\") or t.get(\"label\") or tid,
            \"raw\": t,
        }, on_conflict=\"revolut_terminal_id\")
        count += 1
    return {\"ok\": True, \"synced\": count}


@api.get(\"/admin/revolut/terminals\")
async def get_synced_terminals(user=Depends(require_roles(\"admin\", \"supervisor\"))):
    return await db.find(\"revolut_terminals\", limit=200)


async def _finalize_revolut_payment(pending_id: str, source: str, revolut_ref: Optional[str] = None):
    pending = await db.find_one(\"pending_payments\", {\"id\": pending_id})
    if not pending:
        return None
    if pending[\"status\"] == \"paid\":
        return await db.find_one(\"sales\", {\"id\": pending.get(\"sale_id\")})

    shift = await db.find_one(\"shifts\", {\"id\": pending[\"shift_id\"]})
    if not shift or shift[\"status\"] != \"open\":
        await db.update_one(\"pending_payments\", {\"id\": pending_id}, {\"status\": \"failed\", \"failure_reason\": \"shift_closed\"})
        return None

    stock = await shift_stock_map(pending[\"shift_id\"])
    for it in pending[\"items\"]:
        if stock.get(it[\"product_id\"], 0) < it[\"quantity\"]:
            await db.update_one(\"pending_payments\", {\"id\": pending_id}, {\"status\": \"failed\", \"failure_reason\": \"insufficient_stock\"})
            return None

    sale = {
        \"id\": new_id(),
        \"shift_id\": pending[\"shift_id\"],
        \"walker_id\": pending[\"walker_id\"],
        \"event_id\": pending[\"event_id\"],
        \"payment_method\": \"revolut_terminal\",
        \"terminal_code\": pending.get(\"terminal_code\"),
        \"terminal_transaction_id\": revolut_ref or f\"SIM-{pending_id[:8].upper()}\",
        \"items\": pending[\"items\"],
        \"total\": round(float(pending[\"amount\"]), 2),
        \"timestamp\": now_utc().isoformat(),
    }
    for it in pending[\"items\"]:
        await record_movement(pending[\"shift_id\"], it[\"product_id\"], it[\"quantity\"], \"sale\", \"revolut\", sale[\"id\"])
    await db.insert_one(\"sales\", sale)
    await db.update_one(\"pending_payments\", {\"id\": pending_id}, {
        \"status\": \"paid\",
        \"sale_id\": sale[\"id\"],
        \"confirmed_via\": source,
        \"confirmed_at\": now_utc().isoformat(),
    })
    return sale


@api.post(\"/payments/revolut/charge\")
async def revolut_charge(body: RevolutChargeCreate, user=Depends(require_roles(\"walker\"))):
    shift = await db.find_one(\"shifts\", {\"walker_id\": user[\"id\"], \"status\": \"open\"})
    if not shift:
        raise HTTPException(400, \"No open shift\")
    terminal_code = user.get(\"terminal_code\")
    if not terminal_code:
        raise HTTPException(400, \"No terminal assigned — ask your supervisor\")

    stock = await shift_stock_map(shift[\"id\"])
    for it in body.items:
        if stock.get(it.product_id, 0) < it.quantity:
            raise HTTPException(400, f\"Insufficient stock for {it.product_id}\")

    pending = {
        \"id\": new_id(),
        \"walker_id\": user[\"id\"],
        \"shift_id\": shift[\"id\"],
        \"event_id\": user[\"event_id\"],
        \"terminal_code\": terminal_code,
        \"items\": [it.dict() for it in body.items],
        \"amount\": round(body.amount, 2),
        \"status\": \"awaiting_payment\",
        \"simulated\": True,
        \"created_at\": now_utc().isoformat(),
    }

    if revolut.is_configured():
        walker_full = await db.find_one(\"users\", {\"id\": user[\"id\"]})
        revolut_terminal_id = (walker_full or {}).get(\"revolut_terminal_id\")
        if not revolut_terminal_id:
            raise HTTPException(400, f\"Terminal {terminal_code} isn't linked to a Revolut device yet\")
        try:
            order = await revolut.create_order(
                amount=body.amount, currency=\"EUR\",
                description=f\"walkFellas sale · {terminal_code}\",
                metadata={\"pending_id\": pending[\"id\"], \"walker_id\": user[\"id\"], \"terminal_code\": terminal_code},
            )
            await revolut.push_payment_to_terminal(order[\"id\"], revolut_terminal_id)
            pending[\"simulated\"] = False
            pending[\"revolut_order_id\"] = order.get(\"id\")
            pending[\"revolut_order_token\"] = order.get(\"token\")
        except Exception as e:
            log.error(f\"Revolut charge failed, falling back to demo mode: {e}\")
            pending[\"simulated\"] = True

    await db.insert_one(\"pending_payments\", dict(pending))
    return pending


@api.get(\"/payments/revolut/{pending_id}/status\")
async def revolut_payment_status(pending_id: str, user=Depends(require_roles(\"walker\"))):
    pending = await db.find_one(\"pending_payments\", {\"id\": pending_id, \"walker_id\": user[\"id\"]})
    if not pending:
        raise HTTPException(404, \"Not found\")
    return pending


@api.post(\"/payments/revolut/{pending_id}/simulate\")
async def revolut_payment_simulate(pending_id: str, user=Depends(require_roles(\"walker\"))):
    pending = await db.find_one(\"pending_payments\", {\"id\": pending_id, \"walker_id\": user[\"id\"]})
    if not pending:
        raise HTTPException(404, \"Not found\")
    sale = await _finalize_revolut_payment(pending_id, source=\"simulate\")
    if not sale:
        updated = await db.find_one(\"pending_payments\", {\"id\": pending_id})
        raise HTTPException(400, f\"Payment could not be confirmed: {(updated or {}).get('failure_reason', 'unknown')}\")
    return {\"ok\": True, \"sale\": sale}


@api.post(\"/payments/revolut/{pending_id}/cancel\")
async def revolut_payment_cancel(pending_id: str, user=Depends(require_roles(\"walker\"))):
    await db.update_one(
        \"pending_payments\",
        {\"id\": pending_id, \"walker_id\": user[\"id\"], \"status\": \"awaiting_payment\"},
        {\"status\": \"cancelled\"},
    )
    return {\"ok\": True}


@api.post(\"/payments/revolut/webhook\")
async def revolut_webhook_endpoint(request: Request):
    raw = await request.body()
    signature = request.headers.get(\"Revolut-Signature\") or request.headers.get(\"X-Revolut-Signature\", \"\")
    if not revolut.verify_webhook_signature(raw, signature):
        raise HTTPException(401, \"Invalid webhook signature\")

    payload = await request.json()
    order = payload.get(\"order\", payload)
    order_token = order.get(\"token\") or order.get(\"id\")
    event_state = str(payload.get(\"event\") or payload.get(\"event_type\") or \"\").lower()
    order_state = str(order.get(\"state\") or \"\").lower()

    pending = await db.find_one(\"pending_payments\", {\"revolut_order_token\": order_token})
    if not pending:
        return {\"ok\": True, \"ignored\": True}

    if \"completed\" in event_state or order_state == \"completed\":
        await _finalize_revolut_payment(pending[\"id\"], source=\"webhook\", revolut_ref=order.get(\"id\"))
    elif \"failed\" in event_state or \"cancel\" in event_state or order_state in (\"failed\", \"cancelled\"):
        await db.update_one(\"pending_payments\", {\"id\": pending[\"id\"]}, {
            \"status\": \"failed\",
            \"failure_reason\": f\"revolut_{order_state or event_state}\",
        })

    return {\"ok\": True}


# ---------- Close shift + reconciliation ----------
@api.post(\"/shifts/close\")
async def close_shift(body: CloseShift, user=Depends(require_roles(\"walker\"))):
    shift = await db.find_one(\"shifts\", {\"walker_id\": user[\"id\"], \"status\": \"open\"})
    if not shift:
        raise HTTPException(400, \"No open shift\")
    expected = await shift_stock_map(shift[\"id\"])
    physical = {it.product_id: it.quantity for it in body.physical_count}
    all_pids = set(expected.keys()) | set(physical.keys())
    reconciliation = []
    total_discrepancy = 0
    for pid in all_pids:
        exp = int(expected.get(pid, 0))
        phy = int(physical.get(pid, 0))
        disc = phy - exp
        total_discrepancy += abs(disc)
        reconciliation.append({\"product_id\": pid, \"expected\": exp, \"physical\": phy, \"discrepancy\": disc})
        if phy > 0:
            await record_movement(shift[\"id\"], pid, phy, \"return_in\", user[\"id\"], \"close-out\")
        if disc != 0:
            await record_movement(shift[\"id\"], pid, abs(disc), \"discrepancy\", user[\"id\"], \"close-out\")
    await db.update_one(\"shifts\", {\"id\": shift[\"id\"]}, {
        \"status\": \"closed_pending_review\",
        \"closed_at\": now_utc().isoformat(),
        \"reconciliation\": reconciliation,
        \"total_discrepancy\": total_discrepancy,
    })
    return {\"ok\": True, \"reconciliation\": reconciliation, \"total_discrepancy\": total_discrepancy}


@api.post(\"/shifts/{shift_id}/confirm\")
async def confirm_shift(shift_id: str, user=Depends(require_roles(\"supervisor\", \"admin\"))):
    await db.update_one(\"shifts\", {\"id\": shift_id}, {
        \"status\": \"closed\",
        \"confirmed_by\": user[\"id\"],
        \"confirmed_at\": now_utc().isoformat(),
    })
    return {\"ok\": True}


@api.get(\"/shifts\")
async def list_shifts(event_id: Optional[str] = None, status_filter: Optional[str] = None, user=Depends(require_roles(\"supervisor\", \"admin\"))):
    q: dict = {}
    if event_id:
        q[\"event_id\"] = event_id
    if status_filter:
        q[\"status\"] = status_filter
    return await db.find(\"shifts\", q if q else None, order_by=\"opened_at.desc\", limit=500)


# ---------- Dashboard (admin/supervisor) ----------
@api.get(\"/dashboard/overview\")
async def dashboard(event_id: Optional[str] = None, user=Depends(require_roles(\"admin\", \"supervisor\"))):
    q_ev: dict = {\"event_id\": event_id} if event_id else {}

    # Sales aggregate
    total_sales = 0.0
    total_units_sold = 0
    sales_list = await db.find(\"sales\", q_ev if q_ev else None)
    for s in sales_list:
        total_sales += float(s.get(\"total\", 0))
        for it in (s.get(\"items\") or []):
            total_units_sold += int(it.get(\"quantity\", 0))

    # Waste
    total_waste_units = 0
    waste_filter = {**q_ev, \"status\": {\"$ne\": \"rejected\"}} if q_ev else {\"status\": {\"$ne\": \"rejected\"}}
    waste_list = await db.find(\"waste_logs\", waste_filter)
    for w in waste_list:
        total_waste_units += int(w.get(\"quantity\", 0))

    # Discrepancy
    total_discrepancy = 0
    shift_filter = {**q_ev, \"status\": {\"$in\": [\"closed\", \"closed_pending_review\"]}}
    closed_shifts = await db.find(\"shifts\", shift_filter)
    for s in closed_shifts:
        total_discrepancy += int(s.get(\"total_discrepancy\", 0))

    # Counts
    active_shifts = await db.count(\"shifts\", {**q_ev, \"status\": \"open\"})
    pending_restocks = await db.count(\"restocks\", {**q_ev, \"status\": \"pending\"})
    pending_waste = await db.count(\"waste_logs\", {**q_ev, \"status\": \"pending\"})

    return {
        \"total_sales\": round(total_sales, 2),
        \"total_units_sold\": total_units_sold,
        \"total_waste_units\": total_waste_units,
        \"total_discrepancy\": total_discrepancy,
        \"active_shifts\": active_shifts,
        \"pending_restocks\": pending_restocks,
        \"pending_waste\": pending_waste,
    }


@api.get(\"/dashboard/active-walkers\")
async def active_walkers(event_id: Optional[str] = None, user=Depends(require_roles(\"admin\", \"supervisor\"))):
    q: dict = {\"status\": \"open\"}
    if event_id:
        q[\"event_id\"] = event_id
    shifts = await db.find(\"shifts\", q)
    out = []
    for s in shifts:
        stock = await shift_stock_map(s[\"id\"])
        units = sum(stock.values())
        out.append({**s, \"current_units\": units})
    return out


# ---------- Seed ----------
@api.post(\"/seed\")
async def seed_data():
    \"\"\"Idempotent seed for demo/testing.\"\"\"
    # Admin
    admin_email = \"admin@walkfellas.io\"
    if not await db.find_one(\"users\", {\"email\": admin_email}):
        await db.insert_one(\"users\", {
            \"id\": new_id(), \"role\": \"admin\", \"name\": \"Admin\",
            \"email\": admin_email, \"password_hash\": hash_secret(\"admin123\"),
            \"status\": \"active\", \"created_at\": now_utc().isoformat(),
        })
    # Supervisor
    sup_email = \"sup@walkfellas.io\"
    if not await db.find_one(\"users\", {\"email\": sup_email}):
        await db.insert_one(\"users\", {
            \"id\": new_id(), \"role\": \"supervisor\", \"name\": \"Sarah Chen\",
            \"email\": sup_email, \"password_hash\": hash_secret(\"sup123\"),
            \"status\": \"active\", \"created_at\": now_utc().isoformat(),
        })
    # Event
    event = await db.find_one(\"events\", {\"code\": \"FEST01\"})
    if not event:
        event = {
            \"id\": new_id(), \"name\": \"Summer Festival 2026\",
            \"venue\": \"Dublin Arena\", \"code\": \"FEST01\",
            \"active\": True, \"created_at\": now_utc().isoformat(),
        }
        await db.insert_one(\"events\", event)
    event_id = event[\"id\"]
    # Products
    if await db.count(\"products\", {\"event_id\": event_id}) == 0:
        catalog = [
            (\"BEER-500\", \"Craft Lager 500ml\", 6.50, \"beer\"),
            (\"BEER-CIDER\", \"Cider 500ml\", 7.00, \"beer\"),
            (\"WINE-RED\", \"Red Wine Cup\", 8.00, \"wine\"),
            (\"WATER-500\", \"Water 500ml\", 3.00, \"water\"),
            (\"SODA-COLA\", \"Cola 330ml\", 4.00, \"soda\"),
            (\"SNACK-CHIPS\", \"Chips Pack\", 5.00, \"snack\"),
        ]
        for sku, name, price, cat in catalog:
            await db.insert_one(\"products\", {
                \"id\": new_id(), \"sku\": sku, \"name\": name, \"price\": price,
                \"category\": cat, \"event_id\": event_id,
                \"created_at\": now_utc().isoformat(),
            })
    # Walker(s)
    walker_count = await db.count(\"users\", {\"role\": \"walker\", \"event_id\": event_id})
    if walker_count == 0:
        for name, pin, terminal_code in [
            (\"Jake Miller\", \"1234\", \"REV71\"),
            (\"Luca Rossi\", \"5678\", \"REV72\"),
            (\"Maya Silva\", \"9012\", \"REV73\"),
        ]:
            await db.insert_one(\"users\", {
                \"id\": new_id(), \"role\": \"walker\", \"name\": name,
                \"event_id\": event_id, \"pin_hash\": hash_secret(pin),
                \"terminal_code\": terminal_code,
                \"status\": \"active\", \"created_at\": now_utc().isoformat(),
            })
    else:
        # Backfill terminal_code for walkers without one
        no_terminal = await db.find(\"users\", {
            \"role\": \"walker\",
            \"event_id\": event_id,
            \"terminal_code\": {\"$exists\": False},
        }, order_by=\"created_at.asc\", limit=50)
        for idx, w in enumerate(no_terminal):
            await db.update_one(\"users\", {\"id\": w[\"id\"]}, {\"terminal_code\": f\"REV{71 + idx}\"})
    return {\"ok\": True, \"event_code\": \"FEST01\"}


@api.get(\"/\")
async def root():
    return {\"service\": \"walkFellas\", \"version\": \"2.0\", \"database\": \"supabase\"}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[\"*\"],
    allow_methods=[\"*\"],
    allow_headers=[\"*\"],
)


@app.on_event(\"startup\")
async def on_startup():
    # Auto-seed on startup
    try:
        await seed_data()
        log.info(\"Seed complete (Supabase)\")
    except Exception as e:
        log.warning(f\"Seed skipped: {e}\")


@app.on_event(\"shutdown\")
async def on_shutdown():
    await db.close()
"