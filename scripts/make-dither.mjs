// Ordered (Bayer 8x8) dithering after Dither it! (https://ditheritv3.netlify.app, github.com/alexharris/ditherit, MIT License, Copyright (c) 2025 Nuxt UI Templates). Re-implemented from the textbook definition; palette from the tokens in src/app/globals.css.
//
// Writes public/textures/storm-front.png: the closing band's storm front, a diagonal ramp from the
// band's blue through white to pink, Bayer-dithered on a 300 x 158 cell grid and shown at 4 x with
// image-rendering: pixelated (.bg-storm-front in globals.css). A 3-colour palette PNG, written with
// node:zlib only. Run: node scripts/make-dither.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { crc32, deflateSync } from "node:zlib";

// Keep in step with src/app/globals.css: --clim-accent, --clim-accent-fg and --clim-pink-500 (the
// .bg-storm-front comment there names these values too). Order matters: each cell only ever picks
// between two neighbours in this list, so pink and blue dots never mix (mixed, they read violet).
const PALETTE = ["#0847f7", "#ffffff", "#f50db4"];

const W = 300;
const H = 158;
// The band anchors the texture left-centre at 4 x in a cell about 540 px wide (135 cells) on
// desktop and 86 on a phone, so the whole front sits in the first ~135 columns; past them it stays
// pink. Positions are in cells along the centre row; LEAN tilts the front like "/" (cells per row).
const LEAN = 0.3;
const BLUE_SOLID = 28; // solid blue up to here: the band's own blue, so its edge dissolves seamlessly
const WHITE_SOLID = 66; // blue dots thin out to white by here
const PINK_START = 74; // a white gap between the last blue dot and the first pink one
const PINK_SOLID = 132; // pink dots fill in to solid pink by here

/** Bayer index matrix of size n (a power of two), values 0..n²-1: M(2n) = [[4M, 4M+2], [4M+3, 4M+1]]. */
function bayer(n) {
  if (n === 1) return [[0]];
  const m = bayer(n / 2);
  const h = n / 2;
  const quadrant = [
    [0, 2],
    [3, 1],
  ];
  return Array.from({ length: n }, (_, y) =>
    Array.from({ length: n }, (_, x) => 4 * m[y % h][x % h] + quadrant[+(y >= h)][+(x >= h)]),
  );
}

const B8 = bayer(8);
const ramp = (d, from, to) => Math.max(0, Math.min(1, (d - from) / (to - from)));

// 2 bits per pixel, 4 pixels per byte; each row starts with filter byte 0 (none).
const rowBytes = Math.ceil(W / 4);
const raw = Buffer.alloc(H * (1 + rowBytes));
const counts = [0, 0, 0];
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const d = x + LEAN * (y - (H - 1) / 2);
    // first half: blue (0) or white (1); second half: white (1) or pink (2)
    const pinkSide = d >= (WHITE_SOLID + PINK_START) / 2;
    const f = pinkSide ? ramp(d, PINK_START, PINK_SOLID) : ramp(d, BLUE_SOLID, WHITE_SOLID);
    const i = +pinkSide + +(f > (B8[y % 8][x % 8] + 0.5) / 64);
    counts[i]++;
    raw[y * (1 + rowBytes) + 1 + (x >> 2)] |= i << (6 - 2 * (x & 3));
  }
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "latin1");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr.set([2, 3, 0, 0, 0], 8); // bit depth 2, colour type 3 (palette), deflate, filter method 0, no interlace
const plte = Buffer.from(PALETTE.flatMap((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))));

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("PLTE", plte),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

mkdirSync(new URL("../public/textures/", import.meta.url), { recursive: true });
writeFileSync(new URL("../public/textures/storm-front.png", import.meta.url), png);
const share = counts.map((c, i) => `${PALETTE[i]} ${Math.round((100 * c) / (W * H))} %`).join(", ");
console.log(`public/textures/storm-front.png: ${W}x${H} cells, ${png.length} B (${share})`);
