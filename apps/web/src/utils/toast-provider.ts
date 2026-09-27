/**
 * Toast Provider Utility
 * Central toast management for error handling across the app
 */

import { setToastFunction } from '../lib/api';

let globalToast: any = null;

/**
 * Initialize global toast function for error handling
 * Call this in your app's root component
 */
export function initializeToastSystem(toast: any) {
  globalToast = toast;
  setToastFunction(toast);
}

/**
 * Get the global toast function
 */
export function getToast() {
  return globalToast;
}

/**
 * Show success toast
 */
export function showSuccess(message: string, title: string = 'Success') {
  if (globalToast) {
    globalToast.show({
      title,
      message,
      color: 'teal',
    });
  }
}

/**
 * Show error toast
 */
export function showError(message: string, title: string = 'Error') {
  if (globalToast) {
    globalToast.show({
      title,
      message,
      color: 'red',
    });
  }
}

/**
 * Show warning toast
 */
export function showWarning(message: string, title: string = 'Warning') {
  if (globalToast) {
    globalToast.show({
      title,
      message,
      color: 'orange',
    });
  }
}

/**
 * Show info toast
 */
export function showInfo(message: string, title: string = 'Info') {
  if (globalToast) {
    globalToast.show({
      title,
      message,
      color: 'blue',
    });
  }
}
