/**
 * Personal settings. These will move into an editable Settings screen later;
 * for now they live here so they're easy to find and change.
 */
export const Settings = {
  /** Used in greetings. */
  name: 'Alex',
  /** Sun protection is needed when the UV index is ABOVE this number. */
  uvThreshold: 2,
  /** Time of the morning UV notification (24-hour clock, phone's time zone). */
  morningAlert: { hour: 8, minute: 0 },
} as const;
