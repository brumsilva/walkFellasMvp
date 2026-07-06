"""Supabase REST API (PostgREST) database wrapper for walkFellas.

Replaces motor/MongoDB with Supabase PostgreSQL via the PostgREST REST API.
Uses the service_role key to bypass RLS for all backend operations.
"""
import httpx
import json
import logging
from typing import Optional, Any, List, Dict

log = logging.getLogger("walkfellas.supabase")


class SupabaseDB:
    """Async wrapper around the Supabase PostgREST API."""

    def __init__(self, url: str, key: str):
        self.url = url.rstrip("/")
        self.key = key
        self._client: Optional[httpx.AsyncClient] = None

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.url,
                headers={
                    "apikey": self.key,
                    "Authorization": f"Bearer {self.key}",
                    "Content-Type": "application/json",
                },
                timeout=30.0,
            )
        return self._client

    async def close(self):
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    def _build_params(self, filters: Optional[dict]) -> dict:
        """Convert a MongoDB-style filter dict to PostgREST query params."""
        if not filters:
            return {}
        params: dict = {}
        for key, value in filters.items():
            if isinstance(value, dict):
                for op, val in value.items():
                    if op == "$ne":
                        params[key] = f"neq.{val}"
                    elif op == "$in":
                        joined = ",".join(str(v) for v in val)
                        params[key] = f"in.({joined})"
                    elif op == "$gte":
                        params[key] = f"gte.{val}"
                    elif op == "$lte":
                        params[key] = f"lte.{val}"
                    elif op == "$gt":
                        params[key] = f"gt.{val}"
                    elif op == "$lt":
                        params[key] = f"lt.{val}"
                    elif op == "$exists":
                        params[key] = "not.is.null" if val else "is.null"
            elif value is None:
                params[key] = "is.null"
            elif isinstance(value, bool):
                params[key] = f"eq.{str(value).lower()}"
            else:
                params[key] = f"eq.{value}"
        return params

    async def find_one(self, table: str, filters: dict, exclude: list = None) -> Optional[dict]:
        """Find a single record. Returns None if not found."""
        params = self._build_params(filters)
        params["select"] = "*"
        params["limit"] = "1"
        resp = await self.client.get(f"/{table}", params=params)
        if resp.status_code != 200:
            log.error("find_one %s failed [%s]: %s", table, resp.status_code, resp.text)
            return None
        rows = resp.json()
        if not rows:
            return None
        row = rows[0]
        if exclude:
            for f in exclude:
                row.pop(f, None)
        return row

    async def find(self, table: str, filters: dict = None, exclude: list = None,
                   order_by: str = None, limit: int = 1000) -> list:
        """Find multiple records."""
        params = self._build_params(filters)
        params["select"] = "*"
        params["limit"] = str(limit)
        if order_by:
            params["order"] = order_by
        resp = await self.client.get(f"/{table}", params=params)
        if resp.status_code != 200:
            log.error("find %s failed [%s]: %s", table, resp.status_code, resp.text)
            return []
        rows = resp.json()
        if exclude:
            for row in rows:
                for f in exclude:
                    row.pop(f, None)
        return rows

    async def insert_one(self, table: str, data: dict) -> dict:
        """Insert a single record. Returns the inserted row."""
        resp = await self.client.post(
            f"/{table}",
            json=data,
            headers={"Prefer": "return=representation"},
        )
        if resp.status_code not in (200, 201):
            log.error("insert_one %s failed [%s]: %s", table, resp.status_code, resp.text)
            raise Exception(f"Insert into {table} failed: {resp.text}")
        rows = resp.json()
        return rows[0] if rows else data

    async def update_one(self, table: str, filters: dict, updates: dict) -> None:
        """Update a single matching record (PATCH)."""
        params = self._build_params(filters)
        resp = await self.client.patch(
            f"/{table}",
            params=params,
            json=updates,
        )
        if resp.status_code not in (200, 204):
            log.error("update_one %s failed [%s]: %s", table, resp.status_code, resp.text)

    async def update_many(self, table: str, filters: dict, updates: dict) -> None:
        """Update all matching records (same as update_one in PostgREST)."""
        await self.update_one(table, filters, updates)

    async def upsert(self, table: str, data: dict, on_conflict: str = None) -> dict:
        """Insert or update on conflict."""
        headers = {"Prefer": "return=representation,resolution=merge-duplicates"}
        params = {}
        if on_conflict:
            params["on_conflict"] = on_conflict
        resp = await self.client.post(
            f"/{table}",
            json=data,
            headers=headers,
            params=params,
        )
        if resp.status_code not in (200, 201):
            log.error("upsert %s failed [%s]: %s", table, resp.status_code, resp.text)
            raise Exception(f"Upsert into {table} failed: {resp.text}")
        rows = resp.json()
        return rows[0] if rows else data

    async def count(self, table: str, filters: dict = None) -> int:
        """Count matching records."""
        params = self._build_params(filters)
        params["select"] = "*"
        params["limit"] = "1"
        resp = await self.client.get(
            f"/{table}",
            params=params,
            headers={"Prefer": "count=exact"},
        )
        cr = resp.headers.get("content-range", "*/0")
        if "/" in cr:
            try:
                return int(cr.split("/")[-1])
            except (ValueError, IndexError):
                pass
        try:
            return len(resp.json())
        except Exception:
            return 0

    async def delete(self, table: str, filters: dict) -> None:
        """Delete matching records."""
        params = self._build_params(filters)
        resp = await self.client.delete(f"/{table}", params=params)
        if resp.status_code not in (200, 204):
            log.error("delete %s failed [%s]: %s", table, resp.status_code, resp.text)
