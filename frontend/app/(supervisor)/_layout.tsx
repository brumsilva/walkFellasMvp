import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/src/lib/theme';

export default function SupervisorLayout() {
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
        name="walkers"
        options={{ title: 'WALKERS', tabBarIcon: ({ color, size }) => <Ionicons name="people" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="queue"
        options={{ title: 'QUEUE', tabBarIcon: ({ color, size }) => <Ionicons name="list" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="waste-validate"
        options={{ title: 'WASTE', tabBarIcon: ({ color, size }) => <Ionicons name="alert-circle" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'PROFILE', tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} /> }}
      />
    </Tabs>
  );
}
