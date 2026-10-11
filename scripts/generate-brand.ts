import { config as appConfig, setFontconfigFile } from "../src/lib/config";
import { createRequire } from "node:module";
import { brand, brandMarkPath } from "../src/lib/brand";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import sharp from "sharp";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

async function generateBrand() {
  const fontPath = "scripts/assets/dm-sans.ttf";
  if (!appConfig.FONTCONFIG_FILE) {
    const cache = join(tmpdir(), "ramblo-brand-font-cache");
    const fontconfig = join(tmpdir(), "ramblo-brand-fontconfig.xml");
    await mkdir(cache, { recursive: true });
    const escape = (value: string) =>
      value.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
    await writeFile(
      fontconfig,
      `<?xml version="1.0"?><fontconfig><dir>${escape(resolve("scripts/assets"))}</dir><cachedir>${escape(cache)}</cachedir></fontconfig>`,
    );
    setFontconfigFile(fontconfig);
  }
  const css = await readFile("src/app/globals.css", "utf8");
  const color = (name: string) => {
    const value = css.match(
      new RegExp(`--${name}:\\s*(#[a-fA-F0-9]{6});`),
    )?.[1];
    if (!value) throw new Error(`Missing brand color: ${name}`);
    return value;
  };
  const ink = color("foreground"),
    ivory = color("background"),
    primary = color("primary"),
    apricot = color("brand-apricot");
  // Use the font parser bundled with our pinned Next.js version for portable,
  // outlined SVG wordmarks; exported logos do not depend on an installed font.
  type Font = {
    unitsPerEm: number;
    getVariation: (settings: { wght: number }) => Font;
    layout: (text: string) => {
      glyphs: { path: { toSVG: () => string } }[];
      positions: { xAdvance: number; xOffset: number; yOffset: number }[];
    };
  };
  const readFont = createRequire(import.meta.url)(
    "next/dist/compiled/@next/font/dist/fontkit",
  ).default as (buffer: Buffer) => Font;
  const font = readFont(await readFile(fontPath)).getVariation({ wght: 800 });
  const outlineWordmark = (textColor: string, dotColor: string) => {
    const run = font.layout(brand.wordmark),
      scale = 80 / font.unitsPerEm;
    let x = 10;
    return run.glyphs
      .map((glyph, index) => {
        const position = run.positions[index];
        const path = `<path d="${glyph.path.toSVG()}" fill="${index === run.glyphs.length - 1 ? dotColor : textColor}" transform="translate(${x + position.xOffset * scale} ${74 - position.yOffset * scale}) scale(${scale} ${-scale})"/>`;
        x += position.xAdvance * scale - 4.8;
        return path;
      })
      .join("");
  };
  const license = await readFile("public/brand/font-license.txt", "utf8");
  const mark = `<rect width="64" height="64" rx="16" fill="${ink}"/><path d="${brandMarkPath}" fill="none" stroke="${ivory}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="43" cy="47" r="4" fill="${apricot}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><title>${brand.name}</title>${mark}</svg>`;
  const wordmark = (textColor: string, dotColor: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="96" viewBox="0 0 320 96" role="img" aria-label="${brand.wordmark}"><title>${brand.name}</title><metadata><![CDATA[${license}]]></metadata>${outlineWordmark(textColor, dotColor)}</svg>`;
  await mkdir("public/brand", { recursive: true });
  await writeFile("public/brand/mark.svg", svg);
  await writeFile("public/brand/logo.svg", wordmark(ink, primary));
  await writeFile("public/brand/logo-on-dark.svg", wordmark(ivory, apricot));
  await writeFile("src/app/icon.svg", svg);
  await sharp(Buffer.from(svg))
    .resize(512, 512)
    .png()
    .toFile("public/brand/mark.png");
  const textImage = async (text: string, size: number) =>
    sharp({
      text: { text, font: `DM Sans ${size}`, fontfile: fontPath, rgba: true },
    })
      .png()
      .toBuffer();
  const logo = async (textColor: string, dotColor: string, output: string) => {
    const text = await sharp(
      await textImage(
        `<span foreground="${textColor}" weight="ultrabold">ramblo<span foreground="${dotColor}">.</span></span>`,
        160,
      ),
    )
      .resize({ width: 600, height: 172, fit: "inside" })
      .png()
      .toBuffer();
    const metadata = await sharp(text).metadata();
    await sharp({
      create: { width: 640, height: 192, channels: 4, background: "#00000000" },
    })
      .composite([
        {
          input: text,
          left: 20,
          top: Math.round((192 - metadata.height!) / 2),
        },
      ])
      .png()
      .toFile(output);
  };
  await logo(ink, primary, "public/brand/logo.png");
  await logo(ivory, apricot, "public/brand/logo-on-dark.png");
  await sharp(Buffer.from(svg))
    .resize(180, 180)
    .flatten({ background: ink })
    .png()
    .toFile("src/app/apple-icon.png");
  const images = await Promise.all(
    [16, 32, 48].map((size) =>
      sharp(Buffer.from(svg)).resize(size, size).png().toBuffer(),
    ),
  );
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach((image, index) => {
    const at = 6 + 16 * index,
      size = [16, 32, 48][index];
    header[at] = size;
    header[at + 1] = size;
    header.writeUInt16LE(1, at + 4);
    header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(image.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += image.length;
  });
  await writeFile("src/app/favicon.ico", Buffer.concat([header, ...images]));
  const heading = await textImage(
    `<span foreground="${ivory}" weight="ultrabold">ramblo<span foreground="${apricot}">.</span></span>`,
    140,
  );
  const tagline = await textImage(
    `<span foreground="${ivory}">${brand.tagline}</span>`,
    46,
  );
  const caption = await textImage(
    `<span foreground="${apricot}">AI drafts. Your approval.</span>`,
    24,
  );
  await sharp({
    create: { width: 1200, height: 630, channels: 4, background: ink },
  })
    .composite([
      { input: heading, left: 80, top: 100 },
      { input: tagline, left: 84, top: 330 },
      { input: caption, left: 84, top: 470 },
      {
        input: await sharp(Buffer.from(svg)).resize(128, 128).png().toBuffer(),
        left: 992,
        top: 84,
      },
    ])
    .png()
    .toFile("public/brand/social-card.png");
  console.log(
    "Generated Ramblo logos, compact mark, icons, favicon and social card.",
  );
}
void generateBrand().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
