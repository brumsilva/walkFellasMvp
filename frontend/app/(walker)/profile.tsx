import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Switch, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { clearSession, getUser } from '@/src/lib/api';
import { setForceOffline, isForceOffline, pendingCount, drain, subscribe } from '@/src/lib/outbox';
import { theme } from '@/src/lib/theme';
import { hap } from '@/src/lib/haptics';
import { useToast } from '@/src/lib/toast';

export default function WalkerProfile() {
  const router = useRouter();
  const toast = useToast();
  const [user, setUser] = useState<any>(null);
  const [offline, setOffline] = useState(isForceOffline());
  const [count, setCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    getUser().then(setUser);
    pendingCount().then(setCount);
    const unsub = subscribe(setCount);
    return () => { unsub(); };
  }, []);

  const toggleOffline = (v: boolean) => {
    hap.medium();
    setOffline(v);
    setForceOffline(v);
    toast.show(v ? 'OFFLINE mode ON (demo)' : 'OFFLINE mode OFF', 'info');
  };

  const syncNow = async () => {
    setSyncing(true);
    const r = await drain();
    setSyncing(false);
    if (r.sent > 0) { hap.success(); toast.show(`Synced ${r.sent} item(s)`, 'success'); }
    else if (r.kept > 0) { toast.show(`${r.kept} still queued`, 'info'); }
    else { toast.show('Nothing to sync', 'info'); }
  };

  const logout = async () => { await clearSession(); router.replace('/'); };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}><Text style={styles.title}>PROFILE</Text></View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <View style={styles.info}>
          <Text style={styles.label}>NAME</Text>
          <Text style={styles.value}>{user?.name}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.label}>ROLE</Text>
          <Text style={styles.value}>{user?.role?.toUpperCase()}</Text>
        </View>

        <Text style={styles.sectionLabel}>SYNC</Text>
        <View style={styles.info}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Text style={styles.value}>DEMO OFFLINE MODE</Text>
              <Text style={styles.sub}>Toggle to queue actions locally</Text>
            </View>
            <Switch
              value={offline}
              onValueChange={toggleOffline}
              trackColor={{ true: theme.color.brand, false: theme.color.border }}
              thumbColor={theme.color.surface}
              testID="offline-toggle"
            />
          </View>
        </View>
        <View style={styles.info}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Text style={styles.value}>PENDING SYNC</Text>
              <Text style={styles.sub}>{count} item(s) waiting to send</Text>
            </View>
            <Pressable style={styles.syncBtn} onPress={syncNow} disabled={syncing || offline} testID="sync-now">
              {syncing ? <ActivityIndicator color="#FFF" /> : <Text style={styles.syncBtnText}>SYNC NOW</Text>}
            </Pressable>
          </View>
        </View>

        <Pressable style={styles.logoutBtn} onPress={logout} testID="logout-btn">
          <Ionicons name="log-out-outline" size={22} color="#FFF" />
          <Text style={styles.logoutText}>LOG OUT</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.surface },
  header: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 2, borderBottomColor: theme.color.borderStrong },
  title: { fontSize: 22, fontWeight: '900', letterSpacing: -1 },
  info: { padding: 14, borderWidth: 2, borderColor: theme.color.borderStrong },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: theme.color.muted },
  value: { fontSize: 16, fontWeight: '800', marginTop: 4 },
  sub: { fontSize: 11, color: theme.color.muted, marginTop: 2, letterSpacing: 0.5 },
  sectionLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 2, color: theme.color.muted, marginTop: 8 },
  syncBtn: { backgroundColor: theme.color.surfaceInverse, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 2, borderColor: theme.color.borderStrong },
  syncBtnText: { color: '#FFF', fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 20, backgroundColor: theme.color.brand, paddingVertical: 16, borderWidth: 2, borderColor: theme.color.borderStrong },
  logoutText: { color: '#FFF', fontSize: 14, fontWeight: '900', letterSpacing: 1 },
});
