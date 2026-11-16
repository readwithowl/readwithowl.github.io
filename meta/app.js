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

let lib = { genres: [], books: {} }, genre = null, book = null, chap = 0, tokens = [], nwpm = 175, lastAt = 0, savedAt = 0, fresh = true, jumped = false;
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
const SCREENS = ["home", "genre", "read", "settings"];
function show(name, push) {
  for (const s of SCREENS) $(s).hidden = s !== name;
  if (push) history.pushState({ s: name, g: genre && genre.id }, "");
  if (name !== "read") leaveReader();
  if (name === "home") renderShelf();
  if (name === "genre") renderGenre();
  if (name === "settings") renderRows();
}
addEventListener("popstate", e => {
  const st = e.state || {};
  if (st.g) genre = lib.genres.find(g => g.id === st.g) || genre;
  show(st.s || "home");
});
const screen = () => SCREENS.find(s => !$(s).hidden);
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
  try {
    lib = await (await fetch(BOOKS + "library.json")).json();
    const month = new Date().getMonth() + 1;   // seasonal shelves (Christmas) show only in season, at the top
    lib.genres = lib.genres.filter(g => !g.season || g.season.includes(month)).sort((a, b) => !!b.season - !!a.season);
  } catch { lib = { genres: [], books: {} }; }
  show("home");
}
// reading time at your speed: "12 min", "3 h 20 min"
function mins(words) {
  const m = Math.max(1, Math.round(words / S.wpm));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
function renderShelf() {
  const last = Object.entries(places).filter(([id, pl]) => lib.books[id] && pl.pct < 100).sort((a, b) => b[1].at - a[1].at)[0];
  const cont = last ? `<button class="row" data-nav data-book="${last[0]}"><b>Continue: ${esc(lib.books[last[0]].title)}</b><span>${last[1].pct}% read</span></button>` : "";
  $("shelf").innerHTML = lib.genres.length ? cont + lib.genres.map(g =>
    `<button class="row" data-nav data-genre="${g.id}"><b>${esc(g.name)}</b><span>${g.books.length} ${g.books.length === 1 ? "story" : "stories"}</span></button>`).join("")
    : `<p class="help">The library couldn't load. Check your connection, then reopen OWL.</p>`;
  $("setSummary").textContent = `${MODES[S.mode]} · ${S.wpm} wpm`;
  focusFirst();
}
function renderGenre() {
  if (!genre) return show("home");
  $("genreName").textContent = genre.name;
  $("books").innerHTML = genre.books.map(id => {
    const b = lib.books[id], pl = places[id];
    const tags = [b.credit ? b.credit.replace(/^Narration: (.*?),.*/, "Read by $1") : b.narrator && "Narrator", b.cast && "Full cast",
      b.chapters && `${b.chapters} chapters`, mins(b.words), pl && pl.pct && `${pl.pct}% read`].filter(Boolean).join(" · ");
    return `<button class="row" data-nav data-book="${id}"><b>${esc(b.title)}</b><span>${esc(b.author)} · ${tags}</span></button>`;
  }).join("");
  focusFirst();
}
document.addEventListener("click", e => {
  const gn = e.target.closest("[data-genre]");
  if (gn) { returnTo = `[data-genre="${gn.dataset.genre}"]`; genre = lib.genres.find(g => g.id === gn.dataset.genre); return show("genre", true); }
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
// The two original editions sit in books/; the library's books in books/lib/, novels one chapter per file.
async function openBook(id) {
  const info = lib.books[id];
  let b;
  try { b = await (await fetch(BOOKS + (info && info.file ? info.file : `lib/${id}.json`))).json(); } catch { return toastHome("That book couldn't load. Try again."); }
  const pl = places[id];
  book = b;
  if (!(await loadChapter(pl && pl.ch || 1))) { book = null; return toastHome("That book couldn't load. Try again."); }
  if (pl && pl.p < tokens.length) reader.seek(pl.p);
  lastAt = pl ? pl.at : 0; fresh = true; jumped = false;
  show("read", true);
  hint();
}
// loads chapter n (or the whole story), with a title plate at the start of each chapter
async function loadChapter(n) {
  let src = book.src;
  if (book.chapters) {
    n = Math.max(1, Math.min(book.chapters.length, n));
    try { src = (await (await fetch(`${BOOKS}lib/${book.id}/${n}.json`)).json()).src; } catch { return false; }
  }
  chap = book.chapters ? n : 0;
  tokens = loadTokens({ ...book, src }); nwpm = narratorWpm(book);
  if (chap && tokens[0] && !tokens[0].scene) tokens[0].scene = { title: book.chapters[n - 1].title || `Chapter ${n}`, recap: "", n: 1, chapter: n };
  voice.src = book.audio ? BOOKS + book.audio : ""; voiceFailed = false;
  reader.load(tokens, opts(), nwpm);
  return true;
}
function toastHome(msg) { $("setSummary").textContent = msg; }

function savePlace() {
  if (!book) return;
  savedAt = lastAt = Date.now();
  places[book.id] = { p: reader.pos(), ch: chap || undefined, at: lastAt, pct: Math.min(100, Math.round(100 * progress())) };
  store.set("owl.places", places);
}
// whole-book progress, 0..1: words in earlier chapters, plus this chapter so far
function progress() {
  const here = Math.min(reader.pos(), tokens.length) / (tokens.length || 1);
  if (!chap) return here;
  const ws = book.chapters.map(c => c.words), total = ws.reduce((a, b) => a + b, 0);
  return (ws.slice(0, chap - 1).reduce((a, b) => a + b, 0) + ws[chap - 1] * here) / total;
}
async function gotoChapter(n, play) {
  if (!chap || n < 1 || n > book.chapters.length) return false;
  if (!(await loadChapter(n))) { toast("That chapter couldn't load"); return false; }
  savePlace();
  if (play) reader.play(); else hint();
  return true;
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
    const p = reader.pos(), [s, end] = bounds(tokens, Math.min(p, tokens.length - 1)), playing = reader.playing;
    // at either end of a chapter, left and right step to the neighbouring chapter
    if (k === "ArrowLeft" && p <= 1 && chap > 1) return gotoChapter(chap - 1, playing);
    if (k === "ArrowRight" && end >= tokens.length && chap && chap < book.chapters.length) return gotoChapter(chap + 1, playing);
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
  if (f && f.plate) {
    $("plateNum").textContent = f.plate.chapter ? `${f.plate.chapter} of ${book.chapters.length}` : /^Part /.test(f.plate.title) || chap ? "" : "Scene " + f.plate.n;
    $("plateTitle").textContent = f.plate.title;
  }
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
  $("prog").style.width = (100 * progress()).toFixed(1) + "%";
  if (r.playing) { $("status").textContent = walking && voiceOn() ? "" : `${S.wpm} wpm · ${modeName()}`; return; }
  if (p >= n) { $("status").textContent = "The end · pinch to start over"; return; }
  hint();
};
// a chapter's end rolls straight into the next one
reader.onEnd = async () => {
  if (chap && chap < book.chapters.length && await gotoChapter(chap + 1, true)) return;
  savePlace(); voice.pause(); score && score.off();
};
// narrator timing on a book with no recording reads as Natural
const modeName = () => S.mode === "narrator" && !(tokens[0] && tokens[0].n) ? MODES.natural : MODES[S.mode];
function hint() {
  const sc = sceneAt(tokens, reader.pos());
  const where = chap ? book.chapters[chap - 1].title || `Chapter ${chap}`
    : sc && !/^Part /.test(sc.title) && book.id in { poe: 1, holmes: 1 } ? `Scene ${sc.n}: ${sc.title}` : book.title;
  $("status").textContent = `${where} · pinch to read`;
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
