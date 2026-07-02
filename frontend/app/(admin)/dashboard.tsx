import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, Modal } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { api, clearSession, getUser } from '@/src/lib/api';
import { theme } from '@/src/lib/theme';
import { hap } from '@/src/lib/haptics';
import { useToast } from '@/src/lib/toast';
import { Logo } from '@/src/components/Logo';

type Overview = {
  total_sales: number; total_units_sold: number; total_waste_units: number;
  total_discrepancy: number; active_shifts: number; pending_restocks: number; pending_waste: number;
};
type Product = { id: string; sku: string; name: string };
type WasteLog = { id: string; walker_name: string; product_id: string; quantity: number; category: string; photo_b64?: string; timestamp: string };

export default function Dashboard() {
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState<Overview | null>(null);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [wasteOpen, setWasteOpen] = useState(false);
  const [wasteItems, setWasteItems] = useState<WasteLog[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [wasteLoading, setWasteLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [d, u] = await Promise.all([api<Overview>('/dashboard/overview'), getUser()]);
      setData(d); setUser(u);
    } catch {}
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
      setWasteItems(ws); setProducts(ps);
    } catch (e: any) { toast.show(e.message || 'Load failed', 'error'); }
    finally { setWasteLoading(false); }
  }, [toast]);

  const openWasteModal = () => { hap.light(); setWasteOpen(true); loadWaste(); };

  const validate = async (w: WasteLog, approved: boolean) => {
    setBusyId(w.id);
    try {
      await api(`/waste/${w.id}/validate`, { method: 'POST', body: JSON.stringify({ approved }) });
      approved ? hap.success() : hap.warning();
      toast.show(approved ? 'Approved' : 'Rejected', approved ? 'success' : 'info');
      await Promise.all([loadWaste(), load()]);
    } catch (e: any) { hap.error(); toast.show(e.message || 'Failed', 'error'); }
    finally { setBusyId(null); }
  };

  const logout = async () => { await clearSession(); router.replace('/'); };

  if (loading) return <View style={styles.center}><ActivityIndicator color={theme.color.brand} /></View>;

  const productMap = Object.fromEntries(products.map((p) => [p.id, p]));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.hi}>Hello, {user?.name?.split(' ')[0] || 'Admin'}</Text>
          <Text style={styles.hiSub}>Here's what's moving right now</Text>
        </View>
        <Pressable onPress={logout} testID="logout-btn" hitSlop={12} style={styles.avatarBtn}>
          <Ionicons name="log-out-outline" size={20} color={theme.color.muted} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Hero sales card */}
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroBadge}>
              <Ionicons name="trending-up" size={14} color="#FFF" />
              <Text style={styles.heroBadgeText}>LIVE</Text>
            </View>
            <Logo variant="mark" size={28} color="onBrand" />
          </View>
          <Text style={styles.heroLabel}>Total sales today</Text>
          <Text style={styles.heroValue}>€{(data?.total_sales || 0).toFixed(2)}</Text>
          <View style={styles.heroFooter}>
            <View style={styles.heroChip}>
              <Ionicons name="cube-outline" size={13} color="#FFF" />
              <Text style={styles.heroChipText}>{data?.total_units_sold || 0} units sold</Text>
            </View>
            <View style={styles.heroChip}>
              <Ionicons name="people" size={13} color="#FFF" />
              <Text style={styles.heroChipText}>{data?.active_shifts || 0} active</Text>
            </View>
          </View>
        </View>

        {/* Metric grid */}
        <View style={styles.grid}>
          <View style={styles.metric}>
            <View style={[styles.metricIcon, { backgroundColor: theme.color.brandSoft }]}>
              <Ionicons name="warning" size={18} color={theme.color.brand} />
            </View>
            <Text style={styles.metricLabel}>Discrepancies</Text>
            <Text style={[styles.metricValue, (data?.total_discrepancy || 0) > 0 && { color: theme.color.brand }]}>
              {data?.total_discrepancy || 0}
            </Text>
          </View>
          <View style={styles.metric}>
            <View style={[styles.metricIcon, { backgroundColor: theme.color.warningSoft }]}>
              <Ionicons name="trash" size={18} color="#8B6D19" />
            </View>
            <Text style={styles.metricLabel}>Waste units</Text>
            <Text style={styles.metricValue}>{data?.total_waste_units || 0}</Text>
          </View>
          <View style={styles.metric}>
            <View style={[styles.metricIcon, { backgroundColor: theme.color.infoSoft }]}>
              <Ionicons name="cube" size={18} color={theme.color.info} />
            </View>
            <Text style={styles.metricLabel}>Pending restock</Text>
            <Text style={styles.metricValue}>{data?.pending_restocks || 0}</Text>
          </View>
          <View style={styles.metric}>
            <View style={[styles.metricIcon, { backgroundColor: theme.color.successSoft }]}>
              <Ionicons name="people" size={18} color={theme.color.success} />
            </View>
            <Text style={styles.metricLabel}>Active walkers</Text>
            <Text style={styles.metricValue}>{data?.active_shifts || 0}</Text>
          </View>
        </View>

        {/* Actionable waste alert */}
        <Pressable style={styles.actionCard} onPress={openWasteModal} testID="open-waste-validation">
          <View style={[styles.actionIcon, { backgroundColor: theme.color.brandSoft }]}>
            <Ionicons name="alert-circle" size={22} color={theme.color.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionTitle}>Waste to validate</Text>
            <Text style={styles.actionSub}>Tap to approve or reject pending reports</Text>
          </View>
          <View style={styles.actionCount}>
            <Text style={styles.actionCountText}>{data?.pending_waste || 0}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.color.muted} />
        </Pressable>

        <Pressable style={styles.ghostBtn} onPress={load} testID="refresh-dash">
          <Ionicons name="refresh" size={16} color={theme.color.muted} />
          <Text style={styles.ghostBtnText}>Refresh</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={wasteOpen} animationType="slide" onRequestClose={() => setWasteOpen(false)}>
        <SafeAreaProvider>
          <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            <View style={styles.header}>
              <View>
                <Text style={styles.title}>Waste validation</Text>
                <Text style={styles.hiSub}>{wasteItems.length} pending</Text>
              </View>
              <Pressable onPress={() => setWasteOpen(false)} testID="close-modal" hitSlop={12} style={styles.avatarBtn}>
                <Ionicons name="close" size={22} color={theme.color.onSurface} />
              </Pressable>
            </View>
            {wasteLoading ? (
              <View style={styles.center}><ActivityIndicator /></View>
            ) : (
              <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
                {wasteItems.length === 0 && (
                  <View style={styles.emptyBox}>
                    <View style={styles.emptyIcon}>
                      <Ionicons name="checkmark-circle" size={44} color={theme.color.success} />
                    </View>
                    <Text style={styles.emptyTitle}>All clear</Text>
                    <Text style={styles.emptySub}>No pending waste to validate.</Text>
                  </View>
                )}
                {wasteItems.map((w) => (
                  <View key={w.id} style={styles.wasteCard} testID={`admin-waste-${w.id}`}>
                    {w.photo_b64 && (
                      <Image
                        source={{ uri: `data:image/jpeg;base64,${w.photo_b64}` }}
                        style={styles.wastePhoto}
                        contentFit="cover"
                      />
                    )}
                    <View style={styles.wasteBody}>
                      <View style={styles.rowH}>
                        <Text style={styles.walker}>{w.walker_name}</Text>
                        <Text style={styles.time}>{new Date(w.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                      </View>
                      <Text style={styles.item}>{productMap[w.product_id]?.name || w.product_id}</Text>
                      <View style={styles.metaRow}>
                        <View style={styles.catChip}><Text style={styles.catChipText}>{w.category}</Text></View>
                        <Text style={styles.qty}>× {w.quantity}</Text>
                      </View>
                      <View style={styles.actions}>
                        <Pressable
                          testID={`admin-reject-waste-${w.id}`}
                          style={styles.rejectBtn}
                          disabled={busyId === w.id}
                          onPress={() => validate(w, false)}
                        >
                          <Text style={styles.rejectText}>Reject</Text>
                        </Pressable>
                        <Pressable
                          testID={`admin-approve-waste-${w.id}`}
                          style={styles.approveBtn}
                          disabled={busyId === w.id}
                          onPress={() => validate(w, true)}
                        >
                          {busyId === w.id ? <ActivityIndicator color="#FFF" /> : (
                            <>
                              <Text style={styles.approveText}>Approve</Text>
                              <Ionicons name="checkmark" size={16} color="#FFF" />
                            </>
                          )}
                        </Pressable>
                      </View>
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
  container: { flex: 1, backgroundColor: theme.color.surfaceSecondary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
    backgroundColor: theme.color.surface,
  },
  hi: { fontFamily: theme.font.extrabold, fontSize: 22, color: theme.color.onSurface, letterSpacing: -0.4 },
  hiSub: { fontFamily: theme.font.medium, fontSize: 12, color: theme.color.muted, marginTop: 2 },
  title: { fontFamily: theme.font.extrabold, fontSize: 20, color: theme.color.onSurface },
  avatarBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.color.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },

  heroCard: {
    backgroundColor: theme.color.brand,
    borderRadius: theme.radius.xxl, padding: 20,
    ...(theme.shadow.md as any),
  },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: theme.radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  heroBadgeText: { color: '#FFF', fontFamily: theme.font.extrabold, fontSize: 10, letterSpacing: 1 },
  heroLabel: { color: 'rgba(255,255,255,0.9)', fontFamily: theme.font.semibold, fontSize: 13, marginTop: 20 },
  heroValue: { color: '#FFF', fontFamily: theme.font.black, fontSize: 44, letterSpacing: -1, lineHeight: 50, marginTop: 2 },
  heroFooter: { flexDirection: 'row', gap: 8, marginTop: 14 },
  heroChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: theme.radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  heroChipText: { color: '#FFF', fontFamily: theme.font.semibold, fontSize: 11 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: { width: '48%', backgroundColor: theme.color.surface, borderRadius: theme.radius.xl, padding: 14, gap: 8, ...(theme.shadow.sm as any) },
  metricIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  metricLabel: { fontFamily: theme.font.semibold, fontSize: 12, color: theme.color.muted },
  metricValue: { fontFamily: theme.font.black, fontSize: 26, color: theme.color.onSurface, letterSpacing: -0.5 },

  actionCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: theme.color.surface, borderRadius: theme.radius.xl, padding: 14,
    ...(theme.shadow.sm as any),
  },
  actionIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  actionTitle: { fontFamily: theme.font.extrabold, fontSize: 15, color: theme.color.onSurface },
  actionSub: { fontFamily: theme.font.medium, fontSize: 12, color: theme.color.muted, marginTop: 2 },
  actionCount: { minWidth: 32, height: 32, borderRadius: 16, backgroundColor: theme.color.brand, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  actionCountText: { color: '#FFF', fontFamily: theme.font.extrabold, fontSize: 14 },

  ghostBtn: { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
  ghostBtnText: { fontFamily: theme.font.bold, fontSize: 12, color: theme.color.muted, letterSpacing: 0.5 },

  emptyBox: { padding: 40, alignItems: 'center', gap: 10 },
  emptyIcon: { width: 88, height: 88, borderRadius: 44, backgroundColor: theme.color.successSoft, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontFamily: theme.font.extrabold, fontSize: 18, color: theme.color.onSurface, marginTop: 8 },
  emptySub: { fontFamily: theme.font.medium, fontSize: 13, color: theme.color.muted },

  wasteCard: { backgroundColor: theme.color.surface, borderRadius: theme.radius.xl, overflow: 'hidden', ...(theme.shadow.sm as any) },
  wastePhoto: { width: '100%', height: 180 },
  wasteBody: { padding: 14, gap: 6 },
  rowH: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  walker: { fontFamily: theme.font.extrabold, fontSize: 15, color: theme.color.onSurface },
  time: { fontFamily: theme.font.semibold, fontSize: 11, color: theme.color.muted },
  item: { fontFamily: theme.font.semibold, fontSize: 14, color: theme.color.onSurfaceSecondary },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  catChip: { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: theme.color.warningSoft, borderRadius: theme.radius.pill },
  catChipText: { fontFamily: theme.font.bold, fontSize: 11, color: '#8B6D19', letterSpacing: 0.3, textTransform: 'uppercase' },
  qty: { fontFamily: theme.font.extrabold, fontSize: 16, color: theme.color.onSurface },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  rejectBtn: { flex: 1, borderRadius: theme.radius.pill, backgroundColor: theme.color.surfaceSecondary, paddingVertical: 12, alignItems: 'center' },
  rejectText: { fontFamily: theme.font.bold, fontSize: 13, color: theme.color.onSurface },
  approveBtn: { flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', borderRadius: theme.radius.pill, backgroundColor: theme.color.brand, paddingVertical: 12, alignItems: 'center' },
  approveText: { color: '#FFF', fontFamily: theme.font.bold, fontSize: 13 },
});
