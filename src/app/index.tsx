import { useEffect, useState } from 'react';

import { Card, Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { CheckinCard } from '@/components/log/checkin-cards';
import { MorningAlertCard } from '@/components/morning-alert-card';
import { UvCard } from '@/components/uv-card';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function TodayScreen() {
  // Set after mount so the pre-rendered web page and the live clock never disagree.
  const [title, setTitle] = useState('Today');
  useEffect(() => setTitle(greeting()), []);

  return (
    <Screen title={title}>
      <CheckinCard compact />
      <UvCard />
      <MorningAlertCard />
      <Card>
        <ThemedText type="small" themeColor="textSecondary">
          MyLupus helps you track patterns to discuss with your care team. It isn&apos;t medical advice.
        </ThemedText>
      </Card>
    </Screen>
  );
}
