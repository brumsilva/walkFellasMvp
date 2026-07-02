import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

function resolveApiBase(url: string): string | null {
  const trimmed = url.trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}

const API_BASE = resolveApiBase(BACKEND_URL);
const TOKEN_KEY = 'wf_token';
const USER_KEY = 'wf_user';

function tokenFromResponse(loginResponse: any): string | null {
  const candidate =
    loginResponse?.access_token ??
    loginResponse?.accessToken ??
    loginResponse?.token ??
    null;
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : null;
}

async function storeGet(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; }
  }
  return SecureStore.getItemAsync(key);
}
async function storeSet(key: string, value: string): Promise<void> {
  const normalized = typeof value === 'string' ? value : JSON.stringify(value);
  if (typeof normalized !== 'string') {
    throw new Error(`Invalid storage value for ${key}`);
  }
  if (Platform.OS === 'web') {
    try { globalThis.localStorage?.setItem(key, normalized); } catch {}
    return;
  }
  return SecureStore.setItemAsync(key, normalized);
}
async function storeDel(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    try { globalThis.localStorage?.removeItem(key); } catch {}
    return;
  }
  return SecureStore.deleteItemAsync(key);
}

export async function saveSession(token: string, user: any) {
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('Invalid access token from login response');
  }
  const userPayload = user ?? null;
  await storeSet(TOKEN_KEY, token);
  await storeSet(USER_KEY, JSON.stringify(userPayload));
}

export async function saveSessionFromLoginResponse(loginResponse: any) {
  const token = tokenFromResponse(loginResponse);
  if (!token) {
    if (typeof loginResponse === 'string') {
      throw new Error(
        'Login response was plain text, not JSON. Check EXPO_PUBLIC_BACKEND_URL (example: http://127.0.0.1:8000).',
      );
    }
    const keys = loginResponse && typeof loginResponse === 'object'
      ? Object.keys(loginResponse).join(', ')
      : typeof loginResponse;
    throw new Error(`Invalid access token from login response (keys: ${keys || 'none'})`);
  }
  await saveSession(token, loginResponse?.user ?? null);
}
export async function getToken(): Promise<string | null> {
  return storeGet(TOKEN_KEY);
}
export async function getUser(): Promise<any | null> {
  const s = await storeGet(USER_KEY);
  if (!s || s === 'undefined' || s === 'null') return null;
  try {
    return JSON.parse(s);
  } catch {
    // Recover from legacy/bad persisted values that are not valid JSON.
    await storeDel(USER_KEY);
    return null;
  }
}
export async function clearSession() {
  await storeDel(TOKEN_KEY);
  await storeDel(USER_KEY);
}

export async function api<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  if (!API_BASE) {
    throw new Error('Missing EXPO_PUBLIC_BACKEND_URL. Set it to your backend origin, e.g. http://127.0.0.1:8000');
  }
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  const text = await res.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!res.ok) {
    const detail = (data && (data as any).detail) || res.statusText;
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
  }
  return data as T;
}

export const walkerLogin = (event_code: string, pin: string) =>
  api('/auth/walker/login', { method: 'POST', body: JSON.stringify({ event_code, pin }) });

export const staffLogin = (email: string, password: string) =>
  api('/auth/staff/login', { method: 'POST', body: JSON.stringify({ email, password }) });

export const seed = () => api('/seed', { method: 'POST' });
