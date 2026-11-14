// OWL reading engine, shared by every device build. Ported from prototype/owl.html; no DOM in here.
// Markup: {beat} {beat:long} *emph* {slow}…{/slow} {heart} {heart:up} {/heart} {mood:x} {mood:+x-y}
//         {scene:Title|Recap} {voice:name}

export const BEAT = { beat: 450, long: 1100 };
export const PLATE_MS = 2200;

export function parse(src) {
  const scenes = [];
  src = src.replace(/\{scene:([^|}]*)\|?([^}]*)\}/g, (_, title, recap) => ` {scene#${scenes.push({ title: title.trim(), recap: recap.trim(), n: scenes.length + 1 }) - 1}} `)
    .replace(/—/g, " — ");
  const tokens = []; let slow = false, cues = [], voice = null, scene = null;
  src.trim().split(/\n\s*\n/).forEach(p => {
    let inQuote = false;
    for (const raw of p.split(/\s+/).filter(Boolean)) {
      if (raw === "{heart}" || raw === "{heart:up}" || raw === "{/heart}") { cues.push(raw); continue; }
      const md = raw.match(/^\{(mood:[\w+-]+)\}$/); if (md) { cues.push(md[1]); continue; }
      if (raw === "{slow}") { slow = true; continue; }
      if (raw === "{/slow}") { slow = false; continue; }
      const sc = raw.match(/^\{scene#(\d+)\}$/); if (sc) { scene = scenes[+sc[1]]; continue; }
      const v = raw.match(/^\{voice:(\w+)\}$/); if (v) { voice = v[1]; continue; }
      const b = raw.match(/^\{beat(?::(long))?\}$/);
      if (b) { if (tokens.length) tokens[tokens.length - 1].beatAfter += b[1] ? BEAT.long : BEAT.beat; continue; }
      if (raw === "—" || raw === "–" || raw === "--") { if (tokens.length) tokens[tokens.length - 1].dash = true; continue; }
      let w = raw, emph = false;
      const em = w.match(/^[*_](.+)[*_]([^\w]*)$/);
      if (em) { emph = true; w = em[1] + em[2]; }
      if (/^[“"]/.test(w)) inQuote = true;
      tokens.push({ w, emph, slow, cues, scene, who: inQuote ? voice : null, beatAfter: 0, dash: false, para: false,
        sentEnd: /[.!?]["'”’)]*$/.test(w), clause: /[,;:]["'”’)]*$/.test(w) });
      if (/[”"][^\w]*$/.test(w) && !/^[“"][^\w]*$/.test(w)) inQuote = false;
      cues = []; scene = null;
    }
    if (tokens.length) tokens[tokens.length - 1].para = true;
  });
  if (cues.length && tokens.length) tokens[tokens.length - 1].cues.push(...cues);
  return tokens;
}

// a book file -> tokens, with the narration timings attached when they line up word for word
export function loadTokens(book) {
  const tokens = parse(book.src);
  if (book.narration && tokens.length === book.narration.length) tokens.forEach((t, i) => t.n = book.narration[i]);
  return tokens;
}
export function narratorWpm(book) {
  const n = book.narration;
  return n && n.length ? n.length / (n[n.length - 1][1] - n[0][0]) * 60 : 175;
}

function weight(t, nat, dra) {
  if (!nat) return 1;
  const len = t.w.replace(/[^A-Za-z0-9']/g, "").length;
  let m = 1;
  if (len >= 8) m += .25;
  if (len >= 12) m += .25;
  if (t.sentEnd) m += 1.2; else if (t.clause || t.dash) m += .5;
  if (t.para) m += 1.2;
  if (dra) { if (t.emph) m += 1.2; if (t.slow) m *= 1.8; }
  return m;
}

function narratorFrames(tokens, wpm, chunk, nwpm) {
  const scale = nwpm / wpm, floor = 36000 / wpm, frames = [];
  const next = k => k + 1 < tokens.length ? tokens[k + 1].n[0] : tokens[k].n[1] + .5;
  let i = 0;
  while (i < tokens.length) {
    if (tokens[i].scene) frames.push({ start: i, end: i + 1, plate: tokens[i].scene, ms: PLATE_MS });
    const start = i, words = []; let gap = 0;
    while (i < tokens.length && words.length < chunk) {
      const t = tokens[i];
      if (words.length && (t.scene || t.who !== tokens[start].who)) break;
      words.push(t.w); gap = next(i) - t.n[1]; i++;
      if (gap >= .3 || t.sentEnd || t.para) break;
    }
    const t0 = tokens[start].n[0], held = gap >= .3 ? tokens[i - 1].n[1] : next(i - 1);
    frames.push({ start, end: i, text: words.join(" "), who: tokens[start].who, ms: Math.max(floor, (held - t0) * 1000 * scale), t0, t1: held });
    if (gap >= .3) frames.push({ start: i - 1, end: i, blank: true, ms: gap * 1000 * scale, t0: held, t1: next(i - 1) });
  }
  return frames;
}

// mode: flat | natural | dramatic | narrator (a book with no recording reads narrator as dramatic)
export function buildFrames(tokens, { wpm, chunk, mode }, nwpm) {
  if (mode === "narrator" && tokens.length && tokens[0].n) return narratorFrames(tokens, wpm, chunk, nwpm);
  const base = 60000 / wpm, nat = mode !== "flat", dra = mode === "dramatic" || mode === "narrator", frames = [];
  let i = 0;
  while (i < tokens.length) {
    if (tokens[i].scene) frames.push({ start: i, end: i + 1, plate: tokens[i].scene, ms: PLATE_MS });
    const start = i, words = []; let mult = 0;
    while (i < tokens.length && words.length < chunk) {
      const t = tokens[i];
      if (words.length && (t.scene || t.who !== tokens[start].who)) break;
      if (dra && t.emph && words.length) break;
      words.push(t.w); mult += weight(t, nat, dra); i++;
      if (dra && (t.emph || t.beatAfter)) break;
      if (nat && (t.sentEnd || t.clause || t.dash || t.para)) break;
    }
    const last = tokens[i - 1];
    frames.push({ start, end: i, text: words.join(" "), who: tokens[start].who, ms: mult * base, emph: dra && last.emph && words.length === 1 });
    if (dra && last.beatAfter) frames.push({ start: i - 1, end: i, blank: true, ms: last.beatAfter });
  }
  return frames;
}

// where the eye anchors: one word pivots on its optimal letter, a group on its middle
const orp = n => n <= 1 ? 0 : n <= 5 ? 1 : n <= 9 ? 2 : n <= 13 ? 3 : 4;
export function pivot(f) {
  const text = f.text;
  let pi;
  if (f.end - f.start === 1) {
    const lead = text.match(/^[^A-Za-z0-9]*/)[0].length;
    pi = lead + orp(text.slice(lead).replace(/[^A-Za-z0-9]*$/, "").length);
  } else pi = Math.floor((text.length - 1) / 2);
  return { l: text.slice(0, pi), p: text[pi] || "", r: text.slice(pi + 1) };
}

// {mood:room+calm} replaces the bed; {mood:+tense-calm} adds and drops layers
export function moodOps(mood, v) {
  if (!/^[+-]/.test(v)) return v;
  const set = mood ? mood.split("+") : [];
  for (const [, op, m] of v.matchAll(/([+-])(\w+)/g)) { const i = set.indexOf(m); if (op === "+" && i < 0) set.push(m); if (op === "-" && i >= 0) set.splice(i, 1); }
  return set.join("+");
}
export function stateAt(tokens, p) {
  let bpm = 0, mood = "";
  for (let i = 0; i <= p && i < tokens.length; i++) for (const c of tokens[i].cues)
    if (c.startsWith("mood:")) mood = moodOps(mood, c.slice(5));
    else bpm = c === "{heart}" ? 64 : c === "{heart:up}" ? (bpm ? bpm + 18 : 0) : 0;
  return { bpm, mood };
}

export function bounds(tokens, p) {
  const end = t => t.sentEnd || t.para;
  let s = p; while (s > 0 && !end(tokens[s - 1])) s--;
  let e = p; while (e < tokens.length - 1 && !end(tokens[e])) e++;
  return [s, e + 1];
}
export function sceneAt(tokens, p) { for (let i = Math.min(p, tokens.length - 1); i >= 0; i--) if (tokens[i].scene) return tokens[i].scene; return null; }

// What plays before you pick back up: a jump gets the scene recap; back after 3+ minutes gets a quick
// rewind of your last two sentences; back after a day gets both.
const DAY_MS = 864e5;
export function intros(tokens, p, { jumped, away, wpm }) {
  const sc = sceneAt(tokens, p), q = [];
  if (p === 0 || p >= tokens.length) return q;
  const recap = sc && sc.recap ? { badge: "Previously on…", tokens: parse(sc.recap), wpm } : null;
  if (jumped) return recap ? [recap] : q;
  if (away > DAY_MS && recap) q.push(recap);
  if (away > 3 * 60000) {
    let first = p; while (first > 0 && !tokens[first].scene) first--;
    const [s1] = bounds(tokens, p - 1), [s2] = s1 > 0 ? bounds(tokens, s1 - 1) : [s1], from = Math.max(s2, first);
    if (from < p) q.push({ badge: "Where you left off…", tokens: tokens.slice(from, p).map(t => ({ ...t, scene: null, cues: [] })), wpm: Math.round(wpm * 1.25) });
  }
  return q;
}

// Timing only: the device build decides how a frame is drawn (onFrame) and may stretch time (msFor).
export class Player {
  constructor() { this.tokens = []; this.frames = []; this.fi = 0; this.timer = null; this.playing = false; }
  load(tokens, opts, nwpm) { this.pause(); this.tokens = tokens; this.opts = opts; this.nwpm = nwpm; this.frames = buildFrames(tokens, opts, nwpm); this.fi = 0; this.render(); }
  setOpts(opts) { const p = this.pos(); this.opts = opts; this.frames = buildFrames(this.tokens, opts, this.nwpm); this.seek(p); }
  pos() { const f = this.frames[this.fi]; return f ? f.start : this.tokens.length; }
  frame() { return this.frames[this.fi]; }
  seek(p) {
    p = Math.max(0, Math.min(this.tokens.length - 1, p));
    const idx = this.frames.findIndex(f => p >= f.start && p < f.end);
    this.fi = idx < 0 ? 0 : idx;
    if (this.playing) { clearTimeout(this.timer); this.tick(); } else this.render();
  }
  play() { if (this.fi >= this.frames.length) this.fi = 0; this.playing = true; this.tick(); }
  pause() { clearTimeout(this.timer); this.playing = false; this.render(); }
  tick() {
    const f = this.frames[this.fi];
    if (!f) { this.playing = false; this.render(); this.onEnd && this.onEnd(); return; }
    this.render();
    if (!this.playing) return;
    this.timer = setTimeout(() => { this.fi++; this.tick(); }, this.msFor ? this.msFor(f) : f.ms);
  }
  msLeft() { let s = 0; for (let k = this.fi; k < this.frames.length; k++) s += this.frames[k].ms; return s; }
  render() { this.onFrame && this.onFrame(this.frames[this.fi], this); }
}
