// Palette, fonts, slide layouts and drawing helpers for the clim deck ("storm night": dark throughout).
export const C = {
  night: "0E1726",
  surface: "16233A",
  surface2: "1E2E4A",
  ink: "E8EEF7",
  muted: "9FB0C8",
  sky: "5BC0EB",
  amber: "F5A524",
  grey: "8A94A6",
  good: "3DDC97",
  bad: "FF6B6B",
  grid: "2A3A57",
};
export const FONT = "Calibri";
export const W = 13.333;
export const H = 7.5;
export const M = 0.6;

export function defineLayouts(pres) {
  pres.defineSlideMaster({
    title: "TITLE",
    background: { color: C.night },
    objects: [
      { placeholder: { options: { name: "title", type: "title", x: M, y: 2.0, w: W - 2 * M, h: 1.7, fontFace: FONT, fontSize: 96, bold: true, color: C.ink, align: "left", valign: "bottom", margin: 0 }, text: "" } },
      { placeholder: { options: { name: "body", type: "body", x: M, y: 3.85, w: W - 2 * M, h: 0.8, fontFace: FONT, fontSize: 32, color: C.amber, align: "left", valign: "top", margin: 0 }, text: "" } },
    ],
  });
  pres.defineSlideMaster({
    title: "CONTENT",
    background: { color: C.night },
    slideNumber: { x: W - 1.1, y: H - 0.5, w: 0.6, h: 0.3, fontFace: FONT, fontSize: 10, color: C.muted, align: "right" },
    objects: [
      { placeholder: { options: { name: "title", type: "title", x: M, y: 0.35, w: W - 2 * M, h: 0.9, fontFace: FONT, fontSize: 36, bold: true, color: C.ink, align: "left", valign: "middle", margin: 0 }, text: "" } },
      { text: { text: "clim · TOKEN2049 Origins 2026", options: { x: M, y: H - 0.5, w: 5, h: 0.3, fontFace: FONT, fontSize: 10, color: C.muted, margin: 0 } } },
    ],
  });
  pres.defineSlideMaster({
    title: "SECTION",
    background: { color: C.surface },
    objects: [
      { placeholder: { options: { name: "title", type: "title", x: M, y: 2.9, w: W - 2 * M, h: 1.4, fontFace: FONT, fontSize: 60, bold: true, color: C.ink, align: "left", valign: "middle", margin: 0 }, text: "" } },
    ],
  });
}

export function card(pres, slide, { x, y, w, h, heading, body, color = C.amber, fill = C.surface, headSize = 20, bodySize = 15, name }) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.12, fill: { color: fill }, line: { color: fill }, objectName: `${name}-bg` });
  slide.addText(
    [
      { text: heading, options: { bold: true, color, fontSize: headSize, breakLine: true } },
      { text: body, options: { color: C.ink, fontSize: bodySize } },
    ],
    { x: x + 0.25, y: y + 0.2, w: w - 0.5, h: h - 0.4, valign: "top", fontFace: FONT, margin: 0, paraSpaceAfter: 8, isTextBox: true, objectName: name },
  );
}

export function stat(slide, { x, y, w, value, label, color = C.amber, valueSize = 44, name }) {
  slide.addText(
    [
      { text: value, options: { bold: true, color, fontSize: valueSize, breakLine: true } },
      { text: label, options: { color: C.muted, fontSize: 14 } },
    ],
    { x, y, w, h: valueSize / 72 + 0.8, fontFace: FONT, margin: 0, valign: "top", isTextBox: true, objectName: name },
  );
}

export function badge(pres, slide, { x, y, text, color = C.amber, name }) {
  slide.addShape(pres.shapes.OVAL, { x, y, w: 0.5, h: 0.5, fill: { color }, line: { color }, objectName: `${name}-dot` });
  slide.addText(text, { x, y, w: 0.5, h: 0.5, align: "center", valign: "middle", fontFace: FONT, fontSize: 16, bold: true, color: C.night, margin: 0, isTextBox: true, objectName: name });
}

export function arrow(pres, slide, { x, y, w, name }) {
  slide.addShape(pres.shapes.LINE, { x, y, w, h: 0, line: { color: C.muted, width: 2, endArrowType: "triangle" }, objectName: name });
}

export function note(slide, { x, y, w, h = 0.5, text, name, size = 12 }) {
  slide.addText(text, { x, y, w, h, fontFace: FONT, fontSize: size, color: C.muted, margin: 0, valign: "top", isTextBox: true, objectName: name });
}

// A fresh options object per chart: pptxgenjs mutates the options it receives.
export function chartBase(extra) {
  return {
    chartArea: { fill: { color: C.night }, roundedCorners: false },
    plotArea: { fill: { color: C.night } },
    catAxisLabelColor: C.muted,
    valAxisLabelColor: C.muted,
    catAxisLabelFontFace: FONT,
    valAxisLabelFontFace: FONT,
    catAxisLabelFontSize: 11,
    valAxisLabelFontSize: 11,
    valGridLine: { color: C.grid, size: 0.5 },
    catGridLine: { style: "none" },
    catAxisLineShow: false,
    valAxisLineShow: false,
    showLegend: false,
    legendColor: C.ink,
    legendFontFace: FONT,
    legendFontSize: 12,
    dataLabelFontFace: FONT, // pptxgenjs defaults data labels to Arial
    showTitle: true,
    titleColor: C.ink,
    titleFontFace: FONT,
    titleFontSize: 14,
    ...extra,
  };
}
