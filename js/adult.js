// 어른용 설정(3회차): 첫 화면 구석의 작은 ⚙️를 2초 길게 눌러야 열린다(아이가 우연히 열기 어렵게).
// 물어보기에 쓰는 API 키를 넣고, 「연결 확인」으로 무엇이 문제인지 쉬운 말로 본다.

import * as asker from './ask.js';

const HOLD_MS = 2000;
const $ = s => document.querySelector(s);

const SAY = {
  ok: '✅ 연결됐어요! 이제 우주선 안에 「❓ 물어보기」 단추가 생겨요.',
  key: '❌ 키가 맞지 않아요. Anthropic 콘솔에서 키를 다시 복사해 통째로 붙여 넣어 주세요.',
  limit: '⚠️ 사용 한도(또는 남은 금액)에 닿았어요. Anthropic 콘솔의 Billing·Limits에서 확인해 주세요.',
  net: '📶 인터넷이 끊겼거나 응답이 없어요. 와이파이를 확인하고 다시 눌러 주세요.',
  busy: '⏳ Anthropic 쪽이 지금 바쁘거나 너무 자주 물었어요. 잠시 뒤 다시 눌러 주세요.',
  other: '❓ 알 수 없는 문제예요.',
};

// open(): 설정 화면 띄우기, close(): 닫기 — main.js가 화면 전환을 맡는다
export function initAdult({ open, close }) {
  const gear = $('#btn-adult');
  let timer = null;
  const stop = () => { clearTimeout(timer); timer = null; gear.classList.remove('holding'); };
  gear.addEventListener('pointerdown', e => {
    e.preventDefault();
    stop();
    gear.classList.add('holding');
    timer = setTimeout(() => { stop(); paint(); $('#adult-status').textContent = ''; open(); }, HOLD_MS);
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) gear.addEventListener(ev, stop);

  const input = $('#adult-key');
  $('#adult-check').addEventListener('click', async () => {
    const typed = input.value.replace(/\s+/g, '');
    const k = typed || (asker.hasKey() ? null : '');
    const status = $('#adult-status');
    if (k === '') { status.textContent = '키를 먼저 붙여 넣어 주세요.'; return; }
    input.blur();
    status.textContent = '확인하는 중…';
    $('#adult-check').disabled = true;
    const r = k ? await asker.check(k) : await asker.checkSaved();
    $('#adult-check').disabled = false;
    let text = SAY[r.why] || SAY.other;
    if (r.why === 'other' && (r.status || r.detail)) text += ` (${r.status || ''} ${String(r.detail || '').slice(0, 80)})`;
    // 새 키는 틀린 키가 아닐 때만 저장한다(인터넷이 끊겨 확인을 못 했어도 저장은 해 둔다)
    if (k && r.why !== 'key') {
      asker.saveKey(k);
      input.value = '';
      if (r.why !== 'ok') text += ' 키는 저장해 두었어요.';
    }
    status.textContent = text;
    paint();
  });
  $('#adult-clear').addEventListener('click', () => {
    asker.clearKey();
    input.value = '';
    $('#adult-status').textContent = '키를 지웠어요. 「❓ 물어보기」 단추가 숨겨져요.';
    paint();
  });
  $('#adult-close').addEventListener('click', () => { input.blur(); input.value = ''; close(); });
}

function paint() {
  $('#adult-saved').textContent = asker.hasKey() ? `저장된 키: ${asker.maskedKey()}` : '저장된 키가 없어요.';
  $('#adult-clear').disabled = !asker.hasKey();
}
