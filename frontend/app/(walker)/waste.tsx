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

const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'broken', label: 'BROKEN' },
  { key: 'spilled', label: 'SPILLED' },
  { key: 'expired', label: 'EXPIRED' },
  { key: 'other', label: 'OTHER' },
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
          <Pressable onPress={() => setShowCamera(false)} testID="cam-cancel">
            <Text style={styles.camBtnText}>CANCEL</Text>
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
        <Text style={styles.title}>LOG WASTE</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
        <View>
          <Text style={styles.label}>ITEM</Text>
          <View style={{ gap: 6, marginTop: 8 }}>
            {products.map((p) => (
              <Pressable
                key={p.id}
                testID={`waste-product-${p.sku}`}
                style={[styles.itemRow, productId === p.id && styles.itemRowActive]}
                onPress={() => { hap.light(); setProductId(p.id); }}
              >
                <Text style={[styles.itemText, productId === p.id && { color: '#FFF' }]}>{p.name}</Text>
                <Text style={[styles.itemSku, productId === p.id && { color: '#FFF' }]}>{p.sku}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View>
          <Text style={styles.label}>CATEGORY</Text>
          <View style={styles.chips}>
            {CATEGORIES.map((c) => (
              <Pressable
                key={c.key}
                testID={`cat-${c.key}`}
                style={[styles.chip, category === c.key && styles.chipActive]}
                onPress={() => { hap.light(); setCategory(c.key); }}
              >
                <Text style={[styles.chipText, category === c.key && { color: '#FFF' }]}>{c.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View>
          <Text style={styles.label}>QUANTITY</Text>
          <View style={styles.qtyBox}>
            <Pressable style={styles.qtyBtn} onPress={() => { hap.light(); setQuantity(Math.max(1, quantity - 1)); }} testID="qty-minus">
              <Text style={styles.qtyBtnText}>−</Text>
            </Pressable>
            <Text style={styles.qtyVal}>{quantity}</Text>
            <Pressable style={styles.qtyBtn} onPress={() => { hap.light(); setQuantity(quantity + 1); }} testID="qty-plus">
              <Text style={styles.qtyBtnText}>+</Text>
            </Pressable>
          </View>
        </View>

        <View>
          <Text style={styles.label}>PHOTO (OPTIONAL)</Text>
          {photo ? (
            <View style={{ marginTop: 8 }}>
              <Image source={{ uri: `data:image/jpeg;base64,${photo}` }} style={{ width: '100%', height: 200 }} contentFit="cover" />
              <Pressable style={styles.retakeBtn} onPress={() => setPhoto(null)} testID="photo-retake">
                <Text style={styles.retakeText}>REMOVE PHOTO</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable style={styles.camBtn} onPress={openCam} testID="open-camera">
              <Ionicons name="camera" size={24} color="#000" />
              <Text style={styles.camBtnLabel}>OPEN CAMERA</Text>
            </Pressable>
          )}
        </View>

        <Pressable
          testID="submit-waste"
          style={[styles.submit, submitting && { opacity: 0.5 }]}
          onPress={submit}
          disabled={submitting || !productId}
        >
          {submitting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitText}>SUBMIT TO SUPERVISOR →</Text>}
        </Pressable>
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.surface },
  header: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 2, borderBottomColor: theme.color.borderStrong },
  title: { fontSize: 22, fontWeight: '900', letterSpacing: -1 },
  label: { fontSize: 11, letterSpacing: 1.5, fontWeight: '800', color: theme.color.onSurface },
  itemRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 14, borderWidth: 2, borderColor: theme.color.borderStrong,
  },
  itemRowActive: { backgroundColor: theme.color.surfaceInverse },
  itemText: { fontSize: 15, fontWeight: '800' },
  itemSku: { fontFamily: theme.font.mono, fontSize: 11, color: theme.color.muted, letterSpacing: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderWidth: 2, borderColor: theme.color.borderStrong },
  chipActive: { backgroundColor: theme.color.brand, borderColor: theme.color.brand },
  chipText: { fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  qtyBox: { flexDirection: 'row', alignItems: 'center', gap: 0, borderWidth: 2, borderColor: theme.color.borderStrong, marginTop: 8, alignSelf: 'flex-start' },
  qtyBtn: { paddingHorizontal: 20, paddingVertical: 12, backgroundColor: theme.color.surfaceSecondary },
  qtyBtnText: { fontSize: 26, fontWeight: '900' },
  qtyVal: { width: 60, textAlign: 'center', fontSize: 22, fontWeight: '900', fontFamily: theme.font.mono },
  camBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginTop: 8, padding: 16, borderWidth: 2, borderColor: theme.color.borderStrong,
    backgroundColor: theme.color.surfaceSecondary, justifyContent: 'center',
  },
  camBtnLabel: { fontSize: 14, fontWeight: '900', letterSpacing: 1 },
  retakeBtn: { marginTop: 8, padding: 12, borderWidth: 2, borderColor: theme.color.borderStrong, alignItems: 'center' },
  retakeText: { fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  submit: { padding: 20, backgroundColor: theme.color.brand, borderWidth: 2, borderColor: theme.color.borderStrong, alignItems: 'center' },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  camBar: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingBottom: 40, paddingTop: 20, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  camBtnText: { color: '#FFF', fontWeight: '900', fontSize: 14, letterSpacing: 1 },
  camTrigger: { width: 72, height: 72, borderRadius: 0, backgroundColor: '#FFF', borderWidth: 4, borderColor: theme.color.brand },
});
