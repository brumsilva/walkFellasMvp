import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api, clearSession, getUser } from '@/src/lib/api';
import { theme } from '@/src/lib/theme';
import { hap } from '@/src/lib/haptics';
import { useToast } from '@/src/lib/toast';

type Product = { id: string; sku: string; name: string; price: number; category: string };
type Shift = { id: string; walker_name: string; opened_at: string } | null;

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

  const load = useCallback(async () => {
    try {
      const u = await getUser();
      setUser(u);
      const [sh, prods] = await Promise.all([
        api<any>('/shifts/current'),
        api<Product[]>('/products'),
      ]);
      setShift(sh.shift);
      setStock(sh.stock || {});
      setProducts(prods);
    } catch (e: any) {
      toast.show(e.message || 'Load failed', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const addToCart = (p: Product) => {
    const current = cart[p.id] || 0;
    const available = (stock[p.id] || 0) - current;
    if (available <= 0) {
      hap.warning();
      toast.show('Out of stock', 'error');
      return;
    }
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
  const cartTotal = products.reduce((acc, p) => acc + (cart[p.id] || 0) * p.price, 0);

  const confirmSale = async () => {
    if (!cartCount) return;
    setSubmitting(true);
    try {
      const items = Object.entries(cart).map(([product_id, quantity]) => ({ product_id, quantity }));
      await api('/sales', { method: 'POST', body: JSON.stringify({ items, payment_method: 'mock_terminal' }) });
      hap.success();
      toast.show(`Sale €${cartTotal.toFixed(2)} confirmed`, 'success');
      setCart({});
      await load();
    } catch (e: any) {
      hap.error();
      toast.show(e.message || 'Sale failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const logout = async () => {
    await clearSession();
    router.replace('/');
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.center}><Text style={styles.mono}>LOADING...</Text></View>
      </SafeAreaView>
    );
  }

  if (!shift) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>WALKFELLAS</Text>
            <Text style={styles.mono}>{user?.name}</Text>
          </View>
          <Pressable onPress={logout} testID="logout-btn"><Ionicons name="log-out-outline" size={28} color={theme.color.onSurface} /></Pressable>
        </View>
        <View style={styles.center}>
          <Ionicons name="hourglass-outline" size={64} color={theme.color.muted} />
          <Text style={[styles.title, { fontSize: 20, marginTop: 20, textAlign: 'center' }]}>NO OPEN SHIFT</Text>
          <Text style={{ marginTop: 12, textAlign: 'center', color: theme.color.muted, paddingHorizontal: 40 }}>
            Ask your supervisor to assign your bag to begin the shift.
          </Text>
          <Pressable style={styles.refreshBtn} onPress={load} testID="refresh-btn">
            <Text style={styles.refreshText}>REFRESH</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>POS</Text>
          <Text style={styles.mono}>{user?.name} • {shift.walker_name ? '' : ''}SHIFT OPEN</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={styles.syncDot} />
          <Text style={styles.mono}>ONLINE</Text>
          <Pressable onPress={logout} testID="logout-btn"><Ionicons name="log-out-outline" size={24} color={theme.color.onSurface} /></Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.grid}>
        {products.map((p) => {
          const inCart = cart[p.id] || 0;
          const remaining = (stock[p.id] || 0) - inCart;
          return (
            <View key={p.id} style={styles.card}>
              <Pressable
                testID={`sku-${p.sku}`}
                style={{ padding: 14, minHeight: 130 }}
                onPress={() => addToCart(p)}
              >
                <Text style={styles.cardSku}>{p.sku}</Text>
                <Text style={styles.cardName} numberOfLines={2}>{p.name}</Text>
                <View style={styles.cardBottom}>
                  <Text style={styles.cardPrice}>€{p.price.toFixed(2)}</Text>
                  <Text style={[styles.cardStock, remaining <= 3 && { color: theme.color.brand }]}>
                    {remaining} LEFT
                  </Text>
                </View>
              </Pressable>
              {inCart > 0 && (
                <View style={styles.cartBadge}>
                  <Pressable style={styles.badgeBtn} onPress={() => removeFromCart(p)} testID={`sku-${p.sku}-minus`}>
                    <Text style={styles.badgeBtnText}>−</Text>
                  </Pressable>
                  <Text style={styles.badgeCount}>{inCart}</Text>
                  <Pressable style={styles.badgeBtn} onPress={() => addToCart(p)} testID={`sku-${p.sku}-plus`}>
                    <Text style={styles.badgeBtnText}>+</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        })}
        <View style={{ height: 100 }} />
      </ScrollView>

      {cartCount > 0 && (
        <View style={styles.checkoutBar}>
          <View>
            <Text style={styles.checkQty}>{cartCount} ITEMS</Text>
            <Text style={styles.checkTotal}>€{cartTotal.toFixed(2)}</Text>
          </View>
          <Pressable
            testID="confirm-sale"
            style={[styles.checkBtn, submitting && { opacity: 0.5 }]}
            onPress={confirmSale}
            disabled={submitting}
          >
            {submitting ? <ActivityIndicator color="#000" /> : <Text style={styles.checkBtnText}>CONFIRM SALE →</Text>}
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: theme.color.borderStrong,
  },
  title: { fontSize: 22, fontWeight: '900', letterSpacing: -1, color: theme.color.onSurface },
  mono: { fontFamily: theme.font.mono, fontSize: 12, color: theme.color.muted, marginTop: 2, letterSpacing: 1 },
  syncDot: { width: 10, height: 10, backgroundColor: theme.color.success, borderWidth: 1, borderColor: theme.color.borderStrong },
  grid: {
    padding: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  card: {
    width: '48.5%',
    borderWidth: 2,
    borderColor: theme.color.borderStrong,
    backgroundColor: theme.color.surface,
    position: 'relative',
  },
  cardSku: { fontFamily: theme.font.mono, fontSize: 11, fontWeight: '700', color: theme.color.muted, letterSpacing: 1 },
  cardName: { fontSize: 16, fontWeight: '800', color: theme.color.onSurface, marginTop: 6 },
  cardBottom: { marginTop: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  cardPrice: { fontSize: 20, fontWeight: '900', color: theme.color.onSurface, fontFamily: theme.font.mono },
  cardStock: { fontFamily: theme.font.mono, fontSize: 11, fontWeight: '800', color: theme.color.muted, letterSpacing: 1 },
  cartBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.color.brand,
    borderWidth: 2,
    borderColor: theme.color.borderStrong,
  },
  badgeBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  badgeBtnText: { color: '#FFF', fontSize: 18, fontWeight: '900' },
  badgeCount: { color: '#FFF', fontSize: 16, fontWeight: '900', paddingHorizontal: 4, fontFamily: theme.font.mono },
  checkoutBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.color.surfaceInverse,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 2,
    borderTopColor: theme.color.borderStrong,
  },
  checkQty: { color: '#FFF', fontSize: 11, letterSpacing: 1, fontWeight: '800' },
  checkTotal: { color: '#FFF', fontSize: 28, fontWeight: '900', fontFamily: theme.font.mono },
  checkBtn: { backgroundColor: theme.color.surface, borderWidth: 2, borderColor: '#FFF', paddingVertical: 16, paddingHorizontal: 18 },
  checkBtnText: { color: '#000', fontSize: 14, fontWeight: '900', letterSpacing: 1 },
  refreshBtn: { marginTop: 24, borderWidth: 2, borderColor: theme.color.borderStrong, paddingHorizontal: 24, paddingVertical: 12 },
  refreshText: { fontSize: 14, fontWeight: '900', letterSpacing: 2 },
});
