import { useEffect, useState } from 'react';
import { Alert } from 'react-native';

import {
  ActionButton,
  Field,
  FormSheet,
  Input,
  MonthStepper,
  MultiChips,
  Segmented,
  Stepper,
} from '@/components/meds/controls';
import { FLARE_TRIGGERS, SYMPTOMS, type Flare } from '@/lib/daily';
import { newId, todayString } from '@/lib/meds';

export function FlareForm({
  visible,
  flare,
  onSave,
  onDelete,
  onClose,
}: {
  visible: boolean;
  /** Flare to edit, or null for a new one. */
  flare: Flare | null;
  onSave: (f: Flare) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const today = todayString();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [day, setDay] = useState<number | null>(Number(today.slice(8)));
  const [ongoing, setOngoing] = useState(true);
  const [duration, setDuration] = useState(7);
  const [severity, setSeverity] = useState<Flare['severity']>(2);
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [triggers, setTriggers] = useState<string[]>([]);
  const [treatment, setTreatment] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!visible) return;
    const start = flare?.start ?? today;
    setMonth(start.slice(0, 7));
    setDay(start.length > 7 ? Number(start.slice(8)) : null);
    setOngoing(flare?.ongoing ?? true);
    setDuration(flare?.durationDays ?? 7);
    setSeverity(flare?.severity ?? 2);
    setSymptoms(flare?.symptoms ?? []);
    setTriggers(flare?.triggers ?? []);
    setTreatment(flare?.treatment ?? '');
    setNotes(flare?.notes ?? '');
  }, [visible, flare, today]);

  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();

  const save = () =>
    onSave({
      id: flare?.id ?? newId(),
      start: day ? `${month}-${String(Math.min(day, daysInMonth)).padStart(2, '0')}` : month,
      ongoing,
      durationDays: ongoing ? null : duration,
      severity,
      symptoms,
      triggers,
      treatment: treatment.trim(),
      notes: notes.trim(),
    });

  return (
    <FormSheet
      visible={visible}
      title={flare ? 'Edit flare' : 'Log a flare'}
      saveLabel={flare ? 'Save changes' : 'Save flare'}
      onClose={onClose}
      onSave={save}>
      <Field label="When it started" hint="For past flares, an approximate month is fine.">
        <MonthStepper value={month} onChange={setMonth} />
        <Segmented
          options={[
            { value: 'day', label: 'I know the day' },
            { value: 'month', label: 'Just the month' },
          ]}
          value={day ? 'day' : 'month'}
          onChange={(v) => setDay(v === 'day' ? Math.min(Number(today.slice(8)), daysInMonth) : null)}
        />
        {day !== null && (
          <Stepper
            label={`Day ${Math.min(day, daysInMonth)}`}
            onMinus={() => setDay(Math.max(1, day - 1))}
            onPlus={() => setDay(Math.min(daysInMonth, day + 1))}
          />
        )}
      </Field>

      <Field label="Is it still going?">
        <Segmented
          options={[
            { value: 'yes', label: 'Ongoing' },
            { value: 'no', label: 'It ended' },
          ]}
          value={ongoing ? 'yes' : 'no'}
          onChange={(v) => setOngoing(v === 'yes')}
        />
        {!ongoing && (
          <Stepper
            label={`Lasted ${duration} day${duration === 1 ? '' : 's'}`}
            onMinus={() => setDuration(Math.max(1, duration - 1))}
            onPlus={() => setDuration(Math.min(365, duration + 1))}
          />
        )}
      </Field>

      <Field label="How bad">
        <Segmented
          options={[
            { value: 1, label: 'Mild' },
            { value: 2, label: 'Moderate' },
            { value: 3, label: 'Severe' },
          ]}
          value={severity}
          onChange={setSeverity}
        />
      </Field>

      <Field label="Symptoms">
        <MultiChips options={[...SYMPTOMS, "Raynaud's"]} value={symptoms} onChange={setSymptoms} />
      </Field>

      <Field label="Possible triggers">
        <MultiChips options={FLARE_TRIGGERS} value={triggers} onChange={setTriggers} />
      </Field>

      <Field label="Treatment" hint="e.g. prednisone taper, ER visit, dose change">
        <Input value={treatment} onChangeText={setTreatment} placeholder="What was done about it" multiline />
      </Field>

      <Field label="Notes">
        <Input value={notes} onChangeText={setNotes} placeholder="Anything else you remember" multiline />
      </Field>

      {flare && (
        <ActionButton
          label="Delete flare"
          kind="danger"
          onPress={() =>
            Alert.alert('Delete this flare?', undefined, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => onDelete(flare.id) },
            ])
          }
        />
      )}
    </FormSheet>
  );
}
