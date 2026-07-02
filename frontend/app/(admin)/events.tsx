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
      const eventList = Array.isArray(ev) ? ev : Array.isArray(ev?.events) ? ev.events : [];
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

  if (loading) return <View style={styles.center}><ActivityIndicator color={theme.color.brand} /></View>;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Events</Text>
        <Pressable style={styles.addBtn} onPress={openNew} testID="new-event">
          <Ionicons name="add" size={18} color="#FFF" />
          <Text style={styles.addBtnText}>New</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
        {events.map((e) => (
          <Pressable key={e.id} style={styles.card} testID={`event-${e.code}`} onPress={() => openEdit(e)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.evName}>{e.name}</Text>
              <Text style={styles.evVenue}>{e.venue}</Text>
            </View>
            <View style={styles.codeBox}>
              <Text style={styles.codeLabel}>Code</Text>
              <Text style={styles.codeVal}>{e.code}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.color.muted} style={{ marginLeft: 8 }} />
          </Pressable>
        ))}
      </ScrollView>

      <Modal visible={modal} animationType="slide" onRequestClose={() => setModal(false)}>
        <SafeAreaProvider>
          <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            <View style={styles.header}>
              <Text style={styles.title}>{editingId ? 'Edit event' : 'New event'}</Text>
              <Pressable onPress={() => setModal(false)} testID="close-modal" hitSlop={12} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={theme.color.onSurface} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
              <View>
                <Text style={styles.label}>Name</Text>
                <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Summer Festival" placeholderTextColor={theme.color.muted} testID="ev-name" />
              </View>
              <View>
                <Text style={styles.label}>Venue</Text>
                <TextInput style={styles.input} value={venue} onChangeText={setVenue} placeholder="Dublin Arena" placeholderTextColor={theme.color.muted} testID="ev-venue" />
              </View>
              <View>
                <Text style={styles.label}>Code</Text>
                <TextInput style={styles.input} value={code} onChangeText={(v) => setCode(v.toUpperCase())} placeholder="FEST02" placeholderTextColor={theme.color.muted} autoCapitalize="characters" testID="ev-code" />
              </View>
              <Pressable style={styles.submit} onPress={submit} disabled={busy} testID="ev-create">
                {busy ? <ActivityIndicator color="#FFF" /> : (
                  <>
                    <Text style={styles.submitText}>{editingId ? 'Save' : 'Create'}</Text>
                    <Ionicons name="arrow-forward" size={18} color="#FFF" />
                  </>
                )}
              </Pressable>
            </ScrollView>
          </SafeAreaView>
        </SafeAreaProvider>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.surfaceSecondary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: theme.color.surface },
  title: { fontFamily: theme.font.extrabold, fontSize: 22, color: theme.color.onSurface, letterSpacing: -0.4 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.color.brand, paddingHorizontal: 14, paddingVertical: 10, borderRadius: theme.radius.pill, ...(theme.shadow.sm as any) },
  addBtnText: { color: '#FFF', fontSize: 13, fontFamily: theme.font.bold },
  card: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: theme.radius.xl, backgroundColor: theme.color.surface, ...(theme.shadow.sm as any) },
  evName: { fontFamily: theme.font.extrabold, fontSize: 16, color: theme.color.onSurface },
  evVenue: { fontFamily: theme.font.medium, fontSize: 12, color: theme.color.muted, marginTop: 2 },
  codeBox: { alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: theme.radius.lg, backgroundColor: theme.color.surfaceInverse },
  codeLabel: { fontSize: 9, color: 'rgba(255,255,255,0.7)', letterSpacing: 0.5, fontFamily: theme.font.bold },
  codeVal: { fontSize: 14, color: '#FFF', fontFamily: theme.font.mono, fontWeight: '700' },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.color.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: theme.font.semibold, fontSize: 12, color: theme.color.muted, letterSpacing: 0.3, marginBottom: 6 },
  input: { backgroundColor: theme.color.surfaceSecondary, borderRadius: theme.radius.lg, padding: 14, fontSize: 15, fontFamily: theme.font.semibold, color: theme.color.onSurface },
  submit: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 4, padding: 16, backgroundColor: theme.color.brand, borderRadius: theme.radius.pill, ...(theme.shadow.md as any) },
  submitText: { color: '#FFF', fontFamily: theme.font.extrabold, fontSize: 15 },
});
