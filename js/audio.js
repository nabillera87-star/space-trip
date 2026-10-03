// 소리(4회차). 파일 없이 Web Audio로 합성한다(카운트다운 녹음 파일만 있으면 쓴다).
// 아이패드 사파리는 손가락으로 누른 뒤에만 소리를 낼 수 있어서 unlock()을 「출발!」 같은 버튼에서 부른다.
//
// 길: 효과음 묶음(sfxBus) ─┐
//     배경음 묶음(bgBus)  ─┴→ master(켜기·끄기) → 스피커
// - 효과음: 버튼·삑·말소리·「통!」·「띠링」·「슝」, 그리고 발사 우르르·바람·엔진(계속 나는 소리지만 우주선 소리라 효과음 쪽)
// - 배경음: 우주 배경 화음(패드), 우주선 안 조종석 기계음
// 계속 나는 소리(층)는 처음 한 번 만들어 두고, drive()가 장면에 맞춰 크기·높이를 부드럽게 바꾼다.

const KEY = 'space-trip.sound';
const VOL_KEY = 'space-trip.vol';
const MASTER = 0.26;            // 전체를 작게(아이패드 음량 중간에서 편안하게)
const CD_FILE = 'sounds/countdown.m4a';

let ctx = null, master, sfxBus, bgBus, meterNode, noiseBuf, L = null;
let on = true;
const vol = { sfx: 0.8, bg: 0.7 };
try { on = localStorage.getItem(KEY) !== 'off'; } catch {}
try { Object.assign(vol, JSON.parse(localStorage.getItem(VOL_KEY) || '{}')); } catch {}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };

export function isOn() { return on; }
export function setOn(v) {
  on = v;
  try { localStorage.setItem(KEY, v ? 'on' : 'off'); } catch {}
  if (master) master.gain.setTargetAtTime(on ? MASTER : 0, ctx.currentTime, 0.15);
  if (!on) try { speechSynthesis.cancel(); } catch {}
}

// 어른용 설정: 효과음·배경음 크기(0~1)
export function getVol() { return { ...vol }; }
export function setVol(kind, v) {
  vol[kind] = clamp(+v || 0, 0, 1);
  try { localStorage.setItem(VOL_KEY, JSON.stringify(vol)); } catch {}
  if (ctx) (kind === 'sfx' ? sfxBus : bgBus).gain.setTargetAtTime(curve(vol[kind]), ctx.currentTime, 0.08);
}
const curve = v => v * v;   // 귀에 고르게 들리게

export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    // 아이패드 옆 무음 스위치가 켜져 있어도 게임 소리는 나게(사파리 17+)
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = on ? MASTER : 0;
    meterNode = ctx.createAnalyser(); meterNode.fftSize = 2048;
    master.connect(meterNode); meterNode.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = curve(vol.sfx); sfxBus.connect(master);
    bgBus = ctx.createGain(); bgBus.gain.value = curve(vol.bg); bgBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    L = buildLayers();
    loadCountdown();
    primeSpeech();
  }
  if (ctx.state !== 'running') ctx.resume();
}

// 사파리가 소리를 멈춰 두는 때(다른 앱 다녀옴·전화 등): 다음 터치에 다시 연다
document.addEventListener('pointerdown', () => { if (ctx && ctx.state !== 'running') ctx.resume(); }, true);
document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.hidden) { ctx.suspend(); try { speechSynthesis.cancel(); } catch {} } else ctx.resume();
});

// ── 부품 ────────────────────────────────────────
function gain(v = 0) { const g = ctx.createGain(); g.gain.value = v; return g; }
function osc(type, f) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.start(); return o; }
function noise() { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.start(0, Math.random() * 2); return s; }
function filt(type, f, q = 0.7) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
// 느린 흔들림(단조롭지 않게)
function wobble(param, rate, depth) { const o = osc('sine', rate); const g = gain(depth); o.connect(g).connect(param); }
function set(param, v, tau) { param.setTargetAtTime(v, ctx.currentTime, tau); }

// ── 계속 나는 소리 층 ───────────────────────────────
function buildLayers() {
  const l = {};

  // 발사 우르르: 걸러 낸 잡음 + 낮은 울림
  l.rumble = gain(0); l.rumble.connect(sfxBus);
  const rn = noise(), rlp = filt('lowpass', 150, 0.6);
  rn.connect(rlp).connect(gain(1.6)).connect(l.rumble);
  const r1 = osc('sine', 46), r2 = osc('sine', 61);
  r1.connect(gain(0.35)).connect(l.rumble); r2.connect(gain(0.22)).connect(l.rumble);
  wobble(rlp.frequency, 3.3, 40);

  // 바람: 잡음을 띠로 걸러 천천히 흔든다
  l.wind = gain(0); l.wind.connect(sfxBus);
  const wn = noise(), wbp = filt('bandpass', 700, 0.6);
  wn.connect(wbp).connect(gain(1.4)).connect(l.wind);
  wobble(wbp.frequency, 0.23, 260);
  l.windBp = wbp;

  // 엔진: 낮은 웅웅(톱니파 둘이 살짝 어긋나 맥놀이) + 약한 쉬익
  l.engine = gain(0); l.engine.connect(sfxBus);
  l.engOsc = [osc('sawtooth', 52), osc('sawtooth', 52.7), osc('triangle', 78.3)];
  const elp = filt('lowpass', 260, 1.1);
  l.engOsc[0].connect(gain(0.32)).connect(elp);
  l.engOsc[1].connect(gain(0.32)).connect(elp);
  l.engOsc[2].connect(gain(0.45)).connect(elp);
  l.engBody = gain(0.5); elp.connect(l.engBody).connect(l.engine);
  wobble(elp.frequency, 0.11, 45);
  for (const o of l.engOsc) wobble(o.detune, 0.07 + Math.random() * 0.05, 9);
  const hn = noise(), hbp = filt('bandpass', 2200, 0.7);
  l.hiss = gain(0.05); hn.connect(hbp).connect(l.hiss).connect(l.engine);
  wobble(hbp.frequency, 0.17, 500);
  l.engLp = elp;

  // 우주 배경음: 밝고 은은한 긴 화음. 두 화음을 천천히 오간다(도·미·솔·레 ↔ 도·파·라·도)
  l.pad = gain(0); l.pad.connect(bgBus);
  const plp = filt('lowpass', 1500, 0.5);
  const dly = ctx.createDelay(1.5); dly.delayTime.value = 0.48;
  const fb = gain(0.32);
  plp.connect(l.pad); plp.connect(dly); dly.connect(fb).connect(dly); dly.connect(gain(0.5)).connect(l.pad);
  l.padVoices = [];
  for (let i = 0; i < 4; i++) {
    const v = gain(0.12);
    const a = osc('sine', 0), b = osc('triangle', 0);
    b.detune.value = 6;
    a.connect(v); b.connect(gain(0.35)).connect(v);
    v.connect(plp);
    wobble(v.gain, 0.05 + i * 0.013, 0.05);
    l.padVoices.push([a, b]);
  }
  l.chords = [[261.63, 329.63, 392.0, 587.33], [261.63, 349.23, 440.0, 523.25]];
  l.chord = 0;
  setChord(l, 0, 0.01);

  // 우주선 안 조종석 기계음: 아주 작은 웅— + 가끔 작은 삑
  l.hum = gain(0); l.hum.connect(bgBus);
  const h1 = osc('sine', 110), h2 = osc('sine', 165.5);
  h1.connect(gain(0.5)).connect(l.hum); h2.connect(gain(0.25)).connect(l.hum);
  const hn2 = noise(), hlp = filt('lowpass', 500, 0.5);
  hn2.connect(hlp).connect(gain(0.12)).connect(l.hum);
  return l;
}

function setChord(l, k, tau = 2.5) {
  l.padVoices.forEach(([a, b], i) => { set(a.frequency, l.chords[k][i], tau); set(b.frequency, l.chords[k][i], tau); });
}

// ── 장면에 맞춰 층을 움직인다(flight.js가 매 프레임 부른다) ──
// s: { mode, phase(발사 장면: ready|count|lift), lift(0~1), ascend(0~1), thrust(0~1) }
let lastDrive = 0, chordT = 0, blipT = 3, prev = {};
export function drive(s, dt) {
  if (!L || ctx.state !== 'running') return;
  chordT += dt; blipT -= dt;
  if (chordT > 11) { chordT = 0; L.chord ^= 1; setChord(L, L.chord); }

  const now = ctx.currentTime;
  if (now - lastDrive < 0.05) return;   // 너무 자주 예약하지 않게
  lastDrive = now;

  let rumble = 0, wind = 0, engine = 0, pad = 0, hum = 0, thrust = s.thrust ?? 0.4, muffle = 0, tau = 0.6;
  const m = s.mode;
  if (m === 'launch') {
    if (s.phase === 'count') engine = 0.18, thrust = 0.05;
    if (s.phase === 'lift') {
      const p = s.lift;
      // 천천히 커지는 우르르(놀라지 않게 2초 넘게) → 높이 오르며 바람으로
      rumble = smooth(0, 0.45, p) * (1 - 0.75 * smooth(0.5, 0.95, p));
      wind = 0.85 * smooth(0.35, 0.8, p);
      engine = 0.25 * (1 - smooth(0.2, 0.6, p));
      thrust = 0.6; tau = 0.35;
    }
  } else if (m === 'ascend') {
    const k = s.ascend;
    rumble = 0.25 * (1 - smooth(0, 0.3, k));
    wind = 0.85 * (1 - smooth(0, 0.7, k));
    engine = 0.8 * smooth(0.15, 0.8, k);
    pad = smooth(0.3, 1, k);
    thrust = 0.75 - 0.3 * k; tau = 0.4;
  } else if (m === 'flight') {
    engine = 1; pad = 1; tau = 0.25;
  } else if (m === 'arriving') {
    engine = 0.6; pad = 1; thrust = 0; tau = 0.35;          // 감속: 엔진이 낮아진다
  } else if (m === 'idle') {
    engine = 0.55; pad = 1; thrust = 0.15;
  } else if (m === 'arrived') {
    engine = 0.4; pad = 1; thrust = 0;
  } else if (m === 'cabin-in' || m === 'cabin') {
    engine = 0.22; pad = 0.55; hum = 1; thrust = 0; muffle = 1; tau = 0.9;   // 조종석 안: 엔진은 벽 너머로 작게
  }
  const t = clamp(thrust, 0, 1);
  const want = {
    rumble: rumble * 0.5, wind: wind * 0.3, engine: engine * 0.42 * (0.6 + 0.4 * t), pad: pad * 0.32, hum: hum * 0.05,
    pitch: 1 + 0.18 * t, cut: muffle ? 170 : 190 + 480 * t, body: 0.35 + 0.55 * t, hiss: muffle ? 0.01 : 0.02 + 0.1 * t,
  };
  for (const k in want) {
    if (prev[k] !== undefined && Math.abs(prev[k] - want[k]) < 0.004 * (k === 'cut' ? 100 : 1)) continue;
    prev[k] = want[k];
    if (k === 'pitch') { const f = [52, 52.7, 78.3]; L.engOsc.forEach((o, i) => set(o.frequency, f[i] * want.pitch, tau)); }
    else if (k === 'cut') set(L.engLp.frequency, want.cut, tau);
    else if (k === 'body') set(L.engBody.gain, want.body, tau);
    else if (k === 'hiss') set(L.hiss.gain, want.hiss, tau);
    else set(L[k].gain, want[k], k === 'pad' || k === 'hum' ? Math.max(tau, 1.2) : tau);
  }
  // 조종석의 작은 기계 삑(가끔, 아주 작게)
  if (hum && blipT <= 0) {
    blipT = 3 + Math.random() * 4;
    const f = [1568, 1760, 2093, 1319][Math.floor(Math.random() * 4)];
    tone(f, { dur: 0.08, vol: 0.05, type: 'sine', bus: bgBus });
    if (Math.random() < 0.5) tone(f * 1.25, { at: 0.1, dur: 0.08, vol: 0.04, bus: bgBus });
  }
}

// ── 한 번 나는 소리 ─────────────────────────────────
function tone(freq, { at = 0, dur = 0.25, type = 'sine', vol = 0.5, glide = 0, attack = 0.02, bus = sfxBus } = {}) {
  if (!ctx || !on) return;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (glide) o.frequency.exponentialRampToValueAtTime(freq * glide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + dur + 0.05);
}
// 종소리처럼 맑게(배음 하나 더)
function bell(freq, at, vol) {
  tone(freq, { at, dur: 1.1, vol, attack: 0.005 });
  tone(freq * 2.01, { at, dur: 0.5, vol: vol * 0.35, attack: 0.005 });
}
// 잡음 한 번(「슝」): 띠 필터가 위로 쓸려 올라갔다 내려온다
function swish({ dur = 0.55, vol = 0.35, from = 450, peak = 2400, pan = 0 } = {}) {
  if (!ctx || !on) return;
  const t = ctx.currentTime;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const bp = filt('bandpass', from, 1.4);
  bp.frequency.setValueAtTime(from, t);
  bp.frequency.exponentialRampToValueAtTime(peak, t + dur * 0.45);
  bp.frequency.exponentialRampToValueAtTime(from * 1.3, t + dur);
  const g = gain(0.0001);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.4);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let out = g;
  if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
  s.connect(bp).connect(g);
  out.connect(sfxBus);
  s.start(t, Math.random()); s.stop(t + dur + 0.05);
}

let tongs = [];
export const sfx = {
  tap: () => tone(660, { dur: 0.12, vol: 0.3 }),
  // 카운트다운 「삑」
  count: () => tone(880, { dur: 0.16, vol: 0.32, type: 'triangle' }),
  go: () => { tone(523, { dur: 0.25, vol: 0.35 }); tone(659, { at: 0.12, dur: 0.25, vol: 0.35 }); tone(784, { at: 0.24, dur: 0.5, vol: 0.35 }); },
  // 소행성 「통!」 — 잇달아 부딪히면 점점 작게
  tong: () => {
    const now = ctx ? ctx.currentTime : 0;
    tongs = tongs.filter(x => now - x < 2.5); tongs.push(now);
    tone(330, { dur: 0.22, vol: 0.45 / (1 + (tongs.length - 1) * 0.6), type: 'triangle', glide: 0.7 });
  },
  // 도착 「띠링」
  arrive: () => { bell(1318.5, 0, 0.22); bell(1975.5, 0.13, 0.18); [2637, 3136].forEach((f, i) => tone(f, { at: 0.28 + i * 0.07, dur: 0.3, vol: 0.05 })); },
  sparkle: () => [1319, 1568, 2093].forEach((f, i) => tone(f, { at: i * 0.07, dur: 0.35, vol: 0.18 })),
  hot: () => tone(392, { dur: 0.3, vol: 0.3, glide: 0.8 }),
  // 방향을 크게 틀 때 「슝」(도는 쪽에서 들리게)
  swoosh: (dir = 0) => swish({ pan: clamp(dir, -1, 1) * 0.6 }),
  // 우주선 안으로 줌인: 짧고 부드러운 「슈웅」
  whoosh: () => { tone(260, { dur: 0.8, vol: 0.22, type: 'triangle', glide: 2.6 }); tone(390, { at: 0.05, dur: 0.7, vol: 0.12, glide: 2.2 }); swish({ dur: 0.9, vol: 0.15, from: 300, peak: 1500 }); },
  // 로봇 「삐빅」
  beep: () => { tone(1175, { dur: 0.09, vol: 0.16, type: 'triangle' }); tone(1568, { at: 0.11, dur: 0.12, vol: 0.16, type: 'triangle' }); },
  // 우주선 안 버튼 「뽁」
  pop: () => { tone(820, { dur: 0.07, vol: 0.32, glide: 0.45, attack: 0.004 }); },
  // 물어보기 대답이 왔을 때 작은 알림
  notice: () => { bell(1046.5, 0, 0.12); bell(1568, 0.1, 0.1); },
  // 조종기
  stick: () => { tone(392, { dur: 0.18, vol: 0.25 }); tone(587, { at: 0.1, dur: 0.3, vol: 0.25 }); },
  // 배경음 크기를 바꿀 때 들어 보기
  padPreview: () => [523.25, 659.25, 783.99].forEach(f => tone(f, { dur: 1.2, vol: 0.12, attack: 0.25, bus: bgBus })),
};

// ── 카운트다운 말소리 ─────────────────────────────
// sounds/countdown.m4a가 있으면 그 녹음(「삼, 이, 일, 발사!」를 같은 박자로, 「발사!」가 마지막 4분의 1에)을 쓰고,
// 없으면 기기의 한국어 음성으로 말한다. 한국어 음성이 없으면 삑만.
let cdBuf = null, koVoice = null;
function loadCountdown() {
  fetch(CD_FILE).then(r => r.ok ? r.arrayBuffer() : null)
    .then(b => b && new Promise((ok, no) => ctx.decodeAudioData(b, ok, no)))
    .then(buf => { if (buf) cdBuf = buf; })
    .catch(() => {});
}
function pickVoice() {
  try {
    const vs = speechSynthesis.getVoices().filter(v => /^ko/i.test(v.lang));
    koVoice = vs.find(v => v.localService && /yuna|유나|sora|siri/i.test(v.name)) || vs.find(v => v.localService) || vs[0] || null;
  } catch { koVoice = null; }
}
try { pickVoice(); speechSynthesis.addEventListener?.('voiceschanged', pickVoice); } catch {}
// 사파리는 첫 말소리도 손가락으로 누른 순간에 시작해야 해서, 「출발!」에서 소리 없는 말로 미리 연다
function primeSpeech() {
  try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch {}
}
export function say(text) {
  if (!on || vol.sfx <= 0) return;
  if (!koVoice) pickVoice();
  if (!koVoice) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = koVoice; u.lang = koVoice.lang || 'ko-KR';
    u.rate = 1.05; u.pitch = 1.15; u.volume = clamp(vol.sfx * 0.75, 0, 1);
    speechSynthesis.speak(u);
  } catch {}
}
// 카운트다운 시작: 녹음이 있으면 틀고 한 박자 길이(ms)를, 없으면 0을 돌려준다
export function startCountdownVoice() {
  if (!cdBuf || !ctx || !on) return 0;
  const s = ctx.createBufferSource(); s.buffer = cdBuf;
  s.connect(sfxBus); s.start();
  return cdBuf.duration * 1000 / 4;
}

// 확인용: 지금 나가는 소리 크기(RMS)
export function meter() {
  if (!meterNode) return 0;
  const a = new Float32Array(meterNode.fftSize);
  meterNode.getFloatTimeDomainData(a);
  let s = 0; for (const x of a) s += x * x;
  return Math.sqrt(s / a.length);
}
