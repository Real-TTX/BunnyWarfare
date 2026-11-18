// Small DOM helpers of the player app: elements, icons from the page sprite, toasts, the connection banner, segmented controls, layers.
export const $ = id => document.getElementById(id);

/** A new element: el('div', 'card', 'text') or el('div', 'card', [child, child]). */
export function el(tag, className, content) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (content === undefined || content === null) return e;
    if (Array.isArray(content)) e.append(...content.filter(c => c !== null && c !== undefined && c !== false));
    else if (content instanceof Node) e.append(content);
    else e.textContent = String(content);
    return e;
}

/** An icon of the inline sprite (MatUi line icons and the app's own: carrot, bunny, crosshair, globe-map, swords, trophy). */
export function icon(name, className = 'ico') {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', className);
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(ns, 'use');
    use.setAttribute('href', `#mat-i-${name}`);
    svg.append(use);
    return svg;
}

/** Markup (trusted, our own) to an element. */
export function html(markup) {
    const t = document.createElement('template');
    t.innerHTML = markup.trim();
    return t.content.firstElementChild;
}

export function button(text, { className = 'btn', iconName = null, onClick = null, type = 'button', title = null } = {}) {
    const b = el('button', className);
    b.type = type;
    if (iconName) b.append(icon(iconName));
    if (text) b.append(el('span', null, text));
    if (title) {
        b.title = title;
        b.setAttribute('aria-label', title);
    }
    if (onClick) b.addEventListener('click', onClick);
    return b;
}

/** A segmented control: options [{ value, label }], returns { element, value, set(value) }. */
export function segmented(options, value, onChange) {
    const root = el('div', 'seg');
    root.setAttribute('role', 'radiogroup');
    const control = { element: root, value };
    const buttons = options.map(o => {
        const b = el('button', null, o.label);
        b.type = 'button';
        b.setAttribute('role', 'radio');
        b.addEventListener('click', () => {
            control.set(o.value);
            onChange?.(o.value);
        });
        root.append(b);
        return { b, o };
    });
    control.set = v => {
        control.value = v;
        for (const { b, o } of buttons) {
            b.classList.toggle('is-on', o.value === v);
            b.setAttribute('aria-checked', o.value === v ? 'true' : 'false');
        }
    };
    control.set(value);
    return control;
}

/** A labelled input row: returns { row, input, error }. */
export function field(label, { type = 'text', value = '', maxLength = 60, autocomplete = 'off', placeholder = '' } = {}) {
    const id = `f-${Math.random().toString(36).slice(2, 9)}`;
    const lab = el('label', 'label', label);
    lab.htmlFor = id;
    const input = el('input', 'field');
    input.id = id;
    input.type = type;
    input.value = value ?? '';
    input.maxLength = maxLength;
    input.autocomplete = autocomplete;
    input.placeholder = placeholder;
    input.spellcheck = false;
    const error = el('div', 'form-error');
    const row = el('div', 'form-row', [lab, input, error]);
    input.addEventListener('input', () => {
        input.classList.remove('is-invalid');
        error.textContent = '';
    });
    return { row, input, error };
}

export function toast(text, tone = 'danger') {
    const host = $('bw-toasts');
    const t = el('div', `toast ${tone}`, text);
    host.append(t);
    while (host.children.length > 4) host.firstChild.remove();
    setTimeout(() => t.classList.add('is-leaving'), 3000);
    setTimeout(() => t.remove(), 3500);
}

export function banner(text) {
    const b = $('bw-banner');
    b.hidden = !text;
    b.textContent = text ?? '';
}

export function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text).then(() => true, () => false);
    }
    const ta = el('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
        ok = document.execCommand('copy');
    } catch {
        ok = false;
    }
    ta.remove();
    return Promise.resolve(ok);
}

export const THEME_NAMES = { Meadow: 'Möhrenwiese', Snow: 'Frostbau', Desert: 'Dünenland', Moon: 'Mondkrater', Autumn: 'Herbstwald', Volcano: 'Vulkaninsel', Jungle: 'Dschungel' };
export const LEVEL_NAMES = { Easy: 'Leicht', Normal: 'Normal', Hard: 'Schwer' };
export const themeName = theme => THEME_NAMES[theme] ?? theme;

export function formatDate(iso) {
    if (!iso) return '–';
    const d = new Date(iso);
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}
