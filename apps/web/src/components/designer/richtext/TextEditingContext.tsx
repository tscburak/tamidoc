/**
 * React context for shared text editing state.
 * Wraps the zustand store for easy consumption in components.
 */

import { createContext, useContext, type ReactNode } from 'react';
import { useTextEditingStore, type TextEditingState } from './textEditingStore';
import type { Editor } from '@tiptap/react';
import type { BaseStyle, ContentMarks, Selection } from './schema';

const TextEditingContext = createContext<TextEditingState | null>(null);

export interface TextEditingProviderProps {
  children: ReactNode;
}

export function TextEditingProvider({ children }: TextEditingProviderProps) {
  // The zustand store is already a singleton; we just need to expose it via context
  const store = useTextEditingStore();

  return <TextEditingContext.Provider value={store}>{children}</TextEditingContext.Provider>;
}

/** Hook to access the text editing store. Throws if used outside provider. */
export function useTextEditing(): TextEditingState {
  const context = useContext(TextEditingContext);
  if (!context) {
    throw new Error('useTextEditing must be used within TextEditingProvider');
  }
  return context;
}

/** Convenience hook for components that only need to read toolbar state. */
export function useToolbarState() {
  const store = useTextEditingStore();
  return store.getToolbarState();
}

/** Convenience hook for registering an editor (canvas or properties). */
export function useRegisterEditor(surface: 'canvas' | 'properties', editor: Editor | null) {
  const store = useTextEditingStore();
  store.registerEditor(surface, editor);
}

/** Convenience hook for updating the current editing component's model. */
export function useUpdateEditingModel() {
  const store = useTextEditingStore();

  return (model: ContentMarks, base: BaseStyle, id: string) => {
    store.setModel(model);
    store.setBase(base);
    store.setEditingId(id);
  };
}

/** Convenience hook for reporting selection changes. */
export function useReportSelection() {
  const store = useTextEditingStore();
  return (selection: Selection | null) => {
    store.setSelection(selection);
  };
}
