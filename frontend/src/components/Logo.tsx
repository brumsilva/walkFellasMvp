import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { theme } from '@/src/lib/theme';

type Props = {
  size?: number;
  variant?: 'full' | 'mark';
  color?: 'brand' | 'onBrand' | 'onSurface';
  style?: ViewStyle;
};

/**
 * walkFellas logo.
 * Mark: rounded pill with a stylized footprint / "wF" ligature.
 * `full` variant adds the wordmark to the right.
 */
export function Logo({ size = 40, variant = 'full', color = 'brand', style }: Props) {
  const markColor =
    color === 'onBrand' ? theme.color.surface :
    color === 'onSurface' ? theme.color.onSurface :
    theme.color.brand;
  const inkColor =
    color === 'onBrand' ? theme.color.brand :
    color === 'onSurface' ? theme.color.surface :
    theme.color.surface;
  const wordColor =
    color === 'onBrand' ? theme.color.surface :
    color === 'onSurface' ? theme.color.onSurface :
    theme.color.onSurface;

  const dotSize = size * 0.18;
  const dotGap = size * 0.09;

  return (
    <View style={[styles.wrap, style]}>
      <View
        style={[
          styles.mark,
          {
            width: size,
            height: size,
            borderRadius: size * 0.32,
            backgroundColor: markColor,
          },
        ]}
      >
        {/* Two "footsteps": pair of small circles offset diagonally */}
        <View style={styles.footRow}>
          <View style={[styles.dot, { width: dotSize, height: dotSize, backgroundColor: inkColor, borderRadius: dotSize / 2 }]} />
          <View style={{ width: dotGap }} />
          <View style={[styles.dot, { width: dotSize * 0.75, height: dotSize * 0.75, backgroundColor: inkColor, borderRadius: dotSize / 2, opacity: 0.85 }]} />
        </View>
        <View style={[styles.footRow, { marginTop: dotGap, marginLeft: size * 0.14 }]}>
          <View style={[styles.dot, { width: dotSize * 0.75, height: dotSize * 0.75, backgroundColor: inkColor, borderRadius: dotSize / 2, opacity: 0.7 }]} />
          <View style={{ width: dotGap }} />
          <View style={[styles.dot, { width: dotSize, height: dotSize, backgroundColor: inkColor, borderRadius: dotSize / 2 }]} />
        </View>
      </View>
      {variant === 'full' && (
        <View style={{ marginLeft: size * 0.35 }}>
          <Text style={[styles.word, { color: wordColor, fontSize: size * 0.55, lineHeight: size * 0.65 }]}>
            walk<Text style={{ color: markColor }}>fellas</Text>
          </Text>
          <Text style={[styles.tag, { color: theme.color.muted, fontSize: Math.max(9, size * 0.16) }]}>
            EVERY BOTTLE, TRACKED
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center' },
  mark: { alignItems: 'center', justifyContent: 'center' },
  footRow: { flexDirection: 'row', alignItems: 'center' },
  dot: {},
  word: { fontFamily: theme.font.extrabold, letterSpacing: -0.5 },
  tag: { fontFamily: theme.font.bold, letterSpacing: 1.4, marginTop: 2 },
});
