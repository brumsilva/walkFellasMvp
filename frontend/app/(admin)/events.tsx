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
type Product = { id: string; sku: string; name: string; price: number; event_id: string };
type InventoryItem = {
  product_id: string; sku: string; name: string;
  initial_quantity: number; warehouse_out: number; warehouse_in: number; available: number;
};

export default function Events() {
  const toast = useToast();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  // Event modal
  const [modal, setModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [venue, setVenue] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  // Inventory modal
  const [invModal, setInvModal] = useState(false);
  const [invEvent, setInvEvent] = useState<EventItem | null>(null);
  const [invItems, setInvItems] = useState<InventoryItem[]>([]);
  const [invQty, setInvQty] = useState<Record<string, number>>({});
  const [invLoading, setInvLoading] = useState(false);
  const [invSaving, setInvSaving] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);

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

  // ---- Inventory management ----
  const openInventory = async (ev: EventItem) => {
    hap.light();
    setInvEvent(ev);
    setInvModal(true);
    setInvLoading(true);
    try {
      const [inv, prods] = await Promise.all([
        api<any>(`/events/${ev.id}/inventory`),
        api<any>(`/products?event_id=${ev.id}`),
      ]);
      const items: InventoryItem[] = inv?.items || [];
      const productList = Array.isArray(prods) ? prods : Array.isArray(prods?.products) ? prods.products : [];
      setInvItems(items);
      setProducts(productList);
      // Build qty map from current inventory
      const qtyMap: Record<string, number> = {};
      items.forEach((it) => { qtyMap[it.product_id] = it.initial_quantity; });
      // Also add products that may not have inventory yet
      productList.forEach((p: Product) => {
        if (!(p.id in qtyMap)) qtyMap[p.id] = 0;
      });
      setInvQty(qtyMap);
    } catch (e: any) { toast.show(e.message || 'Load failed', 'error'); }
    finally { setInvLoading(false); }
  };

  const bumpInv = (pid: string, delta: number) => {
    hap.light();
    setInvQty((prev) => ({ ...prev, [pid]: Math.max(0, (prev[pid] || 0) + delta) }));
  };

  const setInvValue = (pid: string, val: string) => {
    const n = parseInt(val.replace(/[^0-9]/g, ''), 10);
    setInvQty((prev) => ({ ...prev, [pid]: isNaN(n) ? 0 : Math.max(0, n) }));
  };

  const saveInventory = async () => {
    if (!invEvent) return;
    setInvSaving(true);
    try {
      const items = Object.entries(invQty).map(([product_id, quantity]) => ({ product_id, quantity }));
      await api(`/events/${invEvent.id}/inventory`, {
        method: 'POST',
        body: JSON.stringify({ items }),
      });
      hap.success();
      toast.show('Inventory saved', 'success');
      setInvModal(false);
    } catch (e: any) { hap.error(); toast.show(e.message || 'Save failed', 'error'); }
    finally { setInvSaving(false); }
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
          <View key={e.id} style={styles.card}>
            <Pressable style={{ flex: 1 }} testID={`event-${e.code}`} onPress={() => openEdit(e)}>
              <Text style={styles.evName}>{e.name}</Text>
              <Text style={styles.evVenue}>{e.venue}</Text>
            </Pressable>
            <View style={styles.codeBox}>
              <Text style={styles.codeLabel}>Code</Text>
              <Text style={styles.codeVal}>{e.code}</Text>
            </View>
            <Pressable
              style={styles.invBtn}
              onPress={() => openInventory(e)}
              testID={`inv-${e.code}`}
              hitSlop={8}
            >
              <Ionicons name="layers" size={16} color={theme.color.info} />
              <Text style={styles.invBtnText}>Stock</Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>

      {/* Event Create/Edit Modal */}
      <Modal visible={modal} animationType="slide" onRequestClose={() => setModal(false)}>
        <SafeAreaProvider>
          <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            <View style={styles.header}>
              <Text style={styles.title}>{editingId ? 'Edit event' : 'New event'}</Text>
              <Pressable onPress={() => setModal(false)} testID="close-modal" hitSlop={12} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={theme.color.onSurface} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16, gap: 12, backgroundColor: 'white' }} keyboardShouldPersistTaps="handled">
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
                <TextInput style={styles.input} value={code} onChangeText={(v) => setCode(v.toUpperCase())} placeholder="e.g. FEST02" placeholderTextColor={theme.color.muted} autoCapitalize="characters" testID="ev-code" />
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

      {/* Inventory Management Modal */}
      <Modal visible={invModal} animationType="slide" onRequestClose={() => setInvModal(false)}>
        <SafeAreaProvider>
          <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>Manage stock</Text>
                <Text style={styles.subtitle}>{invEvent?.name} ({invEvent?.code})</Text>
              </View>
              <Pressable onPress={() => setInvModal(false)} testID="close-inv" hitSlop={12} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={theme.color.onSurface} />
              </Pressable>
            </View>

            {/* Info banner */}
            <View style={styles.infoBanner}>
              <Ionicons name="information-circle" size={16} color={theme.color.info} />
              <Text style={styles.infoBannerText}>Set initial stock quantities. This defines the total inventory for the event.</Text>
            </View>

            {invLoading ? (
              <View style={styles.center}><ActivityIndicator color={theme.color.brand} /></View>
            ) : (
              <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }} keyboardShouldPersistTaps="handled">
                {/* Show current balance for items that have movements */}
                {invItems.filter((it) => it.warehouse_out > 0 || it.warehouse_in > 0).length > 0 && (
                  <View style={styles.balanceSummary}>
                    <View style={styles.balanceSummaryHead}>
                      <Ionicons name="swap-horizontal" size={16} color={theme.color.onSurface} />
                      <Text style={styles.balanceSummaryTitle}>Current balance</Text>
                    </View>
                    {invItems.filter((it) => it.warehouse_out > 0 || it.warehouse_in > 0).map((it) => (
                      <View key={it.product_id} style={styles.balanceRow}>
                        <Text style={styles.balanceRowName} numberOfLines={1}>{it.name}</Text>
                        <View style={styles.balanceTags}>
                          <View style={[styles.balanceTag, { backgroundColor: theme.color.brandSoft }]}>
                            <Text style={[styles.balanceTagText, { color: theme.color.brand }]}>{'\u2193'}{it.warehouse_out}</Text>
                          </View>
                          <View style={[styles.balanceTag, { backgroundColor: theme.color.successSoft }]}>
                            <Text style={[styles.balanceTagText, { color: theme.color.success }]}>{'\u2191'}{it.warehouse_in}</Text>
                          </View>
                          <View style={[styles.balanceTag, { backgroundColor: theme.color.infoSoft }]}>
                            <Text style={[styles.balanceTagText, { color: theme.color.info }]}>{'\u2248'}{it.available}</Text>
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {/* Product qty editor */}
                {products.map((p) => {
                  const qty = invQty[p.id] || 0;
                  return (
                    <View key={p.id} style={styles.invItemRow} testID={`inv-item-${p.sku}`}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.invItemName}>{p.name}</Text>
                        <Text style={styles.invItemSku}>{p.sku} {'\u00B7'} {'\u20AC'}{p.price.toFixed(2)}</Text>
                      </View>
                      <View style={styles.stepper}>
                        <Pressable style={styles.stepBtn} onPress={() => bumpInv(p.id, -10)} testID={`inv-${p.sku}-minus10`}>
                          <Text style={styles.stepBtnTxt}>-10</Text>
                        </Pressable>
                        <Pressable style={styles.stepBtn} onPress={() => bumpInv(p.id, -1)} testID={`inv-${p.sku}-minus`}>
                          <Ionicons name="remove" size={16} color={theme.color.onSurface} />
                        </Pressable>
                        <TextInput
                          style={styles.stepInput}
                          value={String(qty)}
                          onChangeText={(v) => setInvValue(p.id, v)}
                          keyboardType="number-pad"
                          selectTextOnFocus
                          testID={`inv-${p.sku}-input`}
                        />
                        <Pressable style={styles.stepBtn} onPress={() => bumpInv(p.id, +1)} testID={`inv-${p.sku}-plus`}>
                          <Ionicons name="add" size={16} color={theme.color.onSurface} />
                        </Pressable>
                        <Pressable style={styles.stepBtn} onPress={() => bumpInv(p.id, +10)} testID={`inv-${p.sku}-plus10`}>
                          <Text style={styles.stepBtnTxt}>+10</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}

                {products.length === 0 && (
                  <View style={{ padding: 40, alignItems: 'center' }}>
                    <Ionicons name="cube-outline" size={44} color={theme.color.muted} />
                    <Text style={{ fontFamily: theme.font.semibold, fontSize: 13, color: theme.color.muted, marginTop: 8 }}>
                      No products in this event. Add products in Catalog first.
                    </Text>
                  </View>
                )}

                {products.length > 0 && (
                  <Pressable style={[styles.submit, invSaving && { opacity: 0.5 }]} onPress={saveInventory} disabled={invSaving} testID="save-inventory">
                    {invSaving ? <ActivityIndicator color="#FFF" /> : (
                      <>
                        <Ionicons name="layers" size={18} color="#FFF" />
                        <Text style={styles.submitText}>Save inventory</Text>
                      </>
                    )}
                  </Pressable>
                )}
                <View style={{ height: 40 }} />
              </ScrollView>
            )}
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
  subtitle: { fontFamily: theme.font.medium, fontSize: 12, color: theme.color.muted, marginTop: 2 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.color.brand, paddingHorizontal: 14, paddingVertical: 10, borderRadius: theme.radius.pill, ...(theme.shadow.sm as any) },
  addBtnText: { color: '#FFF', fontSize: 13, fontFamily: theme.font.bold },
  card: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: theme.radius.xl, backgroundColor: theme.color.surface, gap: 8, ...(theme.shadow.sm as any) },
  evName: { fontFamily: theme.font.extrabold, fontSize: 16, color: theme.color.onSurface },
  evVenue: { fontFamily: theme.font.medium, fontSize: 12, color: theme.color.muted, marginTop: 2 },
  codeBox: { alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: theme.radius.lg, backgroundColor: theme.color.surfaceInverse },
  codeLabel: { fontSize: 9, color: 'rgba(255,255,255,0.7)', letterSpacing: 0.5, fontFamily: theme.font.bold },
  codeVal: { fontSize: 14, color: '#FFF', fontFamily: theme.font.mono, fontWeight: '700' },
  invBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 8, borderRadius: theme.radius.pill, backgroundColor: theme.color.infoSoft },
  invBtnText: { fontFamily: theme.font.bold, fontSize: 11, color: theme.color.info },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.color.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: theme.font.semibold, fontSize: 12, color: theme.color.muted, letterSpacing: 0.3, marginBottom: 6 },
  input: { backgroundColor: theme.color.surfaceSecondary, borderRadius: theme.radius.lg, padding: 14, fontSize: 15, fontFamily: theme.font.semibold, color: theme.color.onSurface },
  submit: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 4, padding: 16, backgroundColor: theme.color.brand, borderRadius: theme.radius.pill, ...(theme.shadow.md as any) },
  submitText: { color: '#FFF', fontFamily: theme.font.extrabold, fontSize: 15 },
  // Inventory modal styles
  infoBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: theme.color.infoSoft, paddingHorizontal: 20, paddingVertical: 10,
  },
  infoBannerText: { fontFamily: theme.font.medium, fontSize: 11, color: theme.color.info, flex: 1 },
  invItemRow: {
    flexDirection: 'row', alignItems: 'center', padding: 12,
    borderRadius: theme.radius.xl, backgroundColor: theme.color.surface, ...(theme.shadow.sm as any),
  },
  invItemName: { fontFamily: theme.font.bold, fontSize: 14, color: theme.color.onSurface },
  invItemSku: { fontFamily: theme.font.mono, fontSize: 10, color: theme.color.muted, letterSpacing: 0.5, marginTop: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: theme.color.surfaceSecondary, borderRadius: theme.radius.pill, padding: 3 },
  stepBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: theme.color.surface, alignItems: 'center', justifyContent: 'center', ...(theme.shadow.sm as any) },
  stepBtnTxt: { fontFamily: theme.font.bold, fontSize: 10, color: theme.color.onSurface },
  stepInput: {
    width: 48, height: 30, textAlign: 'center',
    fontFamily: theme.font.extrabold, fontSize: 14, color: theme.color.onSurface,
    backgroundColor: theme.color.surface, borderRadius: theme.radius.lg,
    paddingVertical: 0,
  },
  // Balance summary
  balanceSummary: {
    backgroundColor: theme.color.surface, borderRadius: theme.radius.xl,
    padding: 14, gap: 8, marginBottom: 4, ...(theme.shadow.sm as any),
  },
  balanceSummaryHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  balanceSummaryTitle: { fontFamily: theme.font.extrabold, fontSize: 14, color: theme.color.onSurface },
  balanceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  balanceRowName: { fontFamily: theme.font.semibold, fontSize: 13, color: theme.color.onSurfaceSecondary, flex: 1, marginRight: 8 },
  balanceTags: { flexDirection: 'row', gap: 4 },
  balanceTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: theme.radius.pill },
  balanceTagText: { fontFamily: theme.font.bold, fontSize: 10 },
});