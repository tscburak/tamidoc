import { useCallback, useEffect, useReducer, useRef } from 'react';

/** Coalesce a burst of rapid edits (a drag, a slider scrub) into one undo step. */
const COALESCE_MS = 350;
/** Bound memory by capping the undo stack depth. */
const MAX_HISTORY = 100;

/**
 * Undo/redo history for a controlled value. Every edit the designer makes flows
 * through `commit` instead of `onChange` directly; the host's `onChange` is still
 * called, but past/future stacks are maintained alongside it so `undo`/`redo`
 * can move through the history. External resets of `value` (PDF import, loading
 * an existing template) clear the stacks so they don't surface as undo steps.
 *
 * `value` remains the single source of truth — this hook only layers history on
 * top of the existing controlled `value`/`onChange` contract.
 */
export function useDesignerHistory<T>(value: T, onChange: (next: T) => void) {
  const pastRef = useRef<T[]>([]);
  const futureRef = useRef<T[]>([]);
  const presentRef = useRef(value);
  presentRef.current = value;

  // Distinguishes designer-driven changes (commit/undo/redo) from external
  // resets. Set true immediately before onChange; the value-effect consumes it.
  const internalRef = useRef(false);
  const lastPushAtRef = useRef(0);

  // past/future live in refs (they can be large, and undo/redo read them from a
  // stable keyboard handler); bump() just forces a re-render for canUndo/Redo.
  const [, bump] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    if (internalRef.current) {
      internalRef.current = false; // designer-driven change — history already updated.
      return;
    }
    // External change → reset history so loading/importing isn't an undo step.
    if (pastRef.current.length || futureRef.current.length) {
      pastRef.current = [];
      futureRef.current = [];
      bump();
    }
  }, [value]);

  /** Record `next` as the present value and push the prior value onto the undo
   * stack (coalesced with the previous edit if it happened within COALESCE_MS). */
  const commit = useCallback(
    (next: T) => {
      const now = Date.now();
      internalRef.current = true;
      futureRef.current = [];
      if (now - lastPushAtRef.current > COALESCE_MS) {
        pastRef.current = [...pastRef.current, presentRef.current].slice(-MAX_HISTORY);
      }
      lastPushAtRef.current = now;
      onChange(next);
      bump();
    },
    [onChange],
  );

  const undo = useCallback(() => {
    if (pastRef.current.length === 0) return;
    const prev = pastRef.current[pastRef.current.length - 1];
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [...futureRef.current, presentRef.current];
    internalRef.current = true;
    onChange(prev);
    bump();
  }, [onChange]);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return;
    const next = futureRef.current[futureRef.current.length - 1];
    futureRef.current = futureRef.current.slice(0, -1);
    pastRef.current = [...pastRef.current, presentRef.current];
    internalRef.current = true;
    onChange(next);
    bump();
  }, [onChange]);

  return {
    commit,
    undo,
    redo,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
  };
}
