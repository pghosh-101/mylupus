import { useEffect, useState } from 'react';

import { Field, FormSheet, Input, MonthStepper, Segmented } from '@/components/meds/controls';
import { todayString } from '@/lib/meds';
import type { MedicalHistory } from '@/lib/daily';

export function HistoryForm({
  visible,
  history,
  onSave,
  onClose,
}: {
  visible: boolean;
  history: MedicalHistory;
  onSave: (h: MedicalHistory) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(history);
  useEffect(() => {
    if (visible) setDraft(history);
  }, [visible, history]);
  const set = (k: keyof MedicalHistory) => (v: string) => setDraft({ ...draft, [k]: v });

  return (
    <FormSheet visible={visible} title="My history" saveLabel="Save history" onClose={onClose} onSave={() => onSave(draft)}>
      <Field label="Diagnosed">
        <Segmented
          options={[
            { value: 'set', label: 'Set month' },
            { value: 'unset', label: 'Skip' },
          ]}
          value={draft.diagnosed ? 'set' : 'unset'}
          onChange={(v) => set('diagnosed')(v === 'set' ? draft.diagnosed || todayString().slice(0, 7) : '')}
        />
        {draft.diagnosed ? <MonthStepper value={draft.diagnosed} onChange={set('diagnosed')} /> : null}
      </Field>
      <Field label="Past medications" hint="What you've tried and why it changed.">
        <Input
          value={draft.pastMeds}
          onChangeText={set('pastMeds')}
          placeholder="e.g. Prednisone 2024, tapered off after flare"
          multiline
        />
      </Field>
      <Field label="Other conditions">
        <Input value={draft.otherConditions} onChangeText={set('otherConditions')} placeholder="e.g. Raynaud's" multiline />
      </Field>
      <Field label="Allergies">
        <Input value={draft.allergies} onChangeText={set('allergies')} placeholder="Medications or foods" multiline />
      </Field>
      <Field label="Other notes" hint="Anything your doctor has told you that's worth remembering.">
        <Input value={draft.notes} onChangeText={set('notes')} multiline />
      </Field>
    </FormSheet>
  );
}
