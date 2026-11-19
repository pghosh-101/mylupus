import { useEffect, useState } from 'react';

import { CheckinCard } from '@/components/log/checkin-cards';
import { MorningAlertCard } from '@/components/morning-alert-card';
import { Card, Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { HeadsUpCard } from '@/components/today/heads-up-card';
import { NextDoseCard } from '@/components/today/next-dose-card';
import { UvCard } from '@/components/uv-card';
import { Settings } from '@/lib/settings';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function TodayScreen() {
  // Set after mount so the pre-rendered web page and the live clock never disagree.
  const [title, setTitle] = useState('Today');
  const [date, setDate] = useState('');
  useEffect(() => {
    setTitle(`${greeting()}, ${Settings.name}`);
    setDate(new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }));
  }, []);

  return (
    <Screen title={title} subtitle={date}>
      <NextDoseCard />
      <CheckinCard compact />
      <HeadsUpCard />
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
