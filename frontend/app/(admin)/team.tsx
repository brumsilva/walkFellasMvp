import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Modal, ActivityIndicator } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
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
  const [revolutStatus, setRevolutStatus] = useState<{ configured: boolean; env: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [modalType, setModalType] = useState<'walker' | 'staff'>('walker');
  const [name, setName] = useState('');
  const [eventId, setEventId] = useState('');
  const [pin, setPin] = useState('');
  const [terminalCode, setTerminalCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'supervisor' | 'admin'>('supervisor');
  const [busy, setBusy] = useState(false);

  const [termModal, setTermModal] = useState(false);
  const [editingWalker, setEditingWalker] = useState<any>(null);
  const [termInput, setTermInput] = useState('');
  const [termBusy, setTermBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [ws, ev, rs] = await Promise.all([
        api<any>('/walkers'),
        api<any>('/events'),
        api<any>('/admin/revolut/status').catch(() => null),
      ]);
      const walkerList = Array.isArray(ws) ? ws : Array.isArray(ws?.walkers) ? ws.walkers : [];
      const eventList = Array.isArray(ev) ? ev : Array.isArray(ev?.events) ? ev.events : [];
      setWalkers(walkerList);
      setEvents(eventList);
      setRevolutStatus(rs);
      if (eventList.length && !eventId) setEventId(eventList[0].id);
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
        await api('/walkers', { method: 'POST', body: JSON.stringify({ name, event_id: eventId, pin, terminal_code: terminalCode || null }) });
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
      setName(''); setPin(''); setTerminalCode(''); setEmail(''); setPassword('');
      setModal(false);
      await load();
    } catch (e: any) { hap.error(); toast.show(e.message, 'error'); }
    finally { setBusy(false); }
  };

  const openTerminalEdit = (w: any) => {
    hap.light();
    setEditingWalker(w);
    setTermInput(w.terminal_code || '');
    setTermModal(true);
  };

  const saveTerminal = async () => {
    if (!editingWalker || !termInput.trim()) {
      toast.show('Enter a terminal code', 'error');
      return;
    }
    setTermBusy(true);
    try {
      await api(`/walkers/${editingWalker.id}/terminal`, { method: 'PUT', body: JSON.stringify({ terminal_code: termInput.trim().toUpperCase() }) });
      hap.success();
      toast.show('Terminal linked', 'success');
      setTermModal(false);
      await load();
    } catch (e: any) { hap.error(); toast.show(e.message, 'error'); }
    finally { setTermBusy(false); }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={theme.color.brand} /></View>;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Team</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable style={styles.addBtn} onPress={() => { setModalType('walker'); setModal(true); }} testID="new-walker">
            <Text style={styles.addBtnText}>+ Walker</Text>
          </Pressable>
          <Pressable style={[styles.addBtn, styles.addBtnAlt]} onPress={() => { setModalType('staff'); setModal(true); }} testID="new-staff">
            <Text style={[styles.addBtnText, { color: theme.color.onSurface }]}>+ Staff</Text>
          </Pressable>
        </View>
      </View>

      {revolutStatus && (
        <View style={[styles.revBanner, revolutStatus.configured ? styles.revBannerOk : styles.revBannerPending]}>
          <Ionicons
            name={revolutStatus.configured ? 'checkmark-circle' : 'time-outline'}
            size={14}
            color={revolutStatus.configured ? theme.color.success : '#8B6D19'}
          />
          <Text style={[styles.revBannerText, { color: revolutStatus.configured ? theme.color.success : '#8B6D19' }]}>
            Revolut Terminal · {revolutStatus.configured ? `live (${revolutStatus.env})` : `sandbox pending — demo mode active`}
          </Text>
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
        <Text style={styles.section}>Walkers ({walkers.length})</Text>
        {walkers.map((w) => (
          <View key={w.id} style={styles.row} testID={`walker-row-${w.id}`}>
            <View style={{ flex: 1 }}>
              <Text style={styles.wName}>{w.name}</Text>
              <Text style={styles.wEvent}>Event: {events.find(e => e.id === w.event_id)?.code || w.event_id}</Text>
            </View>
            <Pressable style={styles.termPill} onPress={() => openTerminalEdit(w)} testID={`terminal-edit-${w.id}`}>
              <Ionicons name="card-outline" size={12} color={w.terminal_code ? theme.color.brand : theme.color.muted} />
              <Text style={[styles.termPillText, !w.terminal_code && { color: theme.color.muted }]}>
                {w.terminal_code || 'Assign'}
              </Text>
            </Pressable>
            <View style={styles.statusPill}><Text style={styles.statusText}>{w.status}</Text></View>
          </View>
        ))}
      </ScrollView>

      <Modal visible={modal} animationType="slide" onRequestClose={() => setModal(false)}>
        <SafeAreaProvider>
          <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            <View style={styles.header}>
              <Text style={styles.title}>New {modalType === 'walker' ? 'walker' : 'staff'}</Text>
              <Pressable onPress={() => setModal(false)} testID="close-modal" hitSlop={12} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={theme.color.onSurface} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16, gap: 12, backgroundColor: 'white' }} keyboardShouldPersistTaps="handled">
              <View>
                <Text style={styles.label}>Name</Text>
                <TextInput style={styles.input} value={name} onChangeText={setName} placeholderTextColor={theme.color.muted} testID="t-name" />
              </View>

              {modalType === 'walker' ? (
                <>
                  <View>
                    <Text style={styles.label}>Event</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
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
                  </View>
                  <View>
                    <Text style={styles.label}>PIN (4-6 digits)</Text>
                    <TextInput style={styles.input} value={pin} onChangeText={setPin} placeholderTextColor={theme.color.muted} keyboardType="number-pad" maxLength={6} testID="t-pin" />
                  </View>
                  <View>
                    <Text style={styles.label}>Revolut Terminal code (optional)</Text>
                    <TextInput
                      style={styles.input} value={terminalCode}
                      onChangeText={(v) => setTerminalCode(v.toUpperCase())}
                      placeholder="REV73" placeholderTextColor={theme.color.muted}
                      autoCapitalize="characters" testID="t-terminal"
                    />
                  </View>
                </>
              ) : (
                <>
                  <View>
                    <Text style={styles.label}>Email</Text>
                    <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholderTextColor={theme.color.muted} autoCapitalize="none" keyboardType="email-address" testID="t-email" />
                  </View>
                  <View>
                    <Text style={styles.label}>Password</Text>
                    <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholderTextColor={theme.color.muted} secureTextEntry testID="t-password" />
                  </View>
                  <View>
                    <Text style={styles.label}>Role</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {(['supervisor', 'admin'] as const).map((r) => (
                        <Pressable
                          key={r}
                          style={[styles.chip, role === r && styles.chipActive]}
                          onPress={() => setRole(r)}
                          testID={`t-role-${r}`}
                        >
                          <Text style={[styles.chipText, role === r && { color: '#FFF' }]}>{r}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                </>
              )}

              <Pressable style={styles.submit} onPress={submit} disabled={busy} testID="t-submit">
                {busy ? <ActivityIndicator color="#FFF" /> : (
                  <>
                    <Text style={styles.submitText}>Create</Text>
                    <Ionicons name="arrow-forward" size={18} color="#FFF" />
                  </>
                )}
              </Pressable>
            </ScrollView>
          </SafeAreaView>
        </SafeAreaProvider>
      </Modal>

      <Modal visible={termModal} transparent animationType="fade" onRequestClose={() => setTermModal(false)}>
        <View style={styles.termModalBg}>
          <View style={styles.termModalBox}>
            <View style={styles.termModalIcon}>
              <Ionicons name="card" size={26} color={theme.color.brand} />
            </View>
            <Text style={styles.termModalTitle}>Link Revolut Terminal</Text>
            <Text style={styles.termModalSub}>{editingWalker?.name}</Text>
            <TextInput
              style={[styles.input, { marginTop: 14, textAlign: 'center', fontFamily: theme.font.extrabold, fontSize: 18 }]}
              value={termInput}
              onChangeText={(v) => setTermInput(v.toUpperCase())}
              placeholder="REV73"
              placeholderTextColor={theme.color.muted}
              autoCapitalize="characters"
              autoFocus
              testID="terminal-code-input"
            />
            <Pressable style={styles.submit} onPress={saveTerminal} disabled={termBusy} testID="terminal-code-save">
              {termBusy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitText}>Save</Text>}
            </Pressable>
            <Pressable onPress={() => setTermModal(false)} testID="terminal-code-cancel">
              <Text style={styles.termModalCancel}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.surfaceSecondary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: theme.color.surface },
  title: { fontFamily: theme.font.extrabold, fontSize: 22, color: theme.color.onSurface, letterSpacing: -0.4, textTransform: 'capitalize' },
  addBtn: { backgroundColor: theme.color.brand, paddingHorizontal: 12, paddingVertical: 9, borderRadius: theme.radius.pill },
  addBtnAlt: { backgroundColor: theme.color.surfaceSecondary },
  addBtnText: { color: '#FFF', fontSize: 12, fontFamily: theme.font.bold },
  revBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 20, backgroundColor: theme.color.surface },
  revBannerOk: {},
  revBannerPending: {},
  revBannerText: { fontFamily: theme.font.bold, fontSize: 11 },
  section: { fontFamily: theme.font.bold, fontSize: 12, letterSpacing: 0.5, color: theme.color.muted, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, borderRadius: theme.radius.xl, backgroundColor: theme.color.surface, ...(theme.shadow.sm as any) },
  wName: { fontFamily: theme.font.bold, fontSize: 15, color: theme.color.onSurface },
  wEvent: { fontSize: 11, color: theme.color.muted, fontFamily: theme.font.medium, marginTop: 2 },
  termPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: theme.color.brandSoft, borderRadius: theme.radius.pill },
  termPillText: { fontFamily: theme.font.extrabold, fontSize: 11, color: theme.color.brand, letterSpacing: 0.3 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 5, backgroundColor: theme.color.successSoft, borderRadius: theme.radius.pill },
  statusText: { color: theme.color.success, fontSize: 11, fontFamily: theme.font.bold, textTransform: 'capitalize' },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.color.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: theme.font.semibold, fontSize: 12, color: theme.color.muted, letterSpacing: 0.3, marginBottom: 6 },
  input: { 
    backgroundColor: theme.color.surfaceSecondary,
    borderRadius: theme.radius.lg,
    paddingVertical: 14, paddingHorizontal: 14,
    fontSize: 16, fontFamily: theme.font.semibold,
    color: theme.color.onSurface,
  },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: theme.radius.pill, backgroundColor: theme.color.surfaceSecondary },
  chipActive: { backgroundColor: theme.color.brand },
  chipText: { fontSize: 12, fontFamily: theme.font.bold, color: theme.color.onSurface, textTransform: 'capitalize' },
  submit: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 4, padding: 16, backgroundColor: theme.color.brand, borderRadius: theme.radius.pill, ...(theme.shadow.md as any) },
  submitText: { color: '#FFF', fontFamily: theme.font.extrabold, fontSize: 15 },
  termModalBg: { flex: 1, backgroundColor: 'rgba(26,26,31,0.75)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  termModalBox: { backgroundColor: '#FFF', borderRadius: theme.radius.xxl, padding: 24, alignItems: 'center', gap: 6, width: '100%', maxWidth: 320, ...(theme.shadow.lg as any) },
  termModalIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: theme.color.brandSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  termModalTitle: { fontFamily: theme.font.extrabold, fontSize: 17, color: theme.color.onSurface },
  termModalSub: { fontFamily: theme.font.medium, fontSize: 12, color: theme.color.muted },
  termModalCancel: { color: theme.color.muted, fontFamily: theme.font.semibold, marginTop: 4, fontSize: 13 },
});
