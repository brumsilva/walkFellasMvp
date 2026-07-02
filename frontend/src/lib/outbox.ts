// Offline-first mutation outbox
// Queues failed mutations, drains on focus/timer/reconnect.
import { storage } from '@/src/utils/storage';
import { getToken } from './api';

const KEY = 'wf_outbox_v1';
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

export type OutboxItem = {
  id: string;
  method: 'POST' | 'PUT' | 'DELETE';
  path: string;
  body: any;
  createdAt: number;
  retries: number;
  label: string; // human-readable ("Sale €12.50")
};

type Listener = (count: number) => void;
const listeners = new Set<Listener>();

// Force-offline toggle (demo)
let forceOffline = false;
export function setForceOffline(v: boolean) {
  forceOffline = v;
  emit();
}
export function isForceOffline() {
  return forceOffline;
}

async function readQueue(): Promise<OutboxItem[]> {
  const raw = (await storage.getItem<string>(KEY, '')) || '';
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}
async function writeQueue(q: OutboxItem[]) {
  await storage.setItem(KEY, JSON.stringify(q));
  emit();
}

function emit() {
  readQueue().then((q) => listeners.forEach((l) => l(q.length)));
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  readQueue().then((q) => fn(q.length));
  return () => { listeners.delete(fn); };
}

export async function pendingCount(): Promise<number> {
  return (await readQueue()).length;
}

export async function enqueue(item: Omit<OutboxItem, 'id' | 'createdAt' | 'retries'>): Promise<OutboxItem> {
  const full: OutboxItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    retries: 0,
    ...item,
  };
  const q = await readQueue();
  q.push(full);
  await writeQueue(q);
  return full;
}

export async function clearQueue() {
  await writeQueue([]);
}

// Attempt one mutation; throws on network error, returns response body on any HTTP status
async function sendOne(item: OutboxItem): Promise<any> {
  const token = await getToken();
  const res = await fetch(`${BACKEND_URL}/api${item.path}`, {
    method: item.method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(item.body),
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const err: any = new Error((data && data.detail) || res.statusText);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

let draining = false;
export async function drain(): Promise<{ sent: number; failed: number; kept: number }> {
  if (draining || forceOffline) return { sent: 0, failed: 0, kept: 0 };
  draining = true;
  try {
    const q = await readQueue();
    if (!q.length) return { sent: 0, failed: 0, kept: 0 };
    const remaining: OutboxItem[] = [];
    let sent = 0;
    let failed = 0;
    for (const item of q) {
      try {
        await sendOne(item);
        sent += 1;
      } catch (e: any) {
        // Network error → keep in queue. 4xx client error → drop (bad request).
        if (e.status && e.status >= 400 && e.status < 500) {
          failed += 1;
        } else {
          remaining.push({ ...item, retries: item.retries + 1 });
        }
      }
    }
    await writeQueue(remaining);
    return { sent, failed, kept: remaining.length };
  } finally {
    draining = false;
  }
}

// Try live; on network failure (or forceOffline), queue and return synthetic ok
export async function mutate<T = any>(
  path: string,
  body: any,
  opts: { method?: 'POST' | 'PUT' | 'DELETE'; label?: string; forceQueue?: boolean } = {},
): Promise<{ online: boolean; data: T | null; queued: OutboxItem | null }> {
  const method = opts.method || 'POST';
  const label = opts.label || `${method} ${path}`;
  if (forceOffline || opts.forceQueue) {
    const q = await enqueue({ method, path, body, label });
    return { online: false, data: null, queued: q };
  }
  try {
    const token = await getToken();
    const res = await fetch(`${BACKEND_URL}/api${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const err: any = new Error((data && data.detail) || res.statusText);
      err.status = res.status;
      throw err;
    }
    return { online: true, data: data as T, queued: null };
  } catch (e: any) {
    // Distinguish network vs server error: network → no status
    if (!e.status) {
      const q = await enqueue({ method, path, body, label });
      return { online: false, data: null, queued: q };
    }
    throw e; // 4xx/5xx bubble up
  }
}
