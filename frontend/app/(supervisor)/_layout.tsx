import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform } from 'react-native';
import { theme } from '@/src/lib/theme';

const bar = {
  backgroundColor: theme.color.surface,
  borderTopWidth: 0,
  height: Platform.OS === 'ios' ? 84 : 68,
  paddingBottom: Platform.OS === 'ios' ? 24 : 10,
  paddingTop: 8,
  elevation: 12,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: -4 },
  shadowOpacity: 0.06,
  shadowRadius: 12,
};
const label = { fontFamily: theme.font.bold, fontSize: 10, letterSpacing: 0.2, marginTop: 2 };

export default function SupervisorLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.color.brand,
        tabBarInactiveTintColor: theme.color.muted,
        tabBarStyle: bar,
        tabBarLabelStyle: label,
      }}
    >
      <Tabs.Screen name="walkers" options={{ title: 'Team', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'people' : 'people-outline'} size={22} color={color} /> }} />
      <Tabs.Screen name="queue" options={{ title: 'Queue', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'list' : 'list-outline'} size={22} color={color} /> }} />
      <Tabs.Screen name="waste-validate" options={{ title: 'Waste', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'alert-circle' : 'alert-circle-outline'} size={22} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'person-circle' : 'person-circle-outline'} size={22} color={color} /> }} />
    </Tabs>
  );
}
