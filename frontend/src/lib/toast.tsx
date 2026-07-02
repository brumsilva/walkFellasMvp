import React, { createContext, useCallback, useContext, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from './theme';

type ToastKind = 'success' | 'error' | 'info';
type Toast = { id: number; msg: string; kind: ToastKind };

const Ctx = createContext<{ show: (msg: string, kind?: ToastKind) => void }>({ show: () => {} });

const ICONS: Record<ToastKind, keyof typeof Ionicons.glyphMap> = {
  success: 'checkmark-circle',
  error: 'alert-circle',
  info: 'information-circle',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((msg: string, kind: ToastKind = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }, []);

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      <View style={styles.wrap}>
        {toasts.map((t) => {
          const style =
            t.kind === 'success' ? { bg: theme.color.success, tint: '#FFF' } :
            t.kind === 'error' ? { bg: theme.color.error, tint: '#FFF' } :
            { bg: theme.color.onSurface, tint: '#FFF' };
          return (
            <View
              key={t.id}
              style={[styles.toast, { backgroundColor: style.bg }]}
              testID={`toast-${t.kind}`}
            >
              <Ionicons name={ICONS[t.kind]} size={20} color={style.tint} />
              <Text style={[styles.text, { color: style.tint }]} numberOfLines={2}>{t.msg}</Text>
            </View>
          );
        })}
      </View>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 64, left: 16, right: 16,
    gap: 8, zIndex: 9999,
    pointerEvents: 'none',
  },
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: theme.radius.pill,
    paddingVertical: 12, paddingHorizontal: 16,
    ...(theme.shadow.md as any),
  },
  text: { fontFamily: theme.font.semibold, fontSize: 13, flex: 1 },
});
