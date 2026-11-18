import { ComingSoon, Screen } from '@/components/screen';

export default function AskScreen() {
  return (
    <Screen title="Ask MyLupus">
      <ComingSoon
        phase="Phase 5"
        items={[
          'Ask questions about your own history',
          '"What came before my last flares?"',
          'Appointment prep summary for your rheumatologist',
        ]}
      />
    </Screen>
  );
}
