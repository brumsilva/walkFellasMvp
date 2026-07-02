import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { api, clearSession } from '@/src/lib/api';
import { theme } from '@/src/lib/theme';
import { hap } from '@/src/lib/haptics';
import { useToast } from '@/src/lib/toast';

type Product = { id: string; sku: string; name: string; price: number };

export default function CloseShift() {
  const router = useRouter();
  const toast = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [stock, setStock] = useState<Record<string, number>>({});
  const [physical, setPhysical] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      const [sh, prods] = await Promise.all([
        api<any>('/shifts/current'),
        api<any>('/products'),
      ]);
      const productList = Array.isArray(prods)
        ? prods
        : Array.isArray(prods?.products)
          ? prods.products
          : [];
      setProducts(productList);
      setStock(sh.stock || {});
      setResult(null);
      // Prefill physical with expected as starting point
      const init: Record<string, number> = {};
      Object.entries(sh.stock || {}).forEach(([pid, q]) => { init[pid] = q as number; });
      setPhysical(init);
    } catch (e: any) {
      toast.show(e.message || 'Load failed', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const bump = (pid: string, delta: number) => {
    hap.light();
    setPhysical((p) => ({ ...p, [pid]: Math.max(0, (p[pid] || 0) + delta) }));
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const items = Object.entries(physical).map(([product_id, quantity]) => ({ product_id, quantity }));
      const r = await api<any>('/shifts/close', { method: 'POST', body: JSON.stringify({ physical_count: items }) });
      hap.success();
      setResult(r);
      toast.show('Shift closed. Awaiting supervisor.', 'success');
    } catch (e: any) {
      hap.error();
      toast.show(e.message || 'Close failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const logout = async () => {
    await clearSession();
    router.replace('/');
  };

  if (loading) return <View style={styles.center}><ActivityIndicator /></View>;

  const productMap = Object.fromEntries(products.map((p) => [p.id, p]));

  if (result) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>RECONCILIATION</Text>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>TOTAL DISCREPANCY</Text>
            <Text style={[styles.summaryValue, { color: result.total_discrepancy > 0 ? theme.color.brand : theme.color.success }]}>
              {result.total_discrepancy} UNITS
            </Text>
          </View>
          <View style={styles.tableHead}>
            <Text style={[styles.thCell, { flex: 2 }]}>ITEM</Text>
            <Text style={styles.thCell}>EXP</Text>
            <Text style={styles.thCell}>PHY</Text>
            <Text style={styles.thCell}>DIFF</Text>
          </View>
          {result.reconciliation.map((r: any) => {
            const p = productMap[r.product_id];
            return (
              <View key={r.product_id} style={styles.trow}>
                <Text style={[styles.tcell, { flex: 2, fontWeight: '800' }]} numberOfLines={1}>{p?.name || r.product_id}</Text>
                <Text style={styles.tcell}>{r.expected}</Text>
                <Text style={styles.tcell}>{r.physical}</Text>
                <Text style={[styles.tcell, { color: r.discrepancy === 0 ? theme.color.success : theme.color.brand, fontWeight: '900' }]}>
                  {r.discrepancy > 0 ? '+' : ''}{r.discrepancy}
                </Text>
              </View>
            );
          })}
          <Pressable style={styles.doneBtn} onPress={logout} testID="shift-done">
            <Text style={styles.doneBtnText}>LOG OUT →</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>CLOSE SHIFT</Text>
        <Text style={styles.subtitle}>Count what is physically in your bag.</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 12, gap: 6 }}>
        {products.map((p) => {
          const exp = stock[p.id] || 0;
          const phy = physical[p.id] || 0;
          return (
            <View key={p.id} style={styles.row} testID={`close-row-${p.sku}`}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{p.name}</Text>
                <Text style={styles.rowMono}>EXPECTED: {exp}</Text>
              </View>
              <View style={styles.stepper}>
                <Pressable style={styles.stepBtn} onPress={() => bump(p.id, -1)} testID={`close-${p.sku}-minus`}>
                  <Text style={styles.stepBtnText}>−</Text>
                </Pressable>
                <Text style={styles.stepVal}>{phy}</Text>
                <Pressable style={styles.stepBtn} onPress={() => bump(p.id, +1)} testID={`close-${p.sku}-plus`}>
                  <Text style={styles.stepBtnText}>+</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
        <Pressable
          testID="submit-close"
          style={[styles.submit, submitting && { opacity: 0.5 }]}
          onPress={submit}
          disabled={submitting}
        >
          {submitting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitText}>CLOSE SHIFT →</Text>}
        </Pressable>
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 2, borderBottomColor: theme.color.borderStrong },
  title: { fontSize: 22, fontWeight: '900', letterSpacing: -1 },
  subtitle: { fontSize: 12, color: theme.color.muted, marginTop: 4 },
  row: {
    flexDirection: 'row', alignItems: 'center', padding: 14,
    borderWidth: 2, borderColor: theme.color.borderStrong,
  },
  rowName: { fontSize: 15, fontWeight: '800' },
  rowMono: { fontFamily: theme.font.mono, fontSize: 11, color: theme.color.muted, letterSpacing: 1, marginTop: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderColor: theme.color.borderStrong },
  stepBtn: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: theme.color.surfaceSecondary },
  stepBtnText: { fontSize: 22, fontWeight: '900' },
  stepVal: { width: 44, textAlign: 'center', fontSize: 18, fontWeight: '900', fontFamily: theme.font.mono },
  submit: { padding: 20, backgroundColor: theme.color.brand, borderWidth: 2, borderColor: theme.color.borderStrong, alignItems: 'center', marginTop: 12 },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  summaryBox: { borderWidth: 2, borderColor: theme.color.borderStrong, padding: 20, marginBottom: 16, alignItems: 'center' },
  summaryLabel: { fontSize: 11, letterSpacing: 2, fontWeight: '800', color: theme.color.muted },
  summaryValue: { fontSize: 36, fontWeight: '900', fontFamily: theme.font.mono, marginTop: 6 },
  tableHead: { flexDirection: 'row', backgroundColor: theme.color.surfaceInverse, paddingVertical: 8, paddingHorizontal: 8 },
  thCell: { flex: 1, textAlign: 'center', color: '#FFF', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  trow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: theme.color.border, paddingVertical: 10, paddingHorizontal: 8 },
  tcell: { flex: 1, textAlign: 'center', fontFamily: theme.font.mono, fontSize: 14 },
  doneBtn: { marginTop: 20, padding: 20, backgroundColor: theme.color.surfaceInverse, alignItems: 'center' },
  doneBtnText: { color: '#FFF', fontSize: 16, fontWeight: '900', letterSpacing: 1 },
});
