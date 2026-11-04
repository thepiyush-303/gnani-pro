import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CopilotBridgeProvider } from '../src/hooks/CopilotBridge';
import { useTheme } from '../src/ui/theme';

export default function RootLayout() {
  const { c, isDark } = useTheme();
  return (
    <SafeAreaProvider>
      <CopilotBridgeProvider>
        <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={c.bg} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: c.bg },
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
        </Stack>
      </CopilotBridgeProvider>
    </SafeAreaProvider>
  );
}
