// 우주선 안(2회차): 조종석 창틀·계기판·조종기, 로봇, 설명 블록(한 장씩 넘기기).
// 3D(창 너머 천체로 다가가는 카메라)는 flight.js가 맡고, 여기는 그 위에 덮는 화면만 맡는다.
// 설명 글은 cards.js에 있다. 물어보기(3회차)는 ask.js가 묻고, 여기서는 그 화면만 맡는다.

import { CARDS, LAST, NAME_ASK, NAME_THANKS, DEFAULT_ROBOT, EXTRA_SIZES, ASK, QUESTIONS } from './cards.js';
import * as asker from './ask.js';
import { byId } from './data.js';
import { thumbUrls } from './thumbs.js';
import { sfx } from './audio.js';

const ROBOT_KEY = 'space-trip.robot';   // 로봇 이름도 이 기기 브라우저에만 둔다
const $ = s => document.querySelector(s);

let screen, pages = [], idx = 0, bodyId = null, astro = '', handlers = {};
let robotName = '';
// 말풍선이 지금 무엇을 보이나: cards(설명) | name(로봇 이름) | ask(묻기) | think(생각 중) | answer(대답)
let mode = 'cards', askNo = 0, askCtl = null;
try { robotName = localStorage.getItem(ROBOT_KEY) || ''; } catch {}

// ── 글 채우기: {아이} {로봇}, 받침에 따라 {로봇:이야} → 「동동이야 / 별님이야」 ──
const PAIRS = { '이야': '야', '이': '가', '은': '는', '을': '를', '과': '와', '이랑': '랑' };
function hasBatchim(word) {
  const c = word.charCodeAt(word.length - 1);
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
}
function fill(text) {
  return text.replace(/\{(아이|로봇)(?::([^}]+))?\}/g, (_, who, j) => {
    const w = who === '아이' ? astro : (robotName || DEFAULT_ROBOT);
    if (!j) return w;
    return w + (hasBatchim(w) ? j : (PAIRS[j] ?? j));
  });
}

// ── 시작 ────────────────────────────────────────
// on: { stick(), out() } — 조종기·「밖으로」를 누르면 부른다
export function initCabin(on) {
  handlers = on;
  screen = $('#screen-cabin');
  $('#cab-next').addEventListener('click', () => go(idx + 1));
  $('#cab-prev').addEventListener('click', () => go(idx - 1));
  $('#cab-out').addEventListener('click', () => { sfx.pop(); handlers.out(); });
  $('#cab-stick').addEventListener('click', pressStick);
  $('#robot').addEventListener('click', () => { robotHop(); sfx.beep(); });
  $('#robot-tag').addEventListener('click', () => { sfx.pop(); askName(); });
  const input = $('#robot-name-input');
  for (const b of ['#robot-name-ok', '#robot-name-skip']) $(b).addEventListener('pointerdown', e => e.preventDefault());
  $('#robot-name-ok').addEventListener('click', () => setName(input.value));
  $('#robot-name-skip').addEventListener('click', () => setName(''));
  input.addEventListener('keydown', e => { if (e.key === 'Enter') setName(input.value); });

  // 물어보기
  const q = $('#ask-input');
  q.maxLength = asker.MAX_Q;
  $('#cab-ask').addEventListener('click', () => { sfx.pop(); openAsk(); });
  $('#ask-send').addEventListener('pointerdown', e => e.preventDefault());
  $('#ask-send').addEventListener('click', () => sendQ(q.value));
  q.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) sendQ(q.value); });
  $('#ask-again').addEventListener('click', () => { sfx.pop(); openAsk(); });
  for (const b of ['#ask-back', '#ask-done']) $(b).addEventListener('click', () => { sfx.pop(); backToCards(); });
}

// 창 너머 천체를 둘 화면 자리(CSS의 .cab-spot) → { x, y (0~1), rad (픽셀) }
export function spotView() {
  const wasHidden = screen.hidden;
  if (wasHidden) { screen.style.visibility = 'hidden'; screen.hidden = false; }
  const r = $('.cab-spot').getBoundingClientRect();
  if (wasHidden) { screen.hidden = true; screen.style.visibility = ''; }
  return { x: (r.left + r.width / 2) / innerWidth, y: (r.top + r.height / 2) / innerHeight, rad: Math.max(60, Math.min(r.width, r.height) / 2 * 0.86) };   // 창틀에 붙지 않게 조금 여유
}

// 조종석 창을 지나는 순간 부른다(화면은 main.js의 show()가 띄운다)
export function openCabin(id, astroName) {
  bodyId = id; astro = astroName;
  screen.classList.remove('leaving');
  screen.classList.remove('entering'); void screen.offsetWidth; screen.classList.add('entering');
  $('#cab-stick').classList.remove('pushed', 'call');
  $('#dash-name').textContent = id === 'earth' ? '지구 🏠' : byId[id].name;
  paintTag();
  cancelAsk();
  if (!robotName) { askName(true); return; }
  pages = [...CARDS[id], LAST];
  show(0, true);
}

export function leaveCabin() {
  screen.classList.add('leaving');
  $('#robot-name-input').blur();
  $('#ask-input').blur();
  cancelAsk();
}

// 말풍선 모드 바꾸기: 모드마다 보이는 줄이 다르다
function setMode(m) {
  mode = m;
  screen.classList.toggle('naming', m === 'name');
  screen.classList.toggle('asking', m === 'ask');
  $('#robot-name-row').hidden = m !== 'name';
  $('#ask-row').hidden = m !== 'ask';
  $('#answer-btns').hidden = m !== 'answer' && m !== 'think';
  $('#ask-again').hidden = m !== 'answer';   // 생각하는 동안에는 「설명으로 돌아가기」만
  $('.cab-nav').hidden = m !== 'cards';
  $('#cab-pic').hidden = m === 'name' || m === 'ask';
  // 키가 없으면 물어보기 단추는 아예 없다(눌러도 안 되는 단추는 두지 않는다)
  $('#cab-ask').hidden = !(m === 'cards' && asker.hasKey());
  $('#robot').classList.toggle('thinking', m === 'think');
  $('.bubble').classList.toggle('answer', m === 'think' || m === 'answer');
}

function flip() {
  const bubble = $('.bubble');
  bubble.classList.remove('flip'); void bubble.offsetWidth; bubble.classList.add('flip');
}

// ── 로봇 이름 ───────────────────────────────────
function askName(first = false) {
  cancelAsk();
  setMode('name');
  $('#cab-pic').innerHTML = '';
  $('#cab-say').textContent = NAME_ASK;
  const input = $('#robot-name-input');
  input.value = robotName && robotName !== DEFAULT_ROBOT ? robotName : '';
  input.placeholder = DEFAULT_ROBOT;
  $('#robot-name-skip').textContent = `그냥 ${DEFAULT_ROBOT}`;
  setTimeout(() => { robotWave(); sfx.beep(); }, first ? 700 : 0);
}

function setName(v) {
  const n = v.trim().slice(0, 8);
  robotName = n || robotName || DEFAULT_ROBOT;
  try { localStorage.setItem(ROBOT_KEY, robotName); } catch {}
  $('#robot-name-input').blur();
  paintTag();
  sfx.beep();
  // 고맙다는 장 다음에 이 천체 설명을 처음부터(이름표를 눌러 바꿨을 때도)
  pages = [{ text: NAME_THANKS, pic: '💖' }, ...CARDS[bodyId], LAST];
  show(0, false);
}

function paintTag() { $('#robot-tag').textContent = robotName || DEFAULT_ROBOT; }

// ── 설명 블록 ───────────────────────────────────
function go(i) {
  if (i < 0 || i >= pages.length) return;
  sfx.pop();
  show(i, false);
}

function show(i, first) {
  idx = i;
  const p = pages[i];
  const say = $('#cab-say'), pic = $('#cab-pic');
  setMode('cards');
  say.textContent = fill(p.text);
  pic.innerHTML = '';
  pic.appendChild(makePic(p.pic));
  flip();
  $('#cab-prev').style.visibility = i > 0 ? 'visible' : 'hidden';
  $('#cab-next').style.visibility = i < pages.length - 1 ? 'visible' : 'hidden';
  const dots = $('.cab-dots');
  dots.innerHTML = '';
  for (let k = 0; k < pages.length; k++) {
    const d = document.createElement('span');
    if (k === i) d.className = 'on';
    dots.appendChild(d);
  }
  $('#cab-stick').classList.toggle('call', i === pages.length - 1);
  if (p.face) handlers.face?.();
  if (first) setTimeout(() => { robotWave(); sfx.beep(); }, 700);
  else robotNod();
}

// ── 물어보기 ─────────────────────────────────────
function openAsk() {
  cancelAsk();
  setMode('ask');
  $('#cab-say').textContent = ASK.prompt;
  $('#ask-input').value = '';
  const wrap = $('#ask-presets');
  wrap.innerHTML = '';
  for (const text of QUESTIONS[bodyId] || []) {
    const b = document.createElement('button');
    b.className = 'btn preset';
    b.textContent = text;
    b.addEventListener('click', () => { sfx.pop(); sendQ(text); });
    wrap.appendChild(b);
  }
  flip();
  robotWave();
}

async function sendQ(raw) {
  if (mode !== 'ask') return;
  const input = $('#ask-input');
  const q = raw.trim().slice(0, asker.MAX_Q);
  if (!q) { retrigger(input, 'shake'); return; }
  input.blur();
  sfx.beep();
  // 생각하는 동안: 들은 질문을 위에 작게, 로봇은 눈을 굴리고 안테나를 반짝
  setMode('think');
  const pic = $('#cab-pic');
  pic.innerHTML = '';
  const heard = document.createElement('div');
  heard.className = 'heard';
  heard.textContent = `「${q}」`;
  pic.appendChild(heard);
  $('#cab-say').textContent = ASK.thinking;
  flip();

  const no = ++askNo;
  askCtl = new AbortController();
  const names = [[astro, '나'], [robotName, '로봇']];
  const [r] = await Promise.all([
    asker.ask(bodyId, q, names, askCtl.signal),
    new Promise(res => setTimeout(res, 900)),   // 너무 빨리 바뀌어 깜빡이지 않게
  ]);
  if (no !== askNo || mode !== 'think') return;   // 그사이 다른 데로 갔다
  askCtl = null;
  setMode('answer');
  pic.innerHTML = '';
  pic.appendChild(heard);
  if (r.ok) {
    pic.appendChild(makePic({ body: bodyId }));
    $('#cab-say').textContent = `${astro} 우주비행사, ${r.text}`;
    sfx.notice();
  } else {
    pic.appendChild(makePic('📡'));
    $('#cab-say').textContent = ASK.weak;   // 무엇이 문제인지는 어른용 설정의 「연결 확인」에서만
  }
  flip();
  robotNod();
}

function cancelAsk() {
  askNo++;
  askCtl?.abort();
  askCtl = null;
  $('#robot')?.classList.remove('thinking');
}

function backToCards() {
  cancelAsk();
  $('#ask-input').blur();
  show(idx, false);
}

// ── 그림 ────────────────────────────────────────
function makePic(pic) {
  if (typeof pic === 'string') {
    const d = document.createElement('div');
    d.className = 'pic-emoji';
    d.textContent = pic;
    return d;
  }
  if (pic.body) {
    const img = document.createElement('img');
    img.className = 'pic-body';
    img.alt = '';
    if (thumbUrls[pic.body]) img.src = thumbUrls[pic.body];
    return img;
  }
  return sizePic(pic.size, pic.row);
}

// 썸네일 그림에서 구가 차지하는 비율(고리·빛무리 때문에 작게 찍힌 것)
const FILL = { saturn: 0.518, haumea: 0.64, sun: 0.87 };
const imgCache = {};
function bodyImg(id) {
  if (!imgCache[id] && thumbUrls[id]) { imgCache[id] = new Image(); imgCache[id].src = thumbUrls[id]; }
  return imgCache[id];
}
const radiusOf = id => byId[id] ? byId[id].re : EXTRA_SIZES[id];
const nameOf = id => byId[id] ? byId[id].name : { charon: '카론' }[id] || id;
const FONT = '"Jua", "Apple SD Gothic Neo", sans-serif';

// 실제 크기 비율대로 그린다. row가 있으면 마지막(큰) 천체 아래에 첫 천체를 row개 나란히.
function sizePic(ids, row) {
  const cw = 340, ch = row ? 156 : 150;
  const c = document.createElement('canvas');
  const dpr = Math.min(2, devicePixelRatio || 1);
  c.width = cw * dpr; c.height = ch * dpr;
  c.className = 'pic-size';
  const draw = () => {
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, cw, ch);
    const disc = (id, x, y, d) => {
      const im = bodyImg(id);
      if (im && im.complete && im.naturalWidth) {
        const s = d / (FILL[id] || 0.97);
        g.drawImage(im, x - s / 2, y - s / 2, s, s);
      } else {
        g.fillStyle = '#b9b4c8'; g.beginPath(); g.arc(x, y, d / 2, 0, Math.PI * 2); g.fill();
      }
    };
    let ink = '#5a5080';
    const label = (t, x, y) => {
      g.font = `20px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = ink; g.fillText(t, x, y);
    };
    const rs = ids.map(radiusOf), big = Math.max(...rs), small = Math.min(...rs);
    if (row) {
      // 큰 천체 + 그 지름만큼 작은 천체를 한 줄로
      const [a, b] = ids, D = FILL[b] ? 78 : 104, d = D / row;
      const half = D / 2 / (FILL[b] || 1) * 0.95;   // 고리까지 친 반 너비
      disc(b, cw / 2, 8 + D / 2, D);
      const y = 8 + D + 8 + d / 2;
      for (let i = 0; i < row; i++) disc(a, cw / 2 - D / 2 + (i + 0.5) * d, y, d);
      g.strokeStyle = 'rgba(90,80,128,.45)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(cw / 2 + D / 2 + 10, y); g.lineTo(cw / 2 + D / 2 + 22, y); g.stroke();
      label(`${nameOf(a)} ${row}개`, cw / 2 + D / 2 + 66, y);
      label(nameOf(b), cw / 2 - half - 30, 8 + D / 2);
    } else if (big / small > 20) {
      // 너무 크면(태양) 오른쪽 아래 귀퉁이에 둥근 가장자리만 보이게 크게 그린다
      const d = 4, D = d * big / small;
      const [a, b] = rs[0] < rs[1] ? ids : [ids[1], ids[0]];
      // 잘린 가장자리가 어색하지 않게 우주색 액자 안에
      g.beginPath(); g.roundRect ? g.roundRect(4, 4, cw - 8, ch - 8, 20) : g.rect(4, 4, cw - 8, ch - 8); g.fillStyle = '#262a66'; g.fill(); g.save(); g.clip();
      ink = '#fff';
      disc(b, cw + 20, ch + 90, D);
      g.restore();
      const ex = cw * 0.27, ey = ch * 0.42;
      disc(a, ex, ey, d);
      g.strokeStyle = 'rgba(255,236,160,.9)'; g.lineWidth = 2;
      g.beginPath(); g.arc(ex, ey, 11, 0, Math.PI * 2); g.stroke();
      label(nameOf(a), ex, ey + 28);
      label(nameOf(b), cw - 40, ch - 22);
    } else {
      // 나란히, 밑을 맞춰서. 한 칸 너비는 구와 이름 가운데 넓은 쪽
      g.font = `20px ${FONT}`;
      const lw = ids.map(id => g.measureText(nameOf(id)).width + 6);
      const gap = 14;
      let D = 110, ds, slots, total;
      for (;;) {
        ds = rs.map(r => Math.max(6, D * r / big));
        slots = ds.map((d, i) => Math.max(d, lw[i]));
        total = slots.reduce((s, w) => s + w, 0) + gap * (ids.length - 1);
        if (total <= cw - 8 || D < 40) break;
        D -= 4;
      }
      let x = (cw - total) / 2;
      const base = 6 + D;
      ids.forEach((id, i) => {
        const cx = x + slots[i] / 2;
        disc(id, cx, base - ds[i] / 2, ds[i]);
        label(nameOf(id), cx, base + 18);
        x += slots[i] + gap;
      });
    }
  };
  draw();
  // 그림이 아직 안 불러졌으면 불러지는 대로 다시
  for (const id of ids) { const im = bodyImg(id); if (im && !im.complete) im.addEventListener('load', draw, { once: true }); }
  return c;
}

// ── 조종기 · 로봇 몸짓 ───────────────────────────
function pressStick() {
  const s = $('#cab-stick');
  if (s.classList.contains('pushed')) return;
  s.classList.add('pushed');
  sfx.stick();
  setTimeout(() => handlers.stick(), 450);
}

function retrigger(el, cls) { el.classList.remove(cls); void el.getBoundingClientRect(); el.classList.add(cls); }
function robotNod() { retrigger($('#robot'), 'nod'); retrigger($('#robot'), 'glow'); }
function robotWave() { retrigger($('#robot'), 'wave'); retrigger($('#robot'), 'glow'); }
function robotHop() { retrigger($('#robot'), 'hop'); retrigger($('#robot'), 'glow'); }
