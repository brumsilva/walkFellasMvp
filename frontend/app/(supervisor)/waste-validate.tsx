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
      const wasteList = Array.isArray(ws)
        ? ws
        : Array.isArray(ws?.items)
          ? ws.items
          : [];
      const productList = Array.isArray(ps)
        ? ps
        : Array.isArray(ps?.products)
          ? ps.products
          : [];
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

  if (loading) return <View style={styles.center}><ActivityIndicator /></View>;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>WASTE VALIDATION</Text>
        <Text style={styles.subtitle}>{items.length} PENDING</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
        {items.length === 0 && (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>NO PENDING WASTE</Text>
          </View>
        )}
        {items.map((w) => (
          <View key={w.id} style={styles.card} testID={`waste-${w.id}`}>
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
              <View style={styles.chip}><Text style={styles.chipText}>{w.category.toUpperCase()}</Text></View>
              <Text style={styles.qty}>× {w.quantity}</Text>
            </View>
            <View style={styles.actions}>
              <Pressable
                testID={`reject-waste-${w.id}`}
                style={styles.rejectBtn}
                disabled={busyId === w.id}
                onPress={() => validate(w, false)}
              >
                <Text style={styles.rejectText}>REJECT</Text>
              </Pressable>
              <Pressable
                testID={`approve-waste-${w.id}`}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 2, borderBottomColor: theme.color.borderStrong },
  title: { fontSize: 22, fontWeight: '900', letterSpacing: -1 },
  subtitle: { fontSize: 12, color: theme.color.muted, marginTop: 2, fontFamily: theme.font.mono, letterSpacing: 1 },
  emptyBox: { padding: 40, alignItems: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  card: { borderWidth: 2, borderColor: theme.color.borderStrong, padding: 14 },
  rowH: { flexDirection: 'row', justifyContent: 'space-between' },
  walker: { fontSize: 16, fontWeight: '900' },
  time: { fontSize: 11, fontFamily: theme.font.mono, color: theme.color.muted, letterSpacing: 1 },
  item: { fontSize: 15, fontWeight: '700', marginTop: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8, marginBottom: 12 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: theme.color.warning, borderWidth: 2, borderColor: theme.color.borderStrong },
  chipText: { fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  qty: { fontSize: 18, fontWeight: '900', fontFamily: theme.font.mono },
  actions: { flexDirection: 'row', gap: 8 },
  rejectBtn: { flex: 1, borderWidth: 2, borderColor: theme.color.borderStrong, backgroundColor: theme.color.surface, paddingVertical: 14, alignItems: 'center' },
  rejectText: { fontSize: 14, fontWeight: '900', letterSpacing: 1 },
  approveBtn: { flex: 1, backgroundColor: theme.color.surfaceInverse, paddingVertical: 14, alignItems: 'center', borderWidth: 2, borderColor: theme.color.borderStrong },
  approveText: { color: '#FFF', fontSize: 14, fontWeight: '900', letterSpacing: 1 },
});
