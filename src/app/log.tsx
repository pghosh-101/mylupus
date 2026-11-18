import { ComingSoon, Screen } from '@/components/screen';

export default function LogScreen() {
  return (
    <Screen title="Daily log">
      <ComingSoon
        phase="Phase 3"
        items={[
          '30-second check-in: fatigue, joint pain, rash, sleep, stress',
          'Flare log',
          'Weather and UV saved automatically each day',
        ]}
      />
    </Screen>
  );
}
