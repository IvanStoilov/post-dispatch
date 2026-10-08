import { readFile, writeFile, mkdir } from "node:fs/promises";
import sharp from "sharp";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { brandMarkPath } from "../src/lib/brand";

async function generateBrand() {
  // Keep font generation self-contained when the host has no Fontconfig setup.
  if (!process.env.FONTCONFIG_FILE) {
    const cache = join(tmpdir(), "postdispatch-brand-font-cache");
    const config = join(tmpdir(), "postdispatch-brand-fontconfig.xml");
    await mkdir(cache, { recursive: true });
    const fontDir = resolve("node_modules/@fontsource-variable/manrope/files");
    const xml = (value: string) =>
      value.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
    await writeFile(
      config,
      `<?xml version="1.0"?><fontconfig><dir>${xml(fontDir)}</dir><cachedir>${xml(cache)}</cachedir></fontconfig>`,
    );
    process.env.FONTCONFIG_FILE = config;
  }
  const css = await readFile("src/app/globals.css", "utf8");
  const color = (name: string) => {
    const match = css.match(new RegExp(`--${name}:\\s*(#[a-fA-F0-9]{6});`));
    if (!match) throw new Error(`Missing brand color: ${name}`);
    return match[1];
  };
  const teal = color("primary"),
    ink = color("foreground"),
    white = color("primary-foreground");
  const fontPath =
    "node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2";
  const font = (await readFile(fontPath)).toString("base64");
  const fontLicense = await readFile(
    "node_modules/@fontsource-variable/manrope/LICENSE",
    "utf8",
  );
  const mark = `<rect width="64" height="64" rx="16" fill="${teal}"/><path d="${brandMarkPath}" fill="${white}" fill-rule="evenodd"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><title>PostDispatch</title>${mark}</svg>`;
  const wordmark = (textColor: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="496" height="96" viewBox="0 0 496 96"><title>PostDispatch</title><metadata><![CDATA[${fontLicense}]]></metadata><style>@font-face{font-family:PostDispatchManrope;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:200 800}text{font-family:PostDispatchManrope,sans-serif;font-weight:650;letter-spacing:-1.6px}</style><g transform="translate(8 8) scale(1.25)">${mark}</g><text x="108" y="65" font-size="52" fill="${textColor}">PostDispatch</text></svg>`;
  await mkdir("public/brand", { recursive: true });
  await writeFile("public/brand/font-license.txt", fontLicense);
  await writeFile("public/brand/mark.svg", svg);
  await writeFile("public/brand/logo.svg", wordmark(ink));
  await writeFile("public/brand/logo-on-dark.svg", wordmark(white));
  await writeFile("src/app/icon.svg", svg);
  await sharp(Buffer.from(svg))
    .resize(512, 512)
    .png()
    .toFile("public/brand/mark.png");
  // Raster wordmark uses the same bundled font, without a remote font dependency.
  const text = await sharp({
    text: {
      text:
        '<span foreground="' + ink + '" weight="semibold">PostDispatch</span>',
      font: "Manrope 104",
      fontfile: fontPath,
      rgba: true,
    },
  })
    .png()
    .toBuffer();
  const textMeta = await sharp(text).metadata();
  const logo = await sharp({
    create: {
      width: 992,
      height: 192,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: await sharp(Buffer.from(svg)).resize(160, 160).png().toBuffer(),
        left: 16,
        top: 16,
      },
      { input: text, left: 216, top: Math.round((192 - textMeta.height!) / 2) },
    ])
    .png()
    .toBuffer();
  await writeFile("public/brand/logo.png", logo);
  await sharp(Buffer.from(svg))
    .resize(180, 180)
    .flatten({ background: teal })
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
  console.log(
    "Created logo, mark, SVG favicon, 16/32/48px ICO, and 180px Apple icon.",
  );
}
void generateBrand().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
