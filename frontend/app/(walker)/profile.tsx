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
    toast.show(v ? 'Offline mode ON (demo)' : 'Offline mode OFF', 'info');
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
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(user?.name || '?').slice(0, 1)}</Text>
          </View>
          <View>
            <Text style={styles.pName}>{user?.name}</Text>
            <Text style={styles.pRole}>{user?.role?.toUpperCase()}</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>Sync</Text>
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={styles.value}>Demo offline mode</Text>
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
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={styles.value}>Pending sync</Text>
              <Text style={styles.sub}>{count} item(s) waiting to send</Text>
            </View>
            <Pressable style={styles.syncBtn} onPress={syncNow} disabled={syncing || offline} testID="sync-now">
              {syncing ? <ActivityIndicator color="#FFF" /> : <Text style={styles.syncBtnText}>Sync now</Text>}
            </Pressable>
          </View>
        </View>

        <Pressable style={styles.logoutBtn} onPress={logout} testID="logout-btn">
          <Ionicons name="log-out-outline" size={20} color="#FFF" />
          <Text style={styles.logoutText}>Log out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.surfaceSecondary },
  header: { paddingHorizontal: 20, paddingVertical: 16, backgroundColor: theme.color.surface },
  title: { fontFamily: theme.font.extrabold, fontSize: 22, color: theme.color.onSurface, letterSpacing: -0.4 },
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: theme.color.surface, borderRadius: theme.radius.xl, padding: 16, ...(theme.shadow.sm as any) },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: theme.color.brand, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFF', fontFamily: theme.font.extrabold, fontSize: 22 },
  pName: { fontFamily: theme.font.extrabold, fontSize: 17, color: theme.color.onSurface },
  pRole: { fontFamily: theme.font.semibold, fontSize: 11, color: theme.color.muted, letterSpacing: 0.5, marginTop: 2 },
  sectionLabel: { fontFamily: theme.font.bold, fontSize: 12, letterSpacing: 0.5, color: theme.color.muted, marginTop: 6 },
  card: { padding: 14, borderRadius: theme.radius.xl, backgroundColor: theme.color.surface, ...(theme.shadow.sm as any) },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  value: { fontFamily: theme.font.bold, fontSize: 14, color: theme.color.onSurface },
  sub: { fontFamily: theme.font.medium, fontSize: 11, color: theme.color.muted, marginTop: 2 },
  syncBtn: { backgroundColor: theme.color.surfaceInverse, paddingHorizontal: 16, paddingVertical: 10, borderRadius: theme.radius.pill },
  syncBtnText: { color: '#FFF', fontFamily: theme.font.bold, fontSize: 12 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10, backgroundColor: theme.color.brand, paddingVertical: 16, borderRadius: theme.radius.pill, ...(theme.shadow.md as any) },
  logoutText: { color: '#FFF', fontFamily: theme.font.extrabold, fontSize: 14 },
});
