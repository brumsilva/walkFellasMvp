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

  const openAssign = (w: Walker) => {
    setSelectedWalker(w);
    setBagQty({});
    setShowAssign(true);
  };

  const bump = (pid: string, delta: number) => {
    hap.light();
    setBagQty((p) => {
      const next = { ...p, [pid]: Math.max(0, (p[pid] || 0) + delta) };
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
        <Text style={styles.title}>Walkers</Text>
        <Text style={styles.subtitle}>{active.length} active / {walkers.length} total</Text>
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
                    <Text style={styles.wStatusActive}>Active · {shift.current_units} units</Text>
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
            <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
              {products.map((p) => (
                <View key={p.id} style={styles.itemRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{p.name}</Text>
                    <Text style={styles.itemSku}>{p.sku}</Text>
                  </View>
                  <View style={styles.stepper}>
                    <Pressable style={styles.stepBtn} onPress={() => bump(p.id, -1)} testID={`bag-${p.sku}-minus`}>
                      <Ionicons name="remove" size={16} color={theme.color.onSurface} />
                    </Pressable>
                    <Text style={styles.stepVal}>{bagQty[p.id] || 0}</Text>
                    <Pressable style={styles.stepBtn} onPress={() => bump(p.id, +1)} testID={`bag-${p.sku}-plus`}>
                      <Ionicons name="add" size={16} color={theme.color.onSurface} />
                    </Pressable>
                  </View>
                </View>
              ))}
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
  itemRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: theme.radius.xl, backgroundColor: theme.color.surface, ...(theme.shadow.sm as any) },
  itemName: { fontFamily: theme.font.bold, fontSize: 15, color: theme.color.onSurface },
  itemSku: { fontSize: 11, color: theme.color.muted, fontFamily: theme.font.mono, letterSpacing: 0.5 },
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
