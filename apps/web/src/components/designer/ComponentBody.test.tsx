import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ComponentBody } from "./ComponentBody";
import type { TextComponent } from "./types";

afterEach(cleanup);

const paragraph = (): TextComponent => {
  const content = "Türkçe bilgi ikinci satır";
  const source = {
    content,
    width: 200,
    fontFamily: "Lato" as const,
    fontSize: 16,
    fontWeight: "normal" as const,
    fontStyle: "normal" as const,
    lineHeight: 1.5,
  };
  return {
    ...source,
    id: "paragraph",
    kind: "text",
    x: 20,
    y: 40,
    height: 48,
    rotation: 0,
    page: 0,
    color: "#000000",
    align: "left",
    textDecoration: "none",
    fontAscent: 0.75,
    importedText: {
      ...source,
      fragments: [
        { start: 0, end: 12, x: 0, baseline: 12, width: 100 },
        { start: 13, end: content.length, x: 0, baseline: 36, width: 100 },
      ],
    },
  };
};

describe("imported paragraphs", () => {
  it.each(['DejaVuSans', 'DejaVuSansMono'] as const)('fits substituted %s to source widths until edited', (fontFamily) => {
    const component = paragraph();
    component.fontFamily = fontFamily;
    component.importedText!.fontFamily = fontFamily;
    component.importedText!.fragments.forEach((fragment) => { fragment.fitWidth = true; });
    const { container, rerender } = render(<ComponentBody component={component} />);
    const texts = container.querySelectorAll('svg text');
    expect([...texts].map((text) => text.getAttribute('textLength'))).toEqual(['100', '100']);
    expect([...texts].every((text) => text.getAttribute('lengthAdjust') === 'spacingAndGlyphs')).toBe(true);
    expect(texts[0].getAttribute('style')).toContain(fontFamily === 'DejaVuSans' ? 'DejaVu Sans' : 'DejaVu Sans Mono');
    rerender(<ComponentBody component={{ ...component, content: 'Edited text' }} />);
    expect(container.querySelector('svg')).toBeNull();
    expect(container.textContent).toBe('Edited text');
  });

  it("uses the bundled DejaVu family for imported text and subsequent edits", () => {
    const component = paragraph();
    component.fontFamily = 'DejaVuSerifCondensed';
    component.importedText!.fontFamily = 'DejaVuSerifCondensed';
    const { container, rerender } = render(<ComponentBody component={component} />);
    expect(container.querySelector('svg text')?.getAttribute('style')).toContain('DejaVu Serif Condensed');
    rerender(<ComponentBody component={{ ...component, content: 'Düzenlenen izin formu' }} />);
    expect(container.querySelector('.whitespace-pre-wrap')?.getAttribute('style')).toContain('DejaVu Serif Condensed');
  });

  it("preserves original baselines in a single component", () => {
    const { container } = render(<ComponentBody component={paragraph()} />);
    const lines = container.querySelectorAll("svg text");
    expect([...lines].map((line) => line.textContent)).toEqual([
      "Türkçe bilgi",
      "ikinci satır",
    ]);
    expect([...lines].map((line) => line.getAttribute("y"))).toEqual([
      "12",
      "36",
    ]);
  });

  for (const patch of [
    { content: "Değiştirilen paragraf" },
    { width: 300 },
    { fontSize: 20 },
    { marks: [{ start: 0, end: 6, fontWeight: "bold" as const }] },
  ])
    it(`restores normal paragraph flow after ${Object.keys(patch)[0]} changes`, () => {
      const component = { ...paragraph(), ...patch };
      const { container } = render(<ComponentBody component={component} />);
      expect(container.querySelector("svg")).toBeNull();
      expect(container.textContent).toBe(component.content);
      expect(container.querySelector(".whitespace-pre-wrap")).not.toBeNull();
    });
});
