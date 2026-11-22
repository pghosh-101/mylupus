import { useEffect, useState } from 'react';
import { Alert, Platform } from 'react-native';

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
import { SymptomChips } from '@/components/log/symptom-chips';
import { ThemedText } from '@/components/themed-text';
import { FLARE_TRIGGERS, SYMPTOMS, type DurationApprox, type Flare, type MedicalHistory } from '@/lib/daily';
import { newId, todayString } from '@/lib/meds';

/** What the editor is open for. */
export type HistoryEditing =
  | { kind: 'new' } // "Update history": choose a flare or background info
  | { kind: 'flare'; flare: Flare } // edit an existing flare
  | { kind: 'background' }; // edit diagnosis, past meds, conditions, allergies, notes

/**
 * One place to add to your history: log a flare (current or past) or update your health
 * background. Also used to edit a flare or the background from the timeline.
 */
export function HistoryEditor({
  editing,
  history,
  onSaveFlare,
  onDeleteFlare,
  onSaveHistory,
  onClose,
}: {
  editing: HistoryEditing | null;
  history: MedicalHistory;
  onSaveFlare: (f: Flare) => void;
  onDeleteFlare: (id: string) => void;
  onSaveHistory: (h: MedicalHistory) => void;
  onClose: () => void;
}) {
  const visible = editing !== null;
  const today = todayString();
  const existing = editing?.kind === 'flare' ? editing.flare : null;

  const [what, setWhat] = useState<'flare' | 'background'>('flare');
  // Flare fields
  const [month, setMonth] = useState(today.slice(0, 7));
  const [day, setDay] = useState<number | null>(Number(today.slice(8)));
  const [ongoing, setOngoing] = useState(true);
  const [duration, setDuration] = useState(7);
  /** 'exact' uses the day count; otherwise a rough length. */
  const [length, setLength] = useState<DurationApprox | 'exact'>('unknown');
  const [severity, setSeverity] = useState<Flare['severity']>(2);
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [triggers, setTriggers] = useState<string[]>([]);
  const [treatment, setTreatment] = useState('');
  const [notes, setNotes] = useState('');
  // Background fields
  const [background, setBackground] = useState(history);

  useEffect(() => {
    if (!editing) return;
    setWhat(editing.kind === 'background' ? 'background' : 'flare');
    const start = existing?.start ?? today;
    setMonth(start.slice(0, 7));
    setDay(start.length > 7 ? Number(start.slice(8)) : null);
    setOngoing(existing?.ongoing ?? true);
    setDuration(existing?.durationDays ?? 7);
    setLength(existing?.durationDays ? 'exact' : (existing?.durationApprox ?? 'unknown'));
    setSeverity(existing?.severity ?? 2);
    setSymptoms(existing?.symptoms ?? []);
    setTriggers(existing?.triggers ?? []);
    setTreatment(existing?.treatment ?? '');
    setNotes(existing?.notes ?? '');
    setBackground(history);
  }, [editing, existing, history, today]);

  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const setField = (k: keyof MedicalHistory) => (v: string) => setBackground({ ...background, [k]: v });

  const save = () => {
    if (what === 'background') return onSaveHistory(background);
    onSaveFlare({
      id: existing?.id ?? newId(),
      start: day ? `${month}-${String(Math.min(day, daysInMonth)).padStart(2, '0')}` : month,
      ongoing,
      durationDays: ongoing || length !== 'exact' ? null : duration,
      durationApprox: ongoing || length === 'exact' ? undefined : length,
      severity,
      symptoms,
      triggers,
      treatment: treatment.trim(),
      notes: notes.trim(),
    });
  };

  const title =
    editing?.kind === 'flare' ? 'Edit flare' : editing?.kind === 'background' ? 'Health background' : 'Update history';
  const saveLabel = what === 'background' ? 'Save background' : existing ? 'Save changes' : 'Save flare';

  return (
    <FormSheet visible={visible} title={title} saveLabel={saveLabel} onClose={onClose} onSave={save}>
      {editing?.kind === 'new' && (
        <Field label="What are you adding?">
          <Segmented
            options={[
              { value: 'flare', label: 'A flare' },
              { value: 'background', label: 'Health background' },
            ]}
            value={what}
            onChange={setWhat}
          />
          <ThemedText type="small" themeColor="textSecondary">
            {what === 'flare'
              ? 'One happening now, or one from the past. Past flares give the patterns more to work with.'
              : 'Your diagnosis, past medications, other conditions, allergies, and notes from your doctor.'}
          </ThemedText>
        </Field>
      )}

      {what === 'flare' ? (
        <>
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
          </Field>

          {!ongoing && (
            <Field
              label="How long did it last?"
              hint="A rough guess is fine. Flares come and go, so pick whatever feels closest.">
              <Segmented<DurationApprox | 'exact'>
                options={[
                  { value: 'days', label: 'A few days' },
                  { value: 'week', label: 'About a week' },
                  { value: 'weeks', label: 'A few weeks' },
                  { value: 'month', label: 'A month or more' },
                  { value: 'unknown', label: 'Not sure' },
                  { value: 'exact', label: 'Exact days' },
                ]}
                value={length}
                onChange={setLength}
              />
              {length === 'exact' && (
                <Stepper
                  label={`Lasted ${duration} day${duration === 1 ? '' : 's'}`}
                  onMinus={() => setDuration(Math.max(1, duration - 1))}
                  onPlus={() => setDuration(Math.min(365, duration + 1))}
                />
              )}
            </Field>
          )}

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
            <SymptomChips base={[...SYMPTOMS, "Raynaud's"]} value={symptoms} onChange={setSymptoms} />
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

          {existing && (
            <ActionButton
              label="Delete flare"
              kind="danger"
              onPress={() => {
                if (Platform.OS === 'web') return onDeleteFlare(existing.id);
                Alert.alert('Delete this flare?', undefined, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => onDeleteFlare(existing.id) },
                ]);
              }}
            />
          )}
        </>
      ) : (
        <>
          <Field label="Diagnosed">
            <Segmented
              options={[
                { value: 'set', label: 'Set month' },
                { value: 'unset', label: 'Skip' },
              ]}
              value={background.diagnosed ? 'set' : 'unset'}
              onChange={(v) => setField('diagnosed')(v === 'set' ? background.diagnosed || today.slice(0, 7) : '')}
            />
            {background.diagnosed ? (
              <MonthStepper value={background.diagnosed} onChange={setField('diagnosed')} />
            ) : null}
          </Field>
          <Field label="Past medications" hint="What you've tried and why it changed.">
            <Input
              value={background.pastMeds}
              onChangeText={setField('pastMeds')}
              placeholder="e.g. Prednisone 2024, tapered off after flare"
              multiline
            />
          </Field>
          <Field label="Other conditions">
            <Input
              value={background.otherConditions}
              onChangeText={setField('otherConditions')}
              placeholder="e.g. Raynaud's"
              multiline
            />
          </Field>
          <Field label="Allergies">
            <Input
              value={background.allergies}
              onChangeText={setField('allergies')}
              placeholder="Medications or foods"
              multiline
            />
          </Field>
          <Field label="Other notes" hint="Anything your doctor has told you that's worth remembering.">
            <Input value={background.notes} onChangeText={setField('notes')} multiline />
          </Field>
        </>
      )}
    </FormSheet>
  );
}
