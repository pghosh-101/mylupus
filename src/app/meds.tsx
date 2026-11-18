import { ComingSoon, Screen } from '@/components/screen';

export default function MedsScreen() {
  return (
    <Screen title="Medications">
      <ComingSoon
        phase="Phase 2"
        items={[
          'Add medications with dose, frequency, and food rules',
          'Suggested daily schedule that respects those rules',
          'Reminders with Taken / Snooze / Skip',
          'Side effect and refill tracking',
        ]}
      />
    </Screen>
  );
}
