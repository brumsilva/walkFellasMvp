import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, Modal } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { api, clearSession, getUser } from '@/src/lib/api';
import { theme } from '@/src/lib/theme';
import { hap } from '@/src/lib/haptics';
import { useToast } from '@/src/lib/toast';
import { Logo } from '@/src/components/Logo';

type Overview = {
  total_sales: number; total_units_sold: number; total_waste_units: number;
  total_discrepancy: number; active_shifts: number; pending_restocks: number; pending_waste: number;
};
type Product = { id: string; sku: string; name: string };
type WasteLog = { id: string; walker_name: string; product_id: string; quantity: number; category: string; photo_b64?: string; timestamp: string; status?: string; product_name?: string; product_sku?: string };
type EventItem = { id: string; code: string; name: string };
type InventoryItem = { product_id: string; sku: string; name: string; initial_quantity: number; warehouse_out: number; warehouse_in: number; available: number };

// Fix 4 types
type DiscrepancyDetail = { shift_id: string; walker_name: string; closed_at: string; total_discrepancy: number; items: { product_id: string; sku: string; name: string; diff: number }[] };
type RestockDetail = { id: string; walker_name: string; timestamp: string; items: { product_id: string; name: string; sku: string; quantity: number }[] };
type ActiveWalkerDetail = { shift_id: string; walker_name: string; opened_at: string; current_units: number; stock_detail: { sku: string; name: string; qty: number }[] };

export default function Dashboard() {
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState<Overview | null>(null);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [wasteOpen, setWasteOpen] = useState(false);
  const [wasteItems, setWasteItems] = useState<WasteLog[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [wasteLoading, setWasteLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Inventory state
  const [events, setEvents] = useState<EventItem[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<string>('');
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [invLoading, setInvLoading] = useState(false);
  const [invExpanded, setInvExpanded] = useState(true);
  // Fix 4: Detail modals
  const [detailModal, setDetailModal] = useState<'discrepancies' | 'waste' | 'pending_restocks' | 'active_walkers' | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [discrepancies, setDiscrepancies] = useState<DiscrepancyDetail[]>([]);
  const [wasteDetail, setWasteDetail] = useState<WasteLog[]>([]);
  const [restockDetail, setRestockDetail] = useState<RestockDetail[]>([]);
  const [activeDetail, setActiveDetail] = useState<ActiveWalkerDetail[]>([]);

  const load = useCallback(async () => {
    try {
      const [d, u, ev] = await Promise.all([
        api<Overview>('/dashboard/overview'),
        getUser(),
        api<any>('/events'),
      ]);
      setData(d); setUser(u);
      const eventList = Array.isArray(ev) ? ev : Array.isArray(ev?.events) ? ev.events : [];
      setEvents(eventList);
      const firstId = eventList[0]?.id || '';
      if (firstId) {
        setSelectedEvent((prev) => prev || firstId);
        setInvLoading(true);
        try {
          const inv = await api<any>(`/events/${firstId}/inventory`);
          setInventory(inv?.items || []);
        } catch { setInventory([]); }
        finally { setInvLoading(false); }
      }
    } catch {}
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const loadInventoryForEvent = useCallback(async (eid: string) => {
    hap.light();
    setSelectedEvent(eid);
    setInvLoading(true);
    try {
      const inv = await api<any>(`/events/${eid}/inventory`);
      setInventory(inv?.items || []);
    } catch { setInventory([]); }
    finally { setInvLoading(false); }
  }, []);

  // Fix 4: Open detail modal
  const openDetail = useCallback(async (metric: typeof detailModal) => {
    if (!metric) return;
    hap.light();
    setDetailModal(metric);
    setDetailLoading(true);
    try {
      const res = await api<any>(`/dashboard/metric-details/${metric}`);
      const list = Array.isArray(res) ? res : [];
      if (metric === 'discrepancies') setDiscrepancies(list);
      else if (metric === 'waste') setWasteDetail(list);
      else if (metric === 'pending_restocks') setRestockDetail(list);
      else if (metric === 'active_walkers') setActiveDetail(list);
    } catch (e: any) {
      toast.show(e.message || 'Load failed', 'error');
    } finally {
      setDetailLoading(false);
    }
  }, [toast]);

  const loadWaste = useCallback(async () => {
    setWasteLoading(true);
    try {
      const [ws, ps] = await Promise.all([
        api<any>('/waste?status_filter=pending'),
        api<any>('/products'),
      ]);
      setWasteItems(ws); setProducts(ps);
    } catch (e: any) { toast.show(e.message || 'Load failed', 'error'); }
    finally { setWasteLoading(false); }
  }, [toast]);

  const openWasteModal = () => { hap.light(); setWasteOpen(true); loadWaste(); };

  const validate = async (w: WasteLog, approved: boolean) => {
    setBusyId(w.id);
    try {
      await api(`/waste/${w.id}/validate`, { method: 'POST', body: JSON.stringify({ approved }) });
      if (approved) { hap.success(); } else { hap.warning(); }
      toast.show(approved ? 'Approved' : 'Rejected', approved ? 'success' : 'info');
      await Promise.all([loadWaste(), load()]);
    } catch (e: any) { hap.error(); toast.show(e.message || 'Failed', 'error'); }
    finally { setBusyId(null); }
  };

  const logout = async () => { await clearSession(); router.replace('/'); };

  if (loading) return <View style={styles.center}><ActivityIndicator color={theme.color.brand} /></View>;

  const productMap = Object.fromEntries(products.map((p) => [p.id, p]));
  const invTotalInitial = inventory.reduce((a, b) => a + b.initial_quantity, 0);
  const invTotalOut = inventory.reduce((a, b) => a + b.warehouse_out, 0);
  const invTotalIn = inventory.reduce((a, b) => a + b.warehouse_in, 0);
  const invTotalAvailable = inventory.reduce((a, b) => a + b.available, 0);

  const detailTitle = detailModal === 'discrepancies' ? 'Discrepancies' :
    detailModal === 'waste' ? 'Waste logs' :
    detailModal === 'pending_restocks' ? 'Pending restocks' :
    detailModal === 'active_walkers' ? 'Active walkers' : '';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.hi}>Hello, {user?.name?.split(' ')[0] || 'Admin'}</Text>
          <Text style={styles.hiSub}>{ 'what\'s moving right now' }</Text>
        </View>
        <Pressable onPress={logout} testID="logout-btn" hitSlop={12} style={styles.avatarBtn}>
          <Ionicons name="log-out-outline" size={20} color={theme.color.muted} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Hero sales card */}
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroBadge}>
              <Ionicons name="trending-up" size={14} color="#FFF" />
              <Text style={styles.heroBadgeText}>LIVE</Text>
            </View>
            <Logo variant="mark" size={28} color="onBrand" />
          </View>
          <Text style={styles.heroLabel}>Total sales today</Text>
          <Text style={styles.heroValue}>{'\u20AC'}{(data?.total_sales || 0).toFixed(2)}</Text>
          <View style={styles.heroFooter}>
            <View style={styles.heroChip}>
              <Ionicons name="cube-outline" size={13} color="#FFF" />
              <Text style={styles.heroChipText}>{data?.total_units_sold || 0} units sold</Text>
            </View>
            <View style={styles.heroChip}>
              <Ionicons name="people" size={13} color="#FFF" />
              <Text style={styles.heroChipText}>{data?.active_shifts || 0} active</Text>
            </View>
          </View>
        </View>

        {/* Fix 4: Metric grid - now tappable */}
        <View style={styles.grid}>
          <Pressable style={styles.metric} onPress={() => openDetail('discrepancies')} testID="metric-discrepancies">
            <View style={[styles.metricIcon, { backgroundColor: theme.color.brandSoft }]}>
              <Ionicons name="warning" size={18} color={theme.color.brand} />
            </View>
            <Text style={styles.metricLabel}>Discrepancies</Text>
            <View style={styles.metricRow}>
              <Text style={[styles.metricValue, (data?.total_discrepancy || 0) > 0 && { color: theme.color.brand }]}>{data?.total_discrepancy || 0}</Text>
              <Ionicons name="chevron-forward" size={14} color={theme.color.muted} />
            </View>
          </Pressable>
          <Pressable style={styles.metric} onPress={() => openDetail('waste')} testID="metric-waste">
            <View style={[styles.metricIcon, { backgroundColor: theme.color.warningSoft }]}>
              <Ionicons name="trash" size={18} color="#8B6D19" />
            </View>
            <Text style={styles.metricLabel}>Waste units</Text>
            <View style={styles.metricRow}>
              <Text style={styles.metricValue}>{data?.total_waste_units || 0}</Text>
              <Ionicons name="chevron-forward" size={14} color={theme.color.muted} />
            </View>
          </Pressable>
          <Pressable style={styles.metric} onPress={() => openDetail('pending_restocks')} testID="metric-restocks">
            <View style={[styles.metricIcon, { backgroundColor: theme.color.infoSoft }]}>
              <Ionicons name="cube" size={18} color={theme.color.info} />
            </View>
            <Text style={styles.metricLabel}>Pending restock</Text>
            <View style={styles.metricRow}>
              <Text style={styles.metricValue}>{data?.pending_restocks || 0}</Text>
              <Ionicons name="chevron-forward" size={14} color={theme.color.muted} />
            </View>
          </Pressable>
          <Pressable style={styles.metric} onPress={() => openDetail('active_walkers')} testID="metric-active">
            <View style={[styles.metricIcon, { backgroundColor: theme.color.successSoft }]}>
                <Ionicons name="people" size={18} color={theme.color.success} />
            </View>
            <Text style={styles.metricLabel}>Active walkers</Text>
            <View style={styles.metricRow}>
              <Text style={styles.metricValue}>{data?.active_shifts || 0}</Text>
              <Ionicons name="chevron-forward" size={14} color={theme.color.muted} />
            </View>
          </Pressable>
        </View>

        {/* INVENTORY GENERAL SECTION */}
        <Pressable style={styles.invHeader} onPress={() => { hap.light(); setInvExpanded(!invExpanded); }} testID="toggle-inventory">
          <View style={styles.invIconCircle}>
            <Ionicons name="layers" size={20} color={theme.color.info} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.invTitle}>General Inventory</Text>
            <Text style={styles.invSubtitle}>Initial stock vs final balance</Text>
          </View>
          <Ionicons name={invExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={theme.color.muted} />
        </Pressable>

        {invExpanded && (
          <View style={{ gap: 10 }}>
            {events.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {events.map((e) => (
                  <Pressable key={e.id} style={[styles.evChip, selectedEvent === e.id && styles.evChipActive]} onPress={() => loadInventoryForEvent(e.id)} testID={`inv-ev-${e.code}`}>
                    <Text style={[styles.evChipText, selectedEvent === e.id && { color: '#FFF' }]}>{e.code}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
            <View style={styles.invSummaryRow}>
              <View style={styles.invSummaryItem}><Text style={styles.invSummaryLabel}>Initial</Text><Text style={styles.invSummaryVal}>{invTotalInitial}</Text></View>
              <View style={styles.invSummaryDivider} />
              <View style={styles.invSummaryItem}><Text style={styles.invSummaryLabel}>Out</Text><Text style={[styles.invSummaryVal, { color: theme.color.brand }]}>{invTotalOut}</Text></View>
              <View style={styles.invSummaryDivider} />
              <View style={styles.invSummaryItem}><Text style={styles.invSummaryLabel}>Returns</Text><Text style={[styles.invSummaryVal, { color: theme.color.success }]}>{invTotalIn}</Text></View>
              <View style={styles.invSummaryDivider} />
              <View style={styles.invSummaryItem}><Text style={styles.invSummaryLabel}>Available</Text><Text style={[styles.invSummaryVal, { color: theme.color.info }]}>{invTotalAvailable}</Text></View>
            </View>
            {invLoading ? (
              <View style={{ padding: 24, alignItems: 'center' }}><ActivityIndicator color={theme.color.brand} /></View>
            ) : (
              <View style={styles.invTable}>
                <View style={styles.invTableHead}>
                  <Text style={[styles.invTh, { flex: 2.2, textAlign: 'left' }]}>Product</Text>
                  <Text style={styles.invTh}>Initial</Text><Text style={styles.invTh}>Out</Text><Text style={styles.invTh}>In</Text><Text style={styles.invTh}>Final</Text>
                </View>
                {inventory.map((item, idx) => {
                  const pct = item.initial_quantity > 0 ? (item.available / item.initial_quantity) : 0;
                  const isLow = pct < 0.25 && item.initial_quantity > 0;
                  const isMid = pct >= 0.25 && pct < 0.5;
                  const barColor = isLow ? theme.color.brand : isMid ? theme.color.warning : theme.color.success;
                  return (
                    <View key={item.product_id} style={[styles.invRow, idx === inventory.length - 1 && { borderBottomWidth: 0 }]}>
                      <View style={{ flex: 2.2 }}>
                        <Text style={styles.invRowName} numberOfLines={1}>{item.name}</Text>
                        <Text style={styles.invRowSku}>{item.sku}</Text>
                        <View style={styles.progressBg}><View style={[styles.progressFill, { width: `${Math.min(100, pct * 100)}%`, backgroundColor: barColor }]} /></View>
                      </View>
                      <Text style={styles.invTd}>{item.initial_quantity}</Text>
                      <Text style={[styles.invTd, item.warehouse_out > 0 && { color: theme.color.brand }]}>{item.warehouse_out}</Text>
                      <Text style={[styles.invTd, item.warehouse_in > 0 && { color: theme.color.success }]}>{item.warehouse_in}</Text>
                      <Text style={[styles.invTdBold, isLow && { color: theme.color.brand }]}>{item.available}</Text>
                    </View>
                  );
                })}
                {inventory.length === 0 && <View style={{ padding: 24, alignItems: 'center' }}><Text style={styles.invEmptyText}>No inventory set for this event</Text></View>}
              </View>
            )}
            {inventory.length > 0 && !invLoading && (
              <View style={styles.balanceCard}>
                <Ionicons name="checkmark-circle" size={16} color={theme.color.success} />
                <Text style={styles.balanceText}>Balance: {invTotalInitial} initial = {invTotalAvailable} available + {invTotalOut - invTotalIn} distributed</Text>
              </View>
            )}
          </View>
        )}

        {/* Waste validation card */}
        <Pressable style={styles.actionCard} onPress={openWasteModal} testID="open-waste-validation">
          <View style={[styles.actionIcon, { backgroundColor: theme.color.brandSoft }]}>
            <Ionicons name="alert-circle" size={22} color={theme.color.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionTitle}>Waste to validate</Text>
            <Text style={styles.actionSub}>Tap to approve or reject pending reports</Text>
          </View>
          <View style={styles.actionCount}><Text style={styles.actionCountText}>{data?.pending_waste || 0}</Text></View>
          <Ionicons name="chevron-forward" size={20} color={theme.color.muted} />
        </Pressable>

        <Pressable style={styles.ghostBtn} onPress={load} testID="refresh-dash">
          <Ionicons name="refresh" size={16} color={theme.color.muted} /><Text style={styles.ghostBtnText}>Refresh</Text>
        </Pressable>
      </ScrollView>

      {/* Waste validation modal */}
      <Modal visible={wasteOpen} animationType="slide" onRequestClose={() => setWasteOpen(false)}>
        <SafeAreaProvider><SafeAreaView style={styles.container} edges={['top', 'bottom']}>
          <View style={styles.headerRow}>
            <View><Text style={styles.titleText}>Waste validation</Text><Text style={styles.hiSub}>{wasteItems.length} pending</Text></View>
            <Pressable onPress={() => setWasteOpen(false)} testID="close-modal" hitSlop={12} style={styles.avatarBtn}><Ionicons name="close" size={22} color={theme.color.onSurface} /></Pressable>
          </View>
          {wasteLoading ? <View style={styles.center}><ActivityIndicator /></View> : (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
              {wasteItems.length === 0 && (
                <View style={styles.emptyBox}><View style={styles.emptyIconWrap}><Ionicons name="checkmark-circle" size={44} color={theme.color.success} /></View><Text style={styles.emptyTitle}>All clear</Text><Text style={styles.emptySub}>No pending waste to validate.</Text></View>
              )}
              {wasteItems.map((w) => (
                <View key={w.id} style={styles.wasteCard} testID={`admin-waste-${w.id}`}>
                  {w.photo_b64 && <Image source={{ uri: `data:image/jpeg;base64,${w.photo_b64}` }} style={styles.wastePhoto} contentFit="cover" />}
                  <View style={styles.wasteBody}>
                    <View style={styles.rowH}><Text style={styles.walkerText}>{w.walker_name}</Text><Text style={styles.timeText}>{new Date(w.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text></View>
                    <Text style={styles.itemText}>{productMap[w.product_id]?.name || w.product_id}</Text>
                    <View style={styles.metaRow}><View style={styles.catChip}><Text style={styles.catChipText}>{w.category}</Text></View><Text style={styles.qtyText}>{'\u00D7'} {w.quantity}</Text></View>
                    <View style={styles.actionsRow}>
                      <Pressable testID={`admin-reject-waste-${w.id}`} style={styles.rejectBtn} disabled={busyId === w.id} onPress={() => validate(w, false)}><Text style={styles.rejectText}>Reject</Text></Pressable>
                      <Pressable testID={`admin-approve-waste-${w.id}`} style={styles.approveBtn} disabled={busyId === w.id} onPress={() => validate(w, true)}>
                        {busyId === w.id ? <ActivityIndicator color="#FFF" /> : <><Text style={styles.approveText}>Approve</Text><Ionicons name="checkmark" size={16} color="#FFF" /></>}
                      </Pressable>
                    </View>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}
        </SafeAreaView></SafeAreaProvider>
      </Modal>

      {/* Fix 4: Detail modal for metrics */}
      <Modal visible={!!detailModal} animationType="slide" onRequestClose={() => setDetailModal(null)}>
        <SafeAreaProvider><SafeAreaView style={styles.container} edges={['top', 'bottom']}>
          <View style={styles.headerRow}>
            <View><Text style={styles.titleText}>{detailTitle}</Text><Text style={styles.hiSub}>Detailed breakdown</Text></View>
            <Pressable onPress={() => setDetailModal(null)} testID="close-detail" hitSlop={12} style={styles.avatarBtn}><Ionicons name="close" size={22} color={theme.color.onSurface} /></Pressable>
          </View>
          {detailLoading ? <View style={styles.center}><ActivityIndicator color={theme.color.brand} /></View> : (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
              {/* Discrepancies detail */}
              {detailModal === 'discrepancies' && (
                discrepancies.length === 0 ? (
                  <View style={styles.emptyBox}><View style={styles.emptyIconWrap}><Ionicons name="checkmark-circle" size={44} color={theme.color.success} /></View><Text style={styles.emptyTitle}>No discrepancies</Text><Text style={styles.emptySub}>All shifts closed without discrepancies.</Text></View>
                ) : discrepancies.map((d) => (
                  <View key={d.shift_id} style={styles.detailCard}>
                    <View style={styles.detailHead}>
                      <View style={[styles.detailAvatar, { backgroundColor: theme.color.brandSoft }]}><Text style={[styles.detailAvatarText, { color: theme.color.brand }]}>{d.walker_name.slice(0, 1)}</Text></View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.detailName}>{d.walker_name}</Text>
                        <Text style={styles.detailTime}>{d.closed_at ? new Date(d.closed_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</Text>
                      </View>
                      <View style={[styles.detailBadge, { backgroundColor: theme.color.brandSoft }]}>
                        <Text style={[styles.detailBadgeText, { color: theme.color.brand }]}>{d.total_discrepancy > 0 ? '+' : ''}{d.total_discrepancy}</Text>
                      </View>
                    </View>
                    {d.items.map((it) => (
                      <View key={it.product_id} style={styles.detailItemRow}>
                        <Text style={styles.detailItemName}>{it.name}</Text>
                        <Text style={styles.detailItemSku}>{it.sku}</Text>
                        <Text style={[styles.detailItemDiff, it.diff < 0 && { color: theme.color.brand }]}>{it.diff > 0 ? '+' : ''}{it.diff}</Text>
                      </View>
                    ))}
                  </View>
                ))
              )}

              {/* Waste detail */}
              {detailModal === 'waste' && (
                wasteDetail.length === 0 ? (
                  <View style={styles.emptyBox}><View style={styles.emptyIconWrap}><Ionicons name="checkmark-circle" size={44} color={theme.color.success} /></View><Text style={styles.emptyTitle}>No waste logs</Text><Text style={styles.emptySub}>No waste has been logged.</Text></View>
                ) : wasteDetail.map((w) => (
                  <View key={w.id} style={styles.detailCard}>
                    <View style={styles.detailHead}>
                      <View style={[styles.detailAvatar, { backgroundColor: theme.color.warningSoft }]}><Ionicons name="trash-outline" size={16} color="#8B6D19" /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.detailName}>{w.walker_name || '?'}</Text>
                        <Text style={styles.detailTime}>{w.timestamp ? new Date(w.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</Text>
                      </View>
                      <View style={styles.catChip}><Text style={styles.catChipText}>{w.category}</Text></View>
                    </View>
                    <View style={styles.detailItemRow}>
                      <Text style={styles.detailItemName}>{w.product_name || '?'}</Text>
                      <Text style={styles.detailItemSku}>{w.product_sku || ''}</Text>
                      <Text style={styles.detailItemDiff}>{'\u00D7'}{w.quantity}</Text>
                    </View>
                    <View style={[styles.statusPill, w.status === 'approved' ? { backgroundColor: theme.color.successSoft } : w.status === 'pending' ? { backgroundColor: theme.color.warningSoft } : { backgroundColor: theme.color.brandSoft }]}>
                      <Text style={[styles.statusPillText, w.status === 'approved' ? { color: theme.color.success } : w.status === 'pending' ? { color: '#8B6D19' } : { color: theme.color.brand }]}>{w.status || 'pending'}</Text>
                    </View>
                  </View>
                ))
              )}

              {/* Pending restocks detail */}
              {detailModal === 'pending_restocks' && (
                restockDetail.length === 0 ? (
                  <View style={styles.emptyBox}><View style={styles.emptyIconWrap}><Ionicons name="checkmark-circle" size={44} color={theme.color.success} /></View><Text style={styles.emptyTitle}>No pending restocks</Text><Text style={styles.emptySub}>All restock requests have been handled.</Text></View>
                ) : restockDetail.map((r) => (
                  <View key={r.id} style={styles.detailCard}>
                    <View style={styles.detailHead}>
                      <View style={[styles.detailAvatar, { backgroundColor: theme.color.infoSoft }]}><Ionicons name="cube-outline" size={16} color={theme.color.info} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.detailName}>{r.walker_name}</Text>
                        <Text style={styles.detailTime}>{r.timestamp ? new Date(r.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</Text>
                      </View>
                    </View>
                    {(r.items || []).map((it, idx) => (
                      <View key={idx} style={styles.detailItemRow}>
                        <Text style={styles.detailItemName}>{it.name || '?'}</Text>
                        <Text style={styles.detailItemSku}>{it.sku || ''}</Text>
                        <Text style={styles.detailItemDiff}>{'\u00D7'}{it.quantity}</Text>
                      </View>
                    ))}
                  </View>
                ))
              )}

              {/* Active walkers detail */}
              {detailModal === 'active_walkers' && (
                activeDetail.length === 0 ? (
                  <View style={styles.emptyBox}><View style={styles.emptyIconWrap}><Ionicons name="people-outline" size={44} color={theme.color.muted} /></View><Text style={styles.emptyTitle}>No active walkers</Text><Text style={styles.emptySub}>No walkers are currently on shift.</Text></View>
                ) : activeDetail.map((a) => (
                  <View key={a.shift_id} style={styles.detailCard}>
                    <View style={styles.detailHead}>
                      <View style={[styles.detailAvatar, { backgroundColor: theme.color.successSoft }]}><Text style={[styles.detailAvatarText, { color: theme.color.success }]}>{a.walker_name.slice(0, 1)}</Text></View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.detailName}>{a.walker_name}</Text>
                        <Text style={styles.detailTime}>Started {a.opened_at ? new Date(a.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</Text>
                      </View>
                      <View style={[styles.detailBadge, { backgroundColor: theme.color.successSoft }]}>
                        <Text style={[styles.detailBadgeText, { color: theme.color.success }]}>{a.current_units} units</Text>
                      </View>
                    </View>
                    {a.stock_detail.map((st, idx) => (
                      <View key={idx} style={styles.detailItemRow}>
                        <Text style={styles.detailItemName}>{st.name}</Text>
                        <Text style={styles.detailItemSku}>{st.sku}</Text>
                        <Text style={styles.detailItemDiff}>{st.qty}</Text>
                      </View>
                    ))}
                  </View>
                ))
              )}
            </ScrollView>
          )}
        </SafeAreaView></SafeAreaProvider>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.surfaceSecondary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: theme.color.surfaceSecondary },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: theme.color.surfaceSecondary },
  hi: { fontFamily: theme.font.extrabold, fontSize: 22, color: theme.color.onSurface, letterSpacing: -0.4 },
  hiSub: { fontFamily: theme.font.medium, fontSize: 12, color: theme.color.muted, marginTop: 2 },
  titleText: { fontFamily: theme.font.extrabold, fontSize: 20, color: theme.color.onSurface },
  avatarBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.color.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
  heroCard: { backgroundColor: theme.color.brand, borderRadius: theme.radius.xxl, padding: 20, ...(theme.shadow.md as any) },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: theme.radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  heroBadgeText: { color: '#FFF', fontFamily: theme.font.extrabold, fontSize: 10, letterSpacing: 1 },
  heroLabel: { color: 'rgba(255,255,255,0.9)', fontFamily: theme.font.semibold, fontSize: 13, marginTop: 20 },
  heroValue: { color: '#FFF', fontFamily: theme.font.black, fontSize: 44, letterSpacing: -1, lineHeight: 50, marginTop: 2 },
  heroFooter: { flexDirection: 'row', gap: 8, marginTop: 14 },
  heroChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: theme.radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  heroChipText: { color: '#FFF', fontFamily: theme.font.semibold, fontSize: 11 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: { width: '48%', backgroundColor: theme.color.surface, borderRadius: theme.radius.xl, padding: 14, gap: 8, ...(theme.shadow.sm as any) },
  metricIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  metricLabel: { fontFamily: theme.font.semibold, fontSize: 12, color: theme.color.muted },
  metricRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metricValue: { fontFamily: theme.font.black, fontSize: 26, color: theme.color.onSurface, letterSpacing: -0.5 },
  // Inventory
  invHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.color.surface, borderRadius: theme.radius.xl, padding: 16, ...(theme.shadow.sm as any) },
  invIconCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.color.infoSoft, alignItems: 'center', justifyContent: 'center' },
  invTitle: { fontFamily: theme.font.extrabold, fontSize: 16, color: theme.color.onSurface },
  invSubtitle: { fontFamily: theme.font.medium, fontSize: 11, color: theme.color.muted, marginTop: 2 },
  evChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: theme.radius.pill, backgroundColor: theme.color.surfaceTertiary },
  evChipActive: { backgroundColor: theme.color.brand },
  evChipText: { fontFamily: theme.font.bold, fontSize: 12, color: theme.color.onSurface },
  invSummaryRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.color.surface, borderRadius: theme.radius.xl, padding: 14, ...(theme.shadow.sm as any) },
  invSummaryItem: { flex: 1, alignItems: 'center', gap: 4 },
  invSummaryLabel: { fontFamily: theme.font.semibold, fontSize: 10, color: theme.color.muted, letterSpacing: 0.3, textTransform: 'uppercase' },
  invSummaryVal: { fontFamily: theme.font.black, fontSize: 20, color: theme.color.onSurface },
  invSummaryDivider: { width: 1, height: 32, backgroundColor: theme.color.divider },
  invTable: { backgroundColor: theme.color.surface, borderRadius: theme.radius.xl, overflow: 'hidden', ...(theme.shadow.sm as any) },
  invTableHead: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.color.surfaceInverse, paddingVertical: 10, paddingHorizontal: 12 },
  invTh: { flex: 1, textAlign: 'center', color: '#FFF', fontSize: 10, fontFamily: theme.font.bold, letterSpacing: 0.3, textTransform: 'uppercase' },
  invRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, borderBottomWidth: 1, borderColor: theme.color.divider },
  invRowName: { fontFamily: theme.font.bold, fontSize: 13, color: theme.color.onSurface },
  invRowSku: { fontFamily: theme.font.mono, fontSize: 9, color: theme.color.muted, letterSpacing: 0.5, marginTop: 1 },
  progressBg: { height: 4, backgroundColor: theme.color.surfaceTertiary, borderRadius: 2, marginTop: 5, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2 },
  invTd: { flex: 1, textAlign: 'center', fontFamily: theme.font.medium, fontSize: 13, color: theme.color.onSurface },
  invTdBold: { flex: 1, textAlign: 'center', fontFamily: theme.font.extrabold, fontSize: 14, color: theme.color.onSurface },
  invEmptyText: { fontFamily: theme.font.medium, fontSize: 13, color: theme.color.muted },
  balanceCard: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.color.successSoft, borderRadius: theme.radius.lg, padding: 12 },
  balanceText: { fontFamily: theme.font.semibold, fontSize: 11, color: theme.color.success, flex: 1 },
  // Actions
  actionCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.color.surface, borderRadius: theme.radius.xl, padding: 14, ...(theme.shadow.sm as any) },
  actionIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  actionTitle: { fontFamily: theme.font.extrabold, fontSize: 15, color: theme.color.onSurface },
  actionSub: { fontFamily: theme.font.medium, fontSize: 12, color: theme.color.muted, marginTop: 2 },
  actionCount: { minWidth: 32, height: 32, borderRadius: 16, backgroundColor: theme.color.brand, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  actionCountText: { color: '#FFF', fontFamily: theme.font.extrabold, fontSize: 14 },
  ghostBtn: { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
  ghostBtnText: { fontFamily: theme.font.bold, fontSize: 12, color: theme.color.muted, letterSpacing: 0.5 },
  emptyBox: { padding: 40, alignItems: 'center', gap: 10 },
  emptyIconWrap: { width: 88, height: 88, borderRadius: 44, backgroundColor: theme.color.successSoft, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontFamily: theme.font.extrabold, fontSize: 18, color: theme.color.onSurface, marginTop: 8 },
  emptySub: { fontFamily: theme.font.medium, fontSize: 13, color: theme.color.muted, textAlign: 'center' },
  wasteCard: { backgroundColor: theme.color.surface, borderRadius: theme.radius.xl, overflow: 'hidden', ...(theme.shadow.sm as any) },
  wastePhoto: { width: '100%', height: 180 },
  wasteBody: { padding: 14, gap: 6 },
  rowH: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  walkerText: { fontFamily: theme.font.extrabold, fontSize: 15, color: theme.color.onSurface },
  timeText: { fontFamily: theme.font.semibold, fontSize: 11, color: theme.color.muted },
  itemText: { fontFamily: theme.font.semibold, fontSize: 14, color: theme.color.onSurfaceSecondary },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  catChip: { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: theme.color.warningSoft, borderRadius: theme.radius.pill },
  catChipText: { fontFamily: theme.font.bold, fontSize: 11, color: '#8B6D19', letterSpacing: 0.3, textTransform: 'uppercase' },
  qtyText: { fontFamily: theme.font.extrabold, fontSize: 16, color: theme.color.onSurface },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  rejectBtn: { flex: 1, borderRadius: theme.radius.pill, backgroundColor: theme.color.surfaceSecondary, paddingVertical: 12, alignItems: 'center' },
  rejectText: { fontFamily: theme.font.bold, fontSize: 13, color: theme.color.onSurface },
  approveBtn: { flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', borderRadius: theme.radius.pill, backgroundColor: theme.color.brand, paddingVertical: 12, alignItems: 'center' },
  approveText: { color: '#FFF', fontFamily: theme.font.bold, fontSize: 13 },
  // Fix 4: Detail modal styles
  detailCard: { backgroundColor: theme.color.surface, borderRadius: theme.radius.xl, padding: 14, gap: 8, ...(theme.shadow.sm as any) },
  detailHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  detailAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  detailAvatarText: { fontFamily: theme.font.extrabold, fontSize: 14 },
  detailName: { fontFamily: theme.font.bold, fontSize: 14, color: theme.color.onSurface },
  detailTime: { fontFamily: theme.font.medium, fontSize: 11, color: theme.color.muted, marginTop: 1 },
  detailBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: theme.radius.pill },
  detailBadgeText: { fontFamily: theme.font.extrabold, fontSize: 12 },
  detailItemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 4, gap: 6 },
  detailItemName: { flex: 1, fontFamily: theme.font.semibold, fontSize: 13, color: theme.color.onSurface },
  detailItemSku: { fontFamily: theme.font.mono, fontSize: 9, color: theme.color.muted },
  detailItemDiff: { fontFamily: theme.font.extrabold, fontSize: 14, color: theme.color.onSurface, minWidth: 30, textAlign: 'right' },
  statusPill: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: theme.radius.pill, marginTop: 2 },
  statusPillText: { fontFamily: theme.font.bold, fontSize: 10, textTransform: 'uppercase' },
});