import { Tabs } from 'expo-router';
import { Text, View } from 'react-native';
import { C, FONT } from '../../constants/theme';

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  const icons: Record<string, string> = {
    overview: '◉', sprint: '⊞', daily: '✎', settings: '⚙',
  };
  return (
    <View style={{ alignItems: 'center', gap: 2 }}>
      <Text style={{ fontSize: 18, color: focused ? C.orange : C.textDim }}>{icons[label] || '○'}</Text>
      <Text style={{
        fontFamily: FONT.mono, fontSize: 8, letterSpacing: 1.5,
        textTransform: 'uppercase',
        color: focused ? C.orange : C.textDim,
      }}>{label}</Text>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: C.bg },
        headerTintColor: C.white,
        headerTitleStyle: { fontFamily: FONT.mono, fontSize: 13, letterSpacing: 3 },
        headerShadowVisible: false,
        tabBarStyle: {
          backgroundColor: C.bg,
          borderTopWidth: C.BORDER_W,
          borderTopColor: C.border,
          height: 70,
          paddingBottom: 10,
          paddingTop: 6,
        },
        tabBarShowLabel: false,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'AUIV TRACKER',
          tabBarIcon: ({ focused }) => <TabIcon label="overview" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="sprint"
        options={{
          title: 'SPRINT',
          tabBarIcon: ({ focused }) => <TabIcon label="sprint" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="daily"
        options={{
          title: 'DAILY STANDUP',
          tabBarIcon: ({ focused }) => <TabIcon label="daily" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'SETTINGS',
          tabBarIcon: ({ focused }) => <TabIcon label="settings" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
