import { createRequire } from "node:module";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import sharp from "sharp";
import { brand } from "../src/lib/brand";

// Sources, committed as delivered by design:
//   public/brand/mark.svg          symbol for light grounds (pine-900)
//   public/brand/mark-on-dark.svg  symbol for dark grounds (sun-400)
//   public/brand/app-icon.svg      sun tile; favicons, app icons, small marks
// Everything else here is generated from them and the Fredoka wordmark.
const ink = "#1B2620"; // pine-900
const cream = "#F4EFE3";
const sun = "#FFC531"; // sun-400

type Glyph = { path: { toSVG: () => string } };
type Font = {
  unitsPerEm: number;
  layout: (text: string) => {
    glyphs: Glyph[];
    positions: { xAdvance: number; xOffset: number; yOffset: number }[];
    bbox: { minX: number; minY: number; maxX: number; maxY: number };
  };
};
// Next.js bundles fontkit; it reads WOFF (not WOFF2), so outlines come from
// the static @fontsource packages and logos never depend on installed fonts.
const readFont = createRequire(__filename)(
  "next/dist/compiled/@next/font/dist/fontkit",
).default as (buffer: Buffer) => Font;
const font = async (file: string) => readFont(await readFile(file));

/** Outlined text as SVG paths. Returns the markup and its visual box. */
function outline(
  face: Font,
  text: string,
  size: number,
  x: number,
  baseline: number,
  fill: string,
) {
  const run = face.layout(text);
  const scale = size / face.unitsPerEm;
  let cursor = x;
  const paths = run.glyphs
    .map((glyph, index) => {
      const p = run.positions[index];
      const d = glyph.path.toSVG();
      const tx = cursor + p.xOffset * scale;
      cursor += p.xAdvance * scale;
      return d
        ? `<path d="${d}" transform="translate(${tx.toFixed(2)} ${(baseline - p.yOffset * scale).toFixed(2)}) scale(${scale.toFixed(5)} ${(-scale).toFixed(5)})"/>`
        : "";
    })
    .join("");
  return {
    svg: `<g fill="${fill}">${paths}</g>`,
    top: baseline - run.bbox.maxY * scale,
    bottom: baseline - run.bbox.minY * scale,
    right: x + run.bbox.maxX * scale,
  };
}
const inner = (svg: string) =>
  svg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");

async function generateBrand() {
  const fredoka = await font(
    "node_modules/@fontsource/fredoka/files/fredoka-latin-600-normal.woff",
  );
  const figtree = await font(
    "node_modules/@fontsource/figtree/files/figtree-latin-500-normal.woff",
  );
  const mark = inner(await readFile("public/brand/mark.svg", "utf8"));
  const markOnDark = inner(
    await readFile("public/brand/mark-on-dark.svg", "utf8"),
  );
  const appIcon = await readFile("public/brand/app-icon.svg", "utf8");
  const license = await readFile(
    "node_modules/@fontsource/fredoka/LICENSE",
    "utf8",
  );
  await writeFile("public/brand/font-license.txt", license);

  // Lockup: 600-unit symbol, then the wordmark centred on it. The gap is
  // the wordmark's "o" height, the clear space the brand guide asks for.
  const lockup = (symbol: string, text: string) => {
    const size = 520;
    const probe = outline(fredoka, "o", size, 0, 0, text);
    const gap = probe.bottom - probe.top;
    const word = outline(fredoka, brand.wordmark, size, 600 + gap, 0, text);
    const shift = 300 - (word.top + word.bottom) / 2;
    const placed = outline(
      fredoka,
      brand.wordmark,
      size,
      600 + gap,
      shift,
      text,
    );
    const width = Math.ceil(placed.right + 8);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 600" width="${width}" height="600" role="img" aria-label="${brand.name}"><title>${brand.name}</title><metadata><![CDATA[Wordmark outlined from Fredoka SemiBold.\n${license}]]></metadata>${symbol}${placed.svg}</svg>`;
  };
  const logo = lockup(mark, ink);
  const logoOnDark = lockup(markOnDark, cream);
  await mkdir("public/brand", { recursive: true });
  await writeFile("public/brand/logo.svg", logo);
  await writeFile("public/brand/logo-on-dark.svg", logoOnDark);
  // Emails can't rely on SVG; 64px tall at 2x for crisp 32px display.
  for (const [svg, file] of [
    [logo, "public/brand/logo.png"],
    [logoOnDark, "public/brand/logo-on-dark.png"],
  ])
    await sharp(Buffer.from(svg)).resize({ height: 128 }).png().toFile(file);

  await writeFile("src/app/icon.svg", appIcon);
  await sharp(Buffer.from(appIcon))
    .resize(512, 512)
    .png()
    .toFile("public/brand/app-icon.png");
  // iOS masks its own corners, so the square tile goes full-bleed.
  await sharp(Buffer.from(appIcon.replace(/rx="[^"]*"/, 'rx="0"')))
    .resize(180, 180)
    .png()
    .toFile("src/app/apple-icon.png");
  const sizes = [16, 32, 48];
  const images = await Promise.all(
    sizes.map((size) =>
      sharp(Buffer.from(appIcon)).resize(size, size).png().toBuffer(),
    ),
  );
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach((image, index) => {
    const at = 6 + 16 * index;
    header[at] = sizes[index];
    header[at + 1] = sizes[index];
    header.writeUInt16LE(1, at + 4);
    header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(image.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += image.length;
  });
  await writeFile("src/app/favicon.ico", Buffer.concat([header, ...images]));

  // Social card: a full sun block, the house marketing composition.
  const headline = outline(fredoka, brand.tagline, 120, 80, 400, ink);
  const caption = outline(
    figtree,
    "Talk it through. Ramblo posts it.",
    40,
    84,
    500,
    ink,
  );
  const card = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="${sun}"/><g transform="translate(80 80) scale(0.1333)">${inner(logo)}</g>${headline.svg}${caption.svg}</svg>`;
  await sharp(Buffer.from(card)).png().toFile("public/brand/social-card.png");

  await rm("public/brand/mark.png", { force: true });
  console.log(
    "Generated Ramblo lockups, app icons, favicon and social card from public/brand sources.",
  );
}
void generateBrand().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
