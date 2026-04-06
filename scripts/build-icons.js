// scripts/build-icons.js
// ESM: run with `node scripts/build-icons.js`
// Requires: sharp, icon-gen
import sharp from 'sharp';
import iconGen from 'icon-gen';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { mkdir } from 'fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcJpg = resolve(__dirname, '../app/games/high-speed-memory/images/thumbnail.jpg');
const outDir = resolve(__dirname, '../assets/icons');
const sourcePng = resolve(outDir, 'source.png');
const iconPng = resolve(outDir, 'icon.png');

async function main() {
  await mkdir(outDir, { recursive: true });
  // 1. Convert JPG to 1024x1024 PNG
  await sharp(srcJpg).resize(1024, 1024).png().toFile(sourcePng);
  // 2. Generate .icns and .ico from PNG
  await iconGen(sourcePng, outDir, {
    report: true,
    modes: ['icns', 'ico'],
    names: {
      icns: 'icon',
      ico: 'icon',
    },
  });
  // 3. Generate 512x512 PNG for Linux
  await sharp(sourcePng).resize(512, 512).png().toFile(iconPng);
  console.log('Icons generated in', outDir);
}

main().catch((err) => { console.error(err); process.exit(1); });
