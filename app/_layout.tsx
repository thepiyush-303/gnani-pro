import { useEffect, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
// Per-weight imports: importing the package root would bundle all 16 variants (~1.4 MB extra).
import { JetBrainsMono_300Light } from '@expo-google-fonts/jetbrains-mono/300Light';
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono/400Regular';
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono/500Medium';
import { JetBrainsMono_600SemiBold } from '@expo-google-fonts/jetbrains-mono/600SemiBold';
import { CopilotBridgeProvider } from '../src/hooks/CopilotBridge';
import { useTheme } from '../src/ui/theme';

export default function RootLayout() {
  const { c, isDark } = useTheme();
  const [fontsLoaded, fontError] = useFonts({
    JetBrainsMono_300Light,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    JetBrainsMono_600SemiBold,
  });
  // DESIGN.md: respect reduced motion for screen transitions
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <CopilotBridgeProvider>
        <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={c.bg} />
        {/* Wait for JetBrains Mono so text never flashes in the system font (fall back if loading fails). */}
        {fontsLoaded || fontError ? (
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: c.bg },
              animation: reduceMotion ? 'none' : 'slide_from_right',
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="onboarding" options={{ animation: reduceMotion ? 'none' : 'fade' }} />
          </Stack>
        ) : (
          <View style={{ flex: 1, backgroundColor: c.bg }} />
        )}
      </CopilotBridgeProvider>
    </SafeAreaProvider>
  );
}
