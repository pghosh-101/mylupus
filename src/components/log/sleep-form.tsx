import { useEffect, useState } from 'react';

import { Field, FormSheet, Segmented, Stepper } from '@/components/meds/controls';
import type { SleepEntry } from '@/lib/daily';

export function SleepForm({
  visible,
  date,
  existing,
  onSave,
  onClose,
}: {
  visible: boolean;
  date: string;
  existing: SleepEntry | null;
  onSave: (e: SleepEntry) => void;
  onClose: () => void;
}) {
  const [hours, setHours] = useState(7);
  const [quality, setQuality] = useState<SleepEntry['quality']>('ok');

  useEffect(() => {
    if (!visible) return;
    setHours(existing?.hours ?? 7);
    setQuality(existing?.quality ?? 'ok');
  }, [visible, existing]);

  return (
    <FormSheet
      visible={visible}
      title="How did you sleep?"
      saveLabel="Save sleep"
      onClose={onClose}
      onSave={() => onSave({ date, hours, quality })}>
      <Field label="Hours slept">
        <Stepper
          label={`${hours} hours`}
          onMinus={() => setHours(Math.max(0, hours - 0.5))}
          onPlus={() => setHours(Math.min(16, hours + 0.5))}
        />
      </Field>
      <Field label="Sleep quality">
        <Segmented
          options={[
            { value: 'poor', label: 'Poor' },
            { value: 'ok', label: 'OK' },
            { value: 'good', label: 'Good' },
          ]}
          value={quality}
          onChange={setQuality}
        />
      </Field>
    </FormSheet>
  );
}
