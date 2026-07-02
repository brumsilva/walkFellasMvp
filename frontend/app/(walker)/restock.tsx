import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { api } from '@/src/lib/api';
import { theme } from '@/src/lib/theme';
import { hap } from '@/src/lib/haptics';
import { useToast } from '@/src/lib/toast';

type Product = { id: string; sku: string; name: string; price: number };

export default function Restock() {
  const toast = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [pending, setPending] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [prods, restocks] = await Promise.all([
        api<Product[]>('/products'),
        api<any[]>('/restocks?status_filter=pending'),
      ]);
      setProducts(prods);
      setPending(restocks);
    } catch (e: any) {
      toast.show(e.message || 'Load failed', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const bump = (id: string, delta: number) => {
    hap.light();
    const next = { ...qty };
    next[id] = Math.max(0, (next[id] || 0) + delta);
    if (next[id] === 0) delete next[id];
    setQty(next);
  };

  const submit = async () => {
    const items = Object.entries(qty).map(([product_id, quantity]) => ({ product_id, quantity }));
    if (!items.length) {
      toast.show('Select at least one item', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await api('/restocks', { method: 'POST', body: JSON.stringify({ items }) });
      hap.success();
      toast.show('Restock requested', 'success');
      setQty({});
      await load();
    } catch (e: any) {
      hap.error();
      toast.show(e.message || 'Failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const total = Object.values(qty).reduce((a, b) => a + b, 0);

  if (loading) return <View style={styles.center}><ActivityIndicator /></View>;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>RESTOCK REQUEST</Text>
      </View>

      {pending.length > 0 && (
        <View style={styles.pendingBanner}>
          <Text style={styles.pendingText}>{pending.length} PENDING REQUEST{pending.length > 1 ? 'S' : ''}</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: 12, gap: 8 }}>
        {products.map((p) => {
          const q = qty[p.id] || 0;
          return (
            <View key={p.id} style={styles.row} testID={`restock-row-${p.sku}`}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowSku}>{p.sku}</Text>
                <Text style={styles.rowName}>{p.name}</Text>
              </View>
              <View style={styles.stepper}>
                <Pressable style={styles.stepBtn} onPress={() => bump(p.id, -1)} testID={`restock-${p.sku}-minus`}>
                  <Text style={styles.stepBtnText}>−</Text>
                </Pressable>
                <Text style={styles.stepVal}>{q}</Text>
                <Pressable style={styles.stepBtn} onPress={() => bump(p.id, +1)} testID={`restock-${p.sku}-plus`}>
                  <Text style={styles.stepBtnText}>+</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
        <View style={{ height: 100 }} />
      </ScrollView>

      {total > 0 && (
        <View style={styles.checkoutBar}>
          <Text style={styles.checkQty}>{total} UNITS</Text>
          <Pressable
            testID="submit-restock"
            style={[styles.checkBtn, submitting && { opacity: 0.5 }]}
            onPress={submit}
            disabled={submitting}
          >
            {submitting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.checkBtnText}>REQUEST →</Text>}
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 2, borderBottomColor: theme.color.borderStrong },
  title: { fontSize: 22, fontWeight: '900', letterSpacing: -1 },
  pendingBanner: { backgroundColor: theme.color.warning, paddingVertical: 10, paddingHorizontal: 16, borderBottomWidth: 2, borderBottomColor: theme.color.borderStrong },
  pendingText: { fontWeight: '900', fontSize: 12, letterSpacing: 1 },
  row: {
    flexDirection: 'row', alignItems: 'center', padding: 14,
    borderWidth: 2, borderColor: theme.color.borderStrong, backgroundColor: theme.color.surface,
  },
  rowSku: { fontFamily: theme.font.mono, fontSize: 11, color: theme.color.muted, letterSpacing: 1, fontWeight: '700' },
  rowName: { fontSize: 16, fontWeight: '800', marginTop: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderColor: theme.color.borderStrong },
  stepBtn: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: theme.color.surfaceSecondary },
  stepBtnText: { fontSize: 22, fontWeight: '900' },
  stepVal: { width: 40, textAlign: 'center', fontSize: 18, fontWeight: '900', fontFamily: theme.font.mono },
  checkoutBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 2, borderTopColor: theme.color.borderStrong, backgroundColor: theme.color.surfaceInverse },
  checkQty: { color: '#FFF', fontSize: 20, fontWeight: '900', fontFamily: theme.font.mono },
  checkBtn: { backgroundColor: theme.color.brand, borderWidth: 2, borderColor: '#FFF', paddingVertical: 16, paddingHorizontal: 20 },
  checkBtnText: { color: '#FFF', fontSize: 14, fontWeight: '900', letterSpacing: 1 },
});
