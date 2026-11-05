// WCAG 2.x contrast for the theme tokens: hex colours, and rgba fills composited over a surface.

type Rgb = [number, number, number];

function parse(colour: string): { rgb: Rgb; alpha: number } {
  const hex = /^#([0-9a-f]{6})$/i.exec(colour.trim());
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255], alpha: 1 };
  }
  const rgba = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(colour.trim());
  if (rgba) return { rgb: [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])], alpha: rgba[4] === undefined ? 1 : Number(rgba[4]) };
  throw new Error(`Not a #rrggbb or rgba() colour: ${colour}`);
}

/** `colour` painted over the opaque `under`, as #rrggbb. */
export function over(colour: string, under: string): string {
  const top = parse(colour);
  const base = parse(under);
  if (base.alpha !== 1) throw new Error(`${under} is not opaque`);
  const mix = top.rgb.map((c, i) => Math.round(c * top.alpha + base.rgb[i]! * (1 - top.alpha)));
  return `#${mix.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function luminance(colour: string): number {
  const { rgb, alpha } = parse(colour);
  if (alpha !== 1) throw new Error(`${colour} is translucent; composite it first`);
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two opaque colours, 1 to 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
