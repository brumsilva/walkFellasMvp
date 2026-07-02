import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Modal, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { theme } from '@/src/lib/theme';
import { hap } from '@/src/lib/haptics';
import { useToast } from '@/src/lib/toast';

export default function Events() {
  const toast = useToast();
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [name, setName] = useState('');
  const [venue, setVenue] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const ev = await api<any[]>('/events');
      setEvents(ev);
    } catch (e: any) { toast.show(e.message, 'error'); }
    finally { setLoading(false); }
  }, [toast]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const create = async () => {
    if (!name || !venue || !code) { toast.show('All fields required', 'error'); return; }
    setBusy(true);
    try {
      await api('/events', { method: 'POST', body: JSON.stringify({ name, venue, code: code.toUpperCase() }) });
      hap.success(); toast.show('Event created', 'success');
      setName(''); setVenue(''); setCode(''); setModal(false);
      await load();
    } catch (e: any) { hap.error(); toast.show(e.message, 'error'); }
    finally { setBusy(false); }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator /></View>;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>EVENTS</Text>
        <Pressable style={styles.addBtn} onPress={() => setModal(true)} testID="new-event">
          <Ionicons name="add" size={22} color="#FFF" />
          <Text style={styles.addBtnText}>NEW</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 12, gap: 8 }}>
        {events.map((e) => (
          <View key={e.id} style={styles.card} testID={`event-${e.code}`}>
            <View style={{ flex: 1 }}>
              <Text style={styles.evName}>{e.name}</Text>
              <Text style={styles.evVenue}>{e.venue}</Text>
            </View>
            <View style={styles.codeBox}>
              <Text style={styles.codeLabel}>CODE</Text>
              <Text style={styles.codeVal}>{e.code}</Text>
            </View>
          </View>
        ))}
      </ScrollView>

      <Modal visible={modal} animationType="slide" onRequestClose={() => setModal(false)}>
        <SafeAreaView style={styles.container} edges={['top']}>
          <View style={styles.header}>
            <Text style={styles.title}>NEW EVENT</Text>
            <Pressable onPress={() => setModal(false)}><Ionicons name="close" size={28} /></Pressable>
          </View>
          <View style={{ padding: 16, gap: 12 }}>
            <Text style={styles.label}>NAME</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Summer Festival" testID="ev-name" />
            <Text style={styles.label}>VENUE</Text>
            <TextInput style={styles.input} value={venue} onChangeText={setVenue} placeholder="Dublin Arena" testID="ev-venue" />
            <Text style={styles.label}>CODE</Text>
            <TextInput style={styles.input} value={code} onChangeText={(v) => setCode(v.toUpperCase())} placeholder="FEST02" autoCapitalize="characters" testID="ev-code" />
            <Pressable style={styles.submit} onPress={create} disabled={busy} testID="ev-create">
              {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitText}>CREATE →</Text>}
            </Pressable>
          </View>
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
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.color.brand, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 2, borderColor: theme.color.borderStrong },
  addBtnText: { color: '#FFF', fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  card: { flexDirection: 'row', alignItems: 'center', padding: 14, borderWidth: 2, borderColor: theme.color.borderStrong },
  evName: { fontSize: 16, fontWeight: '900' },
  evVenue: { fontSize: 12, color: theme.color.muted, marginTop: 2 },
  codeBox: { alignItems: 'center', padding: 8, borderWidth: 2, borderColor: theme.color.borderStrong, backgroundColor: theme.color.surfaceInverse },
  codeLabel: { fontSize: 9, color: '#FFF', letterSpacing: 1, fontWeight: '900' },
  codeVal: { fontSize: 16, color: '#FFF', fontFamily: theme.font.mono, fontWeight: '900' },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  input: { borderWidth: 2, borderColor: theme.color.borderStrong, padding: 12, fontSize: 16, fontWeight: '700' },
  submit: { marginTop: 12, padding: 18, backgroundColor: theme.color.brand, alignItems: 'center', borderWidth: 2, borderColor: theme.color.borderStrong },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '900', letterSpacing: 1 },
});
