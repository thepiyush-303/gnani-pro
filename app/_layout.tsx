import { useEffect, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
// Per-weight imports: importing the package root would bundle all 18 variants.
import { Poppins_300Light } from '@expo-google-fonts/poppins/300Light';
import { Poppins_400Regular } from '@expo-google-fonts/poppins/400Regular';
import { Poppins_500Medium } from '@expo-google-fonts/poppins/500Medium';
import { Poppins_600SemiBold } from '@expo-google-fonts/poppins/600SemiBold';
import { Poppins_700Bold } from '@expo-google-fonts/poppins/700Bold';
import { CopilotBridgeProvider } from '../src/hooks/CopilotBridge';
import { useTheme } from '../src/ui/theme';

export default function RootLayout() {
  const { c, isDark } = useTheme();
  const [fontsLoaded, fontError] = useFonts({
    Poppins_300Light,
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
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
        {/* Wait for Poppins so text never flashes in the system font (fall back if loading fails). */}
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
