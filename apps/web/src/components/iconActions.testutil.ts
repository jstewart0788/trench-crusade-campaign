export interface IconAction {
  tag: "button" | "a";
  glyph: string;
  /** The accessible name (aria-label). */
  name: string;
  /** The tooltip text. */
  tip: string;
  attrs: Record<string, string>;
  /** The glyph and tooltip are hidden from assistive tech, so the name comes from aria-label alone. */
  decorationHidden: boolean;
  /** The glyph's drawing: the markup inside its <svg>. */
  drawing: string;
}

const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/** Every IconButton / IconLink in server-rendered markup, in document order. */
export function iconActions(html: string): IconAction[] {
  return [...html.matchAll(/<(button|a)\b([^>]*\bdata-glyph="[^"]*"[^>]*)>([\s\S]*?)<\/\1>/g)].map(([, tag, rawAttrs, inner]) => {
    const attrs = Object.fromEntries([...rawAttrs!.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, k, v]) => [k!, decode(v!)]));
    const tip = /<span\b([^>]*)>([^<]*)<\/span>/.exec(inner!);
    const svg = /<svg\b([^>]*)>([\s\S]*?)<\/svg>/.exec(inner!);
    return {
      tag: tag as "button" | "a",
      glyph: attrs["data-glyph"]!,
      name: attrs["aria-label"] ?? "",
      tip: tip ? decode(tip[2]!) : "",
      attrs,
      decorationHidden: !!svg?.[1]!.includes('aria-hidden="true"') && !!tip?.[1]!.includes('aria-hidden="true"'),
      drawing: svg?.[2] ?? "",
    };
  });
}

/** Remove and Undo controls: what takes kit off a model or un-stages it. */
export const removeControls = (html: string) => iconActions(html).filter((a) => a.tip === "Remove" || a.tip === "Undo").length;

/** useId output depends on tree position; compare markup without it. */
export const withoutIds = (html: string) => html.replace(/ (id|aria-controls)="[^"]*"/g, "");
