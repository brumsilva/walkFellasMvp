import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
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

  if (loading) return <View style={styles.center}><ActivityIndicator color={theme.color.brand} /></View>;

  const productMap = Object.fromEntries(products.map((p) => [p.id, p]));

  if (result) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>Reconciliation</Text>
          <Text style={styles.subtitle}>Shift summary</Text>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
          <View style={styles.summaryBox}>
            <View style={[styles.summaryIcon, { backgroundColor: result.total_discrepancy > 0 ? theme.color.brandSoft : theme.color.successSoft }]}>
              <Ionicons name={result.total_discrepancy > 0 ? 'alert-circle' : 'checkmark-circle'} size={28} color={result.total_discrepancy > 0 ? theme.color.brand : theme.color.success} />
            </View>
            <Text style={styles.summaryLabel}>Total discrepancy</Text>
            <Text style={[styles.summaryValue, { color: result.total_discrepancy > 0 ? theme.color.brand : theme.color.success }]}>
              {result.total_discrepancy} units
            </Text>
          </View>
          <View style={styles.tableCard}>
            <View style={styles.tableHead}>
              <Text style={[styles.thCell, { flex: 2, textAlign: 'left' }]}>Item</Text>
              <Text style={styles.thCell}>Exp</Text>
              <Text style={styles.thCell}>Phy</Text>
              <Text style={styles.thCell}>Diff</Text>
            </View>
            {result.reconciliation.map((r: any, idx: number) => {
              const p = productMap[r.product_id];
              return (
                <View key={r.product_id} style={[styles.trow, idx === result.reconciliation.length - 1 && { borderBottomWidth: 0 }]}>
                  <Text style={[styles.tcell, { flex: 2, textAlign: 'left', fontFamily: theme.font.bold }]} numberOfLines={1}>{p?.name || r.product_id}</Text>
                  <Text style={styles.tcell}>{r.expected}</Text>
                  <Text style={styles.tcell}>{r.physical}</Text>
                  <Text style={[styles.tcell, { color: r.discrepancy === 0 ? theme.color.success : theme.color.brand, fontFamily: theme.font.extrabold }]}>
                    {r.discrepancy > 0 ? '+' : ''}{r.discrepancy}
                  </Text>
                </View>
              );
            })}
          </View>
          <Pressable style={styles.doneBtn} onPress={logout} testID="shift-done">
            <Text style={styles.doneBtnText}>Log out</Text>
            <Ionicons name="arrow-forward" size={16} color="#FFF" />
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Close shift</Text>
        <Text style={styles.subtitle}>Count what is physically in your bag</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
        {products.map((p) => {
          const exp = stock[p.id] || 0;
          const phy = physical[p.id] || 0;
          return (
            <View key={p.id} style={styles.row} testID={`close-row-${p.sku}`}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{p.name}</Text>
                <Text style={styles.rowMono}>Expected: {exp}</Text>
              </View>
              <View style={styles.stepper}>
                <Pressable style={styles.stepBtn} onPress={() => bump(p.id, -1)} testID={`close-${p.sku}-minus`}>
                  <Ionicons name="remove" size={16} color={theme.color.onSurface} />
                </Pressable>
                <Text style={styles.stepVal}>{phy}</Text>
                <Pressable style={styles.stepBtn} onPress={() => bump(p.id, +1)} testID={`close-${p.sku}-plus`}>
                  <Ionicons name="add" size={16} color={theme.color.onSurface} />
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
          {submitting ? <ActivityIndicator color="#FFF" /> : (
            <>
              <Text style={styles.submitText}>Close shift</Text>
              <Ionicons name="arrow-forward" size={18} color="#FFF" />
            </>
          )}
        </Pressable>
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.surfaceSecondary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: 20, paddingVertical: 16, backgroundColor: theme.color.surface },
  title: { fontFamily: theme.font.extrabold, fontSize: 22, color: theme.color.onSurface, letterSpacing: -0.4 },
  subtitle: { fontFamily: theme.font.medium, fontSize: 12, color: theme.color.muted, marginTop: 2 },
  row: {
    flexDirection: 'row', alignItems: 'center', padding: 14,
    borderRadius: theme.radius.xl, backgroundColor: theme.color.surface,
    ...(theme.shadow.sm as any),
  },
  rowName: { fontFamily: theme.font.bold, fontSize: 15, color: theme.color.onSurface },
  rowMono: { fontFamily: theme.font.mono, fontSize: 11, color: theme.color.muted, letterSpacing: 0.5, marginTop: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.color.surfaceSecondary, borderRadius: theme.radius.pill, padding: 4 },
  stepBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: theme.color.surface, alignItems: 'center', justifyContent: 'center', ...(theme.shadow.sm as any) },
  stepVal: { width: 40, textAlign: 'center', fontSize: 15, fontFamily: theme.font.extrabold, color: theme.color.onSurface },
  submit: {
    flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center',
    padding: 16, backgroundColor: theme.color.brand, borderRadius: theme.radius.pill,
    marginTop: 8, ...(theme.shadow.md as any),
  },
  submitText: { color: '#FFF', fontFamily: theme.font.extrabold, fontSize: 15 },
  summaryBox: { borderRadius: theme.radius.xxl, backgroundColor: theme.color.surface, padding: 24, alignItems: 'center', ...(theme.shadow.sm as any) },
  summaryIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  summaryLabel: { fontFamily: theme.font.semibold, fontSize: 12, color: theme.color.muted, letterSpacing: 0.3 },
  summaryValue: { fontFamily: theme.font.black, fontSize: 34, marginTop: 4 },
  tableCard: { borderRadius: theme.radius.xl, backgroundColor: theme.color.surface, overflow: 'hidden', ...(theme.shadow.sm as any) },
  tableHead: { flexDirection: 'row', backgroundColor: theme.color.surfaceInverse, paddingVertical: 10, paddingHorizontal: 14 },
  thCell: { flex: 1, textAlign: 'center', color: '#FFF', fontSize: 11, fontFamily: theme.font.bold, letterSpacing: 0.3 },
  trow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: theme.color.divider, paddingVertical: 12, paddingHorizontal: 14 },
  tcell: { flex: 1, textAlign: 'center', fontFamily: theme.font.medium, fontSize: 14, color: theme.color.onSurface },
  doneBtn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 4, padding: 16, backgroundColor: theme.color.surfaceInverse, borderRadius: theme.radius.pill, ...(theme.shadow.md as any) },
  doneBtnText: { color: '#FFF', fontFamily: theme.font.extrabold, fontSize: 15 },
});
