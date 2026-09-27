import { createContext, useContext } from 'react';

export type ToastColor = 'teal' | 'orange' | 'amber' | 'red' | 'gray' | 'blue';

export interface ShowOptions {
  title?: string;
  message?: string;
  color?: ToastColor;
}

export interface ToastItem {
  id: number;
  title?: string;
  message?: string;
  color: ToastColor;
}

export interface ToastApi {
  show: (options: ShowOptions) => void;
}

export const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}
