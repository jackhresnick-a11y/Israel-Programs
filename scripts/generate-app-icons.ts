/**
 * One-off generator for the app icon set -- browser tab, iOS home screen, and
 * Android home screen. Saving the site to a phone home screen used to show the
 * stock create-next-app favicon, because that .ico was the only icon the site
 * shipped: no manifest, no apple-touch-icon, no icon set at any size.
 *
 * Source: public/brand/lion-star-navy.png -- the live header mark
 * (SiteContent.headerLogoUrl). It is a gold Star of David with a cream lion's
 * head on a navy field. Two properties of that file shape this pipeline:
 *
 *   1. Its navy is a subtle radial gradient, not flat, and the PNG has no
 *      transparency (none of the brand PNGs do -- see CLAUDE.md). Rather than
 *      key out the background (which would also dissolve the star's own dark
 *      navy outline, a real part of the artwork), we crop to the star and
 *      re-pad with flat NAVY. The sampled mean of the field navy is
 *      rgb(26,38,63), i.e. the brand NAVY #1a2740 already, so the join is
 *      invisible.
 *   2. It carries a small light-grey four-point sparkle artifact in the bottom
 *      right (an image-generation blemish; the same one appears in
 *      lions-head-black.png). Measured at x 960-1007, y 832-879 -- inside the
 *      square crop, so it is painted out first.
 *
 * Everything below is measured from the pixels at run time and printed, rather
 * than hardcoded, so a future re-run against a revised source file cannot
 * silently produce a mis-cropped icon. The two thresholds are separated by a
 * wide margin in the actual data (see BRIGHT_LUM / DARK_LUM).
 *
 * WRITES (output is committed to the repo -- sharp is a transitive dependency,
 * not a direct one, so this must never become a build step):
 *   app/favicon.ico                        16 + 32 + 48
 *   app/icon.png                           512
 *   app/apple-icon.png                     180
 *   public/icons/icon-192.png              192
 *   public/icons/icon-512.png              512
 *   public/icons/icon-maskable-512.png     512, extra padding for Android
 *
 * Run:
 *   npx tsx scripts/generate-app-icons.ts
 */
import sharp from "sharp";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { NAVY } from "../lib/ogAssets";

const SOURCE = "public/brand/lion-star-navy.png";

/** Above this luminance a pixel is gold or cream artwork. The navy field peaks
 *  around 35, so the gap is wide. */
const BRIGHT_LUM = 110;
/** Below this luminance a pixel is the star's near-black outline. Measured: the
 *  darkest background pixel anywhere in the source is 34.9, so 18 cannot pick
 *  up the vignette. Asserted at run time. */
const DARK_LUM = 18;

/** The sparkle artifact sits well clear of the mark: for y >= 760 the star's
 *  own outline never reaches past x = 660, while the sparkle occupies
 *  x 960-1007, y 832-879. This region brackets it with ~270px of clearance. */
const SPARKLE_REGION = { x: 930, y: 800 };

/** Fraction of the icon's height the star spans. */
const CONTENT_SCALE = 0.82;
/** Android crops maskable icons to a circle of 80% diameter, so the mark needs
 *  to sit further in than it does on a plain square tile. */
const MASKABLE_CONTENT_SCALE = 0.7;

const navy = { r: 26, g: 39, b: 64, alpha: 1 };

function luminance(r: number, g: number, b: number): number {
  return (r * 299 + g * 587 + b * 114) / 1000;
}

type Box = { minX: number; minY: number; maxX: number; maxY: number };

function describe(box: Box): string {
  return `x ${box.minX}-${box.maxX}, y ${box.minY}-${box.maxY} (${
    box.maxX - box.minX + 1
  }x${box.maxY - box.minY + 1})`;
}

async function main() {
  const source = sharp(SOURCE);
  const { width, height } = await source.metadata();
  if (!width || !height) throw new Error(`Could not read dimensions of ${SOURCE}`);
  console.log(`source ${SOURCE} ${width}x${height}`);

  const { data, info } = await sharp(SOURCE)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  const px = (x: number, y: number) => {
    const i = (y * width + x) * ch;
    return [data[i], data[i + 1], data[i + 2]] as const;
  };
  const lum = (x: number, y: number) => luminance(...px(x, y));

  // --- 1. Verify the sparkle paint region holds no real artwork -------------
  let warmInRegion = 0;
  let brightInRegion = 0;
  for (let y = SPARKLE_REGION.y; y < height; y++) {
    for (let x = SPARKLE_REGION.x; x < width; x++) {
      const [r, , b] = px(x, y);
      if (lum(x, y) > BRIGHT_LUM && r - b > 30) warmInRegion++;
      if (lum(x, y) > 50) brightInRegion++;
    }
  }
  if (warmInRegion > 0) {
    throw new Error(
      `Refusing to paint: ${warmInRegion} gold/cream artwork pixels found inside ` +
        `the sparkle region (x>=${SPARKLE_REGION.x}, y>=${SPARKLE_REGION.y}). ` +
        `The source artwork has moved -- re-measure before running.`
    );
  }
  console.log(
    `sparkle region x>=${SPARKLE_REGION.x}, y>=${SPARKLE_REGION.y}: ` +
      `${brightInRegion} artifact px to paint, 0 artwork px (safe)`
  );

  // Paint it flat navy in the raw buffer, before any bbox measurement.
  for (let y = SPARKLE_REGION.y; y < height; y++) {
    for (let x = SPARKLE_REGION.x; x < width; x++) {
      const i = (y * width + x) * ch;
      data[i] = navy.r;
      data[i + 1] = navy.g;
      data[i + 2] = navy.b;
      if (ch === 4) data[i + 3] = 255;
    }
  }

  // --- 2. Measure the mark -------------------------------------------------
  // The threshold must not catch the background vignette, or the bbox blows out
  // to the whole frame.
  let darkestBackground = 255;
  const corner = 120;
  for (const [x0, y0, x1, y1] of [
    [0, 0, corner, corner],
    [width - corner, 0, width, corner],
    [0, height - corner, corner, height],
    [width - corner, height - corner, width, height],
  ]) {
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) darkestBackground = Math.min(darkestBackground, lum(x, y));
    }
  }
  console.log(`darkest background pixel: ${darkestBackground.toFixed(1)} (DARK_LUM=${DARK_LUM})`);
  if (darkestBackground <= DARK_LUM + 6) {
    throw new Error(
      `Background vignette (${darkestBackground.toFixed(1)}) is too close to DARK_LUM ` +
        `(${DARK_LUM}); the outline bbox would pick up background. Re-measure.`
    );
  }

  const empty = (): Box => ({ minX: width, minY: height, maxX: -1, maxY: -1 });
  const bright = empty();
  const dark = empty();
  const grow = (box: Box, x: number, y: number) => {
    if (x < box.minX) box.minX = x;
    if (x > box.maxX) box.maxX = x;
    if (y < box.minY) box.minY = y;
    if (y > box.maxY) box.maxY = y;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const l = lum(x, y);
      if (l > BRIGHT_LUM) grow(bright, x, y);
      if (l < DARK_LUM) grow(dark, x, y);
    }
  }
  console.log(`  gold/cream bbox: ${describe(bright)}`);
  console.log(`  dark outline bbox: ${describe(dark)}`);

  // The full mark is the union: the dark outline rings the gold and extends
  // past it, so cropping to the gold alone would shave the star's points.
  const mark: Box = {
    minX: Math.min(bright.minX, dark.minX),
    minY: Math.min(bright.minY, dark.minY),
    maxX: Math.max(bright.maxX, dark.maxX),
    maxY: Math.max(bright.maxY, dark.maxY),
  };
  console.log(`  full mark bbox: ${describe(mark)}`);

  // --- 3. Square crop centred on the mark ----------------------------------
  const centreX = Math.round((mark.minX + mark.maxX) / 2);
  const centreY = Math.round((mark.minY + mark.maxY) / 2);
  const side = Math.max(mark.maxX - mark.minX + 1, mark.maxY - mark.minY + 1);
  let left = centreX - Math.floor(side / 2);
  let top = centreY - Math.floor(side / 2);
  // Clamp so the crop stays inside the source rather than erroring.
  left = Math.max(0, Math.min(left, width - side));
  top = Math.max(0, Math.min(top, height - side));
  if (side > width || side > height) {
    throw new Error(`Mark (${side}px square) does not fit inside ${width}x${height}`);
  }
  console.log(`  square crop: ${side}x${side} at left=${left}, top=${top} (centre ${centreX},${centreY})`);

  const painted = await sharp(data, { raw: { width, height, channels: ch } }).png().toBuffer();
  const cropped = await sharp(painted)
    .extract({ left, top, width: side, height: side })
    .png()
    .toBuffer();

  // --- 4. Render each size -------------------------------------------------
  /** Downscale the cropped mark and centre it on a flat-navy square. Flat and
   *  fully opaque: iOS applies its own rounded-rect mask and composites a
   *  transparent icon onto black, so a full-bleed opaque tile is what we want. */
  async function render(size: number, scale: number): Promise<Buffer> {
    const inner = Math.round(size * scale);
    const markImage = await sharp(cropped).resize(inner, inner, { fit: "fill" }).toBuffer();
    const offset = Math.round((size - inner) / 2);
    return sharp({
      create: { width: size, height: size, channels: 4, background: navy },
    })
      .composite([{ input: markImage, left: offset, top: offset }])
      .png()
      .toBuffer();
  }

  await mkdir("public/icons", { recursive: true });

  const outputs: Array<{ path: string; size: number; scale: number }> = [
    { path: "app/icon.png", size: 512, scale: CONTENT_SCALE },
    { path: "app/apple-icon.png", size: 180, scale: CONTENT_SCALE },
    { path: "public/icons/icon-192.png", size: 192, scale: CONTENT_SCALE },
    { path: "public/icons/icon-512.png", size: 512, scale: CONTENT_SCALE },
    { path: "public/icons/icon-maskable-512.png", size: 512, scale: MASKABLE_CONTENT_SCALE },
  ];

  for (const { path, size, scale } of outputs) {
    const buf = await render(size, scale);
    await writeFile(path, buf);
    console.log(`wrote ${path} (${size}x${size}, mark at ${Math.round(scale * 100)}%)`);
  }

  // --- 5. favicon.ico ------------------------------------------------------
  // sharp cannot write .ico, so assemble the container by hand. Entries are
  // PNG-compressed, which every browser (and Windows Vista+) reads.
  const icoSizes = [16, 32, 48];
  const pngs = await Promise.all(icoSizes.map((s) => render(s, CONTENT_SCALE)));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(icoSizes.length, 4);

  let offset = 6 + 16 * icoSizes.length;
  const entries: Buffer[] = [];
  for (let i = 0; i < icoSizes.length; i++) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(icoSizes[i] === 256 ? 0 : icoSizes[i], 0); // width
    entry.writeUInt8(icoSizes[i] === 256 ? 0 : icoSizes[i], 1); // height
    entry.writeUInt8(0, 2); // palette size
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(pngs[i].length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += pngs[i].length;
  }
  const ico = Buffer.concat([header, ...entries, ...pngs]);
  await writeFile(join("app", "favicon.ico"), ico);
  console.log(`wrote app/favicon.ico (${icoSizes.join(" + ")}, ${ico.length} bytes)`);

  console.log(`\nbackground: NAVY ${NAVY}`);
  console.log("done -- inspect the 512s before committing.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
