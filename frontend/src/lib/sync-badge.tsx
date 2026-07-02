import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { subscribe, drain, isForceOffline } from './outbox';
import { theme } from './theme';

export function SyncBadge({ onPress }: { onPress?: () => void }) {
  const [count, setCount] = useState(0);
  const [offline, setOffline] = useState(isForceOffline());

  useEffect(() => {
    const unsub = subscribe(setCount);
    const t = setInterval(() => {
      setOffline(isForceOffline());
      if (!isForceOffline()) drain();
    }, 4000);
    return () => { unsub(); clearInterval(t); };
  }, []);

  const label = offline ? 'Offline' : count > 0 ? `Sync ${count}` : 'Live';
  const bg = offline ? theme.color.brandSoft : count > 0 ? theme.color.warningSoft : theme.color.successSoft;
  const fg = offline ? theme.color.brand : count > 0 ? '#8B6D19' : theme.color.success;
  const dot = offline ? theme.color.brand : count > 0 ? theme.color.warning : theme.color.success;

  return (
    <Pressable style={[styles.wrap, { backgroundColor: bg }]} onPress={onPress} testID="sync-badge">
      <View style={[styles.dot, { backgroundColor: dot }]} />
      <Text style={[styles.text, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: theme.radius.pill,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.3 },
});
