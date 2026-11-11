import { Color } from 'three';

/**
 * Site colors for 3D scenes. They are read from the CSS custom properties below, so scenes
 * follow `src/styles/tokens.css`. Those tokens must stay plain hex values: three.js cannot
 * parse every CSS color syntax (oklch(), color-mix(), var() chains).
 *
 * The three meaning colors are a legend shared by every scene and the page text:
 * `signal` is electrical stimulation, `spike` is neural firing, `decode` is models and decoding.
 */
export interface Palette {
  text: Color;
  muted: Color;
  signal: Color;
  spike: Color;
  decode: Color;
}

const TOKENS: Record<keyof Palette, string> = {
  text: '--color-text',
  muted: '--color-text-muted',
  signal: '--color-signal',
  spike: '--color-spike',
  decode: '--color-decode',
};

/** Reads the palette as computed on `element`, so a section can override tokens locally. */
export function readPalette(element: Element = document.documentElement): Palette {
  const style = getComputedStyle(element);
  const palette = {} as Palette;
  for (const [key, token] of Object.entries(TOKENS) as [keyof Palette, string][]) {
    const value = style.getPropertyValue(token).trim();
    if (!value) console.warn(`Palette token ${token} is not defined; using white.`);
    palette[key] = new Color(value || '#ffffff');
  }
  return palette;
}
