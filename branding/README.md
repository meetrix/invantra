# Invantra brand assets

Open `preview.html` locally to review the three concepts, selected concept A, and every visual asset on light and dark backgrounds. Asset links open the original files. PNGs display at native sizes; large images scroll within their panels.

Concept A is a folded document shaped into a capital I. Its main strokes are 96 units in a 512-unit square (6 pixels at 32 px, 3 pixels at 16 px). Its folded corner becomes part of the silhouette in single-colour versions. Concept B explores forward motion; concept C explores stacked workflow stages. These are original constructions, not traced references.

The marketplace symbol spans 60% of the square width and 80% of the height, leaving 10% minimum clear space. The Apple icon uses the same white-on-blue treatment with square corners; the operating system applies its own mask. The horizontal logo and wordmark use outlined Open Sans Semibold, licensed under the SIL Open Font License; see `fonts/OFL.txt`.

## Export PNGs

With Node.js installed, run `sh export.sh` from any directory. It installs the pinned dependencies if missing, then renders the checked-in SVGs with Sharp. On Windows without a POSIX shell, run `npm ci --prefix branding` and `node branding/export.mjs` from the project root. No font installation is required for PNG exports.

`build.mjs` documents the geometric sources and wordmark outlining. To regenerate SVGs run `node branding/build.mjs`; it uses the bundled licensed font in `fonts/`. PNG exports are independently reproducible from the SVGs.

All symbol SVGs have transparent backgrounds. Blue/white thumbnails have opaque backgrounds. Use the white symbol on dark backgrounds; use the dark symbol on light backgrounds. The full-colour symbol and dark wordmark are intended primarily for light backgrounds.

The app's `public/favicon.svg` and `public/apple-touch-icon.png` are copies of the files here; copy them
again after changing the symbol.
