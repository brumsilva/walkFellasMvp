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
type WasteLog = {
  id: string; walker_name: string; product_id: string; quantity: number;
  category: string; photo_b64?: string; timestamp: string;
};

export default function WasteValidate() {
  const toast = useToast();
  const [items, setItems] = useState<WasteLog[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [ws, ps] = await Promise.all([
        api<any>('/waste?status_filter=pending'),
        api<any>('/products'),
      ]);
      const wasteList = Array.isArray(ws) ? ws : Array.isArray(ws?.items) ? ws.items : [];
      const productList = Array.isArray(ps) ? ps : Array.isArray(ps?.products) ? ps.products : [];
      setItems(wasteList);
      setProducts(productList);
    } catch (e: any) {
      toast.show(e.message || 'Load failed', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const productMap = Object.fromEntries(products.map((p) => [p.id, p]));

  const validate = async (w: WasteLog, approved: boolean) => {
    setBusyId(w.id);
    try {
      await api(`/waste/${w.id}/validate`, { method: 'POST', body: JSON.stringify({ approved }) });
      approved ? hap.success() : hap.warning();
      toast.show(approved ? 'Approved' : 'Rejected', approved ? 'success' : 'info');
      await load();
    } catch (e: any) {
      hap.error();
      toast.show(e.message || 'Failed', 'error');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={theme.color.brand} /></View>;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Waste validation</Text>
        <Text style={styles.subtitle}>{items.length} pending</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        {items.length === 0 && (
          <View style={styles.emptyBox}>
            <View style={styles.emptyIcon}>
              <Text style={{ fontSize: 32 }}>✅</Text>
            </View>
            <Text style={styles.emptyTitle}>No pending waste</Text>
          </View>
        )}
        {items.map((w) => (
          <View key={w.id} style={styles.card} testID={`waste-${w.id}`}>
            {w.photo_b64 && (
              <Image
                source={{ uri: `data:image/jpeg;base64,${w.photo_b64}` }}
                style={styles.photo}
                contentFit="cover"
              />
            )}
            <View style={styles.cardBody}>
              <View style={styles.rowH}>
                <Text style={styles.walker}>{w.walker_name}</Text>
                <Text style={styles.time}>{new Date(w.timestamp).toLocaleTimeString()}</Text>
              </View>
              <Text style={styles.item}>{productMap[w.product_id]?.name || w.product_id}</Text>
              <View style={styles.metaRow}>
                <View style={styles.chip}><Text style={styles.chipText}>{w.category}</Text></View>
                <Text style={styles.qty}>× {w.quantity}</Text>
              </View>
              <View style={styles.actions}>
                <Pressable testID={`reject-waste-${w.id}`} style={styles.rejectBtn} disabled={busyId === w.id} onPress={() => validate(w, false)}>
                  <Text style={styles.rejectText}>Reject</Text>
                </Pressable>
                <Pressable testID={`approve-waste-${w.id}`} style={styles.approveBtn} disabled={busyId === w.id} onPress={() => validate(w, true)}>
                  {busyId === w.id ? <ActivityIndicator color="#FFF" /> : <Text style={styles.approveText}>Approve</Text>}
                </Pressable>
              </View>
            </View>
          </View>
        ))}
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
  emptyBox: { padding: 40, alignItems: 'center', gap: 8 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: theme.color.successSoft, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontFamily: theme.font.extrabold, fontSize: 16, color: theme.color.onSurface, marginTop: 4 },
  card: { borderRadius: theme.radius.xl, backgroundColor: theme.color.surface, overflow: 'hidden', ...(theme.shadow.sm as any) },
  photo: { width: '100%', height: 180 },
  cardBody: { padding: 14, gap: 4 },
  rowH: { flexDirection: 'row', justifyContent: 'space-between' },
  walker: { fontFamily: theme.font.extrabold, fontSize: 15, color: theme.color.onSurface },
  time: { fontFamily: theme.font.medium, fontSize: 11, color: theme.color.muted },
  item: { fontFamily: theme.font.semibold, fontSize: 14, color: theme.color.onSurfaceSecondary, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6, marginBottom: 10 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: theme.color.warningSoft, borderRadius: theme.radius.pill },
  chipText: { fontSize: 11, fontFamily: theme.font.bold, color: '#8B6D19', textTransform: 'capitalize' },
  qty: { fontSize: 16, fontFamily: theme.font.extrabold, color: theme.color.onSurface },
  actions: { flexDirection: 'row', gap: 8 },
  rejectBtn: { flex: 1, backgroundColor: theme.color.surfaceSecondary, borderRadius: theme.radius.pill, paddingVertical: 12, alignItems: 'center' },
  rejectText: { fontFamily: theme.font.bold, fontSize: 13, color: theme.color.onSurface },
  approveBtn: { flex: 1, backgroundColor: theme.color.brand, borderRadius: theme.radius.pill, paddingVertical: 12, alignItems: 'center' },
  approveText: { color: '#FFF', fontFamily: theme.font.bold, fontSize: 13 },
});
