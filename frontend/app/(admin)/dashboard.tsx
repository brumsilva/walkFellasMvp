import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api, clearSession } from '@/src/lib/api';
import { theme } from '@/src/lib/theme';

type Overview = {
  total_sales: number;
  total_units_sold: number;
  total_waste_units: number;
  total_discrepancy: number;
  active_shifts: number;
  pending_restocks: number;
  pending_waste: number;
};

export default function Dashboard() {
  const router = useRouter();
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const d = await api<Overview>('/dashboard/overview');
      setData(d);
    } catch (e) {}
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const logout = async () => { await clearSession(); router.replace('/'); };

  if (loading) return <View style={styles.center}><ActivityIndicator /></View>;

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

        <View style={styles.alertBox}>
          <Text style={styles.alertLabel}>PENDING WASTE VALIDATION</Text>
          <Text style={styles.alertValue}>{data?.pending_waste || 0}</Text>
        </View>

        <Pressable style={styles.refreshBtn} onPress={load} testID="refresh-dash">
          <Text style={styles.refreshText}>REFRESH</Text>
        </Pressable>
      </ScrollView>
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
  alertValue: { fontSize: 24, fontWeight: '900', fontFamily: theme.font.mono },
  refreshBtn: { alignSelf: 'center', marginTop: 12, borderWidth: 2, borderColor: theme.color.borderStrong, paddingHorizontal: 24, paddingVertical: 12 },
  refreshText: { fontSize: 12, fontWeight: '900', letterSpacing: 2 },
});
