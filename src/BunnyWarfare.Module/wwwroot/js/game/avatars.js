// Portraits of players and teams in the menus and the HUD: an <img> from portrait.js (cached per look and size, so redrawn lists do not
// flicker) with a level badge; the size badge of the islands.
import { el } from './ui.js';
import { lookOf, portraitUrl } from './portrait.js';

const urls = new Map(); // key -> data URL
const pending = new Map(); // key -> Promise

function keyOf(look, size) {
    return `${look.fur}|${look.outfit}|${look.face}|${look.frame}|${look.color}|${size}`;
}

/** The data URL of a portrait (cached); look as from lookOf(). */
export function portraitSrc(look, size = 96) {
    const key = keyOf(look, size);
    if (urls.has(key)) return Promise.resolve(urls.get(key));
    if (!pending.has(key)) {
        pending.set(key, portraitUrl(look, size).then(url => {
            urls.set(key, url);
            pending.delete(key);
            return url;
        }).catch(() => {
            pending.delete(key);
            return null;
        }));
    }
    return pending.get(key);
}

/** Sets an <img> to the portrait of a look (at once when it is cached). */
export function setPortrait(img, look, size = 96) {
    const key = keyOf(look, size);
    img.dataset.look = key;
    const ready = urls.get(key);
    if (ready) {
        if (img.src !== ready) img.src = ready;
        return;
    }
    portraitSrc(look, size).then(url => {
        if (url && img.dataset.look === key) img.src = url;
    });
}

/**
 * A portrait of a team, a player or a slot (anything with fur/outfit/face/frame and color/teamColor), optionally with its level.
 * size = pixels of the image (it is drawn at twice that for sharp screens).
 */
export function portrait(source, { size = 56, level = null, className = '' } = {}) {
    const img = el('img', 'portrait-img');
    img.alt = '';
    img.width = size;
    img.height = size;
    img.decoding = 'async';
    setPortrait(img, lookOf(source), Math.round(size * 2));
    const wrap = el('span', `portrait ${className}`.trim(), [img]);
    wrap.style.setProperty('--size', `${size}px`);
    if (level) wrap.append(levelBadge(level));
    return wrap;
}

/** Updates a portrait made by portrait() (same element, new look/level): no flicker in lists that redraw. */
export function updatePortrait(wrap, source, level = null) {
    const img = wrap.querySelector('img');
    const size = Number(img.width) || 56;
    setPortrait(img, lookOf(source), Math.round(size * 2));
    let badge = wrap.querySelector('.lvl');
    if (level && !badge) {
        badge = levelBadge(level);
        wrap.append(badge);
    } else if (badge) {
        if (level) badge.textContent = String(level);
        else badge.remove();
    }
}

/** The round level badge (gold from level 20, wild purple at 30). */
export function levelBadge(level) {
    const badge = el('span', `lvl${level >= 30 ? ' is-max' : level >= 20 ? ' is-gold' : ''}`, String(level));
    badge.title = `Level ${level}`;
    return badge;
}

/** S / M / L of an island by its width in metres. */
export function sizeOf(width) {
    return width < 35 ? { key: 's', label: 'S', name: 'klein' } : width < 50 ? { key: 'm', label: 'M', name: 'mittel' } : { key: 'l', label: 'L', name: 'groß' };
}

export function sizeBadge(width) {
    const s = sizeOf(width);
    const badge = el('span', `size-badge is-${s.key}`, s.label);
    badge.title = `${s.name} (${Math.round(width)} m)`;
    return badge;
}
