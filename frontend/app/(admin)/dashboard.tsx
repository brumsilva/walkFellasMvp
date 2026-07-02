import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, Modal } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { api, clearSession } from '@/src/lib/api';
import { theme } from '@/src/lib/theme';
import { hap } from '@/src/lib/haptics';
import { useToast } from '@/src/lib/toast';

type Overview = {
  total_sales: number;
  total_units_sold: number;
  total_waste_units: number;
  total_discrepancy: number;
  active_shifts: number;
  pending_restocks: number;
  pending_waste: number;
};

type Product = { id: string; sku: string; name: string };
type WasteLog = {
  id: string; walker_name: string; product_id: string; quantity: number;
  category: string; photo_b64?: string; timestamp: string;
};

export default function Dashboard() {
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  const [wasteOpen, setWasteOpen] = useState(false);
  const [wasteItems, setWasteItems] = useState<WasteLog[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [wasteLoading, setWasteLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<Overview>('/dashboard/overview');
      setData(d);
    } catch (e) {}
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const loadWaste = useCallback(async () => {
    setWasteLoading(true);
    try {
      const [ws, ps] = await Promise.all([
        api<WasteLog[]>('/waste?status_filter=pending'),
        api<Product[]>('/products'),
      ]);
      setWasteItems(ws);
      setProducts(ps);
    } catch (e: any) {
      toast.show(e.message || 'Load failed', 'error');
    } finally {
      setWasteLoading(false);
    }
  }, [toast]);

  const openWasteModal = () => {
    hap.light();
    setWasteOpen(true);
    loadWaste();
  };

  const validate = async (w: WasteLog, approved: boolean) => {
    setBusyId(w.id);
    try {
      await api(`/waste/${w.id}/validate`, { method: 'POST', body: JSON.stringify({ approved }) });
      approved ? hap.success() : hap.warning();
      toast.show(approved ? 'Approved' : 'Rejected', approved ? 'success' : 'info');
      await Promise.all([loadWaste(), load()]);
    } catch (e: any) {
      hap.error();
      toast.show(e.message || 'Failed', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const logout = async () => { await clearSession(); router.replace('/'); };

  if (loading) return <View style={styles.center}><ActivityIndicator /></View>;

  const productMap = Object.fromEntries(products.map((p) => [p.id, p]));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>DASHBOARD</Text>
          <Text style={styles.subtitle}>OPERATIONS OVERVIEW</Text>
        </View>
        <Pressable onPress={logout} testID="logout-btn"><Ionicons name="log-out-outline" size={28} /></Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
        <View style={styles.bigCard}>
          <Text style={styles.bigLabel}>TOTAL SALES</Text>
          <Text style={styles.bigValue}>€{(data?.total_sales || 0).toFixed(2)}</Text>
          <Text style={styles.bigSub}>{data?.total_units_sold || 0} UNITS SOLD</Text>
        </View>

        <View style={styles.grid}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>ACTIVE WALKERS</Text>
            <Text style={styles.metricValue}>{data?.active_shifts || 0}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>DISCREPANCIES</Text>
            <Text style={[styles.metricValue, (data?.total_discrepancy || 0) > 0 && { color: theme.color.brand }]}>
              {data?.total_discrepancy || 0}
            </Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>WASTE UNITS</Text>
            <Text style={styles.metricValue}>{data?.total_waste_units || 0}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>PENDING RESTOCK</Text>
            <Text style={styles.metricValue}>{data?.pending_restocks || 0}</Text>
          </View>
        </View>

        <Pressable
          style={styles.alertBox}
          onPress={openWasteModal}
          testID="open-waste-validation"
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.alertLabel}>PENDING WASTE VALIDATION</Text>
            <Text style={styles.alertSub}>Tap to review & approve/reject</Text>
          </View>
          <Text style={styles.alertValue}>{data?.pending_waste || 0}</Text>
          <Ionicons name="chevron-forward" size={22} color={theme.color.onSurface} style={{ marginLeft: 6 }} />
        </Pressable>

        <Pressable style={styles.refreshBtn} onPress={load} testID="refresh-dash">
          <Text style={styles.refreshText}>REFRESH</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={wasteOpen} animationType="slide" onRequestClose={() => setWasteOpen(false)}>
        <SafeAreaProvider>
          <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            <View style={styles.header}>
              <View>
                <Text style={styles.title}>WASTE VALIDATION</Text>
                <Text style={styles.subtitle}>{wasteItems.length} PENDING</Text>
              </View>
              <Pressable onPress={() => setWasteOpen(false)} testID="close-modal" hitSlop={12}>
                <Ionicons name="close" size={28} />
              </Pressable>
            </View>
            {wasteLoading ? (
              <View style={styles.center}><ActivityIndicator /></View>
            ) : (
              <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
                {wasteItems.length === 0 && (
                  <View style={styles.emptyBox}>
                    <Ionicons name="checkmark-circle" size={48} color={theme.color.success} />
                    <Text style={styles.emptyTitle}>ALL CLEAR</Text>
                    <Text style={styles.emptySub}>No pending waste to validate.</Text>
                  </View>
                )}
                {wasteItems.map((w) => (
                  <View key={w.id} style={styles.wasteCard} testID={`admin-waste-${w.id}`}>
                    {w.photo_b64 && (
                      <Image
                        source={{ uri: `data:image/jpeg;base64,${w.photo_b64}` }}
                        style={{ width: '100%', height: 180, marginBottom: 10 }}
                        contentFit="cover"
                      />
                    )}
                    <View style={styles.rowH}>
                      <Text style={styles.walker}>{w.walker_name}</Text>
                      <Text style={styles.time}>{new Date(w.timestamp).toLocaleTimeString()}</Text>
                    </View>
                    <Text style={styles.item}>{productMap[w.product_id]?.name || w.product_id}</Text>
                    <View style={styles.metaRow}>
                      <View style={styles.catChip}><Text style={styles.catChipText}>{w.category.toUpperCase()}</Text></View>
                      <Text style={styles.qty}>× {w.quantity}</Text>
                    </View>
                    <View style={styles.actions}>
                      <Pressable
                        testID={`admin-reject-waste-${w.id}`}
                        style={styles.rejectBtn}
                        disabled={busyId === w.id}
                        onPress={() => validate(w, false)}
                      >
                        <Text style={styles.rejectText}>REJECT</Text>
                      </Pressable>
                      <Pressable
                        testID={`admin-approve-waste-${w.id}`}
                        style={styles.approveBtn}
                        disabled={busyId === w.id}
                        onPress={() => validate(w, true)}
                      >
                        {busyId === w.id ? <ActivityIndicator color="#FFF" /> : <Text style={styles.approveText}>APPROVE →</Text>}
                      </Pressable>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </SafeAreaView>
        </SafeAreaProvider>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 2, borderBottomColor: theme.color.borderStrong },
  title: { fontSize: 22, fontWeight: '900', letterSpacing: -1 },
  subtitle: { fontSize: 11, color: theme.color.muted, fontFamily: theme.font.mono, letterSpacing: 1 },
  bigCard: { padding: 20, borderWidth: 2, borderColor: theme.color.borderStrong, backgroundColor: theme.color.surfaceInverse },
  bigLabel: { fontSize: 11, letterSpacing: 2, fontWeight: '900', color: '#FFF' },
  bigValue: { fontSize: 44, fontWeight: '900', color: '#FFF', fontFamily: theme.font.mono, marginTop: 6 },
  bigSub: { fontSize: 12, color: theme.color.brand, fontFamily: theme.font.mono, marginTop: 4, letterSpacing: 1, fontWeight: '900' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metricCard: { width: '48.5%', padding: 16, borderWidth: 2, borderColor: theme.color.borderStrong },
  metricLabel: { fontSize: 10, letterSpacing: 1.5, fontWeight: '900', color: theme.color.muted },
  metricValue: { fontSize: 32, fontWeight: '900', fontFamily: theme.font.mono, marginTop: 6 },
  alertBox: { padding: 16, borderWidth: 2, borderColor: theme.color.borderStrong, backgroundColor: theme.color.warning, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  alertLabel: { fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  alertSub: { fontSize: 10, marginTop: 2, letterSpacing: 0.5, fontWeight: '700' },
  alertValue: { fontSize: 24, fontWeight: '900', fontFamily: theme.font.mono },
  refreshBtn: { alignSelf: 'center', marginTop: 12, borderWidth: 2, borderColor: theme.color.borderStrong, paddingHorizontal: 24, paddingVertical: 12 },
  refreshText: { fontSize: 12, fontWeight: '900', letterSpacing: 2 },
  emptyBox: { padding: 40, alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  emptySub: { fontSize: 12, color: theme.color.muted },
  wasteCard: { borderWidth: 2, borderColor: theme.color.borderStrong, padding: 14 },
  rowH: { flexDirection: 'row', justifyContent: 'space-between' },
  walker: { fontSize: 16, fontWeight: '900' },
  time: { fontSize: 11, fontFamily: theme.font.mono, color: theme.color.muted, letterSpacing: 1 },
  item: { fontSize: 15, fontWeight: '700', marginTop: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8, marginBottom: 12 },
  catChip: { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: theme.color.warning, borderWidth: 2, borderColor: theme.color.borderStrong },
  catChipText: { fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  qty: { fontSize: 18, fontWeight: '900', fontFamily: theme.font.mono },
  actions: { flexDirection: 'row', gap: 8 },
  rejectBtn: { flex: 1, borderWidth: 2, borderColor: theme.color.borderStrong, backgroundColor: theme.color.surface, paddingVertical: 14, alignItems: 'center' },
  rejectText: { fontSize: 14, fontWeight: '900', letterSpacing: 1 },
  approveBtn: { flex: 1, backgroundColor: theme.color.surfaceInverse, paddingVertical: 14, alignItems: 'center', borderWidth: 2, borderColor: theme.color.borderStrong },
  approveText: { color: '#FFF', fontSize: 14, fontWeight: '900', letterSpacing: 1 },
});
