// 물어보기(3회차): 아이가 묻는 말을 Anthropic API(Haiku)에 보내 로봇 대답을 받는다.
// API 키는 어른이 설정 화면에서 넣어 이 기기 브라우저에만 둔다(저장소·다른 서버에는 없다).
// 보내는 것: 질문 글자, 지금 있는 천체 이름, 같은 천체에서 직전 질문·대답 몇 개. 아이·로봇 이름은 보내지 않는다.

import { byId } from './data.js';

const KEY_STORE = 'space-trip.apikey';
const API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 320;        // 두세 문장이면 충분하다(비용 상한)
export const MAX_Q = 80;       // 질문 길이 제한(글자)
const KEEP = 3;                // 같은 천체에서 기억하는 직전 질문·대답 수
const WAIT_MS = 20000;

// 시스템 프롬프트는 여기 고정한다(게임 화면에서 바꿀 수 없다).
const SYSTEM = `너는 다섯 살 아이와 함께 우주선을 타고 태양계를 여행하는 다정한 로봇이야.
아이가 지금 있는 천체에 대해 묻는 말에 한국어로 대답해.

대답하는 법
- 두세 문장으로 짧게. 한 문장도 짧게. 다섯 살이 아는 쉬운 낱말만 쓴다.
- 다정한 반말(「~야」, 「~해」)로. 아이를 부르는 말이나 인사로 시작하지 않는다(부르는 말은 게임이 붙인다).
- 지금 있는 천체를 기준으로 대답한다. 질문에 「여기」, 「거기」가 나오면 지금 있는 천체를 말하는 것이다.
- 사실은 NASA 자료처럼 정확하게. 확실하지 않거나 과학자들도 모르는 것은 「아직 과학자들도 잘 몰라」라고 솔직하게 말한다.
- 큰 숫자는 그대로 말하지 말고 아이가 아는 것과 비교한다(지구 몇 개, 비행기로 몇 년, 냉장고보다 훨씬 차가워 같은).
- 무서운 이야기(죽음, 다침, 재난, 폭발, 충돌, 태양이 지구를 삼키는 일 같은 것), 폭력은 꺼내지 않는다. 그런 쪽으로 물어도 무섭지 않게 부드럽고 안심되는 말로 대답한다.
- 우주와 상관없는 질문이나 알아듣기 어려운 말이면, 짧고 부드럽게 받아 주고 지금 있는 천체의 재미있는 이야기 하나로 돌아온다.
- 아이에게 이름, 사는 곳, 나이 같은 개인 정보를 묻지 않는다. 링크, 광고, 다른 앱이나 웹사이트 이야기를 하지 않는다.
- 글머리표, 별표, 제목 같은 꾸밈 없이 말하듯 평범한 글로만 쓴다.`;

let key = '';
try { key = localStorage.getItem(KEY_STORE) || ''; } catch {}

export const hasKey = () => !!key;
export function saveKey(k) { key = k; try { localStorage.setItem(KEY_STORE, k); } catch {} }
export function clearKey() { key = ''; try { localStorage.removeItem(KEY_STORE); } catch {} }
// 화면에는 앞 몇 글자만
export const maskedKey = () => key ? key.slice(0, 10) + '…' + '●'.repeat(8) : '';
export const looksLikeKey = k => /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(k);

// 천체마다 직전 질문·대답(이 화면을 연 동안만, 저장하지 않는다)
const history = {};

// 아이·로봇 이름이 질문에 섞여 있으면 빼고 보낸다(이름은 밖으로 보내지 않는다)
function scrub(q, names) {
  for (const [name, swap] of names) {
    if (!name || name.length < 2) continue;
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    q = q.replace(new RegExp(esc + '(이야|야|아|이가|가|이는|는|은|이를|를|을|의)?', 'g'), swap);
  }
  return q.replace(/\s+/g, ' ').trim();
}

// 모델 대답 다듬기: 꾸밈표·링크를 걷고, 잘렸으면 마지막 문장 끝까지만
function tidy(text, cut) {
  let t = text
    .replace(/https?:\/\/\S+|www\.\S+/g, '')
    .replace(/[*#_`>~|]/g, '')
    .replace(/^\s*[-•·]\s*/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (cut) {
    const m = t.match(/^[\s\S]*[.!?…~]|^[\s\S]*(요|야|어|해|지|아|래|대|네)(?=\s|$)/);
    if (m) t = m[0];
  }
  return t;
}

function placeText(bodyId) {
  if (bodyId === 'earth') return '지금 우주선은 우리 집 지구 곁에 있어.';
  const b = byId[bodyId];
  const kind = { star: '별', planet: '행성', dwarf: '왜소행성', moon: '지구의 달' }[b.kind] || '';
  return `지금 우주선은 ${b.name}(${kind}) 곁에 있어.`;
}

// 응답 → 무엇이 문제인지: ok | key | limit | busy | net | other
function classify(status, body) {
  const type = body?.error?.type || '';
  const msg = (body?.error?.message || '').toLowerCase();
  if (status === 401 || status === 403 || type === 'authentication_error' || type === 'permission_error') return 'key';
  if (status === 402 || type === 'billing_error' || /credit|usage limit|spend|billing|balance/.test(msg)) return 'limit';
  if (status === 429 || status === 529 || status >= 500) return 'busy';
  return 'other';
}

async function call(payload, apiKey, signal) {
  if (!navigator.onLine) return { why: 'net' };
  const ctl = new AbortController();
  let timer;
  // 끊겨서 응답이 영영 안 와도 정해진 시간 뒤에는 반드시 끝난다
  const late = new Promise((_, no) => { timer = setTimeout(() => { ctl.abort(); no(new Error('timeout')); }, WAIT_MS); });
  signal?.addEventListener('abort', () => ctl.abort(), { once: true });
  try {
    const res = await Promise.race([late, globalThis.fetch(API, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(payload),
      signal: ctl.signal,
    })]);
    let body = null;
    try { body = await Promise.race([late, res.json()]); } catch {}
    if (!res.ok) return { why: classify(res.status, body), status: res.status, detail: body?.error?.message || '' };
    return { why: 'ok', body };
  } catch (e) {
    return { why: signal?.aborted ? 'cancel' : 'net', detail: String(e?.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

// 물어보기. names: [[아이 이름, 바꿀 말], [로봇 이름, 바꿀 말]]
// → { ok: true, text } | { ok: false, why }
export async function ask(bodyId, question, names, signal) {
  if (!key) return { ok: false, why: 'key' };
  const q = scrub(String(question).slice(0, MAX_Q), names);
  if (!q) return { ok: false, why: 'empty' };
  const past = history[bodyId] || [];
  const messages = [];
  for (const h of past) messages.push({ role: 'user', content: h.q }, { role: 'assistant', content: h.a });
  messages.push({ role: 'user', content: q });
  const r = await call({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [{ type: 'text', text: SYSTEM }, { type: 'text', text: placeText(bodyId) }],
    messages,
  }, key, signal);
  if (r.why !== 'ok') return { ok: false, why: r.why };
  const raw = (r.body?.content || []).filter(c => c.type === 'text').map(c => c.text).join(' ');
  const text = tidy(raw, r.body?.stop_reason === 'max_tokens');
  if (!text) return { ok: false, why: 'other' };
  history[bodyId] = [...past, { q, a: text }].slice(-KEEP);
  return { ok: true, text };
}

// 어른용 「연결 확인」: 아주 짧은 요청 하나로 키·한도·인터넷을 본다
export async function check(k) {
  if (!looksLikeKey(k)) return { why: 'key' };
  return call({ model: MODEL, max_tokens: 1, messages: [{ role: 'user', content: '안녕' }] }, k);
}
export const checkSaved = () => check(key);
