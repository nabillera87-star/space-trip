// 작고 부드러운 효과음. 파일 없이 WebAudio로 합성한다.
// 아이패드 사파리는 손가락으로 누른 뒤에만 소리를 낼 수 있어서 unlock()을 버튼 누를 때 부른다.

const KEY = 'space-trip.sound';
let ctx = null, master = null;
let on = true;
try { on = localStorage.getItem(KEY) !== 'off'; } catch {}

export function isOn() { return on; }
export function setOn(v) {
  on = v;
  try { localStorage.setItem(KEY, v ? 'on' : 'off'); } catch {}
  if (master) master.gain.value = on ? 0.18 : 0;
}

export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = on ? 0.18 : 0;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
}

function tone(freq, { at = 0, dur = 0.25, type = 'sine', vol = 0.5, glide = 0 } = {}) {
  if (!ctx || !on) return;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (glide) o.frequency.exponentialRampToValueAtTime(freq * glide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export const sfx = {
  tap: () => tone(660, { dur: 0.12, vol: 0.3 }),
  count: () => tone(523, { dur: 0.3, vol: 0.4 }),
  go: () => { tone(523, { dur: 0.25 }); tone(659, { at: 0.12, dur: 0.25 }); tone(784, { at: 0.24, dur: 0.5 }); },
  // 발사: 낮고 부드러운 「부우웅」(점점 높아지며 사라짐)
  lift: () => { tone(110, { dur: 2.6, vol: 0.35, type: 'triangle', glide: 2.2 }); tone(165, { at: 0.1, dur: 2.4, vol: 0.2, glide: 2 }); },
  // 소행성 「통!」
  tong: () => { tone(330, { dur: 0.22, vol: 0.45, type: 'triangle', glide: 0.7 }); },
  arrive: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, { at: i * 0.12, dur: 0.45, vol: 0.35 })),
  sparkle: () => [1319, 1568, 2093].forEach((f, i) => tone(f, { at: i * 0.07, dur: 0.35, vol: 0.18 })),
  hot: () => tone(392, { dur: 0.3, vol: 0.3, glide: 0.8 }),
};
