import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
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
        <Text style={styles.title}>PROFILE</Text>
      </View>
      <View style={{ padding: 20, gap: 12 }}>
        <View style={styles.info}>
          <Text style={styles.label}>NAME</Text>
          <Text style={styles.value}>{user?.name}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.label}>ROLE</Text>
          <Text style={styles.value}>{user?.role?.toUpperCase()}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.label}>EMAIL</Text>
          <Text style={styles.value}>{user?.email}</Text>
        </View>
        <Pressable style={styles.logoutBtn} onPress={logout} testID="logout-btn">
          <Ionicons name="log-out-outline" size={22} color="#FFF" />
          <Text style={styles.logoutText}>LOG OUT</Text>
        </Pressable>
      </View>
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
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 20, backgroundColor: theme.color.brand, paddingVertical: 16, borderWidth: 2, borderColor: theme.color.borderStrong },
  logoutText: { color: '#FFF', fontSize: 14, fontWeight: '900', letterSpacing: 1 },
});
