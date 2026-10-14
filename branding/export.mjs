import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
const dir = path.dirname(fileURLToPath(import.meta.url));
const jobs = [];
for (const name of ['invantra-thumbnail', 'invantra-thumbnail-light']) {
  for (const size of [1024, 512, 256, 120]) jobs.push([`${name}.svg`, `${name}-${size}.png`, size, size]);
}
jobs.push(['invantra-logo-horizontal.svg', 'invantra-logo-horizontal-1200x300.png', 1200, 300]);
for (const size of [32, 16]) jobs.push(['favicon.svg', `favicon-${size}.png`, size, size]);
jobs.push(['apple-touch-icon.svg', 'apple-touch-icon.png', 180, 180]);
for (const [source, output, width, height] of jobs) {
  await sharp(await fs.readFile(path.join(dir, source)), { density: 384 }).resize(width, height).png().toFile(path.join(dir, output));
  const info = await sharp(path.join(dir, output)).metadata();
  if (info.width !== width || info.height !== height || !info.hasAlpha) throw new Error(`Invalid export: ${output}`);
  console.log(`${output}: ${width} × ${height}`);
}
