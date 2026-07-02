import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/src/lib/theme';

export default function WalkerLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.color.brand,
        tabBarInactiveTintColor: theme.color.muted,
        tabBarStyle: {
          borderTopWidth: 2,
          borderTopColor: theme.color.borderStrong,
          backgroundColor: theme.color.surface,
          height: 64,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
      }}
    >
      <Tabs.Screen
        name="pos"
        options={{
          title: 'POS',
          tabBarIcon: ({ color, size }) => <Ionicons name="grid" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="restock"
        options={{
          title: 'RESTOCK',
          tabBarIcon: ({ color, size }) => <Ionicons name="cube" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="waste"
        options={{
          title: 'WASTE',
          tabBarIcon: ({ color, size }) => <Ionicons name="trash" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="close-shift"
        options={{
          title: 'CLOSE',
          tabBarIcon: ({ color, size }) => <Ionicons name="checkbox" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
