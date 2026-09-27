/**
 * Inline rich text editor using TipTap (ProseMirror).
 * Renders with identical CSS to ComponentBody → no visual difference when entering edit mode.
 */

import { useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import type { Editor } from '@tiptap/react';
import type { BaseStyle, ContentMarks, Selection } from './schema';
import { modelToDoc, docToModel } from './serializer';
import { allExtensions } from './tiptap';

export interface InlineTextEditorProps {
  /** Current component content+marks. */
  model: ContentMarks;
  /** Base component styles (for resolving active/inactive). */
  base: BaseStyle;
  /** Width of the component (for container CSS). */
  width: number;
  /** Called on every transaction (debounced, composition-aware) with serialized model. */
  onTransientChange?: (next: ContentMarks) => void;
  /** Called when the editor session ends (blur/unmount with delay). */
  onSessionEnd?: () => void;
  /** Called when selection changes (content coordinates). */
  onSelectionChange?: (selection: Selection | null) => void;
  /** Surface identifier (canvas or properties). */
  surface: 'canvas' | 'properties';
}

const TRANSIENT_DEBOUNCE_MS = 50;

/**
 * Re-tokenize inserted text to convert `{{name}}` patterns into token nodes.
 * Called after plain-text paste.
 */
function retokenize(editor: Editor, insertedText: string) {
  const { from } = editor.state.selection;
  // Scan for {{...}} patterns and replace with token nodes
  const tokenRegex = /\{\{([^}]+)\}\}/g;
  let match;
  let pos = from;
  const tr = editor.state.tr;

  while ((match = tokenRegex.exec(insertedText)) !== null) {
    const tokenName = match[1];
    const tokenStart = pos + match.index;
    const tokenEnd = tokenStart + match[0].length;
    // Replace the text range with a token node
    tr.delete(tokenStart, tokenEnd);
    // Insert token atom
    const tokenNode = editor.state.schema.nodes['token'].create({ name: tokenName });
    tr.insert(tokenStart, tokenNode);
    pos = tokenEnd;
  }

  if (tr.docChanged) {
    editor.view.dispatch(tr);
  }
}

function fontWeightToCSS(fw: string): number {
  return fw === 'bold' ? 700 : fw === 'semibold' ? 600 : fw === 'medium' ? 500 : 400;
}

export function InlineTextEditor({
  model,
  base,
  width,
  onTransientChange,
  onSessionEnd,
  onSelectionChange,
  surface,
}: InlineTextEditorProps) {
  const transientTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSerializedRef = useRef<ContentMarks>(model);

  const editor = useEditor({
    extensions: [
      ...allExtensions,
    ],
    content: modelToDoc(model, base),
    editorProps: {
      attributes: {
        class: 'tiptap-editor',
        style: `
          font-family: 'Lato', system-ui, sans-serif;
          font-size: ${base.fontSize}px;
          line-height: ${base.lineHeight ?? 1.4};
          color: ${base.color};
          font-weight: ${fontWeightToCSS(base.fontWeight)};
          font-style: ${base.fontStyle === 'italic' ? 'italic' : 'normal'};
          text-decoration: ${base.textDecoration === 'underline' ? 'underline' : 'none'};
          text-align: ${base.align ?? 'left'};
          white-space: pre-wrap;
          word-break: break-words;
          width: ${width}px;
          padding: 0;
          margin: 0;
        `,
      },
      handlePaste: (view, event) => {
        // Prevent default HTML paste
        event.preventDefault();
        // Get plain text
        const text = event.clipboardData?.getData('text/plain') || '';
        if (!text) return true;

        const { from, to, $from } = view.state.selection;
        const tr = view.state.tr;

        // Insert text
        tr.insertText(text, from, to);

        // Apply current selection's effective marks to inserted text
        const marks = view.state.storedMarks || $from.marks();
        for (const mark of marks) {
          tr.addMark(from, from + text.length, mark);
        }

        view.dispatch(tr);

        // Re-tokenize to convert {{name}} patterns
        const fakeEditor = { view, state: view.state } as Editor;
        setTimeout(() => {
          retokenize(fakeEditor, text);
        }, 0);

        return true;
      },
    },
    onUpdate: ({ editor }) => {
      // Clear pending transient commit
      if (transientTimerRef.current) {
        clearTimeout(transientTimerRef.current);
        transientTimerRef.current = null;
      }

      // Skip if composition is ongoing (IME)
      if (editor.view.composing) return;

      // Serialize and schedule transient commit
      const serialized = docToModel(editor.state.doc as any);
      lastSerializedRef.current = serialized;

      transientTimerRef.current = setTimeout(() => {
        onTransientChange?.(serialized);
      }, TRANSIENT_DEBOUNCE_MS);
    },
    onSelectionUpdate: ({ editor }) => {
      // Skip if composition is ongoing
      if (editor.view.composing) return;

      const { from, to, empty } = editor.state.selection;
      if (empty) {
        onSelectionChange?.(null);
      } else {
        // Map ProseMirror positions to content offsets (approximate for now)
        onSelectionChange?.({ start: from, end: to });
      }
    },
    onBlur: () => {
      // Delay session end to allow toolbar clicks to process
      if (sessionEndTimerRef.current) {
        clearTimeout(sessionEndTimerRef.current);
      }
      sessionEndTimerRef.current = setTimeout(() => {
        onSessionEnd?.();
      }, 200);
    },
    onFocus: () => {
      // Cancel session end if we refocus
      if (sessionEndTimerRef.current) {
        clearTimeout(sessionEndTimerRef.current);
        sessionEndTimerRef.current = null;
      }
    },
  }, [model, base, width]); // Only re-init if these change

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (transientTimerRef.current) clearTimeout(transientTimerRef.current);
      if (sessionEndTimerRef.current) clearTimeout(sessionEndTimerRef.current);
      onSessionEnd?.();
    };
  }, []);

  // Sync external model changes (foreign reconciliation)
  useEffect(() => {
    if (!editor) return;
    const incoming = JSON.stringify(model);
    const current = JSON.stringify(lastSerializedRef.current);
    if (incoming === current) return;

    // Model changed externally (undo/redo, or properties panel update)
    const newDoc = modelToDoc(model, base);
    editor.commands.setContent(newDoc, { emitUpdate: false });
    lastSerializedRef.current = model;
  }, [model, base, editor]);

  if (!editor) return null;

  return (
    <div className="inline-text-editor" data-surface={surface}>
      <style>{`
        .tiptap-editor p {
          margin: 0;
        }
      `}</style>
      <EditorContent editor={editor} />
    </div>
  );
}
