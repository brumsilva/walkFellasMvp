import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Modal, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { theme } from '@/src/lib/theme';
import { hap } from '@/src/lib/haptics';
import { useToast } from '@/src/lib/toast';

export default function Team() {
  const toast = useToast();
  const [walkers, setWalkers] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [modalType, setModalType] = useState<'walker' | 'staff'>('walker');
  const [name, setName] = useState('');
  const [eventId, setEventId] = useState('');
  const [pin, setPin] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'supervisor' | 'admin'>('supervisor');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [ws, ev] = await Promise.all([
        api<any[]>('/walkers'),
        api<any[]>('/events'),
      ]);
      setWalkers(ws);
      setEvents(ev);
      if (ev.length && !eventId) setEventId(ev[0].id);
    } catch (e: any) { toast.show(e.message, 'error'); }
    finally { setLoading(false); }
  }, [eventId, toast]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const submit = async () => {
    setBusy(true);
    try {
      if (modalType === 'walker') {
        if (!name || !eventId || !pin || pin.length < 4) {
          toast.show('Name, event, 4-6 digit PIN required', 'error');
          setBusy(false);
          return;
        }
        await api('/walkers', { method: 'POST', body: JSON.stringify({ name, event_id: eventId, pin }) });
      } else {
        if (!name || !email || !password) {
          toast.show('All fields required', 'error');
          setBusy(false);
          return;
        }
        await api('/staff', { method: 'POST', body: JSON.stringify({ name, email, password, role }) });
      }
      hap.success();
      toast.show('Created', 'success');
      setName(''); setPin(''); setEmail(''); setPassword('');
      setModal(false);
      await load();
    } catch (e: any) { hap.error(); toast.show(e.message, 'error'); }
    finally { setBusy(false); }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator /></View>;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>TEAM</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Pressable style={styles.addBtn} onPress={() => { setModalType('walker'); setModal(true); }} testID="new-walker">
            <Text style={styles.addBtnText}>+ WALKER</Text>
          </Pressable>
          <Pressable style={[styles.addBtn, { backgroundColor: theme.color.surfaceInverse }]} onPress={() => { setModalType('staff'); setModal(true); }} testID="new-staff">
            <Text style={styles.addBtnText}>+ STAFF</Text>
          </Pressable>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 12, gap: 6 }}>
        <Text style={styles.section}>WALKERS ({walkers.length})</Text>
        {walkers.map((w) => (
          <View key={w.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.wName}>{w.name}</Text>
              <Text style={styles.wEvent}>Event: {events.find(e => e.id === w.event_id)?.code || w.event_id}</Text>
            </View>
            <View style={styles.statusPill}><Text style={styles.statusText}>{w.status.toUpperCase()}</Text></View>
          </View>
        ))}
      </ScrollView>

      <Modal visible={modal} animationType="slide" onRequestClose={() => setModal(false)}>
        <SafeAreaView style={styles.container} edges={['top']}>
          <View style={styles.header}>
            <Text style={styles.title}>NEW {modalType === 'walker' ? 'WALKER' : 'STAFF'}</Text>
            <Pressable onPress={() => setModal(false)}><Ionicons name="close" size={28} /></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
            <Text style={styles.label}>NAME</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} testID="t-name" />

            {modalType === 'walker' ? (
              <>
                <Text style={styles.label}>EVENT</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {events.map((e) => (
                    <Pressable
                      key={e.id}
                      style={[styles.chip, eventId === e.id && styles.chipActive]}
                      onPress={() => { hap.light(); setEventId(e.id); }}
                      testID={`t-event-${e.code}`}
                    >
                      <Text style={[styles.chipText, eventId === e.id && { color: '#FFF' }]}>{e.code}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.label}>PIN (4-6 DIGITS)</Text>
                <TextInput style={styles.input} value={pin} onChangeText={setPin} keyboardType="number-pad" maxLength={6} testID="t-pin" />
              </>
            ) : (
              <>
                <Text style={styles.label}>EMAIL</Text>
                <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" testID="t-email" />
                <Text style={styles.label}>PASSWORD</Text>
                <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry testID="t-password" />
                <Text style={styles.label}>ROLE</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {(['supervisor', 'admin'] as const).map((r) => (
                    <Pressable
                      key={r}
                      style={[styles.chip, role === r && styles.chipActive]}
                      onPress={() => setRole(r)}
                      testID={`t-role-${r}`}
                    >
                      <Text style={[styles.chipText, role === r && { color: '#FFF' }]}>{r.toUpperCase()}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            <Pressable style={styles.submit} onPress={submit} disabled={busy} testID="t-submit">
              {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitText}>CREATE →</Text>}
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 2, borderBottomColor: theme.color.borderStrong },
  title: { fontSize: 22, fontWeight: '900', letterSpacing: -1 },
  addBtn: { backgroundColor: theme.color.brand, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 2, borderColor: theme.color.borderStrong },
  addBtnText: { color: '#FFF', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  section: { fontSize: 11, letterSpacing: 2, fontWeight: '900', color: theme.color.muted, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 12, borderWidth: 2, borderColor: theme.color.borderStrong },
  wName: { fontSize: 15, fontWeight: '800' },
  wEvent: { fontSize: 11, color: theme.color.muted, fontFamily: theme.font.mono, letterSpacing: 1, marginTop: 2 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 4, backgroundColor: theme.color.success, borderWidth: 1, borderColor: theme.color.borderStrong },
  statusText: { color: '#FFF', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  input: { borderWidth: 2, borderColor: theme.color.borderStrong, padding: 12, fontSize: 16, fontWeight: '700' },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderWidth: 2, borderColor: theme.color.borderStrong },
  chipActive: { backgroundColor: theme.color.surfaceInverse },
  chipText: { fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  submit: { marginTop: 12, padding: 18, backgroundColor: theme.color.brand, alignItems: 'center', borderWidth: 2, borderColor: theme.color.borderStrong },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '900', letterSpacing: 1 },
});
