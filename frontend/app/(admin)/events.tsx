import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Modal, ActivityIndicator } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { theme } from '@/src/lib/theme';
import { hap } from '@/src/lib/haptics';
import { useToast } from '@/src/lib/toast';

type EventItem = { id: string; name: string; venue: string; code: string };

export default function Events() {
  const toast = useToast();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [venue, setVenue] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const ev = await api<any>('/events');
      const eventList = Array.isArray(ev)
        ? ev
        : Array.isArray(ev?.events)
          ? ev.events
          : [];
      setEvents(eventList);
    } catch (e: any) { toast.show(e.message, 'error'); }
    finally { setLoading(false); }
  }, [toast]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openNew = () => {
    setEditingId(null);
    setName(''); setVenue(''); setCode('');
    setModal(true);
  };

  const openEdit = (ev: EventItem) => {
    hap.light();
    setEditingId(ev.id);
    setName(ev.name);
    setVenue(ev.venue);
    setCode(ev.code);
    setModal(true);
  };

  const submit = async () => {
    if (!name || !venue || !code) { toast.show('All fields required', 'error'); return; }
    setBusy(true);
    try {
      if (editingId) {
        await api(`/events/${editingId}`, { method: 'PUT', body: JSON.stringify({ name, venue, code: code.toUpperCase() }) });
        toast.show('Event updated', 'success');
      } else {
        await api('/events', { method: 'POST', body: JSON.stringify({ name, venue, code: code.toUpperCase() }) });
        toast.show('Event created', 'success');
      }
      hap.success();
      setModal(false);
      await load();
    } catch (e: any) { hap.error(); toast.show(e.message, 'error'); }
    finally { setBusy(false); }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator /></View>;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>EVENTS</Text>
        <Pressable style={styles.addBtn} onPress={openNew} testID="new-event">
          <Ionicons name="add" size={22} color="#FFF" />
          <Text style={styles.addBtnText}>NEW</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 12, gap: 8 }}>
        {events.map((e) => (
          <Pressable
            key={e.id}
            style={styles.card}
            testID={`event-${e.code}`}
            onPress={() => openEdit(e)}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.evName}>{e.name}</Text>
              <Text style={styles.evVenue}>{e.venue}</Text>
            </View>
            <View style={styles.codeBox}>
              <Text style={styles.codeLabel}>CODE</Text>
              <Text style={styles.codeVal}>{e.code}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.color.muted} style={{ marginLeft: 8 }} />
          </Pressable>
        ))}
      </ScrollView>

      <Modal visible={modal} animationType="slide" onRequestClose={() => setModal(false)}>
        <SafeAreaProvider>
          <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            <View style={styles.header}>
              <Text style={styles.title}>{editingId ? 'EDIT EVENT' : 'NEW EVENT'}</Text>
              <Pressable onPress={() => setModal(false)} testID="close-modal" hitSlop={12}><Ionicons name="close" size={28} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.label}>NAME</Text>
              <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Summer Festival" testID="ev-name" />
              <Text style={styles.label}>VENUE</Text>
              <TextInput style={styles.input} value={venue} onChangeText={setVenue} placeholder="Dublin Arena" testID="ev-venue" />
              <Text style={styles.label}>CODE</Text>
              <TextInput style={styles.input} value={code} onChangeText={(v) => setCode(v.toUpperCase())} placeholder="FEST02" autoCapitalize="characters" testID="ev-code" />
              <Pressable style={styles.submit} onPress={submit} disabled={busy} testID="ev-create">
                {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitText}>{editingId ? 'SAVE →' : 'CREATE →'}</Text>}
              </Pressable>
            </ScrollView>
          </SafeAreaView>
        </SafeAreaProvider>
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
