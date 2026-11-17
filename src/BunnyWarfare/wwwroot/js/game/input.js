// Keyboard and pointer: which keys are held, camera drags, zoom, clicks on the island.
export class Input {
    /** handlers: keyDown(code, event) → true when used, keyUp(code), rotate(dx, dy), zoom(delta), click(x, y) */
    constructor(surface, handlers) {
        this.held = new Set();
        this.handlers = handlers;
        this.drag = null;

        window.addEventListener('keydown', e => {
            if (typing(e)) return;
            if (!e.repeat) this.held.add(e.code);
            if (handlers.keyDown?.(e.code, e)) e.preventDefault();
        });
        window.addEventListener('keyup', e => {
            this.held.delete(e.code);
            if (typing(e)) return;
            if (handlers.keyUp?.(e.code, e)) e.preventDefault();
        });
        window.addEventListener('blur', () => {
            for (const code of [...this.held]) handlers.keyUp?.(code);
            this.held.clear();
        });

        surface.addEventListener('pointerdown', e => {
            surface.setPointerCapture(e.pointerId);
            this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
        });
        surface.addEventListener('pointermove', e => {
            if (!this.drag || this.drag.id !== e.pointerId) return;
            const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
            this.drag.x = e.clientX;
            this.drag.y = e.clientY;
            this.drag.moved += Math.abs(dx) + Math.abs(dy);
            handlers.rotate?.(dx, dy);
        });
        const end = e => {
            if (!this.drag || this.drag.id !== e.pointerId) return;
            if (this.drag.moved < 6) handlers.click?.(e.clientX, e.clientY);
            this.drag = null;
        };
        surface.addEventListener('pointerup', end);
        surface.addEventListener('pointercancel', () => (this.drag = null));
        surface.addEventListener('wheel', e => {
            e.preventDefault();
            handlers.zoom?.(e.deltaY);
        }, { passive: false });
        surface.addEventListener('contextmenu', e => e.preventDefault());
    }

    isDown(...codes) {
        return codes.some(c => this.held.has(c));
    }
}

function typing(e) {
    const t = e.target;
    return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t?.isContentEditable;
}
