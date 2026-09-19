// Generates the PWA icons from an inline SVG. Run: node scripts/icons.mjs
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";

const BG = "#2563eb";

// lucide "package" glyph, 24x24 viewBox, stroke-based.
const GLYPH = `
  <path d="m7.5 4.27 9 5.15"/>
  <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
  <path d="M12 22V12"/>
  <path d="m3.3 7 8.7 5 8.7-5"/>`;

function svg({ size, radius, glyphScale }) {
  const glyphSize = size * glyphScale;
  const offset = (size - glyphSize) / 2;
  const scale = glyphSize / 24;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" rx="${radius}" fill="${BG}"/>
    <g transform="translate(${offset} ${offset}) scale(${scale})" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${GLYPH}</g>
  </svg>`;
}

async function write(path, options) {
  await sharp(Buffer.from(svg(options))).png().toFile(path);
  console.log("wrote", path);
}

await mkdir("public/icons", { recursive: true });
await write("public/icons/icon-192.png", { size: 192, radius: 40, glyphScale: 0.62 });
await write("public/icons/icon-512.png", { size: 512, radius: 108, glyphScale: 0.62 });
await write("public/icons/icon-maskable-192.png", { size: 192, radius: 0, glyphScale: 0.5 });
await write("public/icons/icon-maskable-512.png", { size: 512, radius: 0, glyphScale: 0.5 });
await write("src/app/icon.png", { size: 512, radius: 108, glyphScale: 0.62 });
await write("src/app/apple-icon.png", { size: 180, radius: 0, glyphScale: 0.56 });

// favicon.ico: a single 48x48 PNG wrapped in an ICO container (supported by all modern browsers).
const faviconPng = await sharp(Buffer.from(svg({ size: 48, radius: 10, glyphScale: 0.62 }))).png().toBuffer();
const header = Buffer.alloc(6 + 16);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(1, 4); // image count
header.writeUInt8(48, 6); // width
header.writeUInt8(48, 7); // height
header.writeUInt8(0, 8); // palette
header.writeUInt8(0, 9); // reserved
header.writeUInt16LE(1, 10); // color planes
header.writeUInt16LE(32, 12); // bits per pixel
header.writeUInt32LE(faviconPng.length, 14); // image size
header.writeUInt32LE(header.length, 18); // image offset
await writeFile("src/app/favicon.ico", Buffer.concat([header, faviconPng]));
console.log("wrote src/app/favicon.ico");
