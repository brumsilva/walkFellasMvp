import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { api } from '@/src/lib/api';
import { theme } from '@/src/lib/theme';
import { hap } from '@/src/lib/haptics';
import { useToast } from '@/src/lib/toast';

type Product = { id: string; sku: string; name: string };
type Restock = { id: string; walker_name: string; items: { product_id: string; quantity: number }[]; created_at: string };

export default function Queue() {
  const toast = useToast();
  const [restocks, setRestocks] = useState<Restock[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [tab, setTab] = useState<'restock' | 'close'>('restock');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [rs, sh, pr] = await Promise.all([
        api<any>('/restocks?status_filter=pending'),
        api<any>('/shifts?status_filter=closed_pending_review'),
        api<any>('/products'),
      ]);
      const restockList = Array.isArray(rs) ? rs : Array.isArray(rs?.restocks) ? rs.restocks : [];
      const shiftList = Array.isArray(sh) ? sh : Array.isArray(sh?.shifts) ? sh.shifts : [];
      const productList = Array.isArray(pr) ? pr : Array.isArray(pr?.products) ? pr.products : [];
      setRestocks(restockList);
      setShifts(shiftList);
      setProducts(productList);
    } catch (e: any) {
      toast.show(e.message || 'Load failed', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const productMap = Object.fromEntries(products.map((p) => [p.id, p]));

  const approve = async (r: Restock) => {
    setBusyId(r.id);
    try {
      await api(`/restocks/${r.id}/approve`, { method: 'POST', body: JSON.stringify({ delivered_items: r.items }) });
      hap.success();
      toast.show('Restock delivered', 'success');
      await load();
    } catch (e: any) {
      hap.error();
      toast.show(e.message || 'Failed', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (r: Restock) => {
    setBusyId(r.id);
    try {
      await api(`/restocks/${r.id}/reject`, { method: 'POST' });
      hap.warning();
      toast.show('Restock rejected', 'info');
      await load();
    } catch (e: any) {
      toast.show(e.message || 'Failed', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const confirmClose = async (id: string) => {
    setBusyId(id);
    try {
      await api(`/shifts/${id}/confirm`, { method: 'POST' });
      hap.success();
      toast.show('Shift confirmed', 'success');
      await load();
    } catch (e: any) {
      toast.show(e.message || 'Failed', 'error');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={theme.color.brand} /></View>;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Queue</Text>
      </View>
      <View style={styles.segment}>
        <Pressable
          testID="tab-restock"
          style={[styles.segBtn, tab === 'restock' && styles.segBtnActive]}
          onPress={() => { hap.light(); setTab('restock'); }}
        >
          <Text style={[styles.segText, tab === 'restock' && styles.segTextActive]}>Restock ({restocks.length})</Text>
        </Pressable>
        <Pressable
          testID="tab-close"
          style={[styles.segBtn, tab === 'close' && styles.segBtnActive]}
          onPress={() => { hap.light(); setTab('close'); }}
        >
          <Text style={[styles.segText, tab === 'close' && styles.segTextActive]}>Shift close ({shifts.length})</Text>
        </Pressable>
      </View>

      {tab === 'restock' && (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          {restocks.length === 0 && (
            <View style={styles.emptyBox}>
              <Image
                source={{ uri: 'https://images.unsplash.com/photo-1587293852726-70cdb56c2866?crop=entropy&cs=srgb&fm=jpg&h=400&w=400&q=80' }}
                style={{ width: 140, height: 140, marginBottom: 12, borderRadius: theme.radius.xl }}
                contentFit="cover"
              />
              <Text style={styles.emptyTitle}>Queue is clear</Text>
              <Text style={styles.emptySub}>No pending restock requests.</Text>
            </View>
          )}
          {restocks.map((r) => (
            <View key={r.id} style={styles.qCard} testID={`restock-${r.id}`}>
              <View style={styles.qHead}>
                <Text style={styles.qWalker}>{r.walker_name}</Text>
                <Text style={styles.qTime}>{new Date(r.created_at).toLocaleTimeString()}</Text>
              </View>
              <View style={{ marginVertical: 10, gap: 4 }}>
                {r.items.map((it, idx) => (
                  <View key={idx} style={styles.qItem}>
                    <Text style={styles.qItemName}>{productMap[it.product_id]?.name || it.product_id}</Text>
                    <Text style={styles.qItemQty}>× {it.quantity}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.actions}>
                <Pressable testID={`reject-${r.id}`} style={styles.rejectBtn} disabled={busyId === r.id} onPress={() => reject(r)}>
                  <Text style={styles.rejectText}>Reject</Text>
                </Pressable>
                <Pressable testID={`approve-${r.id}`} style={styles.approveBtn} disabled={busyId === r.id} onPress={() => approve(r)}>
                  {busyId === r.id ? <ActivityIndicator color="#FFF" /> : <Text style={styles.approveText}>Deliver</Text>}
                </Pressable>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {tab === 'close' && (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          {shifts.length === 0 && (
            <View style={styles.emptyBox}><Text style={styles.emptyTitle}>No pending close-outs</Text></View>
          )}
          {shifts.map((s) => (
            <View key={s.id} style={styles.qCard} testID={`shift-${s.id}`}>
              <View style={styles.qHead}>
                <Text style={styles.qWalker}>{s.walker_name}</Text>
                <Text style={styles.qTime}>{new Date(s.closed_at).toLocaleTimeString()}</Text>
              </View>
              <View style={styles.discBox}>
                <Text style={styles.discLabel}>Discrepancy</Text>
                <Text style={[styles.discVal, s.total_discrepancy > 0 && { color: theme.color.brand }]}>
                  {s.total_discrepancy || 0} units
                </Text>
              </View>
              <View style={{ marginTop: 8 }}>
                {(s.reconciliation || []).filter((x: any) => x.discrepancy !== 0).slice(0, 4).map((x: any, i: number) => (
                  <View key={i} style={styles.qItem}>
                    <Text style={styles.qItemName}>{productMap[x.product_id]?.name || x.product_id}</Text>
                    <Text style={[styles.qItemQty, { color: theme.color.brand }]}>{x.discrepancy > 0 ? '+' : ''}{x.discrepancy}</Text>
                  </View>
                ))}
              </View>
              <Pressable style={[styles.approveBtn, { marginTop: 12 }]} onPress={() => confirmClose(s.id)} testID={`confirm-${s.id}`}>
                <Text style={styles.approveText}>Confirm close</Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.surfaceSecondary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: 20, paddingVertical: 16, backgroundColor: theme.color.surface },
  title: { fontFamily: theme.font.extrabold, fontSize: 22, color: theme.color.onSurface, letterSpacing: -0.4 },
  segment: { flexDirection: 'row', backgroundColor: theme.color.surface, paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  segBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: theme.radius.pill, backgroundColor: theme.color.surfaceSecondary },
  segBtnActive: { backgroundColor: theme.color.brand },
  segText: { fontFamily: theme.font.bold, fontSize: 12, color: theme.color.onSurface },
  segTextActive: { color: '#FFF' },
  emptyBox: { padding: 40, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontFamily: theme.font.extrabold, fontSize: 16, color: theme.color.onSurface },
  emptySub: { fontFamily: theme.font.medium, fontSize: 12, color: theme.color.muted, marginTop: 6 },
  qCard: { borderRadius: theme.radius.xl, backgroundColor: theme.color.surface, padding: 16, ...(theme.shadow.sm as any) },
  qHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  qWalker: { fontFamily: theme.font.extrabold, fontSize: 16, color: theme.color.onSurface },
  qTime: { fontFamily: theme.font.medium, fontSize: 11, color: theme.color.muted },
  qItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  qItemName: { fontFamily: theme.font.semibold, fontSize: 14, color: theme.color.onSurfaceSecondary },
  qItemQty: { fontFamily: theme.font.extrabold, fontSize: 14, color: theme.color.onSurface },
  actions: { flexDirection: 'row', gap: 8, marginTop: 6 },
  rejectBtn: { flex: 1, backgroundColor: theme.color.surfaceSecondary, borderRadius: theme.radius.pill, paddingVertical: 13, alignItems: 'center' },
  rejectText: { fontFamily: theme.font.bold, fontSize: 13, color: theme.color.onSurface },
  approveBtn: { flex: 1, backgroundColor: theme.color.brand, borderRadius: theme.radius.pill, paddingVertical: 13, alignItems: 'center' },
  approveText: { color: '#FFF', fontFamily: theme.font.bold, fontSize: 13 },
  discBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, backgroundColor: theme.color.surfaceSecondary, borderRadius: theme.radius.lg, marginTop: 8 },
  discLabel: { fontFamily: theme.font.bold, fontSize: 11, color: theme.color.muted, letterSpacing: 0.3 },
  discVal: { fontFamily: theme.font.extrabold, fontSize: 17, color: theme.color.onSurface },
});
