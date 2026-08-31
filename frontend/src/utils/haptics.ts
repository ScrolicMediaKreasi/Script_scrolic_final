/**
 * Haptic Feedback Utility for Scrolic Web App
 * Provides subtle tactile feedback on mobile devices and supported browsers.
 */

export type HapticType = 'light' | 'selection' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

export const triggerHaptic = (type: HapticType = 'light'): void => {
  if (typeof window === 'undefined' || !('navigator' in window) || !navigator.vibrate) {
    return;
  }
  try {
    switch (type) {
      case 'light':
      case 'selection':
        navigator.vibrate(8); // Very subtle vibration for menu/tabs
        break;
      case 'medium':
        navigator.vibrate(18); // Button clicks / triggers
        break;
      case 'heavy':
        navigator.vibrate(30); // Action executions
        break;
      case 'success':
        navigator.vibrate([12, 40, 18]); // Double gentle buzz
        break;
      case 'warning':
        navigator.vibrate([20, 60, 20]);
        break;
      case 'error':
        navigator.vibrate([40, 70, 40, 70, 40]);
        break;
      default:
        navigator.vibrate(10);
    }
  } catch (err) {
    // Ignore vibrations not allowed or unsupported in context
  }
};

/**
 * Higher-order function to wrap any click or touch handler with haptic feedback
 */
export const withHaptic = <T extends (...args: any[]) => any>(
  fn?: T,
  type: HapticType = 'light'
) => {
  return (...args: Parameters<T>): ReturnType<T> | undefined => {
    triggerHaptic(type);
    if (fn) {
      return fn(...args);
    }
    return undefined;
  };
};
