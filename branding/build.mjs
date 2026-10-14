import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';
const dir = path.dirname(fileURLToPath(import.meta.url));
const blue = '#237DC5', grey = '#788187', dark = '#1F2933';
const body = 'M112 64H304V160H280V352H400V448H112V352H184V160H112Z';
const fold = 'M304 64L400 160H304Z';
// One-colour versions draw the body and fold as a single outline, so no hairline shows where they meet.
const solidBody = 'M112 64H304L400 160H304H280V352H400V448H112V352H184V160H112Z';
const mark = (color = blue, second = grey) => color === second ? `<path fill="${color}" d="${solidBody}"/>` : `<path fill="${color}" d="${body}"/><path fill="${second}" d="${fold}"/>`;
const thumbnailMark = (color, second) => color === second ? `<path fill="${color}" d="M102.4 51.2H307.2L409.6 153.6H307.2H281.6V358.4H409.6V460.8H102.4V358.4H179.2V153.6H102.4Z"/>` : `<path fill="${color}" d="M102.4 51.2H307.2V153.6H281.6V358.4H409.6V460.8H102.4V358.4H179.2V153.6H102.4Z"/><path fill="${second}" d="M307.2 51.2L409.6 153.6H307.2Z"/>`;
const svg = (name, box, content) => `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}" role="img" aria-label="${name}">\n${content}\n</svg>\n`;
const write = (name, data) => fs.writeFile(path.join(dir, name), data);
for (const [name, content] of [
  ['invantra-symbol.svg', mark()], ['invantra-symbol-white.svg', mark('#FFFFFF', '#FFFFFF')],
  ['invantra-symbol-dark.svg', mark(dark, dark)], ['favicon.svg', mark()],
  ['concept-a.svg', mark()],
  ['concept-b.svg', `<path fill="${blue}" d="M112 64H304L400 160V448H112Z"/><path fill="#FFFFFF" d="M168 272H280V224L360 304L280 384V336H168Z"/>`],
  ['concept-c.svg', `<path fill="${grey}" d="M96 64H304V112H144V352H96Z M160 128H368V176H208V416H160Z"/><path fill="${blue}" d="M224 192H336L416 272V448H224Z"/>`]
]) await write(name, svg('Invantra', '0 0 512 512', content));
for (const [name, bg, content] of [
  ['invantra-thumbnail.svg', blue, thumbnailMark('#FFFFFF', '#FFFFFF')],
  ['invantra-thumbnail-light.svg', '#FFFFFF', thumbnailMark(blue, grey)]
]) await write(name, svg('Invantra marketplace thumbnail', '0 0 512 512', `<path fill="${bg}" d="M0 0H512V512H0Z"/>${content}`));
const fontBytes = await fs.readFile(path.join(dir, 'fonts/OpenSans-Semibold.woff'));
const font = opentype.parse(fontBytes.buffer.slice(fontBytes.byteOffset, fontBytes.byteOffset + fontBytes.byteLength));
const word = font.getPath('Invantra', 365, 208, 164, { kerning: true });
await write('invantra-wordmark.svg', svg('Invantra wordmark', '0 0 700 220', `<path fill="${dark}" d="${font.getPath('Invantra', 18, 166, 164, { kerning: true }).toPathData(1)}"/>`));
await write('invantra-logo-horizontal.svg', svg('Invantra', '0 0 1200 300', `<path fill="${blue}" d="M85 30H205V90H190V210H265V270H85V210H130V90H85Z"/><path fill="${grey}" d="M205 30L265 90H205Z"/><path fill="${dark}" d="${word.toPathData(1)}"/>`));
await write('apple-touch-icon.svg', svg('Invantra app icon', '0 0 512 512', `<path fill="${blue}" d="M0 0H512V512H0Z"/>${thumbnailMark('#FFFFFF', '#FFFFFF')}`));
console.log('SVG sources built; wordmark outlined with Open Sans Semibold.');
