// 화면 흐름: 이름 → 발사 → 목적지 고르기 → 비행 → 도착 → (우주선 누르면) 고르기 …
//                                                    └ (천체 누르면) 우주선 안 → 조종기: 고르기 / 밖으로: 도착

import { byId, PICK_ROWS } from './data.js';
import * as flight from './flight.js';
import { makeThumbs } from './thumbs.js';
import * as cabin from './cabin.js';
import { sfx, unlock, isOn, setOn } from './audio.js';
import { initAdult } from './adult.js';

const NAME_KEY = 'space-trip.name';   // 이름은 이 기기 브라우저에만 둔다
const $ = s => document.querySelector(s);

// 아이패드 사파리는 user-scalable=no를 무시하므로 확대 몸짓을 직접 막는다
for (const ev of ['gesturestart', 'gesturechange', 'contextmenu', 'dblclick']) document.addEventListener(ev, e => e.preventDefault());

flight.init($('#scene'), $('#hud-canvas'));

let astro = '';
function readName() { try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; } }
function saveName(n) { try { localStorage.setItem(NAME_KEY, n); } catch {} }

function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
  $('#hud').hidden = id !== null;
  flight.setPaused(id === 'screen-name' || id === 'screen-credits' || id === 'screen-adult');
}

function toast(text, ms = 1400) {
  const t = $('#toast');
  t.textContent = text; t.hidden = false;
  t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, ms);
}

// ── 소리 버튼 ─────────────────────────────────────
const soundBtn = $('#btn-sound');
function paintSound() { soundBtn.textContent = isOn() ? '🔊' : '🔇'; }
paintSound();
soundBtn.addEventListener('click', () => { unlock(); setOn(!isOn()); paintSound(); sfx.tap(); });

// ── 1. 이름 ──────────────────────────────────────
const input = $('#name-input');
input.value = readName();
function start() {
  unlock();
  const n = input.value.trim().slice(0, 8);
  astro = n || '꼬마';
  if (n) saveName(n);
  input.blur();
  sfx.tap();
  $('#astro-name').textContent = astro;
  document.querySelectorAll('.who-small').forEach(e => { e.textContent = `${astro} 우주비행사,`; });
  flight.showLaunch();
  show('screen-launch');
  $('#btn-launch').hidden = false;
  document.querySelector('.launch-top').hidden = false;
  $('#countdown').textContent = '';
}
// 버튼을 눌러도 입력칸 포커스를 뺏지 않게 해서(키보드가 닫히며 화면이 밀리는 것 방지) 한 번에 눌리게 한다
$('#btn-start').addEventListener('pointerdown', e => e.preventDefault());
$('#btn-start').addEventListener('click', start);
input.addEventListener('keydown', e => { if (e.key === 'Enter') start(); });

$('#btn-credits').addEventListener('click', () => show('screen-credits'));
$('#btn-credits-close').addEventListener('click', () => show('screen-name'));
initAdult({ open: () => show('screen-adult'), close: () => show('screen-name') });

// ── 2. 발사 ──────────────────────────────────────
$('#btn-launch').addEventListener('click', () => {
  unlock();
  $('#btn-launch').hidden = true;
  document.querySelector('.launch-top').hidden = true;
  const cd = $('#countdown');
  flight.countdown();
  ['3', '2', '1', '발사!'].forEach((s, i) => setTimeout(() => {
    cd.textContent = s;
    cd.classList.toggle('small', i === 3);
    cd.classList.remove('pop'); void cd.offsetWidth; cd.classList.add('pop');
    if (i < 3) { sfx.count(); return; }
    sfx.go();
    flight.liftOff(onLaunchStep);
    setTimeout(() => { cd.textContent = ''; }, 900);   // 올라가는 우주선을 가리지 않게
  }, i * 950));
});

function onLaunchStep(step) {
  const fade = $('#fade');
  if (step === 'space') {
    // 하늘을 뚫고 우주로: 짙은 남보라로 살짝 덮였다가 걷힌다
    fade.hidden = false; fade.classList.remove('out');
    requestAnimationFrame(() => requestAnimationFrame(() => fade.classList.add('out')));
    setTimeout(() => { fade.hidden = true; }, 800);
    show(null);
    $('#hud').hidden = true;
  } else if (step === 'ready') {
    toast('우주에 왔어요!', 1600);
    setTimeout(openSelect, 1700);
  }
}

// ── 3. 고르기 ────────────────────────────────────
const cardImgs = {};
function buildPicker() {
  const wrap = $('#pick-rows');
  wrap.innerHTML = '';
  for (const row of PICK_ROWS) {
    const r = document.createElement('div');
    r.className = 'pick-row' + (row.special ? ' special' : '');
    if (row.title) {
      const t = document.createElement('div');
      t.className = 'row-title'; t.textContent = row.title;
      r.appendChild(t);
    }
    const cards = document.createElement('div');
    cards.className = 'cards';
    for (const id of row.ids) {
      const b = byId[id];
      const btn = document.createElement('button');
      btn.className = 'card' + (id === 'earth' ? ' home' : '');
      btn.dataset.id = id;
      const img = document.createElement('img');
      img.alt = '';
      cardImgs[id] = img;
      const name = document.createElement('div');
      name.textContent = id === 'earth' ? '🏠 지구로' : b.name;
      btn.append(img, name);
      btn.addEventListener('click', () => pick(id));
      cards.appendChild(btn);
    }
    r.appendChild(cards);
    wrap.appendChild(r);
  }
}
buildPicker();
makeThumbs([...PICK_ROWS.flatMap(r => r.ids), 'charon']).then(urls => {
  for (const id in urls) if (cardImgs[id]) cardImgs[id].src = urls[id];
  $('#loading').textContent = '';
});

function openSelect() {
  // 비행 도중에 고르면 「지금 여기」는 없다(우주 한가운데)
  const m = flight.getMode();
  const here = (m === 'idle' || m === 'arrived') ? flight.getAt() : null;
  for (const btn of document.querySelectorAll('.card')) {
    const isHere = btn.dataset.id === here;
    btn.classList.toggle('here', isHere);
    btn.disabled = isHere;
    btn.querySelector('.here-badge')?.remove();
    if (isHere) {
      const s = document.createElement('span');
      s.className = 'here-badge'; s.textContent = '지금 여기';
      btn.appendChild(s);
    }
  }
  show('screen-select');
  $('#screen-select').scrollTop = 0;
  $('#hud').hidden = true;
}

function pick(id) {
  sfx.tap();
  const b = byId[id];
  show(null);
  $('#target-pill').textContent = id === 'earth' ? '🏠 지구로 가자!' : `${b.name}까지 가자!`;
  flight.fly(id, arrived);
}

$('#btn-choose').addEventListener('click', () => { sfx.tap(); openSelect(); });
$('#btn-aim').addEventListener('click', () => { sfx.tap(); flight.lookAtTarget(); });

// ── 5. 도착 ──────────────────────────────────────
function arrived(id) {
  const b = byId[id];
  $('#arrive-title').textContent = id === 'earth' ? '지구에 왔어요! 🏠' : id === 'sun' ? '너무 뜨거워!' : `${b.name} 도착!`;
  $('#arrive-fact').textContent = id === 'sun' ? '태양은 여기서 볼게' : b.fact;
  show('screen-arrive');
}
$('#ship-btn').addEventListener('click', () => { sfx.tap(); openSelect(); });

// ── 6. 우주선 안 ─────────────────────────────────
// 도착 화면에서 천체를 누르면: 반짝 → 카메라가 우주선 조종석 창을 지나 안으로 → 로봇 설명
flight.setBodyTap(id => {
  setTimeout(() => {
    if (flight.getMode() !== 'arrived' || $('#screen-arrive').hidden) return;
    if (!flight.enterCabin(cabin.spotView(), () => { show('screen-cabin'); cabin.openCabin(id, astro); })) return;
    $('#screen-arrive').hidden = true;
  }, 250);
});
cabin.initCabin({
  stick: () => { flight.exitCabin(); openSelect(); },
  out: () => {
    cabin.leaveCabin();
    flight.exitCabin();
    setTimeout(() => { if (flight.getMode() === 'arrived') show('screen-arrive'); }, 350);
  },
  face: () => flight.faceFeature(),
});
window.addEventListener('resize', () => { if (!$('#screen-cabin').hidden) flight.setCabinView(cabin.spotView()); });

// 도착 화면: 우주선 단추가 우주선을 따라다닌다. 천체 누르기는 캔버스가 받도록 단추 밖은 통과시킨다.
const shipBtn = $('#ship-btn');
function placeShipBtn() {
  const { x, y, size } = flight.shipScreen();
  shipBtn.style.left = x + 'px';
  shipBtn.style.top = y + 'px';
  shipBtn.style.width = shipBtn.style.height = size + 'px';
}

// ── 루프 ─────────────────────────────────────────
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);   // 한 프레임에서 문제가 나도 게임이 멈추지 않게 먼저 예약
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  try {
    flight.frame(dt);
    if (!$('#screen-arrive').hidden) placeShipBtn();
  } catch (e) {
    console.error(e);
  }
}
requestAnimationFrame(loop);

// 처음 화면
show('screen-name');
flight.showLaunch();
window.__game = { flight, show, openSelect, pick, cabin };   // 확인용
