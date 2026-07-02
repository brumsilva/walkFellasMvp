import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform } from 'react-native';
import { theme } from '@/src/lib/theme';

export default function WalkerLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.color.brand,
        tabBarInactiveTintColor: theme.color.muted,
        tabBarStyle: {
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
        },
        tabBarLabelStyle: { fontFamily: theme.font.bold, fontSize: 10, letterSpacing: 0.2, marginTop: 2 },
      }}
    >
      <Tabs.Screen
        name="pos"
        options={{ title: 'Sell', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'grid' : 'grid-outline'} size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="restock"
        options={{ title: 'Restock', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'cube' : 'cube-outline'} size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="waste"
        options={{ title: 'Waste', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'trash' : 'trash-outline'} size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="close-shift"
        options={{ title: 'Close', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'checkmark-done-circle' : 'checkmark-done-circle-outline'} size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'person-circle' : 'person-circle-outline'} size={22} color={color} /> }}
      />
    </Tabs>
  );
}
