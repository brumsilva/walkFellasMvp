import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, TextInput, Modal } from 'react-native';
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
      const walkerList = Array.isArray(ws)
        ? ws
        : Array.isArray(ws?.walkers)
          ? ws.walkers
          : [];
      const activeList = Array.isArray(act)
        ? act
        : Array.isArray(act?.active)
          ? act.active
          : [];
      const productList = Array.isArray(pr)
        ? pr
        : Array.isArray(pr?.products)
          ? pr.products
          : [];
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

  if (loading) return <View style={styles.center}><ActivityIndicator /></View>;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>WALKERS</Text>
        <Text style={styles.subtitle}>{active.length} ACTIVE / {walkers.length} TOTAL</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 12, gap: 8 }}>
        {walkers.map((w) => {
          const shift = activeMap[w.id];
          return (
            <View key={w.id} style={styles.card} testID={`walker-${w.id}`}>
              <View style={{ flex: 1 }}>
                <Text style={styles.wName}>{w.name}</Text>
                {shift ? (
                  <Text style={styles.wMonoActive}>● ACTIVE • {shift.current_units} UNITS</Text>
                ) : (
                  <Text style={styles.wMono}>○ OFF SHIFT</Text>
                )}
              </View>
              <Pressable
                testID={`assign-${w.id}`}
                style={[styles.assignBtn, shift && styles.assignBtnAlt]}
                onPress={() => openAssign(w)}
              >
                <Text style={[styles.assignBtnText, shift && { color: '#FFF' }]}>
                  {shift ? 'REASSIGN' : 'ASSIGN BAG'}
                </Text>
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
              <Text style={styles.title}>ASSIGN BAG</Text>
              <Text style={styles.subtitle}>{selectedWalker?.name}</Text>
            </View>
            <Pressable onPress={() => setShowAssign(false)} testID="close-assign"><Ionicons name="close" size={28} /></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 12, gap: 6 }}>
            {products.map((p) => (
              <View key={p.id} style={styles.itemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{p.name}</Text>
                  <Text style={styles.itemSku}>{p.sku}</Text>
                </View>
                <View style={styles.stepper}>
                  <Pressable style={styles.stepBtn} onPress={() => bump(p.id, -1)} testID={`bag-${p.sku}-minus`}>
                    <Text style={styles.stepBtnText}>−</Text>
                  </Pressable>
                  <Text style={styles.stepVal}>{bagQty[p.id] || 0}</Text>
                  <Pressable style={styles.stepBtn} onPress={() => bump(p.id, +1)} testID={`bag-${p.sku}-plus`}>
                    <Text style={styles.stepBtnText}>+</Text>
                  </Pressable>
                </View>
              </View>
            ))}
            <Pressable testID="confirm-bag" style={[styles.submit, busy && { opacity: 0.5 }]} onPress={assignBag} disabled={busy}>
              {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitText}>ASSIGN BAG →</Text>}
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
  container: { flex: 1, backgroundColor: theme.color.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 2, borderBottomColor: theme.color.borderStrong },
  title: { fontSize: 22, fontWeight: '900', letterSpacing: -1 },
  subtitle: { fontSize: 12, color: theme.color.muted, marginTop: 2, fontFamily: theme.font.mono, letterSpacing: 1 },
  card: { flexDirection: 'row', alignItems: 'center', padding: 14, borderWidth: 2, borderColor: theme.color.borderStrong },
  wName: { fontSize: 16, fontWeight: '800' },
  wMono: { fontSize: 11, color: theme.color.muted, fontFamily: theme.font.mono, marginTop: 4, letterSpacing: 1 },
  wMonoActive: { fontSize: 11, color: theme.color.success, fontFamily: theme.font.mono, marginTop: 4, letterSpacing: 1, fontWeight: '900' },
  assignBtn: { borderWidth: 2, borderColor: theme.color.borderStrong, paddingHorizontal: 14, paddingVertical: 10 },
  assignBtnAlt: { backgroundColor: theme.color.surfaceInverse },
  assignBtnText: { fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  itemRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderWidth: 2, borderColor: theme.color.borderStrong },
  itemName: { fontSize: 15, fontWeight: '800' },
  itemSku: { fontSize: 11, color: theme.color.muted, fontFamily: theme.font.mono, letterSpacing: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderColor: theme.color.borderStrong },
  stepBtn: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: theme.color.surfaceSecondary },
  stepBtnText: { fontSize: 20, fontWeight: '900' },
  stepVal: { width: 44, textAlign: 'center', fontSize: 16, fontWeight: '900', fontFamily: theme.font.mono },
  submit: { padding: 20, backgroundColor: theme.color.brand, borderWidth: 2, borderColor: theme.color.borderStrong, alignItems: 'center', marginTop: 12 },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '900', letterSpacing: 1 },
});
