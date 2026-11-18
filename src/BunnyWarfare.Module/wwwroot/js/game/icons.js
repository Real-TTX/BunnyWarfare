// Drawn pictures of the player app (inline SVG, our own): the weapons, a bunny avatar in a team colour, the badge of a lobby seat and the big logo.
import { html } from './ui.js';

const S = '#3b2414';

const WEAPONS = {
    // carrot launcher: a carrot rocket with leafy fins
    Projectile: `<svg class="wico" viewBox="0 0 48 48" aria-hidden="true">
        <path d="M30 18 8 42c-1 1 0 2 1 1l24-21z" fill="#f97316" stroke="${S}" stroke-width="2.6" stroke-linejoin="round"/>
        <path d="M17 32l3 3M21 27l3 3M25 23l2 2" stroke="${S}" stroke-width="2" stroke-linecap="round"/>
        <path d="M31 17c2-6 7-10 13-10-1 6-4 11-10 13zM29 15c-1-5 0-9 4-12 2 4 2 9-1 12zM34 21c4-1 8 1 10 4-4 1-8 0-10-2z" fill="#4fa83a" stroke="${S}" stroke-width="2.4" stroke-linejoin="round"/>
    </svg>`,
    // beet grenade: a round purple bulb with leaves and a fuse spark
    Grenade: `<svg class="wico" viewBox="0 0 48 48" aria-hidden="true">
        <path d="M24 44c-9 0-15-7-15-15 0-7 6-13 15-13s15 6 15 13c0 8-6 15-15 15z" fill="#8e2a6e" stroke="${S}" stroke-width="2.6"/>
        <path d="M24 44v4" stroke="${S}" stroke-width="2.4" stroke-linecap="round"/>
        <path d="M17 24c2-2 5-3 8-3" stroke="#d76aa8" stroke-width="2.6" stroke-linecap="round"/>
        <path d="M24 16c-3-5-8-8-14-8 2 6 7 9 14 8zM24 16c1-6 5-10 11-12 0 6-4 11-11 12z" fill="#4fa83a" stroke="${S}" stroke-width="2.4" stroke-linejoin="round"/>
        <circle cx="38" cy="10" r="3.4" fill="#ffd34d" stroke="${S}" stroke-width="2"/>
    </svg>`,
    // cabbage cluster: a leafy ball
    Cluster: `<svg class="wico" viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="26" r="17" fill="#7cc755" stroke="${S}" stroke-width="2.6"/>
        <path d="M24 9c-6 6-6 28 0 34M24 9c6 6 6 28 0 34M9 22c8 3 22 3 30 0M10 32c8 4 20 4 28 0" fill="none" stroke="#3f8f2f" stroke-width="2.2" stroke-linecap="round"/>
        <circle cx="12" cy="11" r="3" fill="#a6e27e" stroke="${S}" stroke-width="2"/>
        <circle cx="38" cy="9" r="2.5" fill="#a6e27e" stroke="${S}" stroke-width="2"/>
    </svg>`,
    // dandelion shotgun: a seed head with flying seeds
    Hitscan: `<svg class="wico" viewBox="0 0 48 48" aria-hidden="true">
        <path d="M14 44c2-10 4-18 8-24" fill="none" stroke="#4fa83a" stroke-width="3.2" stroke-linecap="round"/>
        <circle cx="23" cy="17" r="11" fill="#fffdf2" stroke="${S}" stroke-width="2.4"/>
        <path d="M23 17l-8-6M23 17l9-5M23 17l10 3M23 17l3 10M23 17l-9 4M23 17l-1-11" stroke="#c9b48a" stroke-width="1.8" stroke-linecap="round"/>
        <circle cx="23" cy="17" r="2.6" fill="#ffd34d" stroke="${S}" stroke-width="1.8"/>
        <path d="M39 9l5-2M40 16l6 0M38 23l5 2" stroke="${S}" stroke-width="2.2" stroke-linecap="round"/>
    </svg>`,
    // carrot rain: carrots falling from a little cloud
    Airstrike: `<svg class="wico" viewBox="0 0 48 48" aria-hidden="true">
        <path d="M10 18c-4 0-6-3-5-6 1-3 4-4 7-3 1-4 5-6 9-5 3 1 5 3 5 6 3-1 7 1 7 4 0 3-2 4-5 4z" fill="#fff" stroke="${S}" stroke-width="2.4" stroke-linejoin="round"/>
        <path d="M14 24l4 0-2 14z" fill="#f97316" stroke="${S}" stroke-width="2.2" stroke-linejoin="round"/>
        <path d="M28 22l4 0-2 18z" fill="#f97316" stroke="${S}" stroke-width="2.2" stroke-linejoin="round"/>
        <path d="M38 28l3.6 0-1.8 12z" fill="#f97316" stroke="${S}" stroke-width="2.2" stroke-linejoin="round"/>
        <path d="M16 24c-1-2-1-3 0-4M30 22c-1-2-1-3 0-4M40 28c-1-2-1-3 0-4" stroke="#4fa83a" stroke-width="2.4" stroke-linecap="round"/>
    </svg>`,
    // Hasenloch: a hole in the ground with two bunny ears popping out, a shovel beside it
    Teleport: `<svg class="wico" viewBox="0 0 48 48" aria-hidden="true">
        <ellipse cx="22" cy="38" rx="16" ry="6" fill="#5a3f26" stroke="${S}" stroke-width="2.4"/>
        <ellipse cx="22" cy="37" rx="11" ry="3.6" fill="#2a1a0e"/>
        <path d="M16 36c-2-8-2-16 1-20 3 3 4 12 3 20zM24 36c0-8 2-16 6-19 2 4 0 13-3 19z" fill="#f4efe7" stroke="${S}" stroke-width="2.2" stroke-linejoin="round"/>
        <path d="M17.5 33c-.6-5-.4-10 .8-13M26 33c.6-5 1.8-10 3.4-12" stroke="#f5a9b8" stroke-width="2" stroke-linecap="round"/>
        <path d="M40 6l-6 22" stroke="#8a5a2b" stroke-width="3" stroke-linecap="round"/>
        <path d="M33 26l-3 9c2 2 5 1 6-1l1-8z" fill="#f97316" stroke="${S}" stroke-width="2.2" stroke-linejoin="round"/>
        <path d="M6 20l3 2M5 27l4 0M37 38l4 1" stroke="${S}" stroke-width="2" stroke-linecap="round"/>
    </svg>`,
    // golden giant carrot (crates only): the carrot in gold with sparkles
    Golden: `<svg class="wico" viewBox="0 0 48 48" aria-hidden="true">
        <path d="M31 17 7 43c-1 1 0 2 1 1l26-22z" fill="#ffcc33" stroke="${S}" stroke-width="2.6" stroke-linejoin="round"/>
        <path d="M17 33l3 3M21 28l3 3M25 23l3 3" stroke="#c98a00" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M14 34l12-13" stroke="#fff4b8" stroke-width="2" stroke-linecap="round"/>
        <path d="M32 16c2-6 7-10 13-10-1 6-4 11-10 13zM30 14c-1-5 0-9 4-12 2 4 2 9-1 12zM35 20c4-1 8 1 10 4-4 1-8 0-10-2z" fill="#4fa83a" stroke="${S}" stroke-width="2.4" stroke-linejoin="round"/>
        <path d="M8 10l1.6 3.6L13 15l-3.4 1.4L8 20l-1.6-3.6L3 15l3.4-1.4zM40 32l1 2.4 2.4 1-2.4 1-1 2.4-1-2.4-2.4-1 2.4-1z" fill="#fff07a" stroke="${S}" stroke-width="1.6" stroke-linejoin="round"/>
    </svg>`,
};

/** The icon of a weapon by its kind (the golden carrot by its name). */
export function weaponIcon(kind, name = '') {
    if (kind === 'Projectile' && /gold/i.test(name)) return html(WEAPONS.Golden);
    return html(WEAPONS[kind] ?? WEAPONS.Projectile);
}

/** A cute bunny head with a helmet in the team colour (for chips, the podium, the profile). */
export function bunnyAvatar(color = '#c2410c', { wink = false } = {}) {
    return html(`<svg viewBox="0 0 100 100" aria-hidden="true" style="--team:${color}">
        <rect width="100" height="100" fill="${color}" opacity=".22"/>
        <path class="bun-ear" d="M33 46c-8-14-9-32-2-38 7-2 13 16 13 34z"/>
        <path class="bun-inner" d="M35 40c-4-10-5-22-2-27 3 0 7 12 7 24z"/>
        <path class="bun-ear" d="M58 44c3-15 12-31 21-32 5 5-4 22-12 34z"/>
        <path class="bun-inner" d="M61 40c3-10 9-21 15-23 2 4-4 15-10 22z"/>
        <ellipse class="bun-body" cx="50" cy="66" rx="30" ry="26"/>
        <path class="bun-helmet" d="M22 56c0-17 12-26 28-26s28 9 28 26c-8-4-18-6-28-6s-20 2-28 6z"/>
        <path d="M20 57c10-5 20-6 30-6s20 1 30 6" fill="none" stroke="${S}" stroke-width="4" stroke-linecap="round"/>
        ${wink
            ? `<path d="M34 66c3-3 7-3 10 0" fill="none" stroke="${S}" stroke-width="4" stroke-linecap="round"/>`
            : `<circle cx="39" cy="66" r="5.2" fill="${S}"/><circle cx="40.6" cy="64.4" r="1.7" fill="#fff"/>`}
        <circle cx="61" cy="66" r="5.2" fill="${S}"/><circle cx="62.6" cy="64.4" r="1.7" fill="#fff"/>
        <path d="M46 74h8l-4 4z" fill="#f28aa0" stroke="${S}" stroke-width="2.4" stroke-linejoin="round"/>
        <path d="M50 78v5M46 83h8" stroke="${S}" stroke-width="2.4" stroke-linecap="round"/>
        <rect x="46.5" y="83" width="7" height="6" rx="1.5" fill="#fff" stroke="${S}" stroke-width="2"/>
        <circle cx="30" cy="76" r="4" fill="#f7a6b8" opacity=".7"/><circle cx="70" cy="76" r="4" fill="#f7a6b8" opacity=".7"/>
    </svg>`);
}

/** The badge of a lobby seat: a rounded hexagon in the team colour with a bunny or a robot inside. */
export function seatBadge(color, bot = false, free = false) {
    const fill = free ? '#e9dccb' : color;
    const inner = free
        ? `<path d="M50 34v32M34 50h32" stroke="#a8927a" stroke-width="7" stroke-linecap="round"/>`
        : bot
            ? `<rect x="33" y="38" width="34" height="28" rx="8" fill="#fff" stroke="${S}" stroke-width="4"/><circle cx="43" cy="51" r="4" fill="${S}"/><circle cx="57" cy="51" r="4" fill="${S}"/><path d="M50 38v-8" stroke="${S}" stroke-width="4" stroke-linecap="round"/><circle cx="50" cy="28" r="4" fill="#ffd34d" stroke="${S}" stroke-width="3"/>`
            : `<path d="M41 44c-4-8-4-17 0-20 4 0 6 10 6 18zM55 42c2-9 6-17 10-17 3 3-1 13-5 19z" fill="#fff" stroke="${S}" stroke-width="3.6" stroke-linejoin="round"/><ellipse cx="50" cy="56" rx="15" ry="13" fill="#fff" stroke="${S}" stroke-width="4"/><circle cx="45" cy="55" r="2.6" fill="${S}"/><circle cx="55" cy="55" r="2.6" fill="${S}"/><path d="M48 61h4l-2 2z" fill="#f28aa0"/>`;
    return html(`<svg class="hexbadge" viewBox="0 0 100 100" aria-hidden="true">
        <path d="M50 6 88 28v44L50 94 12 72V28z" fill="${S}" transform="translate(0 4)"/>
        <path d="M50 6 88 28v44L50 94 12 72V28z" fill="${fill}" stroke="${S}" stroke-width="6" stroke-linejoin="round"/>
        <path d="M50 14 80 31v8L50 22 20 39v-8z" fill="#fff" opacity=".25"/>
        ${inner}
    </svg>`);
}

/** The big logo of the menu: the mark between bouncing sparks over the word mark and a ribbon. */
let logos = 0;

export function logo(tagline = 'LÖFFEL HOCH · KAROTTEN LOS!') {
    // every copy gets its own gradient ids: a removed copy must not take the colours of the others with it
    const id = `lg${++logos}`;
    return html(`<div class="logo" aria-label="BunnyWarfare" role="img">
      <svg viewBox="0 0 1000 440" aria-hidden="true">
        <defs>
          <linearGradient id="${id}-carrot" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#ffd09a"/><stop offset=".45" stop-color="#ff8a2a"/><stop offset="1" stop-color="#d9480f"/>
          </linearGradient>
          <linearGradient id="${id}-cream" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#ffe2bf"/>
          </linearGradient>
        </defs>
        <g class="spark"><path d="M170 70l8 20 20 8-20 8-8 20-8-20-20-8 20-8z" fill="#fff6cf" stroke="#3b2414" stroke-width="5" stroke-linejoin="round"/></g>
        <g class="spark"><path d="M820 50l6 15 15 6-15 6-6 15-6-15-15-6 15-6z" fill="#fff6cf" stroke="#3b2414" stroke-width="5" stroke-linejoin="round"/></g>
        <image class="mark" href="img/logo/bunnywarfare-mark.svg" x="405" y="0" width="190" height="190"/>
        <text class="word-shadow" x="500" y="330" text-anchor="middle" textLength="930" lengthAdjust="spacingAndGlyphs">BUNNY WARFARE</text>
        <text class="word" x="500" y="318" text-anchor="middle" textLength="930" lengthAdjust="spacingAndGlyphs"><tspan fill="url(#${id}-cream)">BUNNY </tspan><tspan fill="url(#${id}-carrot)">WARFARE</tspan></text>
        <g transform="translate(0 6)">
          <path d="M215 352h570l-20 30 20 30H215l20-30z" fill="#6b3f1f" stroke="#3b2414" stroke-width="6" stroke-linejoin="round"/>
          <path d="M250 352h500v60H250z" fill="#8a4e22" stroke="#3b2414" stroke-width="6" stroke-linejoin="round"/>
          <text class="ribbon-text" x="500" y="393" text-anchor="middle">${tagline}</text>
        </g>
      </svg>
    </div>`);
}

/** A speaker (with sound waves) for the sound buttons. */
export function speakerIcon() {
    return html(`<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`);
}
