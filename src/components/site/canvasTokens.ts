/** Design tokens for canvases, which take colours and family names but not CSS variables. */
export type CanvasTokens = {
  fg: string;
  signal: string;
  deep: string;
  wash: string;
  sigma: string;
  lcdBg: string;
  lcdLit: string;
  lcdHot: string;
  display: string;
  ui: string;
};

export function canvasTokens(el: Element): CanvasTokens {
  const cs = getComputedStyle(el);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    fg: v("--clim-fg", "#0e1119"),
    signal: v("--clim-signal", "#0847f7"),
    deep: v("--clim-deep", "#1a2b6b"),
    wash: v("--clim-wash", "#eff6ff"),
    sigma: v("--clim-sigma", "#f50db4"),
    lcdBg: v("--clim-lcd-bg", "#0e1119"),
    lcdLit: v("--clim-lcd-lit", "#cadcf6"),
    lcdHot: v("--clim-lcd-hot", "#ff37c7"),
    display: v("--font-inter-tight", "system-ui"),
    ui: v("--font-inter", "system-ui"),
  };
}
