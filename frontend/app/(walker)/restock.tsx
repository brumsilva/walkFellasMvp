import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { mutate } from '@/src/lib/outbox';
import { theme } from '@/src/lib/theme';
import { hap } from '@/src/lib/haptics';
import { useToast } from '@/src/lib/toast';

type Product = { id: string; sku: string; name: string; price: number };
type Suggestion = {
  product_id: string; sku: string; name: string;
  current_stock: number; sold_last_window: number;
  window_minutes: number; rate_per_min: number; suggested_qty: number;
};

export default function Restock() {
  const toast = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [pending, setPending] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [hasShift, setHasShift] = useState(true);

  const load = useCallback(async () => {
    try {
      // Check if walker has active shift first
      const shiftRes = await api<any>('/shifts/current').catch(() => null);
      if (!shiftRes?.shift) {
        setHasShift(false);
        setLoading(false);
        return;
      }
      setHasShift(true);

      const [prods, restocks, sug] = await Promise.all([
        api<any>('/products'),
        api<any>('/restocks?status_filter=pending'),
        api<{ suggestions: Suggestion[] }>('/restocks/suggestions').catch(() => ({ suggestions: [] })),
      ]);
      const productList = Array.isArray(prods)
        ? prods
        : Array.isArray(prods?.products)
          ? prods.products
          : [];
      const pendingList = Array.isArray(restocks)
        ? restocks
        : Array.isArray(restocks?.restocks)
          ? restocks.restocks
          : [];
      const suggestionList = Array.isArray(sug?.suggestions) ? sug.suggestions : [];
      setProducts(productList);
      setPending(pendingList);
      setSuggestions(suggestionList);
    } catch (e: any) {
      toast.show(e.message || 'Load failed', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const applySuggestions = () => {
    hap.medium();
    const next: Record<string, number> = {};
    suggestions.forEach((s) => {
      if (s.suggested_qty > 0) next[s.product_id] = s.suggested_qty;
    });
    setQty(next);
    toast.show('Applied suggestions', 'success');
  };

  const bump = (id: string, delta: number) => {
    hap.light();
    const next = { ...qty };
    next[id] = Math.max(0, (next[id] || 0) + delta);
    if (next[id] === 0) delete next[id];
    setQty(next);
  };

  const submit = async () => {
    const items = Object.entries(qty).map(([product_id, quantity]) => ({ product_id, quantity }));
    if (!items.length) { toast.show('Select at least one item', 'error'); return; }
    setSubmitting(true);
    try {
      const r = await mutate('/restocks', { items }, { label: `Restock ${items.length} items` });
      if (r.online) { hap.success(); toast.show('Restock requested', 'success'); }
      else { hap.warning(); toast.show('Offline \u2014 request queued', 'info'); }
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
  const suggestionMap: Record<string, Suggestion> = Object.fromEntries(suggestions.map((s) => [s.product_id, s]));
  const hasSuggestions = suggestions.some((s) => s.suggested_qty > 0);

  if (loading) return <View style={styles.center}><ActivityIndicator color={theme.color.brand} /></View>;

  // ====== FIX 1: Show empty state when walker has no active bag ======
  if (!hasShift) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Restock</Text>
            <Text style={styles.subtitle}>Request more stock for your bag</Text>
          </View>
        </View>
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Ionicons name="bag-outline" size={48} color={theme.color.muted} />
          </View>
          <Text style={styles.emptyTitle}>No active bag</Text>
          <Text style={styles.emptySubtitle}>
            You need an active bag to request restocks.{'\n'}Ask your supervisor to assign one.
          </Text>
          <Pressable style={styles.retryBtn} onPress={load} testID="retry-restock">
            <Ionicons name="refresh" size={16} color={theme.color.brand} />
            <Text style={styles.retryText}>Check again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Restock</Text>
          <Text style={styles.subtitle}>Request more stock for your bag</Text>
        </View>
        {hasSuggestions && (
          <Pressable style={styles.suggestBtn} onPress={applySuggestions} testID="use-suggestions">
            <Ionicons name="flash" size={14} color="#FFF" />
            <Text style={styles.suggestBtnText}>Use suggestions</Text>
          </Pressable>
        )}
      </View>

      {pending.length > 0 && (
        <View style={styles.pendingBanner}>
          <Ionicons name="time-outline" size={16} color="#8B6D19" />
          <Text style={styles.pendingText}>{pending.length} pending request{pending.length > 1 ? 's' : ''}</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
        {products.map((p) => {
          const q = qty[p.id] || 0;
          const s = suggestionMap[p.id];
          return (
            <View key={p.id} style={styles.row} testID={`restock-row-${p.sku}`}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowSku}>{p.sku}</Text>
                <Text style={styles.rowName}>{p.name}</Text>
                {s && s.suggested_qty > 0 && (
                  <View style={styles.suggestChip}>
                    <Ionicons name="trending-up" size={11} color={theme.color.brand} />
                    <Text style={styles.suggestChipText}>Suggested {s.suggested_qty} {'\u00B7'} {s.rate_per_min}/min</Text>
                  </View>
                )}
              </View>
              <View style={styles.stepper}>
                <Pressable style={styles.stepBtn} onPress={() => bump(p.id, -1)} testID={`restock-${p.sku}-minus`}>
                  <Ionicons name="remove" size={16} color={theme.color.onSurface} />
                </Pressable>
                <Text style={styles.stepVal}>{q}</Text>
                <Pressable style={styles.stepBtn} onPress={() => bump(p.id, +1)} testID={`restock-${p.sku}-plus`}>
                  <Ionicons name="add" size={16} color={theme.color.onSurface} />
                </Pressable>
              </View>
            </View>
          );
        })}
        <View style={{ height: 100 }} />
      </ScrollView>

      {total > 0 && (
        <View style={styles.checkoutBar}>
          <Text style={styles.checkQty}>{total} units selected</Text>
          <Pressable
            testID="submit-restock"
            style={[styles.checkBtn, submitting && { opacity: 0.6 }]}
            onPress={submit}
            disabled={submitting}
          >
            {submitting ? <ActivityIndicator color="#FFF" /> : (
              <>
                <Text style={styles.checkBtnText}>Request</Text>
                <Ionicons name="arrow-forward" size={16} color="#FFF" />
              </>
            )}
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.surfaceSecondary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: 20, paddingVertical: 16, backgroundColor: theme.color.surface, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: theme.font.extrabold, fontSize: 22, color: theme.color.onSurface, letterSpacing: -0.4 },
  subtitle: { fontFamily: theme.font.medium, fontSize: 12, color: theme.color.muted, marginTop: 2 },
  // Empty state
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  emptyIcon: { width: 88, height: 88, borderRadius: 44, backgroundColor: theme.color.surfaceTertiary, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  emptyTitle: { fontFamily: theme.font.extrabold, fontSize: 20, color: theme.color.onSurface },
  emptySubtitle: { fontFamily: theme.font.medium, fontSize: 14, color: theme.color.muted, textAlign: 'center', lineHeight: 20 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.color.brandSoft, paddingHorizontal: 18, paddingVertical: 12, borderRadius: theme.radius.pill, marginTop: 8 },
  retryText: { fontFamily: theme.font.bold, fontSize: 13, color: theme.color.brand },
  // Rest
  suggestBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.color.brand, paddingHorizontal: 14, paddingVertical: 10, borderRadius: theme.radius.pill, ...(theme.shadow.sm as any) },
  suggestBtnText: { color: '#FFF', fontSize: 12, fontFamily: theme.font.bold },
  pendingBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.color.warningSoft, paddingVertical: 10, paddingHorizontal: 20 },
  pendingText: { fontFamily: theme.font.bold, fontSize: 12, color: '#8B6D19' },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: theme.radius.xl, backgroundColor: theme.color.surface, ...(theme.shadow.sm as any) },
  rowSku: { fontFamily: theme.font.mono, fontSize: 11, color: theme.color.muted, letterSpacing: 0.5 },
  rowName: { fontFamily: theme.font.bold, fontSize: 15, color: theme.color.onSurface, marginTop: 2 },
  suggestChip: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: theme.color.brandSoft, borderRadius: theme.radius.pill },
  suggestChipText: { fontSize: 10, fontFamily: theme.font.bold, color: theme.color.brand },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.color.surfaceSecondary, borderRadius: theme.radius.pill, padding: 4 },
  stepBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: theme.color.surface, alignItems: 'center', justifyContent: 'center', ...(theme.shadow.sm as any) },
  stepVal: { width: 36, textAlign: 'center', fontSize: 15, fontFamily: theme.font.extrabold, color: theme.color.onSurface },
  checkoutBar: {
    position: 'absolute', left: 16, right: 16, bottom: 16,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: theme.color.surfaceInverse, borderRadius: theme.radius.xxl,
    paddingHorizontal: 20, paddingVertical: 16,
    ...(theme.shadow.lg as any),
  },
  checkQty: { color: '#FFF', fontFamily: theme.font.bold, fontSize: 14 },
  checkBtn: { flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: theme.color.brand, borderRadius: theme.radius.pill, paddingVertical: 12, paddingHorizontal: 18 },
  checkBtnText: { color: '#FFF', fontFamily: theme.font.bold, fontSize: 13 },
});