import { Image } from 'expo-image';
import * as Location from 'expo-location';
import * as SplashScreen from 'expo-splash-screen';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DEMO } from '@/lib/demo';
import { ActionButton, Input, Segmented, TimeStepper } from '@/components/meds/controls';
import { ThemedText } from '@/components/themed-text';
import { HeadingFont, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { scheduleEveningReminder } from '@/lib/daily';
import { rescheduleMedNotifications } from '@/lib/meds';
import { requestNotificationPermission } from '@/lib/notifications';
import { saveSettings, Settings } from '@/lib/settings';

const STEPS = 5;

/** First-launch welcome: name, sun sensitivity, permissions. Shown over the app until finished. */
export function Welcome({ onDone }: { onDone: () => void }) {
  const theme = useTheme();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(Settings.name);
  const [uv, setUv] = useState(Settings.uvThreshold);
  const [alertAt, setAlertAt] = useState(Settings.morningAlert.hour * 60 + Settings.morningAlert.minute);
  const [notif, setNotif] = useState<'idle' | 'on' | 'off'>('idle');
  const [loc, setLoc] = useState<'idle' | 'on' | 'off'>('idle');

  const next = () => setStep((s) => Math.min(STEPS - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  const finish = async () => {
    await saveSettings({
      name: name.trim(),
      uvThreshold: uv,
      morningAlert: { hour: Math.floor(alertAt / 60), minute: alertAt % 60 },
      onboarded: true,
    });
    // Permissions may have just been granted: set up reminders now.
    scheduleEveningReminder().catch(() => {});
    rescheduleMedNotifications().catch(() => {});
    onDone();
  };

  const firstName = name.trim();

  return (
    <View
      style={[styles.overlay, { backgroundColor: theme.background }]}
      onLayout={() => SplashScreen.hideAsync().catch(() => {})}>
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.top}>
            <View style={styles.side}>
              {step > 0 && (
                <Pressable onPress={back} hitSlop={12}>
                  <ThemedText style={{ color: theme.accent }}>‹ Back</ThemedText>
                </Pressable>
              )}
            </View>
            <View style={styles.dots} accessible accessibilityLabel={`Step ${step + 1} of ${STEPS}`}>
              {Array.from({ length: STEPS }, (_, i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    i === step
                      ? [styles.dotActive, { backgroundColor: theme.accent }]
                      : { backgroundColor: theme.textSecondary, opacity: 0.45 },
                  ]}
                />
              ))}
            </View>
            <View style={styles.side} />
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {step === 0 && (
              <>
                <Image source={require('@/assets/images/butterfly.png')} style={styles.logo} contentFit="contain" />
                <ThemedText style={styles.h1}>Welcome to MyLupus</ThemedText>
                <ThemedText style={styles.lead}>
                  A calm place to keep track of your lupus: UV alerts, medication reminders, symptoms, flares, and
                  labs, with an assistant that can look for patterns in your own history.
                </ThemedText>
                {DEMO && (
                  <View style={[styles.note, { backgroundColor: theme.backgroundSelected }]}>
                    <ThemedText type="smallBold">This is a demo.</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      It&apos;s filled with two months of sample data for a fictional user, Alex. AI answers are
                      pre-written examples, and nothing you enter leaves this browser.
                    </ThemedText>
                  </View>
                )}
                <View style={[styles.note, { backgroundColor: theme.backgroundElement }]}>
                  <ThemedText type="smallBold">Your data stays on your phone.</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    Nothing is uploaded unless you scan a lab report or ask the assistant a question. MyLupus helps you
                    track patterns to discuss with your care team; it isn&apos;t medical advice.
                  </ThemedText>
                </View>
              </>
            )}

            {step === 1 && (
              <>
                <ThemedText style={styles.h1}>What should we call you?</ThemedText>
                <ThemedText style={styles.lead}>Used for greetings like “Good morning.” You can skip this.</ThemedText>
                <Input
                  value={name}
                  onChangeText={setName}
                  placeholder="Your first name"
                  autoCapitalize="words"
                  autoCorrect={false}
                  returnKeyType="next"
                  onSubmitEditing={next}
                />
              </>
            )}

            {step === 2 && (
              <>
                <ThemedText style={styles.h1}>Sun sensitivity</ThemedText>
                <ThemedText style={styles.lead}>
                  UV light is one of the most common lupus flare triggers. MyLupus will tell you when UV goes above
                  your limit.
                </ThemedText>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  PROTECT MYSELF WHEN UV IS ABOVE
                </ThemedText>
                <Segmented
                  options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))}
                  value={uv}
                  onChange={setUv}
                />
                <ThemedText type="small" themeColor="textSecondary">
                  Many people with lupus protect themselves from UV 3 and up, and more sun-sensitive people from 2 or
                  lower. Ask your doctor if you&apos;re not sure.
                </ThemedText>
                <ThemedText type="smallBold" themeColor="textSecondary" style={styles.gap}>
                  MORNING UV ALERT
                </ThemedText>
                <TimeStepper value={alertAt} onChange={setAlertAt} />
                <ThemedText type="small" themeColor="textSecondary">
                  A daily message with today&apos;s UV, the max, and when it&apos;s above your limit.
                </ThemedText>
              </>
            )}

            {step === 3 && (
              <>
                <ThemedText style={styles.h1}>Reminders and UV</ThemedText>
                <ThemedText style={styles.lead}>
                  Two permissions make MyLupus work best. You can change them anytime in iPhone Settings.
                </ThemedText>
                <Permission
                  title="Notifications"
                  detail="Medication reminders, the morning UV alert, sunscreen reapply reminders, and an evening check-in."
                  state={notif}
                  onPress={async () => setNotif((await requestNotificationPermission()) === 'granted' ? 'on' : 'off')}
                />
                <Permission
                  title="Location"
                  detail="Used only to look up the UV index where you are. You can pick a city instead."
                  state={loc}
                  onPress={async () => {
                    const { status } = await Location.requestForegroundPermissionsAsync();
                    setLoc(status === 'granted' ? 'on' : 'off');
                  }}
                />
              </>
            )}

            {step === 4 && (
              <>
                <ThemedText style={styles.h1}>You&apos;re all set{firstName ? `, ${firstName}` : ''}</ThemedText>
                <ThemedText style={styles.lead}>A few good places to start:</ThemedText>
                {[
                  ['Meds', 'Add your medications and your daily routine for reminders that adjust to your day.'],
                  ['Log', 'Do a quick evening check-in, and add past flares for more history.'],
                  ['Labs', 'Scan or type in your latest lab report.'],
                  ['Ask', 'Ask questions about your patterns once you have a few days of data.'],
                ].map(([tab, text]) => (
                  <View key={tab} style={[styles.tip, { backgroundColor: theme.backgroundElement }]}>
                    <ThemedText type="smallBold" style={{ color: theme.accent }}>
                      {tab}
                    </ThemedText>
                    <ThemedText type="small">{text}</ThemedText>
                  </View>
                ))}
                <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
                  Be gentle with yourself. Every check-in helps you understand your body a little more.
                </ThemedText>
              </>
            )}
          </ScrollView>

          <View style={styles.footer}>
            {step < STEPS - 1 ? (
              <ActionButton label={step === 0 ? 'Get started' : step === 1 && !firstName ? 'Skip' : 'Continue'} onPress={next} />
            ) : (
              <ActionButton label="Open MyLupus" onPress={finish} />
            )}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function Permission({
  title,
  detail,
  state,
  onPress,
}: {
  title: string;
  detail: string;
  state: 'idle' | 'on' | 'off';
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.note, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="smallBold">{title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {detail}
      </ThemedText>
      {Platform.OS === 'web' ? null : state === 'idle' ? (
        <ActionButton label={`Allow ${title.toLowerCase()}`} kind="secondary" onPress={onPress} />
      ) : (
        <ThemedText type="small" style={{ color: state === 'on' ? theme.accent : theme.textSecondary }}>
          {state === 'on' ? '✓ Allowed' : 'Not allowed. You can turn it on later in iPhone Settings.'}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 200 },
  flex: { flex: 1 },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    minHeight: 44,
  },
  side: { width: 70 },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  dotActive: { width: 24 },
  body: { padding: Spacing.four, gap: Spacing.three, flexGrow: 1, justifyContent: 'center', maxWidth: 520, alignSelf: 'center', width: '100%' },
  logo: { width: 120, height: 120, alignSelf: 'center' },
  h1: { fontFamily: HeadingFont.bold, fontSize: 28, lineHeight: 36 },
  lead: { fontSize: 17, lineHeight: 25 },
  note: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
  tip: { borderRadius: 14, padding: Spacing.three, gap: 2 },
  gap: { marginTop: Spacing.three },
  center: { textAlign: 'center', marginTop: Spacing.two },
  footer: { padding: Spacing.four, paddingTop: Spacing.two },
});
