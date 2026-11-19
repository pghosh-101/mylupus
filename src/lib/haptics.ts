import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const enabled = Platform.OS !== 'web';

/** A light tap, for buttons. */
export function tap() {
  if (enabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** A tick, for changing a choice (chips, steppers). */
export function select() {
  if (enabled) Haptics.selectionAsync().catch(() => {});
}

/** A success buzz, for logging something (dose taken, check-in saved, sunscreen). */
export function success() {
  if (enabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
