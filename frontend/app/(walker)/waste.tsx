import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { api } from '@/src/lib/api';
import { mutate } from '@/src/lib/outbox';
import { theme } from '@/src/lib/theme';
import { hap } from '@/src/lib/haptics';
import { useToast } from '@/src/lib/toast';

type Product = { id: string; sku: string; name: string };
type Category = 'broken' | 'spilled' | 'expired' | 'other';

const CATEGORIES: { key: Category; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'broken', label: 'Broken', icon: 'alert-circle' },
  { key: 'spilled', label: 'Spilled', icon: 'water' },
  { key: 'expired', label: 'Expired', icon: 'time' },
  { key: 'other', label: 'Other', icon: 'ellipsis-horizontal' },
];

export default function Waste() {
  const toast = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState<string | null>(null);
  const [category, setCategory] = useState<Category>('broken');
  const [quantity, setQuantity] = useState(1);
  const [photo, setPhoto] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [perm, requestPerm] = useCameraPermissions();
  const [submitting, setSubmitting] = useState(false);
  const camRef = useRef<CameraView | null>(null);

  const load = useCallback(async () => {
    try {
      const prods = await api<any>('/products');
      const productList = Array.isArray(prods)
        ? prods
        : Array.isArray(prods?.products)
          ? prods.products
          : [];
      setProducts(productList);
    } catch (e: any) {
      toast.show(e.message || 'Load failed', 'error');
    }
  }, [toast]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openCam = async () => {
    if (Platform.OS === 'web') {
      toast.show('Camera not available on web', 'info');
      return;
    }
    if (!perm?.granted) {
      const r = await requestPerm();
      if (!r.granted) {
        toast.show('Camera permission denied', 'error');
        return;
      }
    }
    setShowCamera(true);
  };

  const snap = async () => {
    if (!camRef.current) return;
    hap.medium();
    try {
      const p = await camRef.current.takePictureAsync({ base64: true, quality: 0.5 });
      if (p?.base64) setPhoto(p.base64);
      setShowCamera(false);
    } catch (e: any) {
      toast.show('Snap failed', 'error');
    }
  };

  const submit = async () => {
    if (!productId) {
      toast.show('Select an item', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const r = await mutate('/waste', {
        product_id: productId,
        quantity,
        category,
        photo_b64: photo || null,
      }, { label: `Waste ${quantity} unit(s)` });
      if (r.online) { hap.success(); toast.show('Waste logged. Awaiting supervisor.', 'success'); }
      else { hap.warning(); toast.show('Offline — waste queued', 'info'); }
      setProductId(null);
      setQuantity(1);
      setPhoto(null);
    } catch (e: any) {
      hap.error();
      toast.show(e.message || 'Failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (showCamera) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <CameraView ref={camRef} style={{ flex: 1 }} facing="back" />
        <View style={styles.camBar}>
          <Pressable style={styles.camCancelBtn} onPress={() => setShowCamera(false)} testID="cam-cancel">
            <Text style={styles.camBtnText}>Cancel</Text>
          </Pressable>
          <Pressable style={styles.camTrigger} onPress={snap} testID="cam-snap" />
          <View style={{ width: 60 }} />
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Log waste</Text>
        <Text style={styles.subtitle}>Track broken or spilled stock</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 40 }}>
        <View>
          <Text style={styles.label}>Item</Text>
          <View style={{ gap: 8, marginTop: 8 }}>
            {products.map((p) => {
              const active = productId === p.id;
              return (
                <Pressable
                  key={p.id}
                  testID={`waste-product-${p.sku}`}
                  style={[styles.itemRow, active && styles.itemRowActive]}
                  onPress={() => { hap.light(); setProductId(p.id); }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemText, active && styles.itemTextActive]}>{p.name}</Text>
                    <Text style={[styles.itemSku, active && styles.itemSkuActive]}>{p.sku}</Text>
                  </View>
                  {active && <Ionicons name="checkmark-circle" size={22} color="#FFF" />}
                </Pressable>
              );
            })}
          </View>
        </View>

        <View>
          <Text style={styles.label}>Category</Text>
          <View style={styles.chips}>
            {CATEGORIES.map((c) => {
              const active = category === c.key;
              return (
                <Pressable
                  key={c.key}
                  testID={`cat-${c.key}`}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => { hap.light(); setCategory(c.key); }}
                >
                  <Ionicons name={c.icon} size={14} color={active ? '#FFF' : theme.color.muted} />
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View>
          <Text style={styles.label}>Quantity</Text>
          <View style={styles.qtyBox}>
            <Pressable style={styles.qtyBtn} onPress={() => { hap.light(); setQuantity(Math.max(1, quantity - 1)); }} testID="qty-minus">
              <Ionicons name="remove" size={20} color={theme.color.onSurface} />
            </Pressable>
            <Text style={styles.qtyVal}>{quantity}</Text>
            <Pressable style={styles.qtyBtn} onPress={() => { hap.light(); setQuantity(quantity + 1); }} testID="qty-plus">
              <Ionicons name="add" size={20} color={theme.color.onSurface} />
            </Pressable>
          </View>
        </View>

        <View>
          <Text style={styles.label}>Photo (optional)</Text>
          {photo ? (
            <View style={{ marginTop: 8 }}>
              <Image source={{ uri: `data:image/jpeg;base64,${photo}` }} style={styles.photoPreview} contentFit="cover" />
              <Pressable style={styles.retakeBtn} onPress={() => setPhoto(null)} testID="photo-retake">
                <Ionicons name="trash-outline" size={16} color={theme.color.brand} />
                <Text style={styles.retakeText}>Remove photo</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable style={styles.camBtn} onPress={openCam} testID="open-camera">
              <View style={styles.camIconBubble}>
                <Ionicons name="camera" size={22} color={theme.color.brand} />
              </View>
              <Text style={styles.camBtnLabel}>Open camera</Text>
            </Pressable>
          )}
        </View>

        <Pressable
          testID="submit-waste"
          style={[styles.submit, (submitting || !productId) && { opacity: 0.5 }]}
          onPress={submit}
          disabled={submitting || !productId}
        >
          {submitting ? <ActivityIndicator color="#FFF" /> : (
            <>
              <Text style={styles.submitText}>Submit to supervisor</Text>
              <Ionicons name="arrow-forward" size={18} color="#FFF" />
            </>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.surfaceSecondary },
  header: { paddingHorizontal: 20, paddingVertical: 16, backgroundColor: theme.color.surface },
  title: { fontFamily: theme.font.extrabold, fontSize: 22, color: theme.color.onSurface, letterSpacing: -0.4 },
  subtitle: { fontFamily: theme.font.medium, fontSize: 12, color: theme.color.muted, marginTop: 2 },
  label: { fontFamily: theme.font.semibold, fontSize: 12, color: theme.color.muted, letterSpacing: 0.3 },
  itemRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 14, borderRadius: theme.radius.xl, backgroundColor: theme.color.surface,
    ...(theme.shadow.sm as any),
  },
  itemRowActive: { backgroundColor: theme.color.brand },
  itemText: { fontFamily: theme.font.bold, fontSize: 15, color: theme.color.onSurface },
  itemTextActive: { color: '#FFF' },
  itemSku: { fontFamily: theme.font.mono, fontSize: 11, color: theme.color.muted, letterSpacing: 0.5, marginTop: 2 },
  itemSkuActive: { color: 'rgba(255,255,255,0.8)' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: theme.radius.pill, backgroundColor: theme.color.surface, ...(theme.shadow.sm as any) },
  chipActive: { backgroundColor: theme.color.brand },
  chipText: { fontFamily: theme.font.bold, fontSize: 12, color: theme.color.onSurface },
  chipTextActive: { color: '#FFF' },
  qtyBox: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.color.surface, borderRadius: theme.radius.pill, padding: 6, marginTop: 8, alignSelf: 'flex-start', ...(theme.shadow.sm as any) },
  qtyBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.color.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
  qtyVal: { width: 48, textAlign: 'center', fontSize: 18, fontFamily: theme.font.extrabold, color: theme.color.onSurface },
  photoPreview: { width: '100%', height: 200, borderRadius: theme.radius.xl },
  retakeBtn: { marginTop: 10, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: theme.radius.pill, backgroundColor: theme.color.brandSoft },
  retakeText: { fontFamily: theme.font.bold, fontSize: 12, color: theme.color.brand },
  camBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginTop: 8, padding: 14, borderRadius: theme.radius.xl,
    backgroundColor: theme.color.surface, ...(theme.shadow.sm as any),
  },
  camIconBubble: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.color.brandSoft, alignItems: 'center', justifyContent: 'center' },
  camBtnLabel: { fontFamily: theme.font.bold, fontSize: 14, color: theme.color.onSurface },
  submit: {
    flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center',
    padding: 16, backgroundColor: theme.color.brand, borderRadius: theme.radius.pill,
    ...(theme.shadow.md as any),
  },
  submitText: { color: '#FFF', fontFamily: theme.font.extrabold, fontSize: 15, letterSpacing: 0.2 },
  camBar: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingBottom: 40, paddingTop: 20, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  camCancelBtn: { padding: 10 },
  camBtnText: { color: '#FFF', fontFamily: theme.font.bold, fontSize: 14 },
  camTrigger: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#FFF', borderWidth: 4, borderColor: theme.color.brand },
});
