import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Modal, ActivityIndicator } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { theme } from '@/src/lib/theme';
import { hap } from '@/src/lib/haptics';
import { useToast } from '@/src/lib/toast';

type Product = { id: string; sku: string; name: string; price: number; category?: string; event_id: string };
type EventItem = { id: string; code: string; name: string };

export default function Catalog() {
  const toast = useToast();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<string>('');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const ev = await api<any>('/events');
      const eventList = Array.isArray(ev) ? ev : Array.isArray(ev?.events) ? ev.events : [];
      setEvents(eventList);
      const eid = selectedEvent || eventList[0]?.id || '';
      setSelectedEvent(eid);
      if (eid) {
        const pr = await api<any>(`/products?event_id=${eid}`);
        const productList = Array.isArray(pr) ? pr : Array.isArray(pr?.products) ? pr.products : [];
        setProducts(productList);
      }
    } catch (e: any) { toast.show(e.message, 'error'); }
    finally { setLoading(false); }
  }, [selectedEvent, toast]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openNew = () => {
    setEditingId(null);
    setSku(''); setName(''); setPrice('');
    setModal(true);
  };

  const openEdit = (p: Product) => {
    hap.light();
    setEditingId(p.id);
    setSku(p.sku);
    setName(p.name);
    setPrice(String(p.price));
    setModal(true);
  };

  const submit = async () => {
    if (!sku || !name || !price) { toast.show('All fields required', 'error'); return; }
    setBusy(true);
    try {
      if (editingId) {
        await api(`/products/${editingId}`, { method: 'PUT', body: JSON.stringify({ sku, name, price: parseFloat(price) }) });
        toast.show('Product updated', 'success');
      } else {
        await api('/products', { method: 'POST', body: JSON.stringify({ sku, name, price: parseFloat(price), event_id: selectedEvent, category: 'other' }) });
        toast.show('Product added', 'success');
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
        <Text style={styles.title}>Catalog</Text>
        <Pressable style={[styles.addBtn, !selectedEvent && { opacity: 0.5 }]} onPress={openNew} testID="new-product" disabled={!selectedEvent}>
          <Ionicons name="add" size={18} color="#FFF" />
          <Text style={styles.addBtnText}>New</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow} contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}>
        {events.map((e) => (
          <Pressable
            key={e.id}
            testID={`ev-chip-${e.code}`}
            style={[styles.chip, selectedEvent === e.id && styles.chipActive]}
            onPress={() => { hap.light(); setSelectedEvent(e.id); }}
          >
            <Text style={[styles.chipText, selectedEvent === e.id && { color: '#FFF' }]}>{e.code}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
        {products.map((p) => (
          <Pressable key={p.id} style={styles.row} testID={`product-${p.sku}`} onPress={() => openEdit(p)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.pSku}>{p.sku}</Text>
              <Text style={styles.pName}>{p.name}</Text>
            </View>
            <Text style={styles.pPrice}>€{p.price.toFixed(2)}</Text>
            <Ionicons name="chevron-forward" size={18} color={theme.color.muted} style={{ marginLeft: 8 }} />
          </Pressable>
        ))}
      </ScrollView>

      <Modal visible={modal} animationType="slide" onRequestClose={() => setModal(false)}>
        <SafeAreaProvider>
          <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            <View style={styles.header}>
              <Text style={styles.title}>{editingId ? 'Edit product' : 'New product'}</Text>
              <Pressable onPress={() => setModal(false)} testID="close-modal" hitSlop={12} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={theme.color.onSurface} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16, gap: 12, backgroundColor: 'white', height: '100%' }} keyboardShouldPersistTaps="handled">
              <View>
                <Text style={styles.label}>SKU</Text>
                <TextInput style={styles.input} value={sku} onChangeText={(v) => setSku(v.toUpperCase())} placeholder="BEER-500" placeholderTextColor={theme.color.muted} autoCapitalize="characters" testID="pr-sku" />
              </View>
              <View>
                <Text style={styles.label}>Name</Text>
                <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Craft Lager 500ml" placeholderTextColor={theme.color.muted} testID="pr-name" />
              </View>
              <View>
                <Text style={styles.label}>Price (€)</Text>
                <TextInput style={styles.input} value={price} onChangeText={setPrice} placeholder="6.50" placeholderTextColor={theme.color.muted} keyboardType="decimal-pad" testID="pr-price" />
              </View>
              <Pressable style={styles.submit} onPress={submit} disabled={busy} testID="pr-create">
                {busy ? <ActivityIndicator color="#FFF" /> : (
                  <>
                    <Text style={styles.submitText}>{editingId ? 'Save' : 'Add'}</Text>
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
  chipRow: { maxHeight: 56, paddingVertical: 10, backgroundColor: theme.color.surface },
  chip: { flexShrink: 0, paddingHorizontal: 14, paddingVertical: 8, borderRadius: theme.radius.pill, backgroundColor: theme.color.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
  chipActive: { backgroundColor: theme.color.brand },
  chipText: { fontSize: 12, fontFamily: theme.font.bold, letterSpacing: 0.3, color: theme.color.onSurface },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: theme.radius.xl, backgroundColor: theme.color.surface, ...(theme.shadow.sm as any) },
  pSku: { fontFamily: theme.font.mono, fontSize: 11, color: theme.color.muted, letterSpacing: 0.5 },
  pName: { fontFamily: theme.font.bold, fontSize: 15, color: theme.color.onSurface, marginTop: 2 },
  pPrice: { fontFamily: theme.font.extrabold, fontSize: 16, color: theme.color.onSurface },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.color.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: theme.font.semibold, fontSize: 12, color: theme.color.muted, letterSpacing: 0.3, marginBottom: 6 },
  input: { backgroundColor: theme.color.surfaceSecondary, borderRadius: theme.radius.lg, padding: 14, fontSize: 15, fontFamily: theme.font.semibold, color: theme.color.onSurface },
  submit: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 4, padding: 16, backgroundColor: theme.color.brand, borderRadius: theme.radius.pill, ...(theme.shadow.md as any) },
  submitText: { color: '#FFF', fontFamily: theme.font.extrabold, fontSize: 15 },
});
