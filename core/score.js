// OWL score: mood beds and heartbeat, synthesized in Web Audio. Generated from prototype/owl.html by
// tools/port-score.py, so the glasses builds sound exactly like the prototype.

// Each mood builds its sound from oscillators and noise. A real catalog would use recorded
// ambiences; these stand in so the tagging and crossfades can be judged.
export const MOOD_NAMES = { dread: "Dread", eerie: "Eerie", room: "Sitting room", street: "Street", outdoors: "Outdoors",
  party: "Party", office: "Office", calm: "Calm underscore", tense: "Tense underscore", mystery: "Mystery underscore" };
const MOODS = {
  dread(k) { const f = k.filt("lowpass", 300, 0, k.amp(.045)); [55, 55.7, 82.4].forEach(hz => k.osc("sawtooth", hz, f)); },
  eerie(k) {
    const g = k.amp(.012); [220, 221.4, 329.2].forEach(hz => k.osc("sine", hz, g)); k.lfo(.15, .008, g.gain);
    const w = k.filt("bandpass", 600, .8, k.amp(.05)); k.hiss(w); k.lfo(.05, 300, w.frequency);
  },
  room(k) {
    k.hiss(k.filt("lowpass", 160, 0, k.amp(.09)));                               // room tone
    const fire = k.filt("bandpass", 320, .7, k.amp(.03)); k.hiss(fire); k.lfo(.3, .015, fire.gain);
    k.every(60, 420, t => k.burst(t, 2500 + Math.random() * 3000, 1, .005 + Math.random() * .02, .008 + Math.random() * .03));
    let tock = false; k.every(1000, 1000, t => { k.blip(t, "triangle", tock ? 1900 : 2400, 0, .012, .035); tock = !tock; });
  },
  street(k) {
    k.hiss(k.filt("lowpass", 110, 0, k.amp(.12)));
    [340, 520, 780].forEach((hz, i) => { const g = k.amp(.012); k.hiss(k.filt("bandpass", hz, 2.5, g)); k.lfo(.2 + i * .13, .008, g.gain); });
    // a horse and cart passing on cobbles, left to right
    k.every(5000, 11000, t => {
      const pan = k.pan(-1);
      pan.pan.linearRampToValueAtTime(1, t + 5);
      for (let s = 0; s < 5; s += .52) {
        const v = .09 * Math.sin(Math.PI * s / 5) + .01;
        k.burst(t + s, 1100, 5, .03, v, pan); k.burst(t + s + .13, 900, 5, .03, v * .8, pan);
      }
    });
  },
  outdoors(k) {
    const w = k.filt("bandpass", 450, .5, k.amp(.06)); k.hiss(w); k.lfo(.07, 250, w.frequency);
    k.every(1500, 5500, t => {
      const f = 2800 + Math.random() * 1800, p = k.pan(Math.random() * 1.6 - .8);
      for (let n = 0, m = 2 + Math.floor(Math.random() * 3); n < m; n++) k.blip(t + n * .13, "sine", f, f + (Math.random() - .3) * 900, .07, .025, p);
    });
  },
  party(k) {
    [300, 450, 650, 900].forEach((hz, i) => { const g = k.amp(.014); k.hiss(k.filt("bandpass", hz, 3, g)); k.lfo(.3 + i * .17, .01, g.gain); });
    k.every(1200, 4000, t => { const f = 3200 + Math.random() * 1200; k.blip(t, "sine", f, 0, .5, .015); k.blip(t, "sine", f * 2.7, 0, .3, .006); });
    // a waltz in the next room: bass on one, chord on two and three
    const room = k.filt("lowpass", 900, 0, k.amp(.5)), prog = [[110, 220, 277, 330], [146.8, 220, 293.7, 370], [164.8, 246.9, 329.6, 415.3], [110, 220, 277, 330]];
    let beat = 0; k.every(480, 480, t => {
      const ch = prog[Math.floor(beat / 3) % 4], b = beat % 3;
      if (b === 0) k.blip(t, "triangle", ch[0], 0, .35, .05, room); else ch.slice(1).forEach(hz => k.blip(t, "triangle", hz, 0, .2, .014, room));
      beat++;
    });
  },
  office(k) {
    k.hiss(k.filt("lowpass", 160, 0, k.amp(.07)));
    let tock = false; k.every(1000, 1000, t => { k.blip(t, "triangle", tock ? 1900 : 2400, 0, .012, .03); tock = !tock; });
    k.every(2500, 7000, t => { for (let n = 0, m = 6 + Math.random() * 12; n < m; n++) k.burst(t + n * (.05 + Math.random() * .06), 4200, 1.2, .03 + Math.random() * .05, .012); });
  },
  calm(k) {  // slow major pad, one chord every 8 s
    const out = k.filt("lowpass", 1100, 0, k.amp(1)), prog = [[261.6, 329.6, 392], [220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7]];
    let n = 0; k.every(8000, 8000, t => { prog[n++ % 4].forEach(hz => k.swell(t, hz, 8.5, .012, out)); k.swell(t, prog[(n - 1) % 4][0] / 2, 8.5, .016, out); });
  },
  mystery(k) {  // a soft plucked minor figure, the sound of someone working it out
    const out = k.filt("lowpass", 1800, 0, k.amp(1));
    const bars = [[146.8, 220, 174.6, 220], [164.8, 220, 196, 220], [146.8, 220, 174.6, 233.1], [130.8, 196, 164.8, 220]];
    let n = 0; k.every(330, 330, t => {
      const bar = bars[Math.floor(n / 8) % 4], step = n % 8;
      if (step % 2 === 0) k.blip(t, "triangle", bar[(step / 2) % 4] * 2, 0, .28, .03, out);
      if (step === 0) k.blip(t, "sine", bar[0] / 2, 0, 1.2, .05, out);
      n++;
    });
  },
  tense(k) {  // low pulse under a minor pad
    k.every(850, 850, t => k.blip(t, "sine", 58, 50, .45, .06));
    const out = k.filt("lowpass", 800, 0, k.amp(1)), prog = [[220, 261.6, 329.6], [174.6, 220, 261.6], [164.8, 207.7, 246.9]];
    let n = 0; k.every(10000, 10000, t => prog[n++ % 3].forEach(hz => k.swell(t, hz, 10.5, .01, out)));
  },
};

// per-mood level trims, measured so every bed sits near -37 dB RMS (dread a touch louder)
const MOOD_TRIM = { dread: .5, eerie: 1, room: 2, street: 1.8, outdoors: 1.3, party: 2.6, office: 2.3, calm: 1, tense: .9, mystery: 1 };

// one playing bed: its own bus, nodes and timers, so a crossfade can retire it cleanly
function moodBed(name, fadeIn) {
  const c = score.ctx, bus = c.createGain(), nodes = [];
  let dead = false;
  bus.gain.value = 0; bus.connect(score.moodOut);
  const start = n => { nodes.push(n); n.start(); return n; };
  const k = {
    amp(v, dest = bus) { const g = c.createGain(); g.gain.value = v; g.connect(dest); return g; },
    filt(type, hz, q, dest) { const f = c.createBiquadFilter(); f.type = type; f.frequency.value = hz; if (q) f.Q.value = q; f.connect(dest); return f; },
    pan(v) { const p = c.createStereoPanner(); p.pan.value = v; p.connect(bus); return p; },
    osc(type, hz, dest) { const o = c.createOscillator(); o.type = type; o.frequency.value = hz; o.connect(dest); return start(o); },
    hiss(dest) { const s = c.createBufferSource(); s.buffer = score.noise(); s.loop = true; s.loopStart = Math.random(); s.connect(dest); return start(s); },
    lfo(hz, depth, param) { const g = c.createGain(); g.gain.value = depth; g.connect(param); k.osc("sine", hz, g); },
    every(lo, hi, fn) { const go = () => { if (dead) return; fn(c.currentTime + .05); setTimeout(go, lo + Math.random() * (hi - lo)); }; setTimeout(go, Math.random() * Math.min(lo, 1500)); },
    blip(t, type, f0, f1, dur, vol, dest = bus) {
      const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t);
      if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .005); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + .05);
    },
    burst(t, hz, q, dur, vol, dest = bus) {
      const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      s.buffer = score.noise(); f.type = "bandpass"; f.frequency.value = hz; f.Q.value = q;
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random()); s.stop(t + dur + .02);
    },
    swell(t, hz, dur, vol, dest) {
      const o = c.createOscillator(), g = c.createGain(); o.type = "triangle"; o.frequency.value = hz;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + dur * .35); g.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + .05);
    },
  };
  MOODS[name](k);
  bus.gain.setValueAtTime(0, c.currentTime); bus.gain.linearRampToValueAtTime(MOOD_TRIM[name] || 1, c.currentTime + fadeIn);
  return { stop(fade) { dead = true; const t = c.currentTime; bus.gain.cancelScheduledValues(t); bus.gain.setValueAtTime(bus.gain.value, t); bus.gain.linearRampToValueAtTime(0, t + fade); nodes.forEach(n => n.stop(t + fade + .1)); } };
}

export const score = {
  ctx: null, out: null, moodOut: null, onMood: null, onBeat: null, buf: null, beds: {}, moodKey: "", timer: null, bpm: 0,
  ensure() {
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.out = this.ctx.createGain(); this.out.connect(this.ctx.destination);
        this.moodOut = this.ctx.createGain(); this.moodOut.connect(this.out);
      } catch { return false; }
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return true;
  },
  noise() {
    if (!this.buf) { const n = this.ctx.sampleRate * 2; this.buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate); const d = this.buf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; }
    return this.buf;
  },
  // duck: beds sit lower under the narrator's voice
  sync(bpm, mood, duck) { if (!this.ensure()) return; this.mood(mood); this.setHeart(bpm); this.moodOut.gain.setTargetAtTime(duck ? .5 : 1, this.ctx.currentTime, .5); },
  off() { this.setHeart(0); this.mood(""); },
  level(v) { if (this.out) this.out.gain.setTargetAtTime(v, this.ctx.currentTime, .3); },
  mood(key) {
    if (key === this.moodKey) return;
    // beds that stay keep playing untouched; a layer change (something stays) fades slower than a switch
    const want = key ? key.split("+").filter(m => MOODS[m]) : [], layer = want.some(m => this.beds[m]);
    this.moodKey = key;
    for (const m in this.beds) if (!want.includes(m)) { this.beds[m].stop(layer ? 3 : 2); delete this.beds[m]; }
    for (const m of want) if (!this.beds[m]) this.beds[m] = moodBed(m, layer ? 4 : 2.5);
    this.onMood && this.onMood(key);
  },
  thump(t, vol) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(38, t + .12);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + .18);
    o.connect(g); g.connect(this.out); o.start(t); o.stop(t + .2);
  },
  setHeart(bpm) {
    if (bpm === this.bpm) return;
    clearInterval(this.timer); this.bpm = bpm;
    if (!bpm) return;
    const vol = Math.min(.9, .35 + (bpm - 64) / 150);
    const beat = () => { const t = this.ctx.currentTime + .02; this.thump(t, vol); this.thump(t + .22, vol * .6); this.onBeat && this.onBeat(); };
    beat(); this.timer = setInterval(beat, 60000 / bpm);
  },
};
