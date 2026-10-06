/** Design tokens for canvases, which take colours and family names but not CSS variables. */
export type CanvasTokens = { fg: string; ember: string; brass: string; ivory: string; display: string; ui: string };

export function canvasTokens(el: Element): CanvasTokens {
  const cs = getComputedStyle(el);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    fg: v("--clim-fg", "#202020"),
    ember: v("--clim-ember", "#ff682c"),
    brass: v("--clim-brass", "#816729"),
    ivory: v("--clim-ivory", "#ebe6dd"),
    display: v("--font-inter-tight", "system-ui"),
    ui: v("--font-inter", "system-ui"),
  };
}
