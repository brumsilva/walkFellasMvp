import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/src/lib/theme';

export default function AdminLayout() {
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
        name="dashboard"
        options={{ title: 'DASHBOARD', tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="events"
        options={{ title: 'EVENTS', tabBarIcon: ({ color, size }) => <Ionicons name="calendar" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="catalog"
        options={{ title: 'CATALOG', tabBarIcon: ({ color, size }) => <Ionicons name="pricetags" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="team"
        options={{ title: 'TEAM', tabBarIcon: ({ color, size }) => <Ionicons name="people" size={size} color={color} /> }}
      />
    </Tabs>
  );
}
