#!/usr/bin/env node
// Writes the logo of BunnyWarfare in its levels of detail (docs/logo and src/BunnyWarfare.Module/wwwroot/img/logo, the favicon of wwwroot):
//   mark      the full mark (64 x 64): a cheeky bunny head with a helmet, one ear bent, a carrot crossed behind it
//   favicon   the small mark (32 x 32): head, ears and helmet only, thicker shapes, no carrot (it would be mush at 16 px)
//   maskable  the mark without corners, the content inside the safe zone (Android adaptive icons)
//   mono      one colour (currentColor) for places that tint it
//   logo      the mark with the word mark (light surfaces), logo-dark (dark surfaces)
//   hero      the large picture of the start page: the mark on a hill with the word mark beside it
// It also writes the app's icon sprite (wwwroot/img/app-icons.svg): the mark and a few icons of the game as line icons (24 x 24, like Lucide).
// The PNG icons are made from these files with scripts/icons.ps1 (Edge headless).
//   node scripts/logo.js
const fs = require('fs');
const path = require('path');

const accent = '#c2410c';      // carrot orange (white on it 5.2:1)
const accentLight = '#fb923c'; // the accent on dark surfaces
const leaf = '#3f8f2f';
const fur = '#f6f1ea';
const furShade = '#d9cfc2';
const ear = '#f0a8a0';
const helmet = '#55603a';
const helmetLight = '#6c7a48';
const dark = '#2a1f17';
const root = path.join(__dirname, '..');

// a carrot along the x axis: the tip at (0,0), the wide end at x = 34, the leaves beyond it
const carrot =
  `<path d="M0 0 L31 -5.5 Q35 -5.5 35 0 Q35 5.5 31 5.5 Z" fill="${accentLight}" stroke="${dark}" stroke-width="1.6" stroke-linejoin="round"/>` +
  `<path d="M12 -2.4 l3 1.6 M20 1 l3.4 1.8 M24 -3.6 l3 1.6" stroke="${dark}" stroke-width="1.2" stroke-linecap="round" fill="none"/>` +
  `<path d="M34 -2 Q41 -9 45 -6 Q40 -3 35 -1 Z M34.5 0 Q43 0 46 3 Q40 4.5 34.5 1.6 Z M34 2 Q38 9 35 12 Q33 7 33 3 Z" fill="${leaf}" stroke="${dark}" stroke-width="1.3" stroke-linejoin="round"/>`;

// the bunny of the full mark (64 x 64, without its background)
const bunny = [
  // ears (behind the helmet): the left one upright, the right one bent over
  `<ellipse cx="23" cy="18" rx="5.6" ry="13.5" transform="rotate(-10 23 18)" fill="${fur}" stroke="${dark}" stroke-width="1.6"/>`,
  `<ellipse cx="23" cy="19" rx="2.4" ry="9.5" transform="rotate(-10 23 19)" fill="${ear}"/>`,
  `<path d="M36.5 31 C35.5 22 37.5 14 42 11.5 C47 9 54 11.5 56.5 17.5 C57.6 20.4 55 22.2 52.3 19.6 C49.8 17.2 46.6 17.6 46 22.5 C45.6 26 45.6 29 45.6 31 Z" fill="${fur}" stroke="${dark}" stroke-width="1.6" stroke-linejoin="round"/>`,
  `<path d="M40.2 29 C39.6 22.5 40.8 17 43.6 15 C46.6 13 50.4 13.6 52.6 16.4 C49 14.8 45.2 15.6 43.8 19.4 C42.8 22.4 42.6 26 42.6 29 Z" fill="${ear}"/>`,
  // head and cheeks
  `<ellipse cx="32" cy="43.5" rx="15.5" ry="12.5" fill="${fur}" stroke="${dark}" stroke-width="1.6"/>`,
  `<ellipse cx="22.5" cy="49" rx="3.2" ry="2" fill="${ear}" opacity=".7"/>`,
  `<ellipse cx="41.5" cy="49" rx="3.2" ry="2" fill="${ear}" opacity=".7"/>`,
  // helmet: dome, band, brim
  `<path d="M15.5 38.5 C15.5 27 23 21.5 32 21.5 C41 21.5 48.5 27 48.5 38.5 Z" fill="${helmet}" stroke="${dark}" stroke-width="1.6" stroke-linejoin="round"/>`,
  `<path d="M20 28.5 C24 25.5 28 24.6 32 24.6" stroke="${helmetLight}" stroke-width="2" stroke-linecap="round" fill="none"/>`,
  `<rect x="12.5" y="36.5" width="39" height="4.6" rx="2.3" fill="${helmet}" stroke="${dark}" stroke-width="1.6"/>`,
  // face: a squinting left eye, an open right eye, the nose and the two front teeth
  `<path d="M23.4 46 q2.6 -2.2 5.2 0" stroke="${dark}" stroke-width="1.9" stroke-linecap="round" fill="none"/>`,
  `<circle cx="38.2" cy="45.6" r="2.5" fill="${dark}"/><circle cx="39" cy="44.8" r=".8" fill="#fff"/>`,
  `<path d="M30 49.4 h4 l-2 2.2 z" fill="${ear}" stroke="${dark}" stroke-width="1" stroke-linejoin="round"/>`,
  `<path d="M32 51.6 v1.2 M30.2 52.8 h3.6 v3 h-3.6 z M32 52.8 v3" stroke="${dark}" stroke-width="1" fill="#fff" stroke-linejoin="round"/>`,
].join('');

// the inside of the 64 x 64 mark: the carrot crossed behind the bunny, from the lower left to the right
const markShapes = `<g transform="translate(4 56) rotate(-18) scale(1.25)">${carrot}</g>` + bunny;

// the small mark (32 x 32): no carrot, no details, thick outlines
const faviconShapes = [
  `<ellipse cx="11" cy="9.5" rx="3.6" ry="8" transform="rotate(-10 11 9.5)" fill="${fur}" stroke="${dark}" stroke-width="1.4"/>`,
  `<path d="M18 16 C17.4 10.5 18.6 6 21.6 5 C24.6 4 28 5.8 28.8 9.4 C29.2 11 27.6 11.8 26.2 10.4 C25 9.2 23.4 9.6 23.2 12 C23 13.8 23 15 23 16 Z" fill="${fur}" stroke="${dark}" stroke-width="1.4" stroke-linejoin="round"/>`,
  `<ellipse cx="16" cy="22.5" rx="8.6" ry="7.3" fill="${fur}" stroke="${dark}" stroke-width="1.4"/>`,
  `<path d="M7 19.5 C7 13.5 11 10.8 16 10.8 C21 10.8 25 13.5 25 19.5 Z" fill="${helmet}" stroke="${dark}" stroke-width="1.4" stroke-linejoin="round"/>`,
  `<rect x="5.2" y="18.2" width="21.6" height="3.2" rx="1.6" fill="${helmet}" stroke="${dark}" stroke-width="1.4"/>`,
  `<circle cx="12.6" cy="24.3" r="1.6" fill="${dark}"/><circle cx="19.4" cy="24.3" r="1.6" fill="${dark}"/>`,
  `<path d="M14.8 26.8 h2.4 l-1.2 1.4 z" fill="${dark}"/>`,
].join('');

// one colour: the silhouette, the face cut out
const monoShapes =
  `<defs><mask id="bw-mono-face"><rect width="64" height="64" fill="#fff"/>` +
  `<path d="M23.4 46 q2.6 -2.2 5.2 0" stroke="#000" stroke-width="2" stroke-linecap="round" fill="none"/>` +
  `<circle cx="38.2" cy="45.6" r="2.5" fill="#000"/><path d="M30 49.4 h4 l-2 2.2 z" fill="#000"/>` +
  `<path d="M14.5 41.4 h35" stroke="#000" stroke-width="1.2"/></mask></defs>` +
  `<g mask="url(#bw-mono-face)">` +
  `<ellipse cx="23" cy="18" rx="5.6" ry="13.5" transform="rotate(-10 23 18)"/>` +
  `<path d="M36.5 31 C35.5 22 37.5 14 42 11.5 C47 9 54 11.5 56.5 17.5 C57.6 20.4 55 22.2 52.3 19.6 C49.8 17.2 46.6 17.6 46 22.5 C45.6 26 45.6 29 45.6 31 Z"/>` +
  `<ellipse cx="32" cy="43.5" rx="15.5" ry="12.5"/>` +
  `<path d="M15.5 38.5 C15.5 27 23 21.5 32 21.5 C41 21.5 48.5 27 48.5 38.5 Z"/><rect x="12.5" y="36.5" width="39" height="4.6" rx="2.3"/>` +
  `</g>` +
  `<g transform="translate(4 56) rotate(-18) scale(1.25)" opacity=".55"><path d="M0 0 L31 -5.5 Q35 -5.5 35 0 Q35 5.5 31 5.5 Z M34 -2 Q41 -9 45 -6 Q40 -3 35 -1 Z M34.5 0 Q43 0 46 3 Q40 4.5 34.5 1.6 Z"/></g>`;

function svg(viewBox, body, extra = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"${extra} role="img" aria-label="BunnyWarfare">\n  ${body}\n</svg>\n`;
}

function wordmark(text, warfare) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 212 40" width="212" height="40" role="img" aria-label="BunnyWarfare">\n` +
    `  <rect x="2" y="2" width="36" height="36" rx="8" fill="${accent}"/><g transform="translate(2 2) scale(0.5625)">${markShapes}</g>\n` +
    `  <text x="47" y="28.5" font-family="'Segoe UI','Helvetica Neue',Arial,sans-serif" font-size="22" font-weight="800" letter-spacing="-0.4" fill="${text}">Bunny<tspan fill="${warfare}">Warfare</tspan></text>\n</svg>\n`;
}

const hero =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 256" width="512" height="256" role="img" aria-label="BunnyWarfare">\n` +
  `  <defs>\n` +
  `    <linearGradient id="bw-hero-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b2219"/><stop offset="1" stop-color="#1b1712"/></linearGradient>\n` +
  `    <linearGradient id="bw-hero-hill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4f9a3a"/><stop offset="1" stop-color="#2f6b26"/></linearGradient>\n` +
  `  </defs>\n` +
  `  <rect width="512" height="256" rx="24" fill="url(#bw-hero-sky)"/>\n` +
  `  <circle cx="440" cy="52" r="22" fill="${accentLight}" opacity=".25"/>\n` +
  // a shell flying over, with its trail
  `  <path d="M236 76 Q330 14 432 62" stroke="${fur}" stroke-width="2" stroke-dasharray="2 7" stroke-linecap="round" fill="none" opacity=".5"/>\n` +
  `  <g transform="translate(446 70) rotate(207) scale(.9)">${carrot}</g>\n` +
  // the hill with the crater
  `  <path d="M0 210 C70 168 150 170 214 196 C250 210 268 206 292 198 C350 178 430 186 512 214 V232 A24 24 0 0 1 488 256 H24 A24 24 0 0 1 0 232 Z" fill="url(#bw-hero-hill)"/>\n` +
  `  <path d="M232 202 Q252 214 272 202" stroke="#2a4f1f" stroke-width="3" fill="none" stroke-linecap="round"/>\n` +
  // the mark, large, on the hill
  `  <g transform="translate(36 40) scale(2.6)"><rect width="64" height="64" rx="14" fill="${accent}"/>${markShapes}</g>\n` +
  `  <text x="222" y="128" font-family="'Segoe UI','Helvetica Neue',Arial,sans-serif" font-size="46" font-weight="800" letter-spacing="-1" fill="${fur}">Bunny</text>\n` +
  `  <text x="222" y="172" font-family="'Segoe UI','Helvetica Neue',Arial,sans-serif" font-size="46" font-weight="800" letter-spacing="-1" fill="${accentLight}">Warfare</text>\n` +
  `</svg>\n`;

const files = {
  'bunnywarfare-mark.svg': svg('0 0 64 64', `<rect width="64" height="64" rx="14" fill="${accent}"/>\n  ${markShapes}`),
  'bunnywarfare-favicon.svg': svg('0 0 32 32', `<rect width="32" height="32" rx="7" fill="${accent}"/>\n  ${faviconShapes}`),
  'bunnywarfare-maskable.svg': svg('0 0 64 64', `<rect width="64" height="64" fill="${accent}"/>\n  <g transform="translate(9.6 9.6) scale(0.7)">${markShapes}</g>`),
  'bunnywarfare-mono.svg': svg('0 0 64 64', monoShapes, ' fill="currentColor"'),
  'bunnywarfare-logo.svg': wordmark(dark, accent),
  'bunnywarfare-logo-dark.svg': wordmark(fur, accentLight),
  'bunnywarfare-hero.svg': hero,
};

for (const dir of [path.join(root, 'docs', 'logo'), path.join(root, 'src', 'BunnyWarfare.Module', 'wwwroot', 'img', 'logo')]) {
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content);
  }
}

fs.writeFileSync(path.join(root, 'src', 'BunnyWarfare.Module', 'wwwroot', 'favicon.svg'), files['bunnywarfare-favicon.svg']);

// ---- the sprite of the app: line icons 24 x 24 (stroke currentColor, width 2, round caps and joins), ids mat-i-* next to the toolkit's ----
const line = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const symbols = {
  // the mark: ears, helmet, face
  bunnywarfare:
    `<path d="M8.5 9.5 7 3.5a1.6 1.6 0 0 1 3-.8l1.2 6"/>` +
    `<path d="M13.6 9 14.6 4c.5-2 3.6-2.2 4.4-.3.4.9-.4 1.6-1.2 1.2l-1.4 4.4"/>` +
    `<path d="M5 13a7 5 0 0 1 14 0"/><path d="M3.5 13h17"/>` +
    `<path d="M5.5 13.5a6.5 6.5 0 0 0 13 0"/><path d="M10 16.5h.01M14 16.5h.01"/><path d="m11.3 18.8.7.6.7-.6"/>`,
  carrot:
    `<path d="M2.3 21.7S9 19.6 14.6 14c2-2 2.2-5 .2-7s-5-1.8-7 .2C2.2 12.8.1 19.5.1 19.5"/>` +
    `<path d="m8.6 9.6 1.8 1.8M11 15l1.6 1.6M5.3 14.4l1.3 1.3"/>` +
    `<path d="M15 9s1-4 4-6M15 9s3-1 6-.5M15 9s.5-3.5-.5-6.5"/>`,
  bunny:
    `<path d="M9 10 7.4 3.6a1.7 1.7 0 0 1 3.2-.9L12 9"/><path d="M15 10l1.6-6.4a1.7 1.7 0 0 0-3.2-.9L12 9"/>` +
    `<circle cx="12" cy="15" r="6"/><path d="M10 14h.01M14 14h.01"/><path d="m11 17 1 .8 1-.8"/>`,
  crosshair:
    `<circle cx="12" cy="12" r="8"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><circle cx="12" cy="12" r="1"/>`,
  'globe-map':
    `<path d="M2 19h20"/><path d="M2 19 8 9l4 5 3-4 7 9"/><path d="M8 9l1.6 2.6M15 10l1.3 1.7"/><circle cx="17.5" cy="5.5" r="2"/>`,
  swords:
    `<path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="m13 19 6-6M16 16l4 4M19 21l2-2"/>` +
    `<path d="M14.5 6.5 18 3h3v3l-3.5 3.5"/><path d="m5 14 4 4M7 17l-3 3M3 19l2 2"/>`,
  trophy:
    `<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/>` +
    `<path d="M10 14.7V17c0 .6-.5 1-1 1.2C7.8 18.8 7 20.2 7 22"/><path d="M14 14.7V17c0 .6.5 1 1 1.2 1.2.6 2 2 2 3.8"/>` +
    `<path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>`,
};

// do not shadow an icon the toolkit already has
const toolkit = fs.readFileSync(path.join(root, 'src', 'BunnyWarfare.Module', 'wwwroot', 'img', 'matui-icons.svg'), 'utf8');
const sprite = Object.entries(symbols)
  .filter(([name]) => !toolkit.includes(`id="mat-i-${name}"`))
  .map(([name, body]) => `  <symbol id="mat-i-${name}" viewBox="0 0 24 24" ${line}>${body}</symbol>`)
  .join('\n');
fs.writeFileSync(path.join(root, 'src', 'BunnyWarfare.Module', 'wwwroot', 'img', 'app-icons.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">\n${sprite}\n</svg>\n`);

console.log('logo and sprite written');
