import { ComingSoon, Screen } from '@/components/screen';

export default function LabsScreen() {
  return (
    <Screen title="Labs">
      <ComingSoon
        phase="Phase 4"
        items={[
          'Enter C3, C4, anti-dsDNA, CBC, urine protein, and more',
          'Charts over time with normal ranges',
          'Timeline of labs, symptoms, flares, and UV together',
        ]}
      />
    </Screen>
  );
}
