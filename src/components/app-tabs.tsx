import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';
import type { ColorValue } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

type IconName = 'map' | 'notifications' | 'people' | 'person';

function TabIcon({ name, color, focused }: { name: IconName; color: ColorValue; focused: boolean }) {
  return <Ionicons name={focused ? name : `${name}-outline`} size={24} color={color as string} />;
}


export default function AppTabs() {
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarStyle: { backgroundColor: theme.backgroundElement, borderTopColor: theme.border },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Map', tabBarIcon: (p) => <TabIcon name="map" {...p} /> }} />
      <Tabs.Screen name="alerts" options={{ title: 'Alerts', tabBarIcon: (p) => <TabIcon name="notifications" {...p} /> }} />
      <Tabs.Screen name="buddies" options={{ title: 'Buddies', tabBarIcon: (p) => <TabIcon name="people" {...p} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: (p) => <TabIcon name="person" {...p} /> }} />
    </Tabs>
  );
}
