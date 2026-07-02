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
        api<Restock[]>('/restocks?status_filter=pending'),
        api<any[]>('/shifts?status_filter=closed_pending_review'),
        api<Product[]>('/products'),
      ]);
      setRestocks(rs);
      setShifts(sh);
      setProducts(pr);
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
      await api(`/restocks/${r.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ delivered_items: r.items }),
      });
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

  if (loading) return <View style={styles.center}><ActivityIndicator /></View>;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>QUEUE</Text>
      </View>
      <View style={styles.segment}>
        <Pressable
          testID="tab-restock"
          style={[styles.segBtn, tab === 'restock' && styles.segBtnActive]}
          onPress={() => { hap.light(); setTab('restock'); }}
        >
          <Text style={[styles.segText, tab === 'restock' && styles.segTextActive]}>RESTOCK ({restocks.length})</Text>
        </Pressable>
        <Pressable
          testID="tab-close"
          style={[styles.segBtn, tab === 'close' && styles.segBtnActive]}
          onPress={() => { hap.light(); setTab('close'); }}
        >
          <Text style={[styles.segText, tab === 'close' && styles.segTextActive]}>SHIFT CLOSE ({shifts.length})</Text>
        </Pressable>
      </View>

      {tab === 'restock' && (
        <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
          {restocks.length === 0 && (
            <View style={styles.emptyBox}>
              <Image
                source={{ uri: 'https://images.unsplash.com/photo-1587293852726-70cdb56c2866?crop=entropy&cs=srgb&fm=jpg&h=400&w=400&q=80' }}
                style={{ width: 160, height: 160, marginBottom: 16 }}
                contentFit="cover"
              />
              <Text style={styles.emptyTitle}>QUEUE IS CLEAR</Text>
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
                <Pressable
                  testID={`reject-${r.id}`}
                  style={styles.rejectBtn}
                  disabled={busyId === r.id}
                  onPress={() => reject(r)}
                >
                  <Text style={styles.rejectText}>REJECT</Text>
                </Pressable>
                <Pressable
                  testID={`approve-${r.id}`}
                  style={styles.approveBtn}
                  disabled={busyId === r.id}
                  onPress={() => approve(r)}
                >
                  {busyId === r.id ? <ActivityIndicator color="#FFF" /> : <Text style={styles.approveText}>DELIVER →</Text>}
                </Pressable>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {tab === 'close' && (
        <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
          {shifts.length === 0 && (
            <View style={styles.emptyBox}><Text style={styles.emptyTitle}>NO PENDING CLOSE-OUTS</Text></View>
          )}
          {shifts.map((s) => (
            <View key={s.id} style={styles.qCard} testID={`shift-${s.id}`}>
              <View style={styles.qHead}>
                <Text style={styles.qWalker}>{s.walker_name}</Text>
                <Text style={styles.qTime}>{new Date(s.closed_at).toLocaleTimeString()}</Text>
              </View>
              <View style={styles.discBox}>
                <Text style={styles.discLabel}>DISCREPANCY</Text>
                <Text style={[styles.discVal, s.total_discrepancy > 0 && { color: theme.color.brand }]}>
                  {s.total_discrepancy || 0} UNITS
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
                <Text style={styles.approveText}>CONFIRM CLOSE →</Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 2, borderBottomColor: theme.color.borderStrong },
  title: { fontSize: 22, fontWeight: '900', letterSpacing: -1 },
  segment: { flexDirection: 'row', borderBottomWidth: 2, borderBottomColor: theme.color.borderStrong },
  segBtn: { flex: 1, paddingVertical: 14, alignItems: 'center', borderRightWidth: 2, borderRightColor: theme.color.borderStrong },
  segBtnActive: { backgroundColor: theme.color.surfaceInverse },
  segText: { fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  segTextActive: { color: '#FFF' },
  emptyBox: { padding: 40, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  emptySub: { fontSize: 12, color: theme.color.muted, marginTop: 6 },
  qCard: { borderWidth: 2, borderColor: theme.color.borderStrong, padding: 14 },
  qHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  qWalker: { fontSize: 16, fontWeight: '900' },
  qTime: { fontSize: 11, fontFamily: theme.font.mono, color: theme.color.muted, letterSpacing: 1 },
  qItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  qItemName: { fontSize: 14, fontWeight: '700' },
  qItemQty: { fontSize: 14, fontWeight: '900', fontFamily: theme.font.mono },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  rejectBtn: { flex: 1, borderWidth: 2, borderColor: theme.color.borderStrong, backgroundColor: theme.color.surface, paddingVertical: 14, alignItems: 'center' },
  rejectText: { fontSize: 14, fontWeight: '900', letterSpacing: 1 },
  approveBtn: { flex: 1, backgroundColor: theme.color.surfaceInverse, paddingVertical: 14, alignItems: 'center', borderWidth: 2, borderColor: theme.color.borderStrong },
  approveText: { color: '#FFF', fontSize: 14, fontWeight: '900', letterSpacing: 1 },
  discBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10, backgroundColor: theme.color.surfaceSecondary, marginTop: 8 },
  discLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  discVal: { fontSize: 18, fontWeight: '900', fontFamily: theme.font.mono },
});
