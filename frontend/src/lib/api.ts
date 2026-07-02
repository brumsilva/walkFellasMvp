import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const API_BASE = `${BACKEND_URL}/api`;
const TOKEN_KEY = 'wf_token';
const USER_KEY = 'wf_user';

async function storeGet(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; }
  }
  return SecureStore.getItemAsync(key);
}
async function storeSet(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try { globalThis.localStorage?.setItem(key, value); } catch {}
    return;
  }
  return SecureStore.setItemAsync(key, value);
}
async function storeDel(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    try { globalThis.localStorage?.removeItem(key); } catch {}
    return;
  }
  return SecureStore.deleteItemAsync(key);
}

export async function saveSession(token: string, user: any) {
  await storeSet(TOKEN_KEY, token);
  await storeSet(USER_KEY, JSON.stringify(user));
}
export async function getToken(): Promise<string | null> {
  return storeGet(TOKEN_KEY);
}
export async function getUser(): Promise<any | null> {
  const s = await storeGet(USER_KEY);
  return s ? JSON.parse(s) : null;
}
export async function clearSession() {
  await storeDel(TOKEN_KEY);
  await storeDel(USER_KEY);
}

export async function api<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
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
