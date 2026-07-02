import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Modal } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api, clearSession, getUser } from '@/src/lib/api';
import { mutate, drain } from '@/src/lib/outbox';
import { SyncBadge } from '@/src/lib/sync-badge';
import { theme } from '@/src/lib/theme';
import { hap } from '@/src/lib/haptics';
import { useToast } from '@/src/lib/toast';
import { Logo } from '@/src/components/Logo';

type Product = { id: string; sku: string; name: string; price: number; category: string };
type Shift = { id: string; walker_name: string; opened_at: string } | null;

const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  beer: 'beer', wine: 'wine', water: 'water', soda: 'cafe', snack: 'fast-food', other: 'pricetag',
};

export default function POS() {
  const router = useRouter();
  const toast = useToast();
  const [user, setUser] = useState<any>(null);
  const [shift, setShift] = useState<Shift>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [stock, setStock] = useState<Record<string, number>>({});
  const [cart, setCart] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [terminalWait, setTerminalWait] = useState(false);
  const safeProducts = Array.isArray(products) ? products : [];

  const load = useCallback(async () => {
    try {
      const u = await getUser();
      setUser(u);
      const [sh, prods] = await Promise.all([
        api<any>('/shifts/current'),
        api<any>('/products'),
      ]);
      const productList = Array.isArray(prods)
        ? prods
        : Array.isArray(prods?.products)
          ? prods.products
          : [];
      setShift(sh.shift);
      setStock(sh.stock || {});
      setProducts(productList);
    } catch (e: any) {
      toast.show(e.message || 'Load failed', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useFocusEffect(useCallback(() => { load(); drain(); }, [load]));

  const addToCart = (p: Product) => {
    const current = cart[p.id] || 0;
    const available = (stock[p.id] || 0) - current;
    if (available <= 0) { hap.warning(); toast.show('Out of stock', 'error'); return; }
    hap.heavy();
    setCart({ ...cart, [p.id]: current + 1 });
  };

  const removeFromCart = (p: Product) => {
    if (!cart[p.id]) return;
    hap.light();
    const next = { ...cart };
    next[p.id] -= 1;
    if (next[p.id] <= 0) delete next[p.id];
    setCart(next);
  };

  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);
  const cartTotal = safeProducts.reduce((acc, p) => acc + (cart[p.id] || 0) * p.price, 0);

  const confirmSale = async () => {
    if (!cartCount) return;
    setSubmitting(true);
    try {
      const items = Object.entries(cart).map(([product_id, quantity]) => ({ product_id, quantity }));
      const r = await mutate('/sales', { items, payment_method: 'mock_terminal' }, { label: `Sale €${cartTotal.toFixed(2)}` });
      if (r.online) { hap.success(); toast.show(`Sale €${cartTotal.toFixed(2)} confirmed`, 'success'); }
      else { hap.warning(); toast.show('Offline — sale queued, will sync', 'info'); }
      setCart({});
      await load();
    } catch (e: any) {
      hap.error();
      toast.show(e.message || 'Sale failed', 'error');
    } finally { setSubmitting(false); }
  };

  const sendToTerminal = () => { if (!cartCount) return; setTerminalWait(true); hap.medium(); };

  const simulateTerminalConfirm = async () => {
    try {
      const items = Object.entries(cart).map(([product_id, quantity]) => ({ product_id, quantity }));
      const r = await api<any>('/payments/simulate-terminal', { method: 'POST', body: JSON.stringify({ items, amount: cartTotal }) });
      hap.success();
      toast.show(`Terminal · ${r.sale.terminal_transaction_id}`, 'success');
      setCart({}); setTerminalWait(false);
      await load();
    } catch (e: any) {
      hap.error();
      toast.show(e.message || 'Terminal failed', 'error');
      setTerminalWait(false);
    }
  };

  const logout = async () => { await clearSession(); router.replace('/'); };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.center}><ActivityIndicator color={theme.color.brand} /></View>
      </SafeAreaView>
    );
  }

  if (!shift) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Logo size={32} />
          <Pressable onPress={logout} testID="logout-btn" hitSlop={12}>
            <Ionicons name="log-out-outline" size={24} color={theme.color.muted} />
          </Pressable>
        </View>
        <View style={styles.emptyPad}>
          <View style={styles.emptyIcon}>
            <Ionicons name="hourglass-outline" size={44} color={theme.color.brand} />
          </View>
          <Text style={styles.emptyTitle}>Waiting for your bag</Text>
          <Text style={styles.emptySub}>Ask your supervisor to assign your stock to begin the shift.</Text>
          <Pressable style={styles.refreshBtn} onPress={load} testID="refresh-btn">
            <Ionicons name="refresh" size={16} color="#FFF" />
            <Text style={styles.refreshText}>Refresh</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.hi}>Hi, {user?.name?.split(' ')[0]}</Text>
          <Text style={styles.hiSub}>Shift open · sell away</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <SyncBadge />
          <Pressable onPress={logout} testID="logout-btn" hitSlop={12}>
            <Ionicons name="log-out-outline" size={22} color={theme.color.muted} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
        {products.map((p) => {
      <ScrollView contentContainerStyle={styles.grid}>
        {safeProducts.map((p) => {
          const inCart = cart[p.id] || 0;
          const remaining = (stock[p.id] || 0) - inCart;
          const low = remaining <= 3;
          return (
            <View key={p.id} style={[styles.card, inCart > 0 && styles.cardActive]}>
              <Pressable
                testID={`sku-${p.sku}`}
                style={styles.cardBody}
                onPress={() => addToCart(p)}
                android_ripple={{ color: theme.color.brandSoft }}
              >
                <View style={styles.iconBubble}>
                  <Ionicons name={CATEGORY_ICONS[p.category] || 'pricetag'} size={22} color={theme.color.brand} />
                </View>
                <Text style={styles.cardName} numberOfLines={2}>{p.name}</Text>
                <Text style={styles.cardSku}>{p.sku}</Text>
                <View style={styles.cardBottom}>
                  <Text style={styles.cardPrice}>€{p.price.toFixed(2)}</Text>
                  <View style={[styles.stockPill, low && styles.stockPillLow]}>
                    <Text style={[styles.stockPillText, low && { color: theme.color.brand }]}>{remaining}</Text>
                  </View>
                </View>
              </Pressable>
              {inCart > 0 && (
                <View style={styles.cartBadge}>
                  <Pressable style={styles.badgeBtn} onPress={() => removeFromCart(p)} testID={`sku-${p.sku}-minus`} hitSlop={8}>
                    <Ionicons name="remove" size={16} color="#FFF" />
                  </Pressable>
                  <Text style={styles.badgeCount}>{inCart}</Text>
                  <Pressable style={styles.badgeBtn} onPress={() => addToCart(p)} testID={`sku-${p.sku}-plus`} hitSlop={8}>
                    <Ionicons name="add" size={16} color="#FFF" />
                  </Pressable>
                </View>
              )}
            </View>
          );
        })}
        <View style={{ height: 140 }} />
      </ScrollView>

      {cartCount > 0 && (
        <View style={styles.checkoutBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.checkQty}>{cartCount} item{cartCount > 1 ? 's' : ''}</Text>
            <Text style={styles.checkTotal}>€{cartTotal.toFixed(2)}</Text>
          </View>
          <Pressable testID="send-terminal" style={styles.termBtn} onPress={sendToTerminal}>
            <Ionicons name="card" size={16} color={theme.color.brand} />
            <Text style={styles.termBtnText}>Terminal</Text>
          </Pressable>
          <Pressable
            testID="confirm-sale"
            style={[styles.checkBtn, submitting && { opacity: 0.6 }]}
            onPress={confirmSale}
            disabled={submitting}
          >
            {submitting ? <ActivityIndicator color="#FFF" /> : (
              <>
                <Text style={styles.checkBtnText}>Manual</Text>
                <Ionicons name="arrow-forward" size={16} color="#FFF" />
              </>
            )}
          </Pressable>
        </View>
      )}

      <Modal visible={terminalWait} transparent animationType="fade" onRequestClose={() => setTerminalWait(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalBox}>
            <View style={styles.modalIcon}>
              <Ionicons name="card" size={40} color={theme.color.brand} />
            </View>
            <Text style={styles.modalTitle}>Insert card on terminal</Text>
            <Text style={styles.modalAmount}>€{cartTotal.toFixed(2)}</Text>
            <Text style={styles.modalSub}>{cartCount} item{cartCount > 1 ? 's' : ''} · waiting…</Text>
            <Pressable style={styles.modalConfirm} onPress={simulateTerminalConfirm} testID="sim-terminal-ok">
              <Text style={styles.modalConfirmText}>Simulate terminal OK</Text>
            </Pressable>
            <Pressable onPress={() => setTerminalWait(false)} testID="sim-terminal-cancel">
              <Text style={styles.modalCancel}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.surfaceSecondary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
    backgroundColor: theme.color.surface,
  },
  hi: { fontFamily: theme.font.extrabold, fontSize: 20, color: theme.color.onSurface, letterSpacing: -0.3 },
  hiSub: { fontFamily: theme.font.medium, fontSize: 12, color: theme.color.muted, marginTop: 2 },
  emptyPad: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
  emptyIcon: { width: 96, height: 96, borderRadius: 48, backgroundColor: theme.color.brandSoft, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontFamily: theme.font.extrabold, fontSize: 22, color: theme.color.onSurface, textAlign: 'center', marginTop: 8 },
  emptySub: { fontFamily: theme.font.medium, fontSize: 14, color: theme.color.muted, textAlign: 'center', lineHeight: 20 },
  refreshBtn: { marginTop: 16, flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: theme.color.brand, borderRadius: theme.radius.pill, paddingVertical: 12, paddingHorizontal: 20, ...(theme.shadow.md as any) },
  refreshText: { color: '#FFF', fontFamily: theme.font.bold, fontSize: 13 },
  grid: { padding: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: {
    width: '48%', backgroundColor: theme.color.surface,
    borderRadius: theme.radius.xl, position: 'relative', overflow: 'hidden',
    ...(theme.shadow.sm as any),
  },
  cardActive: { borderWidth: 2, borderColor: theme.color.brand },
  cardBody: { padding: 14, gap: 6, minHeight: 148 },
  iconBubble: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.color.brandSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  cardName: { fontFamily: theme.font.bold, fontSize: 14, color: theme.color.onSurface, lineHeight: 18 },
  cardSku: { fontFamily: theme.font.medium, fontSize: 10, color: theme.color.muted, letterSpacing: 0.5 },
  cardBottom: { marginTop: 'auto', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardPrice: { fontFamily: theme.font.extrabold, fontSize: 17, color: theme.color.onSurface },
  stockPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: theme.radius.pill, backgroundColor: theme.color.surfaceSecondary },
  stockPillLow: { backgroundColor: theme.color.brandSoft },
  stockPillText: { fontFamily: theme.font.bold, fontSize: 11, color: theme.color.muted },
  cartBadge: {
    position: 'absolute', top: 10, right: 10,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: theme.color.brand, borderRadius: theme.radius.pill,
    paddingHorizontal: 4, paddingVertical: 3,
    ...(theme.shadow.sm as any),
  },
  badgeBtn: { padding: 3 },
  badgeCount: { color: '#FFF', fontFamily: theme.font.extrabold, fontSize: 13, minWidth: 14, textAlign: 'center' },
  checkoutBar: {
    position: 'absolute', left: 12, right: 12, bottom: 12,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: theme.color.surfaceInverse,
    borderRadius: theme.radius.xxl,
    paddingHorizontal: 16, paddingVertical: 12,
    ...(theme.shadow.lg as any),
  },
  checkQty: { color: 'rgba(255,255,255,0.7)', fontFamily: theme.font.semibold, fontSize: 11 },
  checkTotal: { color: '#FFF', fontFamily: theme.font.extrabold, fontSize: 22 },
  termBtn: { flexDirection: 'row', gap: 4, alignItems: 'center', backgroundColor: theme.color.surface, borderRadius: theme.radius.pill, paddingVertical: 10, paddingHorizontal: 14 },
  termBtnText: { color: theme.color.brand, fontFamily: theme.font.bold, fontSize: 12 },
  checkBtn: { flexDirection: 'row', gap: 4, alignItems: 'center', backgroundColor: theme.color.brand, borderRadius: theme.radius.pill, paddingVertical: 10, paddingHorizontal: 14 },
  checkBtnText: { color: '#FFF', fontFamily: theme.font.bold, fontSize: 12 },
  modalBg: { flex: 1, backgroundColor: 'rgba(26,26,31,0.75)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalBox: { backgroundColor: '#FFF', borderRadius: theme.radius.xxl, padding: 28, alignItems: 'center', gap: 8, width: '100%', maxWidth: 340, ...(theme.shadow.lg as any) },
  modalIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: theme.color.brandSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  modalTitle: { fontFamily: theme.font.extrabold, fontSize: 18, textAlign: 'center', color: theme.color.onSurface },
  modalAmount: { fontFamily: theme.font.black, fontSize: 32, color: theme.color.brand },
  modalSub: { fontFamily: theme.font.medium, fontSize: 12, color: theme.color.muted },
  modalConfirm: { backgroundColor: theme.color.onSurface, borderRadius: theme.radius.pill, paddingVertical: 14, paddingHorizontal: 24, marginTop: 12 },
  modalConfirmText: { color: '#FFF', fontFamily: theme.font.bold, fontSize: 14 },
  modalCancel: { color: theme.color.muted, fontFamily: theme.font.semibold, marginTop: 4, fontSize: 13 },
});
