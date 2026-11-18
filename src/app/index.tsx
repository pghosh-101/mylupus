import { Card, ComingSoon, Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
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
      <ComingSoon
        phase="Phase 1"
        items={['Morning UV heads-up notification', 'Sunscreen reapply reminders', '"Heading out" UV check']}
      />
      <Card>
        <ThemedText type="small" themeColor="textSecondary">
          MyLupus helps you track patterns to discuss with your care team. It isn&apos;t medical advice.
        </ThemedText>
      </Card>
    </Screen>
  );
}
