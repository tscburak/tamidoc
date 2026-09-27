/**
 * Rich text schema contracts for TipTap ↔ content+marks bridge.
 * Pure types — no React, no TipTap imports here.
 */

import type { FontWeight, FontStyle, TextDecoration, TextMark } from '../types';

/** Per-attribute resolved state for the toolbar. */
export type StyleState = 'active' | 'inactive' | 'mixed';

/** Toolbar state for one attribute. */
export interface AttributeState {
  /** Resolved state over the current selection. */
  state: StyleState;
  /** Active value (when state !== 'inactive'). */
  value?: string | number;
}

/** Full toolbar state (all five attributes). */
export interface ToolbarState {
  fontWeight: AttributeState;
  fontStyle: AttributeState;
  textDecoration: AttributeState;
  fontSize: AttributeState;
  color: AttributeState;
}

/** Effective style at a single character position (matches ComponentBody logic). */
export interface EffectiveStyle {
  fontWeight: FontWeight;
  fontStyle: FontStyle;
  textDecoration: TextDecoration;
  fontSize: number;
  color: string;
}

/** Base component style (for resolving active/inactive). */
export interface BaseStyle {
  fontWeight: FontWeight;
  fontStyle: FontStyle;
  textDecoration: TextDecoration;
  fontSize: number;
  color: string;
  lineHeight?: number;
  align?: 'left' | 'center' | 'right' | 'justify';
}

/** Content + marks model (the stored format). Uses TextMark[] from types.ts. */
export interface ContentMarks {
  content: string;
  marks?: TextMark[];
}

/** Selection in content coordinates. */
export interface Selection {
  start: number;
  end: number;
}
