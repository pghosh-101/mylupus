import {
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { AppState } from 'react-native';

import { seedDemoData } from '@/lib/demo';
import { LaunchOverlay } from '@/components/launch-overlay';
import { useColorScheme } from '@/hooks/use-color-scheme';
import AppTabs from '@/components/app-tabs';
import { Welcome } from '@/components/welcome';
import { scheduleEveningReminder } from '@/lib/daily';
import { listenForDoseActions, rescheduleMedNotifications, setupDoseCategory } from '@/lib/meds';
import { loadSettings, onSettingsChange } from '@/lib/settings';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const [fontsLoaded, fontError] = useFonts({ PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold });
  const [settingsReady, setSettingsReady] = useState(false);
  const [onboarded, setOnboarded] = useState(false);
  // Bumped when settings change, to re-render the whole app with the new values.
  const [appKey, setAppKey] = useState(0);
  // The encouraging launch screen plays on app start, not right after finishing the welcome.
  const [showLaunch, setShowLaunch] = useState(true);

  useEffect(() => {
    seedDemoData()
      .then(loadSettings)
      .then((s) => {
        setOnboarded(s.onboarded);
        setSettingsReady(true);
      });
    return onSettingsChange((s) => {
      setOnboarded(s.onboarded);
      setAppKey((k) => k + 1);
    });
  }, []);

  // Taken / Snooze / Skip buttons on medication reminders.
  // Medication reminders are scheduled two weeks ahead; refresh them whenever the app opens.
  useEffect(() => {
    setupDoseCategory();
    rescheduleMedNotifications().catch(() => {});
    scheduleEveningReminder().catch(() => {});
    const stopListening = listenForDoseActions();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') rescheduleMedNotifications().catch(() => {});
    });
    return () => {
      stopListening();
      sub.remove();
    };
  }, []);

  // Keep the native splash screen up until the heading font and settings are ready.
  if ((!fontsLoaded && !fontError) || !settingsReady) return null;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <AppTabs key={appKey} />
      {onboarded ? (
        showLaunch && <LaunchOverlay />
      ) : (
        <Welcome
          onDone={() => {
            setShowLaunch(false);
            setOnboarded(true);
          }}
        />
      )}
    </ThemeProvider>
  );
}
