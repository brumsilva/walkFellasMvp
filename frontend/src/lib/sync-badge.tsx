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

  const label = offline ? 'OFFLINE' : count > 0 ? `SYNCING (${count})` : 'ONLINE';
  const dotColor = offline ? theme.color.error : count > 0 ? theme.color.warning : theme.color.success;

  return (
    <Pressable style={styles.wrap} onPress={onPress} testID="sync-badge">
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderWidth: 1, borderColor: theme.color.borderStrong },
  text: { fontFamily: theme.font.mono, fontSize: 11, letterSpacing: 1, fontWeight: '900' },
});
