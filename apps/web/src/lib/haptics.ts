import { isNative } from './platform';

type Kind = 'tap' | 'turn' | 'error' | 'heavy' | 'success';

/** Vibração curta: plugin nativo no app, `navigator.vibrate` no Android web; nada no iOS web. */
export async function haptic(kind: Kind, enabled: boolean): Promise<void> {
  if (!enabled) return;
  try {
    if (isNative) {
      const { Haptics, ImpactStyle, NotificationType } = await import('@capacitor/haptics');
      if (kind === 'success') await Haptics.notification({ type: NotificationType.Success });
      else if (kind === 'error') await Haptics.notification({ type: NotificationType.Warning });
      else
        await Haptics.impact({
          style: kind === 'heavy' ? ImpactStyle.Heavy : kind === 'turn' ? ImpactStyle.Medium : ImpactStyle.Light,
        });
      return;
    }
    const pattern = { tap: 8, turn: [12, 40, 12], error: [30, 40, 30], heavy: 45, success: [15, 30, 15, 30, 40] }[kind];
    navigator.vibrate?.(pattern);
  } catch {
    /* sem vibração disponível */
  }
}
