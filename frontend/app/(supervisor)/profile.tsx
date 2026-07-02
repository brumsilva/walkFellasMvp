import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { clearSession, getUser } from '@/src/lib/api';
import { theme } from '@/src/lib/theme';

export default function Profile() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);

  useEffect(() => { getUser().then(setUser); }, []);

  const logout = async () => {
    await clearSession();
    router.replace('/');
  };

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
        <View style={styles.card}>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.value}>{user?.email}</Text>
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
  card: { padding: 14, borderRadius: theme.radius.xl, backgroundColor: theme.color.surface, ...(theme.shadow.sm as any) },
  label: { fontFamily: theme.font.semibold, fontSize: 11, color: theme.color.muted, letterSpacing: 0.3 },
  value: { fontFamily: theme.font.bold, fontSize: 15, color: theme.color.onSurface, marginTop: 4 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10, backgroundColor: theme.color.brand, paddingVertical: 16, borderRadius: theme.radius.pill, ...(theme.shadow.md as any) },
  logoutText: { color: '#FFF', fontFamily: theme.font.extrabold, fontSize: 14 },
});
