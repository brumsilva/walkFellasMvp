import React, { createContext, useCallback, useContext, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { theme } from './theme';

type ToastKind = 'success' | 'error' | 'info';
type Toast = { id: number; msg: string; kind: ToastKind };

const Ctx = createContext<{ show: (msg: string, kind?: ToastKind) => void }>({ show: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((msg: string, kind: ToastKind = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2500);
  }, []);

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      <View style={styles.wrap}>
        {toasts.map((t) => (
          <View
            key={t.id}
            style={[
              styles.toast,
              t.kind === 'success' && { backgroundColor: theme.color.success },
              t.kind === 'error' && { backgroundColor: theme.color.error },
              t.kind === 'info' && { backgroundColor: theme.color.surfaceInverse },
            ]}
            testID={`toast-${t.kind}`}
          >
            <Text style={styles.text}>{t.msg}</Text>
          </View>
        ))}
      </View>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 60,
    left: 16,
    right: 16,
    gap: 8,
    zIndex: 9999,
    pointerEvents: 'none',
  },
  toast: {
    borderWidth: 2,
    borderColor: theme.color.borderStrong,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  text: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
