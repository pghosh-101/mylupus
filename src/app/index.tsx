import { Card, ComingSoon, Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { MorningAlertCard } from '@/components/morning-alert-card';
import { UvCard } from '@/components/uv-card';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function TodayScreen() {
  return (
    <Screen title={greeting()}>
      <UvCard />
      <MorningAlertCard />
      <ComingSoon phase="Phase 1" items={['Sunscreen reapply reminders', '"Heading out" UV check']} />
      <Card>
        <ThemedText type="small" themeColor="textSecondary">
          MyLupus helps you track patterns to discuss with your care team. It isn&apos;t medical advice.
        </ThemedText>
      </Card>
    </Screen>
  );
}
