"""Revolut Business Merchant API integration — in-person Terminal payments.

BUSINESS CONTEXT
-----------------
Each walker carries a physical Revolut Terminal card machine, manually labeled
with a code like "REV73" (set by ops, stored on the walker record as
`terminal_code`). Revolut Terminal is the one Revolut device that officially
supports API-driven "push payments": our backend creates a Merchant `Order`
for the sale amount, pushes a payment intent to that specific terminal (via
its Revolut-issued `revolut_terminal_id`), the walker has the customer tap
their card on REV73, and Revolut fires a signed webhook back to us the moment
it completes — no manual re-entry, no polling of Revolut itself.

CURRENT STATUS: sandbox access pending approval.
-------------------------------------------------
Until `REVOLUT_MERCHANT_SECRET_KEY` is set below, `is_configured()` returns
False and every call site in server.py transparently falls back to a
"simulated" flow (see /payments/revolut/{id}/simulate) so the full app keeps
working end-to-end for QA/demo purposes. Flip the switch by filling in the
three env vars — zero application code changes required.

SETUP CHECKLIST (once Revolut approves sandbox / production access)
---------------------------------------------------------------------
1. Revolut Business dashboard -> Merchant -> API keys -> copy the "Secret key".
2. Revolut Business dashboard -> Merchant -> Webhooks -> add a webhook for
   `order.completed` / `order.payment_failed` pointing to:
       {your public backend URL}/api/payments/revolut/webhook
   Copy the generated signing secret.
3. Fill in backend/.env:
       REVOLUT_ENV=sandbox                 # or "production" when going live
       REVOLUT_MERCHANT_SECRET_KEY=sk_...
       REVOLUT_WEBHOOK_SECRET=whsec_...
4. Restart the backend (`sudo supervisorctl restart backend`).
5. As admin, call POST /api/admin/revolut/sync-terminals once — this pulls
   your real Revolut Terminal device IDs into the `revolut_terminals`
   collection.
6. For each walker, call PUT /api/walkers/{id}/terminal with
   {"terminal_code": "REV73", "revolut_terminal_id": "<id from step 5>"}
   to link the physical label to the real Revolut device.

Docs referenced (verify exact paths against your approved sandbox — Revolut's
public paths occasionally version-bump):
  - developer.revolut.com/docs/merchant/orders
  - developer.revolut.com/docs/merchant/retrieve-terminal-list
  - developer.revolut.com/docs/guides/merchant/accept-payments/in-person-payments/terminal/push-payments
  - developer.revolut.com/docs/guides/merchant/monitor-and-observe/webhooks/verify-the-payload-signature
"""
import os
import hmac
import hashlib
import logging
from typing import Optional

import httpx

log = logging.getLogger("walkfellas.revolut")

REVOLUT_ENV = os.environ.get("REVOLUT_ENV", "sandbox")
REVOLUT_SECRET_KEY = os.environ.get("REVOLUT_MERCHANT_SECRET_KEY", "").strip()
REVOLUT_WEBHOOK_SECRET = os.environ.get("REVOLUT_WEBHOOK_SECRET", "").strip()

_DEFAULT_SANDBOX_URL = "https://sandbox-merchant.revolut.com/api/1.0"
_DEFAULT_PRODUCTION_URL = "https://merchant.revolut.com/api/1.0"
REVOLUT_BASE_URL = os.environ.get(
    "REVOLUT_API_BASE_URL",
    _DEFAULT_SANDBOX_URL if REVOLUT_ENV != "production" else _DEFAULT_PRODUCTION_URL,
).rstrip("/")

# Path segments kept as overridable constants — confirm against your approved
# sandbox docs and set the matching env var if Revolut's actual path differs.
ORDERS_PATH = os.environ.get("REVOLUT_ORDERS_PATH", "/orders")
TERMINALS_PATH = os.environ.get("REVOLUT_TERMINALS_PATH", "/pos/terminals")
TERMINAL_PAYMENT_PATH = os.environ.get("REVOLUT_TERMINAL_PAYMENT_PATH", "/orders/{order_id}/terminal-payments")

_TIMEOUT = httpx.Timeout(15.0, connect=8.0)


def is_configured() -> bool:
    """True once real Merchant API credentials have been provided."""
    return bool(REVOLUT_SECRET_KEY)


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {REVOLUT_SECRET_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


async def create_order(amount: float, currency: str, description: str, metadata: dict) -> dict:
    """Create a Merchant Order for a sale. Returns Revolut's order payload
    (contains `id` and `token`). Raises RuntimeError on failure."""
    if not is_configured():
        raise RuntimeError("Revolut Merchant API not configured")
    payload = {
        "amount": int(round(amount * 100)),  # minor units (cents)
        "currency": currency,
        "description": description,
        "metadata": metadata,
        "capture_mode": "AUTOMATIC",
    }
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.post(f"{REVOLUT_BASE_URL}{ORDERS_PATH}", json=payload, headers=_headers())
    if resp.status_code not in (200, 201):
        log.error("Revolut create_order failed [%s]: %s", resp.status_code, resp.text)
        raise RuntimeError(f"Revolut order creation failed ({resp.status_code})")
    return resp.json()


async def list_terminals() -> list:
    """Retrieve the merchant's registered Revolut Terminal devices."""
    if not is_configured():
        raise RuntimeError("Revolut Merchant API not configured")
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.get(f"{REVOLUT_BASE_URL}{TERMINALS_PATH}", headers=_headers())
    if resp.status_code != 200:
        log.error("Revolut list_terminals failed [%s]: %s", resp.status_code, resp.text)
        raise RuntimeError(f"Revolut terminal list failed ({resp.status_code})")
    data = resp.json()
    if isinstance(data, list):
        return data
    return data.get("terminals") or data.get("data") or []


async def push_payment_to_terminal(order_id: str, revolut_terminal_id: str) -> dict:
    """Assign a created order's payment intent to a specific physical terminal
    so it prompts the customer's card there (Pay-at-Counter push payment)."""
    if not is_configured():
        raise RuntimeError("Revolut Merchant API not configured")
    path = TERMINAL_PAYMENT_PATH.format(order_id=order_id)
    payload = {"terminal_id": revolut_terminal_id}
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.post(f"{REVOLUT_BASE_URL}{path}", json=payload, headers=_headers())
    if resp.status_code not in (200, 201):
        log.error("Revolut push_payment_to_terminal failed [%s]: %s", resp.status_code, resp.text)
        raise RuntimeError(f"Revolut push payment failed ({resp.status_code})")
    return resp.json()


def verify_webhook_signature(raw_body: bytes, signature: Optional[str]) -> bool:
    """HMAC-SHA256 verification per Revolut's webhook signing spec."""
    if not REVOLUT_WEBHOOK_SECRET or not signature:
        return False
    computed = hmac.new(REVOLUT_WEBHOOK_SECRET.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(computed, signature)
