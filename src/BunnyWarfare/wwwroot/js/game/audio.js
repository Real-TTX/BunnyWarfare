// Tiny sounds made on the fly with WebAudio (no files): a whoosh, a boom, a splash, a ping. Muting is remembered.
const KEY = 'bunnywarfare.muted';

export class Sound {
    constructor() {
        this.muted = localStorage.getItem(KEY) === '1';
        this.context = null;
    }

    toggle() {
        this.muted = !this.muted;
        localStorage.setItem(KEY, this.muted ? '1' : '0');
        return this.muted;
    }

    ctx() {
        if (this.muted) return null;
        if (!this.context) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return null;
            this.context = new AudioContext();
        }
        if (this.context.state === 'suspended') this.context.resume();
        return this.context;
    }

    noise(duration, { from = 1200, to = 200, gain = 0.4, type = 'lowpass' } = {}) {
        const c = this.ctx();
        if (!c) return;
        const length = Math.floor(c.sampleRate * duration);
        const buffer = c.createBuffer(1, length, c.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2;
        const source = c.createBufferSource();
        source.buffer = buffer;
        const filter = c.createBiquadFilter();
        filter.type = type;
        filter.frequency.setValueAtTime(from, c.currentTime);
        filter.frequency.exponentialRampToValueAtTime(Math.max(20, to), c.currentTime + duration);
        const g = c.createGain();
        g.gain.value = gain;
        source.connect(filter).connect(g).connect(c.destination);
        source.start();
    }

    tone(freq, duration, gain = 0.15, type = 'sine') {
        const c = this.ctx();
        if (!c) return;
        const o = c.createOscillator();
        o.type = type;
        o.frequency.setValueAtTime(freq, c.currentTime);
        const g = c.createGain();
        g.gain.setValueAtTime(gain, c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + duration);
        o.connect(g).connect(c.destination);
        o.start();
        o.stop(c.currentTime + duration);
    }

    fire() { this.noise(0.35, { from: 3000, to: 400, gain: 0.25, type: 'bandpass' }); }

    boom(radius = 2.5) { this.noise(0.9 + radius * 0.1, { from: 900, to: 60, gain: 0.7 }); }

    splash() { this.noise(0.6, { from: 5000, to: 800, gain: 0.2, type: 'highpass' }); }

    ping() { this.tone(880, 0.25); setTimeout(() => this.tone(1320, 0.3), 120); }

    tick() { this.tone(1500, 0.05, 0.05, 'square'); }
}
