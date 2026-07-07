import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Modal } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { theme } from '@/src/lib/theme';
import { hap } from '@/src/lib/haptics';
import { useToast } from '@/src/lib/toast';

type Walker = { id: string; name: string; event_id: string };
type Product = { id: string; sku: string; name: string };
type ShiftInfo = { id: string; walker_id: string; walker_name: string; opened_at: string; current_units: number };
type WarehouseItem = { product_id: string; sku: string; name: string; available: number; initial_quantity: number };

export default function Walkers() {
  const toast = useToast();
  const [walkers, setWalkers] = useState<Walker[]>([]);
  const [active, setActive] = useState<ShiftInfo[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAssign, setShowAssign] = useState(false);
  const [selectedWalker, setSelectedWalker] = useState<Walker | null>(null);
  const [bagQty, setBagQty] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  // Warehouse stock
  const [warehouseStock, setWarehouseStock] = useState<Record<string, number>>({});
  const [warehouseLoading, setWarehouseLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const [ws, act, pr] = await Promise.all([
        api<any>('/walkers'),
        api<any>('/dashboard/active-walkers'),
        api<any>('/products'),
      ]);
      const walkerList = Array.isArray(ws) ? ws : Array.isArray(ws?.walkers) ? ws.walkers : [];
      const activeList = Array.isArray(act) ? act : Array.isArray(act?.active) ? act.active : [];
      const productList = Array.isArray(pr) ? pr : Array.isArray(pr?.products) ? pr.products : [];
      setWalkers(walkerList);
      setActive(activeList);
      setProducts(productList);
    } catch (e: any) {
      toast.show(e.message || 'Load failed', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const loadWarehouseStock = useCallback(async (eventId: string) => {
    setWarehouseLoading(true);
    try {
      const inv = await api<any>(`/events/${eventId}/inventory`);
      const items: WarehouseItem[] = inv?.items || [];
      const stockMap: Record<string, number> = {};
      items.forEach((it) => { stockMap[it.product_id] = it.available; });
      setWarehouseStock(stockMap);
    } catch {
      setWarehouseStock({});
    } finally {
      setWarehouseLoading(false);
    }
  }, []);

  const openAssign = (w: Walker) => {
    setSelectedWalker(w);
    setBagQty({});
    setShowAssign(true);
    if (w.event_id) loadWarehouseStock(w.event_id);
  };

  const bump = (pid: string, delta: number) => {
    hap.light();
    setBagQty((p) => {
      const currentBag = p[pid] || 0;
      const available = warehouseStock[pid] || 0;
      let nextVal = currentBag + delta;
      if (nextVal < 0) nextVal = 0;
      // Limit to available warehouse stock
      if (nextVal > available) {
        hap.warning();
        nextVal = available;
      }
      const next = { ...p, [pid]: nextVal };
      if (next[pid] === 0) delete next[pid];
      return next;
    });
  };

  const assignBag = async () => {
    if (!selectedWalker) return;
    const items = Object.entries(bagQty).map(([product_id, quantity]) => ({ product_id, quantity }));
    if (!items.length) {
      toast.show('Add items to bag', 'error');
      return;
    }
    setBusy(true);
    try {
      await api('/shifts/assign-bag', { method: 'POST', body: JSON.stringify({ walker_id: selectedWalker.id, items }) });
      hap.success();
      toast.show(`Bag assigned to ${selectedWalker.name}`, 'success');
      setShowAssign(false);
      await load();
    } catch (e: any) {
      hap.error();
      toast.show(e.message || 'Failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const activeMap = Object.fromEntries(active.map((a) => [a.walker_id, a]));

  if (loading) return <View style={styles.center}><ActivityIndicator color={theme.color.brand} /></View>;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Walkers</Text>
          <Text style={styles.subtitle}>{active.length} active / {walkers.length} total</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
        {walkers.map((w) => {
          const shift = activeMap[w.id];
          return (
            <View key={w.id} style={styles.card} testID={`walker-${w.id}`}>
              <View style={[styles.avatar, shift && { backgroundColor: theme.color.successSoft }]}>
                <Text style={[styles.avatarText, shift && { color: theme.color.success }]}>{w.name.slice(0, 1)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.wName}>{w.name}</Text>
                {shift ? (
                  <View style={styles.statusRow}>
                    <View style={[styles.dot, { backgroundColor: theme.color.success }]} />
                    <Text style={styles.wStatusActive}>Active {'\u00B7'} {shift.current_units} units</Text>
                  </View>
                ) : (
                  <View style={styles.statusRow}>
                    <View style={[styles.dot, { backgroundColor: theme.color.muted }]} />
                    <Text style={styles.wStatus}>Off shift</Text>
                  </View>
                )}
              </View>
              <Pressable testID={`assign-${w.id}`} style={[styles.assignBtn, shift && styles.assignBtnAlt]} onPress={() => openAssign(w)}>
                <Text style={[styles.assignBtnText, shift && { color: '#FFF' }]}>{shift ? 'Reassign' : 'Assign bag'}</Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>

      <Modal visible={showAssign} animationType="slide" onRequestClose={() => setShowAssign(false)}>
        <SafeAreaProvider>
          <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>Assign bag</Text>
                <Text style={styles.subtitle}>{selectedWalker?.name}</Text>
              </View>
              <Pressable onPress={() => setShowAssign(false)} testID="close-assign" hitSlop={12} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color={theme.color.onSurface} />
              </Pressable>
            </View>

            {/* Warehouse stock info banner */}
            <View style={styles.warehouseBanner}>
              <Ionicons name="layers-outline" size={16} color={theme.color.info} />
              <Text style={styles.warehouseBannerText}>Available warehouse stock shown per product</Text>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
              {warehouseLoading && (
                <View style={{ padding: 12, alignItems: 'center' }}><ActivityIndicator color={theme.color.brand} size="small" /></View>
              )}
              {products.map((p) => {
                const available = warehouseStock[p.id] || 0;
                const inBag = bagQty[p.id] || 0;
                const remaining = available - inBag;
                const isLow = available > 0 && remaining <= 0;
                const noStock = available === 0;
                return (
                  <View key={p.id} style={[styles.itemRow, noStock && { opacity: 0.5 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemName}>{p.name}</Text>
                      <View style={styles.stockInfoRow}>
                        <Text style={styles.itemSku}>{p.sku}</Text>
                        <View style={[styles.stockBadge, isLow && styles.stockBadgeLow, noStock && styles.stockBadgeEmpty]}>
                          <Text style={[styles.stockBadgeText, isLow && { color: theme.color.brand }, noStock && { color: theme.color.muted }]}>
                            {noStock ? 'No stock' : `${remaining} avail`}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <View style={styles.stepper}>
                      <Pressable style={styles.stepBtn} onPress={() => bump(p.id, -1)} testID={`bag-${p.sku}-minus`} disabled={noStock}>
                        <Ionicons name="remove" size={16} color={noStock ? theme.color.muted : theme.color.onSurface} />
                      </Pressable>
                      <Text style={styles.stepVal}>{inBag}</Text>
                      <Pressable style={styles.stepBtn} onPress={() => bump(p.id, +1)} testID={`bag-${p.sku}-plus`} disabled={noStock || remaining <= 0}>
                        <Ionicons name="add" size={16} color={(noStock || remaining <= 0) ? theme.color.muted : theme.color.onSurface} />
                      </Pressable>
                    </View>
                  </View>
                );
              })}
              <Pressable testID="confirm-bag" style={[styles.submit, busy && { opacity: 0.5 }]} onPress={assignBag} disabled={busy}>
                {busy ? <ActivityIndicator color="#FFF" /> : (
                  <>
                    <Text style={styles.submitText}>Assign bag</Text>
                    <Ionicons name="arrow-forward" size={18} color="#FFF" />
                  </>
                )}
              </Pressable>
              <View style={{ height: 40 }} />
            </ScrollView>
          </SafeAreaView>
        </SafeAreaProvider>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.surfaceSecondary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: theme.color.surface },
  title: { fontFamily: theme.font.extrabold, fontSize: 22, color: theme.color.onSurface, letterSpacing: -0.4 },
  subtitle: { fontFamily: theme.font.medium, fontSize: 12, color: theme.color.muted, marginTop: 2 },
  closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.color.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: theme.radius.xl, backgroundColor: theme.color.surface, ...(theme.shadow.sm as any) },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.color.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: theme.font.extrabold, fontSize: 16, color: theme.color.muted },
  wName: { fontFamily: theme.font.bold, fontSize: 15, color: theme.color.onSurface },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  wStatus: { fontSize: 11, color: theme.color.muted, fontFamily: theme.font.medium },
  wStatusActive: { fontSize: 11, color: theme.color.success, fontFamily: theme.font.bold },
  assignBtn: { backgroundColor: theme.color.surfaceSecondary, paddingHorizontal: 14, paddingVertical: 10, borderRadius: theme.radius.pill },
  assignBtnAlt: { backgroundColor: theme.color.brand },
  assignBtnText: { fontSize: 12, fontFamily: theme.font.bold, color: theme.color.onSurface },
  // Warehouse banner
  warehouseBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: theme.color.infoSoft, paddingHorizontal: 20, paddingVertical: 10,
  },
  warehouseBannerText: { fontFamily: theme.font.semibold, fontSize: 11, color: theme.color.info },
  // Items
  itemRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: theme.radius.xl, backgroundColor: theme.color.surface, ...(theme.shadow.sm as any) },
  itemName: { fontFamily: theme.font.bold, fontSize: 15, color: theme.color.onSurface },
  itemSku: { fontSize: 11, color: theme.color.muted, fontFamily: theme.font.mono, letterSpacing: 0.5 },
  stockInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  stockBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: theme.radius.pill, backgroundColor: theme.color.successSoft },
  stockBadgeLow: { backgroundColor: theme.color.brandSoft },
  stockBadgeEmpty: { backgroundColor: theme.color.surfaceTertiary },
  stockBadgeText: { fontFamily: theme.font.bold, fontSize: 10, color: theme.color.success },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.color.surfaceSecondary, borderRadius: theme.radius.pill, padding: 4 },
  stepBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: theme.color.surface, alignItems: 'center', justifyContent: 'center', ...(theme.shadow.sm as any) },
  stepVal: { width: 36, textAlign: 'center', fontSize: 15, fontFamily: theme.font.extrabold, color: theme.color.onSurface },
  submit: {
    flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center',
    padding: 16, backgroundColor: theme.color.brand, borderRadius: theme.radius.pill,
    marginTop: 8, ...(theme.shadow.md as any),
  },
  submitText: { color: '#FFF', fontFamily: theme.font.extrabold, fontSize: 15 },
});