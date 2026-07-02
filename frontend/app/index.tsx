import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { saveSession, walkerLogin, staffLogin, getToken, getUser } from '@/src/lib/api';
import { theme } from '@/src/lib/theme';
import { hap } from '@/src/lib/haptics';
import { useToast } from '@/src/lib/toast';
import { Logo } from '@/src/components/Logo';

type Mode = 'walker' | 'staff';

export default function AuthScreen() {
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('walker');
  const [eventCode, setEventCode] = useState('');
  const [pin, setPin] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [bootChecked, setBootChecked] = useState(false);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      const user = await getUser();
      if (token && user) routeByRole(user.role);
      else setBootChecked(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const routeByRole = (role: string) => {
    if (role === 'walker') router.replace('/(walker)/pos');
    else if (role === 'supervisor') router.replace('/(supervisor)/queue');
    else if (role === 'admin') router.replace('/(admin)/dashboard');
  };

  const pressDigit = (d: string) => {
    if (pin.length < 6) { hap.light(); setPin(pin + d); }
  };
  const clearDigit = () => { hap.light(); setPin(pin.slice(0, -1)); };

  const submit = async () => {
    setBusy(true);
    try {
      if (mode === 'walker') {
        if (!eventCode || pin.length < 4) { toast.show('Enter event code and 4-6 digit PIN', 'error'); return; }
        const r: any = await walkerLogin(eventCode.trim(), pin);
        await saveSession(r.access_token, r.user);
        hap.success();
        routeByRole('walker');
      } else {
        if (!email || !password) { toast.show('Enter email and password', 'error'); return; }
        const r: any = await staffLogin(email.trim(), password);
        await saveSession(r.access_token, r.user);
        hap.success();
        routeByRole(r.role);
      }
    } catch (e: any) {
      hap.error();
      toast.show(e?.message || 'Login failed', 'error');
    } finally { setBusy(false); }
  };

  if (!bootChecked) {
    return (
      <View style={[styles.container, styles.center]}>
        <Logo size={56} />
        <ActivityIndicator color={theme.color.brand} style={{ marginTop: 24 }} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={{ flexGrow: 1, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        {/* Hero */}
        <View style={styles.hero}>
          <Image
            source={{ uri: 'https://images.pexels.com/photos/13830767/pexels-photo-13830767.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940' }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
          <LinearGradient
            colors={['rgba(230,57,70,0.15)', 'rgba(26,26,31,0.95)']}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroContent}>
            <Logo size={44} color="onBrand" style={{ marginBottom: 12 }} />
            <Text style={styles.heroTitle}>Sell smarter,{'\n'}shift by shift.</Text>
            <Text style={styles.heroSub}>Real-time stock. Fair to walkers. Auditable to the last unit.</Text>
          </View>
        </View>

        {/* Card */}
        <View style={styles.card}>
          <View style={styles.segment}>
            <Pressable
              testID="tab-walker"
              style={[styles.segBtn, mode === 'walker' && styles.segBtnActive]}
              onPress={() => { hap.light(); setMode('walker'); }}
            >
              <Ionicons name="walk" size={16} color={mode === 'walker' ? '#FFF' : theme.color.muted} />
              <Text style={[styles.segText, mode === 'walker' && styles.segTextActive]}>Walker</Text>
            </Pressable>
            <Pressable
              testID="tab-staff"
              style={[styles.segBtn, mode === 'staff' && styles.segBtnActive]}
              onPress={() => { hap.light(); setMode('staff'); }}
            >
              <Ionicons name="briefcase" size={16} color={mode === 'staff' ? '#FFF' : theme.color.muted} />
              <Text style={[styles.segText, mode === 'staff' && styles.segTextActive]}>Staff</Text>
            </Pressable>
          </View>

          {mode === 'walker' ? (
            <View style={{ gap: 12 }}>
              <View style={styles.field}>
                <Text style={styles.label}>Event code</Text>
                <TextInput
                  testID="input-event-code"
                  value={eventCode}
                  onChangeText={(v) => setEventCode(v.toUpperCase())}
                  style={styles.input}
                  autoCapitalize="characters"
                  placeholder="e.g. FEST01"
                  placeholderTextColor={theme.color.muted}
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>PIN</Text>
                <View style={styles.pinDisplay} testID="pin-display">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <View key={i} style={[styles.pinCell, pin[i] && styles.pinCellFilled]}>
                      <Text style={styles.pinChar}>{pin[i] ? '●' : ''}</Text>
                    </View>
                  ))}
                </View>
                <View style={styles.pad}>
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                    <Pressable
                      key={d}
                      testID={`pin-${d}`}
                      style={({ pressed }) => [styles.padKey, pressed && styles.padKeyActive]}
                      onPress={() => pressDigit(d)}
                    >
                      <Text style={styles.padKeyText}>{d}</Text>
                    </Pressable>
                  ))}
                  <Pressable style={styles.padKey} onPress={() => { hap.light(); setPin(''); }} testID="pin-clear">
                    <Text style={styles.padKeyTextSmall}>Clear</Text>
                  </Pressable>
                  <Pressable style={styles.padKey} onPress={() => pressDigit('0')} testID="pin-0">
                    <Text style={styles.padKeyText}>0</Text>
                  </Pressable>
                  <Pressable style={styles.padKey} onPress={clearDigit} testID="pin-back">
                    <Ionicons name="backspace-outline" size={22} color={theme.color.onSurface} />
                  </Pressable>
                </View>
              </View>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              <View style={styles.field}>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  testID="input-email"
                  value={email}
                  onChangeText={setEmail}
                  style={styles.input}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  placeholder="admin@walkfellas.io"
                  placeholderTextColor={theme.color.muted}
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Password</Text>
                <TextInput
                  testID="input-password"
                  value={password}
                  onChangeText={setPassword}
                  style={styles.input}
                  secureTextEntry
                  placeholder="••••••••"
                  placeholderTextColor={theme.color.muted}
                />
              </View>
              <View style={styles.hintBox}>
                <Ionicons name="key-outline" size={14} color={theme.color.brand} />
                <View>
                  <Text style={styles.hintText}>admin@walkfellas.io · admin123</Text>
                  <Text style={styles.hintText}>sup@walkfellas.io · sup123</Text>
                </View>
              </View>
            </View>
          )}

          <Pressable
            testID="submit-login"
            style={({ pressed }) => [styles.submit, busy && { opacity: 0.6 }, pressed && { transform: [{ scale: 0.98 }] }]}
            onPress={submit}
            disabled={busy}
          >
            {busy ? <ActivityIndicator color="#FFF" /> : (
              <>
                <Text style={styles.submitText}>Enter</Text>
                <Ionicons name="arrow-forward" size={18} color="#FFF" />
              </>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.surfaceSecondary },
  center: { alignItems: 'center', justifyContent: 'center' },
  hero: {
    height: 300, position: 'relative', overflow: 'hidden',
    borderBottomLeftRadius: theme.radius.xxl,
    borderBottomRightRadius: theme.radius.xxl,
  },
  heroContent: { position: 'absolute', bottom: 28, left: 24, right: 24 },
  heroTitle: { fontFamily: theme.font.extrabold, fontSize: 30, color: '#FFF', lineHeight: 34, letterSpacing: -0.5 },
  heroSub: { fontFamily: theme.font.medium, fontSize: 13, color: 'rgba(255,255,255,0.9)', marginTop: 8, lineHeight: 18 },
  card: {
    margin: 16, marginTop: -28,
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.xxl,
    padding: 18,
    gap: 14,
    ...(theme.shadow.lg as any),
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: theme.color.surfaceSecondary,
    borderRadius: theme.radius.pill,
    padding: 4,
    gap: 4,
  },
  segBtn: {
    flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: theme.radius.pill,
  },
  segBtnActive: { backgroundColor: theme.color.brand, ...(theme.shadow.sm as any) },
  segText: { fontFamily: theme.font.bold, fontSize: 13, color: theme.color.muted, letterSpacing: 0.2 },
  segTextActive: { color: '#FFF' },
  field: { gap: 6 },
  label: { fontFamily: theme.font.semibold, fontSize: 12, color: theme.color.muted, letterSpacing: 0.3 },
  input: {
    backgroundColor: theme.color.surfaceSecondary,
    borderRadius: theme.radius.lg,
    paddingVertical: 14, paddingHorizontal: 14,
    fontSize: 16, fontFamily: theme.font.semibold,
    color: theme.color.onSurface,
  },
  pinDisplay: { flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  pinCell: {
    flex: 1, height: 52,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.color.surfaceSecondary,
    alignItems: 'center', justifyContent: 'center',
  },
  pinCellFilled: { backgroundColor: theme.color.brandSoft },
  pinChar: { fontSize: 26, fontFamily: theme.font.black, color: theme.color.brand, lineHeight: 30 },
  pad: { marginTop: 6, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  padKey: {
    width: '31.5%', height: 56,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.color.surfaceSecondary,
    alignItems: 'center', justifyContent: 'center',
  },
  padKeyActive: { backgroundColor: theme.color.brandSoft, transform: [{ scale: 0.96 }] },
  padKeyText: { fontSize: 24, fontFamily: theme.font.bold, color: theme.color.onSurface },
  padKeyTextSmall: { fontSize: 13, fontFamily: theme.font.bold, color: theme.color.onSurface },
  hintBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, borderRadius: theme.radius.md,
    backgroundColor: theme.color.brandSoft,
  },
  hintText: { fontFamily: theme.font.semibold, fontSize: 12, color: theme.color.brandDeep },
  submit: {
    flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center',
    backgroundColor: theme.color.brand,
    borderRadius: theme.radius.pill,
    paddingVertical: 16,
    marginTop: 4,
    ...(theme.shadow.md as any),
  },
  submitText: { color: '#FFF', fontFamily: theme.font.extrabold, fontSize: 16, letterSpacing: 0.3 },
});
