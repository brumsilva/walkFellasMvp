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
      const ev = await api<EventItem[]>('/events');
      setEvents(ev);
      const eid = selectedEvent || ev[0]?.id || '';
      setSelectedEvent(eid);
      if (eid) {
        const pr = await api<Product[]>(`/products?event_id=${eid}`);
        setProducts(pr);
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
        await api(`/products/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify({ sku, name, price: parseFloat(price) }),
        });
        toast.show('Product updated', 'success');
      } else {
        await api('/products', {
          method: 'POST',
          body: JSON.stringify({ sku, name, price: parseFloat(price), event_id: selectedEvent, category: 'other' }),
        });
        toast.show('Product added', 'success');
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
        <Text style={styles.title}>CATALOG</Text>
        <Pressable style={styles.addBtn} onPress={openNew} testID="new-product" disabled={!selectedEvent}>
          <Ionicons name="add" size={22} color="#FFF" />
          <Text style={styles.addBtnText}>NEW</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow} contentContainerStyle={{ gap: 8, paddingHorizontal: 12 }}>
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
      <ScrollView contentContainerStyle={{ padding: 12, gap: 6 }}>
        {products.map((p) => (
          <Pressable
            key={p.id}
            style={styles.row}
            testID={`product-${p.sku}`}
            onPress={() => openEdit(p)}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.pSku}>{p.sku}</Text>
              <Text style={styles.pName}>{p.name}</Text>
            </View>
            <Text style={styles.pPrice}>€{p.price.toFixed(2)}</Text>
            <Ionicons name="chevron-forward" size={20} color={theme.color.muted} style={{ marginLeft: 8 }} />
          </Pressable>
        ))}
      </ScrollView>

      <Modal visible={modal} animationType="slide" onRequestClose={() => setModal(false)}>
        <SafeAreaProvider>
          <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            <View style={styles.header}>
              <Text style={styles.title}>{editingId ? 'EDIT PRODUCT' : 'NEW PRODUCT'}</Text>
              <Pressable onPress={() => setModal(false)} testID="close-modal" hitSlop={12}><Ionicons name="close" size={28} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.label}>SKU</Text>
              <TextInput style={styles.input} value={sku} onChangeText={(v) => setSku(v.toUpperCase())} placeholder="BEER-500" autoCapitalize="characters" testID="pr-sku" />
              <Text style={styles.label}>NAME</Text>
              <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Craft Lager 500ml" testID="pr-name" />
              <Text style={styles.label}>PRICE (€)</Text>
              <TextInput style={styles.input} value={price} onChangeText={setPrice} placeholder="6.50" keyboardType="decimal-pad" testID="pr-price" />
              <Pressable style={styles.submit} onPress={submit} disabled={busy} testID="pr-create">
                {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitText}>{editingId ? 'SAVE →' : 'ADD →'}</Text>}
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
  chipRow: { maxHeight: 56, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: theme.color.borderStrong },
  chip: { flexShrink: 0, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 2, borderColor: theme.color.borderStrong, alignItems: 'center', justifyContent: 'center' },
  chipActive: { backgroundColor: theme.color.surfaceInverse },
  chipText: { fontSize: 12, fontWeight: '900', letterSpacing: 1, fontFamily: theme.font.mono },
  row: { flexDirection: 'row', alignItems: 'center', padding: 12, borderWidth: 2, borderColor: theme.color.borderStrong },
  pSku: { fontFamily: theme.font.mono, fontSize: 11, color: theme.color.muted, letterSpacing: 1, fontWeight: '800' },
  pName: { fontSize: 15, fontWeight: '800', marginTop: 2 },
  pPrice: { fontSize: 18, fontWeight: '900', fontFamily: theme.font.mono },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  input: { borderWidth: 2, borderColor: theme.color.borderStrong, padding: 12, fontSize: 16, fontWeight: '700' },
  submit: { marginTop: 12, padding: 18, backgroundColor: theme.color.brand, alignItems: 'center', borderWidth: 2, borderColor: theme.color.borderStrong },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '900', letterSpacing: 1 },
});
