import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { AppState, useColorScheme } from 'react-native';

import { LaunchOverlay } from '@/components/launch-overlay';
import AppTabs from '@/components/app-tabs';
import { scheduleEveningReminder } from '@/lib/daily';
import { listenForDoseActions, rescheduleMedNotifications, setupDoseCategory } from '@/lib/meds';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();

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

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <LaunchOverlay />
      <AppTabs />
    </ThemeProvider>
  );
}
