/**
 * Shared text editing state (canvas ↔ properties panel).
 * Uses zustand (already a dependency).
 * Holds selection, active surface, and provides toolbar state + apply/toggle.
 */

import { create } from 'zustand';
import type { ContentMarks, Selection, ToolbarState, BaseStyle } from './schema';
import { resolveSelectionStyles } from './selection';
import type { Editor } from '@tiptap/react';
import { applyAttribute, toggleAttribute } from './ops';

export interface TextEditingState {
  /** Currently editing component ID. */
  editingId: string | null;
  /** Which surface is active ('canvas' | 'properties'). */
  activeSurface: 'canvas' | 'properties' | null;
  /** Current selection in content coordinates (null if collapsed/none). */
  selection: Selection | null;
  /** Registered editors (by surface). */
  editors: {
    canvas: Editor | null;
    properties: Editor | null;
  };
  /** Base styles of the editing component (for toolbar resolution). */
  base: BaseStyle | null;
  /** Content+marks of the editing component. */
  model: ContentMarks | null;

  // Actions
  setEditingId: (id: string | null) => void;
  setActiveSurface: (surface: 'canvas' | 'properties' | null) => void;
  setSelection: (selection: Selection | null) => void;
  registerEditor: (surface: 'canvas' | 'properties', editor: Editor | null) => void;
  setBase: (base: BaseStyle | null) => void;
  setModel: (model: ContentMarks | null) => void;

  /** Compute toolbar state from current selection + marks + base. */
  getToolbarState: () => ToolbarState | null;

  /** Apply one attribute over the current selection via the active editor. */
  applyAttribute: (
    attr: 'fontWeight' | 'fontStyle' | 'textDecoration' | 'fontSize' | 'color',
    value: string | number,
  ) => void;

  /** Toggle one attribute over the current selection. */
  toggleAttribute: (
    attr: 'fontWeight' | 'fontStyle' | 'textDecoration' | 'fontSize' | 'color',
    value: string | number,
  ) => void;
}

export const useTextEditingStore = create<TextEditingState>((set, get) => ({
  editingId: null,
  activeSurface: null,
  selection: null,
  editors: { canvas: null, properties: null },
  base: null,
  model: null,

  setEditingId: (id) => set({ editingId: id }),
  setActiveSurface: (surface) => set({ activeSurface: surface }),
  setSelection: (selection) => set({ selection }),
  registerEditor: (surface, editor) =>
    set((state) => ({
      editors: { ...state.editors, [surface]: editor },
    })),
  setBase: (base) => set({ base }),
  setModel: (model) => set({ model }),

  getToolbarState: () => {
    const { selection, base, model } = get();
    if (!selection || !base || !model) return null;
    return resolveSelectionStyles(model.content, model.marks, base, selection);
  },

  applyAttribute: (attr, value) => {
    const state = get();
    if (!state.selection || !state.model || !state.activeSurface) return;

    // Compute new model via ops
    const { model, selection } = state;
    const nextModel = applyAttribute(model, selection, attr, value);

    // Dispatch mark-only transaction on the active editor
    const editor = state.editors[state.activeSurface];
    if (!editor) return;

    // For now, we'll update the model and let the editor reconcile
    // In the full implementation, this would dispatch tr.addMark/removeMark
    // For the initial version, we're taking the simpler path of updating the model
    // and letting the editor's external sync handle it
    set({ model: nextModel });
  },

  toggleAttribute: (attr, value) => {
    const state = get();
    if (!state.selection || !state.model || !state.base || !state.activeSurface) return;

    const { model, selection } = state;
    const nextModel = toggleAttribute(model, selection, attr, value);

    const editor = state.editors[state.activeSurface];
    if (!editor) return;

    set({ model: nextModel });
  },
}));
