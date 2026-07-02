import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { saveSession, walkerLogin, staffLogin, getToken, getUser } from '@/src/lib/api';
import { theme } from '@/src/lib/theme';
import { hap } from '@/src/lib/haptics';
import { useToast } from '@/src/lib/toast';

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
      if (token && user) {
        routeByRole(user.role);
      } else {
        setBootChecked(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const routeByRole = (role: string) => {
    if (role === 'walker') router.replace('/(walker)/pos');
    else if (role === 'supervisor') router.replace('/(supervisor)/queue');
    else if (role === 'admin') router.replace('/(admin)/dashboard');
  };

  const pressDigit = (d: string) => {
    if (pin.length < 6) {
      hap.light();
      setPin(pin + d);
    }
  };
  const clearDigit = () => {
    hap.light();
    setPin(pin.slice(0, -1));
  };

  const submit = async () => {
    setBusy(true);
    try {
      if (mode === 'walker') {
        if (!eventCode || pin.length < 4) {
          toast.show('Enter event code and 4-6 digit PIN', 'error');
          return;
        }
        const r: any = await walkerLogin(eventCode.trim(), pin);
        await saveSession(r.access_token, r.user);
        hap.success();
        routeByRole('walker');
      } else {
        if (!email || !password) {
          toast.show('Enter email and password', 'error');
          return;
        }
        const r: any = await staffLogin(email.trim(), password);
        await saveSession(r.access_token, r.user);
        hap.success();
        routeByRole(r.role);
      }
    } catch (e: any) {
      hap.error();
      toast.show(e?.message || 'Login failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!bootChecked) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={styles.loadingText}>LOADING...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        {/* Hero */}
        <View style={styles.hero}>
          <Image
            source={{ uri: 'https://images.pexels.com/photos/13830767/pexels-photo-13830767.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940' }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
          <LinearGradient
            colors={['rgba(10,10,10,0.2)', 'rgba(10,10,10,0.95)']}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroContent}>
            <Text style={styles.wordmark}>walkFellas</Text>
            <Text style={styles.tagline}>EVERY BOTTLE SOLD, TRACKED.</Text>
          </View>
        </View>

        {/* Segment */}
        <View style={styles.segment}>
          <Pressable
            testID="tab-walker"
            style={[styles.segBtn, mode === 'walker' && styles.segBtnActive]}
            onPress={() => { hap.light(); setMode('walker'); }}
          >
            <Text style={[styles.segText, mode === 'walker' && styles.segTextActive]}>WALKER PIN</Text>
          </Pressable>
          <Pressable
            testID="tab-staff"
            style={[styles.segBtn, mode === 'staff' && styles.segBtnActive]}
            onPress={() => { hap.light(); setMode('staff'); }}
          >
            <Text style={[styles.segText, mode === 'staff' && styles.segTextActive]}>STAFF LOGIN</Text>
          </Pressable>
        </View>

        {mode === 'walker' ? (
          <View style={styles.pane}>
            <Text style={styles.label}>EVENT CODE</Text>
            <TextInput
              testID="input-event-code"
              value={eventCode}
              onChangeText={(v) => setEventCode(v.toUpperCase())}
              style={styles.input}
              autoCapitalize="characters"
              placeholder="FEST01"
              placeholderTextColor="#999"
            />
            <Text style={styles.label}>PIN</Text>
            <View style={styles.pinDisplay} testID="pin-display">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <View key={i} style={styles.pinCell}>
                  <Text style={styles.pinChar}>{pin[i] ? '•' : ''}</Text>
                </View>
              ))}
            </View>
            <View style={styles.pad}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                <Pressable
                  key={d}
                  testID={`pin-${d}`}
                  style={styles.padKey}
                  onPress={() => pressDigit(d)}
                >
                  <Text style={styles.padKeyText}>{d}</Text>
                </Pressable>
              ))}
              <Pressable style={[styles.padKey, styles.padKeyGhost]} onPress={() => { hap.light(); setPin(''); }} testID="pin-clear">
                <Text style={styles.padKeyTextSmall}>CLR</Text>
              </Pressable>
              <Pressable style={styles.padKey} onPress={() => pressDigit('0')} testID="pin-0">
                <Text style={styles.padKeyText}>0</Text>
              </Pressable>
              <Pressable style={[styles.padKey, styles.padKeyGhost]} onPress={clearDigit} testID="pin-back">
                <Text style={styles.padKeyTextSmall}>DEL</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.pane}>
            <Text style={styles.label}>EMAIL</Text>
            <TextInput
              testID="input-email"
              value={email}
              onChangeText={setEmail}
              style={styles.input}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="admin@walkfellas.io"
              placeholderTextColor="#999"
            />
            <Text style={styles.label}>PASSWORD</Text>
            <TextInput
              testID="input-password"
              value={password}
              onChangeText={setPassword}
              style={styles.input}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor="#999"
            />
            <View style={styles.hintBox}>
              <Text style={styles.hintText}>DEMO: admin@walkfellas.io / admin123</Text>
              <Text style={styles.hintText}>DEMO: sup@walkfellas.io / sup123</Text>
            </View>
          </View>
        )}

        <Pressable
          testID="submit-login"
          style={[styles.submit, busy && { opacity: 0.5 }]}
          onPress={submit}
          disabled={busy}
        >
          {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitText}>ENTER →</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.surface },
  loadingText: { fontSize: 24, fontWeight: '900', letterSpacing: 4, color: theme.color.onSurface },
  hero: { height: 260, position: 'relative', overflow: 'hidden' },
  heroContent: { position: 'absolute', bottom: 20, left: 20, right: 20 },
  wordmark: { fontSize: 48, fontWeight: '900', color: '#FFF', letterSpacing: -2 },
  tagline: { fontSize: 12, color: theme.color.brand, letterSpacing: 2, fontWeight: '800', marginTop: 4 },
  segment: {
    flexDirection: 'row',
    borderBottomWidth: 2,
    borderBottomColor: theme.color.borderStrong,
  },
  segBtn: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: theme.color.surface,
    borderRightWidth: 2,
    borderRightColor: theme.color.borderStrong,
  },
  segBtnActive: { backgroundColor: theme.color.surfaceInverse },
  segText: { fontSize: 12, fontWeight: '800', letterSpacing: 1.5, color: theme.color.onSurface },
  segTextActive: { color: theme.color.onSurfaceInverse },
  pane: { padding: 20, gap: 12 },
  label: { fontSize: 11, letterSpacing: 1.5, fontWeight: '800', color: theme.color.onSurface, marginTop: 4 },
  input: {
    borderWidth: 2,
    borderColor: theme.color.borderStrong,
    paddingVertical: 14,
    paddingHorizontal: 14,
    fontSize: 18,
    fontWeight: '700',
    color: theme.color.onSurface,
    backgroundColor: theme.color.surface,
  },
  pinDisplay: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'space-between',
  },
  pinCell: {
    flex: 1,
    height: 48,
    borderWidth: 2,
    borderColor: theme.color.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinChar: { fontSize: 32, fontWeight: '900', color: theme.color.onSurface, lineHeight: 34 },
  pad: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  padKey: {
    width: '32%',
    height: 60,
    borderWidth: 2,
    borderColor: theme.color.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.color.surface,
  },
  padKeyGhost: { backgroundColor: theme.color.surfaceSecondary },
  padKeyText: { fontSize: 26, fontWeight: '900', color: theme.color.onSurface },
  padKeyTextSmall: { fontSize: 14, fontWeight: '800', letterSpacing: 1, color: theme.color.onSurface },
  hintBox: { marginTop: 8, padding: 10, borderWidth: 2, borderColor: theme.color.borderStrong, backgroundColor: theme.color.surfaceSecondary },
  hintText: { fontSize: 11, fontWeight: '700', color: theme.color.onSurface, letterSpacing: 0.5 },
  submit: {
    margin: 20,
    marginTop: 8,
    backgroundColor: theme.color.brand,
    borderWidth: 2,
    borderColor: theme.color.borderStrong,
    paddingVertical: 20,
    alignItems: 'center',
  },
  submitText: { color: '#FFF', fontSize: 20, fontWeight: '900', letterSpacing: 2 },
});
