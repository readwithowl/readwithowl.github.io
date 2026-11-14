// OWL for Meta Ray-Ban Display. D-pad + pinch (arrow keys + Enter on desktop), system Back = history.
import { loadTokens, narratorWpm, Player, pivot, stateAt, intros, sceneAt, bounds } from "../core/engine.js";

const $ = id => document.getElementById(id);
const BOOKS = "../books/";
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const S = Object.assign({ wpm: 300, chunk: 1, mode: "narrator", sound: true, walk: true }, store.get("owl.settings", {}));
const places = store.get("owl.places", {});
const MODES = { narrator: "Narrator", dramatic: "Dramatic", natural: "Natural" };

let shelf = [], book = null, tokens = [], nwpm = 175, lastAt = 0, savedAt = 0, fresh = true, jumped = false;
const reader = new Player(), intro = new Player();
let introQ = [], introing = false;

// ---------- sound: the narrator's recording, plus the score (loaded only once sound is used) ----------
const voice = new Audio(); voice.preload = "none";
let voiceFailed = false, score = null, scoreLoading = null;
function getScore() {
  if (!scoreLoading) scoreLoading = import("../core/score.js").then(m => { score = m.score; return score; }).catch(() => null);
  return scoreLoading;
}
function voiceOn() {
  const rate = S.wpm / nwpm;
  return S.mode === "narrator" && S.sound && !voiceFailed && book && book.audio && tokens[0] && tokens[0].n && rate >= .5 && rate <= 2;
}
reader.msFor = f => voiceOn() && !voice.paused && f.t1 != null
  ? Math.max(f.blank ? 0 : 90, (f.t1 - voice.currentTime) / voice.playbackRate * 1000) : f.ms;

// ---------- screens + Back ----------
function show(name, push) {
  for (const s of ["home", "read", "settings"]) $(s).hidden = s !== name;
  if (push) history.pushState({ s: name }, "");
  if (name !== "read") leaveReader();
  if (name === "home") renderShelf();
  if (name === "settings") renderRows();
}
addEventListener("popstate", e => show((e.state && e.state.s) || "home"));
const screen = () => ["home", "read", "settings"].find(s => !$(s).hidden);
const navs = () => [...document.querySelectorAll(`#${screen()} [data-nav]`)];
// coming back, focus returns to whatever opened the screen you left (the book, or Settings)
let returnTo = null;
function focusFirst() { const n = navs(), back = returnTo && document.querySelector(returnTo); returnTo = null; (back && n.includes(back) ? back : n[0])?.focus(); }

addEventListener("keydown", e => {
  if (e.key === "Escape" && history.state && history.state.s !== "home") { e.preventDefault(); history.back(); return; }
  if (screen() === "read") return readerKey(e);
  const n = navs(), i = n.indexOf(document.activeElement);
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    n[Math.max(0, Math.min(n.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))]?.focus();
  } else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && document.activeElement.dataset.cycle) {
    e.preventDefault(); cycle(document.activeElement.dataset.cycle, e.key === "ArrowRight" ? 1 : -1);
  }
});

// ---------- home ----------
async function boot() {
  history.replaceState({ s: "home" }, "");
  try { shelf = await (await fetch(BOOKS + "shelf.json")).json(); } catch { shelf = []; }
  show("home");
}
function renderShelf() {
  $("shelf").innerHTML = shelf.length ? shelf.map(b => {
    const pl = places[b.id], tags = [b.credit ? b.credit.replace(/^Narration: (.*?),.*/, "Read by $1") : b.narrator && "Narrator", b.cast && "Full cast"].filter(Boolean).join(" · ");
    return `<button class="row" data-nav data-book="${b.id}"><b>${b.title}</b><span>${b.author}${tags ? " · " + tags : ""}${pl && pl.pct ? ` · ${pl.pct}% read` : ""}</span></button>`;
  }).join("") : `<p class="help">The library couldn't load. Check your connection, then reopen OWL.</p>`;
  $("setSummary").textContent = `${MODES[S.mode]} · ${S.wpm} wpm`;
  focusFirst();
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-book]"); if (b) { returnTo = `[data-book="${b.dataset.book}"]`; return openBook(b.dataset.book); }
  const g = e.target.closest("[data-go]"); if (g) { returnTo = `[data-go="${g.dataset.go}"]`; return show(g.dataset.go, true); }
  const c = e.target.closest("[data-cycle]"); if (c) return cycle(c.dataset.cycle, 1);
});

// ---------- settings ----------
const ROWS = {
  mode: { label: "Timing", vals: Object.keys(MODES), show: v => MODES[v] },
  wpm: { label: "Speed", vals: [200, 250, 300, 350, 400, 500, 600], show: v => v + " wpm" },
  chunk: { label: "Words per flash", vals: [1, 2, 3], show: v => v },
  sound: { label: "Sound", vals: [true, false], show: v => v ? "Narration and score" : "Off" },
  walk: { label: "When you walk", vals: [true, false], show: v => v ? "Audio only" : "Keep showing words" },
};
function renderRows() {
  $("rows").innerHTML = Object.entries(ROWS).map(([k, r]) =>
    `<button class="row" data-nav data-cycle="${k}"><b>${r.label}</b><span class="val">${r.show(S[k])}</span></button>`).join("");
  focusFirst();
}
function cycle(k, dir) {
  const r = ROWS[k];
  let i = r.vals.indexOf(S[k]);
  if (i < 0) i = r.vals.reduce((best, v, j) => Math.abs(v - S[k]) < Math.abs(r.vals[best] - S[k]) ? j : best, 0);
  S[k] = r.vals[(i + dir + r.vals.length) % r.vals.length];
  store.set("owl.settings", S);
  const row = document.querySelector(`[data-cycle="${k}"] .val`); if (row) row.textContent = r.show(S[k]);
}

// ---------- reader ----------
const opts = () => ({ wpm: S.wpm, chunk: S.chunk, mode: S.mode });
async function openBook(id) {
  try { book = await (await fetch(BOOKS + id + ".json")).json(); } catch { return toastHome("That book couldn't load. Try again."); }
  tokens = loadTokens(book); nwpm = narratorWpm(book);
  voice.src = book.audio ? BOOKS + book.audio : ""; voiceFailed = false;
  reader.load(tokens, opts(), nwpm);
  const pl = places[id];
  if (pl && pl.p < tokens.length) reader.seek(pl.p);
  lastAt = pl ? pl.at : 0; fresh = true; jumped = false;
  show("read", true);
  hint();
}
function toastHome(msg) { $("setSummary").textContent = msg; }

function savePlace() {
  if (!book) return;
  savedAt = lastAt = Date.now();
  places[book.id] = { p: reader.pos(), at: lastAt, pct: Math.round(100 * reader.pos() / tokens.length) };
  store.set("owl.places", places);
}
function leaveReader() {
  if (!book) return;
  endIntro(false); if (reader.playing) reader.pause();
  voice.pause(); score && score.off(); stopWalkWatch();
  savePlace();
}
addEventListener("pagehide", () => { if (screen() === "read") savePlace(); });

function readerKey(e) {
  const k = e.key;
  if (k === "Enter" || k === " ") { e.preventDefault(); toggle(); }
  else if (k === "ArrowUp" || k === "ArrowDown") { e.preventDefault(); speed(k === "ArrowUp" ? 25 : -25); }
  else if (k === "ArrowLeft" || k === "ArrowRight") {
    e.preventDefault();
    const p = reader.pos(), [s, end] = bounds(tokens, Math.min(p, tokens.length - 1));
    reader.seek(k === "ArrowLeft" ? (p - s <= 1 && s > 0 ? bounds(tokens, s - 1)[0] : s) : end);
  }
}
function speed(d) {
  S.wpm = Math.max(100, Math.min(900, S.wpm + d)); store.set("owl.settings", S);
  reader.setOpts(opts());
  const quiet = S.mode === "narrator" && S.sound && book.audio && !voiceOn();
  toast(`${S.wpm} wpm${quiet ? " · voice rests at this speed" : ""}`);
}
let toastT;
function toast(msg) { $("toast").textContent = msg; $("toast").hidden = false; clearTimeout(toastT); toastT = setTimeout(() => $("toast").hidden = true, 1400); }

function toggle() {
  if (introing) return endIntro(true);
  if (reader.playing) { reader.pause(); savePlace(); } else start();
}
function start() {
  if (S.sound) getScore();
  startWalkWatch();
  if (fresh) {
    fresh = false;
    const q = intros(tokens, reader.pos(), { jumped, away: lastAt ? Date.now() - lastAt : 0, wpm: S.wpm }); jumped = false;
    if (q.length) return playIntros(q);
  }
  reader.play();
}
function playIntros(q) {
  introQ = q; introing = true;
  const it = introQ.shift();
  $("badge").textContent = it.badge;
  intro.load(it.tokens, { wpm: it.wpm, chunk: S.chunk, mode: "natural" });
  intro.play();
}
intro.onFrame = f => { if (introing) drawWord(f, " recap"); };
intro.onEnd = () => introQ.length ? playIntros(introQ) : endIntro(true);
function endIntro(go) {
  if (!introing) return;
  introing = false; introQ = []; intro.pause(); $("badge").textContent = "";
  if (go) reader.play();
}

function drawWord(f, extra = "") {
  const w = $("word");
  $("plate").hidden = !(f && f.plate);
  if (f && f.plate) { $("plateNum").textContent = "Scene " + f.plate.n; $("plateTitle").textContent = f.plate.title; }
  if (!f || f.blank || f.plate) { w.className = "word"; w.innerHTML = ""; return; }
  const { l, p, r } = pivot(f), cn = castN(f.who);
  w.className = "word" + (f.emph ? " emph" : "") + (f.end - f.start > 1 ? " chunk" : "") + (cn ? " c" + cn : "") + extra;
  w.innerHTML = "";
  for (const [cls, text] of [["l", l], ["p", p], ["r", r]]) { const s = document.createElement("span"); s.className = cls; s.textContent = text; w.append(s); }
}
const castN = who => who && book.cast && book.cast[who] ? Object.keys(book.cast).indexOf(who) + 1 : 0;

reader.onFrame = (f, r) => {
  if (!book) return;
  const p = r.pos(), n = tokens.length;
  if (!introing) drawWord(walking && voiceOn() ? null : f);
  // narrator's voice follows the frames
  if (r.playing && voiceOn() && f && f.t0 != null) {
    voice.playbackRate = S.wpm / nwpm;
    if (voice.currentTime < f.t0 - .25 || voice.currentTime > f.t1 + .1) voice.currentTime = f.t0;
    if (voice.paused) voice.play().catch(() => { voiceFailed = true; toast("Voice unavailable here, reading at his pace"); });
  } else if (!voice.paused) voice.pause();
  // score: mood beds in Dramatic and Narrator (under the voice), heartbeat in Dramatic
  if (score && r.playing && S.sound && (S.mode === "dramatic" || voiceOn())) {
    const st = stateAt(tokens, p);
    score.sync(S.mode === "dramatic" ? st.bpm : 0, st.mood, voiceOn());
  } else if (score) score.off();
  if (r.playing && Date.now() - savedAt > 5000) savePlace();
  // labels
  const cn = f && !f.plate && !f.blank ? castN(f.who) : 0;
  $("who").textContent = cn ? book.cast[f.who] : ""; $("who").className = cn ? "c" + cn : "";
  $("prog").style.width = (100 * Math.min(p, n) / n).toFixed(1) + "%";
  if (r.playing) { $("status").textContent = walking && voiceOn() ? "" : `${S.wpm} wpm · ${MODES[S.mode]}`; return; }
  if (p >= n) { $("status").textContent = "The end · pinch to start over"; return; }
  hint();
};
reader.onEnd = () => { savePlace(); voice.pause(); score && score.off(); };
function hint() {
  const sc = sceneAt(tokens, reader.pos());
  $("status").textContent = `${sc ? `Scene ${sc.n}: ${sc.title}` : book.title} · pinch to read`;
}

// ---------- walking: words step aside, the narrator keeps going ----------
// The glasses report head motion through DeviceMotionEvent. A steady bob means walking.
let walking = false, pausedForWalk = false, motion = [], watching = false, still = 0;
function onMotion(e) {
  const a = e.accelerationIncludingGravity || e.acceleration; if (!a || a.x == null) return;
  const now = performance.now(), m = Math.hypot(a.x, a.y, a.z);
  motion.push([now, m]); while (motion.length && now - motion[0][0] > 2000) motion.shift();
  if (motion.length < 10) return;
  const mean = motion.reduce((s, x) => s + x[1], 0) / motion.length;
  const sd = Math.sqrt(motion.reduce((s, x) => s + (x[1] - mean) ** 2, 0) / motion.length);
  if (!walking && sd > 1.2) setWalking(true);
  else if (walking && sd < .6) { if (!still) still = now; if (now - still > 3000) setWalking(false); }
  else still = 0;
}
function setWalking(on) {
  walking = on; still = 0;
  if (on) {
    if (reader.playing && !voiceOn()) { reader.pause(); pausedForWalk = true; }
    $("walk").textContent = voiceOn() ? "Walking · listening" : "Paused while you walk";
  } else if (pausedForWalk) { pausedForWalk = false; reader.play(); }
  $("walk").hidden = !on;
  reader.render();
}
async function startWalkWatch() {
  if (!S.walk || watching || !("DeviceMotionEvent" in window)) return;
  try { if (typeof DeviceMotionEvent.requestPermission === "function" && await DeviceMotionEvent.requestPermission() !== "granted") return; } catch { return; }
  addEventListener("devicemotion", onMotion); watching = true;
}
function stopWalkWatch() {
  if (watching) removeEventListener("devicemotion", onMotion);
  watching = false; motion = []; if (walking) { walking = false; $("walk").hidden = true; }
}

// read-only handle for automated QA (voice drift, position)
window.__owl = { reader, voice, get book() { return book && book.id; } };
boot();
