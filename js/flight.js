// 비행: 조종·카메라·소행성 부딪힘·도착, 그리고 화면 위 2D 표시(미니 지도·이름표·「통!」).
// 모드: launch(땅 위 발사) · ascend(지구가 둥글게 보이며 올라감) · idle(떠 있음) · flight(조종) · arriving(감속) · arrived(도착 화면)
//       · cabin-in(조종석 창을 지나 우주선 안으로) · cabin(우주선 안 — 창 너머로 천체를 본다)

import * as THREE from 'three';
import { BODIES, byId, BELT, MAP_ORDER, arriveRadius, SUN_HOT } from './data.js';
import { initWorld, resizeWorld, updateWorld, updateRocks, updateGuide, render, renderer, camera, scene, rocks, bodyObjs, pickBody, setSpinScale } from './world.js';
import { createShip, glow, SHIP_LEN } from './ship.js';
import * as launch from './launch.js';
import { sfx } from './audio.js';

const CRUISE = 60;         // 기본 빠르기(세계 단위/초)
const BOOST_MAX = 14;      // 목적지 쪽으로 곧게 가면 최대 (1+14)배까지
const BELT_SPEED = 105;    // 소행성대 안 최고 빠르기
const BUMP_SPEED = 35;     // 부딪힌 뒤 잠깐
const SHIP_HIT = 1.3;      // 우주선 부딪힘 반지름
const ASCEND_DUR = 4.2;
const CABIN_IN = 1.8;      // 도착 화면 → 우주선 안 줌인 시간(초)

let hud, hctx, W = 0, H = 0, DPR = 1;
let mode = 'launch', time = 0, modeT = 0;
let at = 'earth', target = null, onArrive = null, onLaunchDone = null;
let shipObj;
const ship = { pos: new THREE.Vector3(), yaw: 0, pitch: 0, yawRate: 0, pitchRate: 0, speed: 0, boost: 0, slowT: 0, align: 0, scale: 1, thrust: 0, freeT: 0 };
const pointer = { down: false, id: null, x: 0, y: 0, touched: false };
let popups = [], hotCool = 0, tongCool = 0, bumps = 0, paused = false;
let mapRect = null;
const camLook = new THREE.Vector3(), camOff = new THREE.Vector3(0, 2, 7), camLookOff = new THREE.Vector3(0, 0, -10);
const arrivedView = { cam: new THREE.Vector3(), look: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), park: new THREE.Vector3() };

const V = () => new THREE.Vector3();
const _f = V(), _u = V(), _t = V(), _d = V(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angLerp = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
const bodyPos = (b, out = V()) => out.fromArray(b.pos);

function fwd(out = _f) {
  const cp = Math.cos(ship.pitch);
  return out.set(-Math.sin(ship.yaw) * cp, Math.sin(ship.pitch), -Math.cos(ship.yaw) * cp);
}
function upVec(out = _u) {
  _e.set(ship.pitch, ship.yaw, 0, 'YXZ');
  return out.set(0, 1, 0).applyEuler(_e);
}
function aimAngles(dir) { return { yaw: Math.atan2(-dir.x, -dir.z), pitch: Math.asin(clamp(dir.y, -1, 1)) }; }

// ── 시작 ────────────────────────────────────────
export function init(canvas, hudCanvas) {
  initWorld(canvas);
  launch.initLaunch();
  shipObj = createShip();
  scene.add(shipObj.object);
  hud = hudCanvas;
  hctx = hud.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  makeSparkles();
}

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  hud.width = Math.round(W * DPR); hud.height = Math.round(H * DPR);
  resizeWorld();
  if ((mode === 'arrived' || mode === 'cabin-in' || mode === 'cabin') && target) frameArrival(target, false);
  if (mode === 'cabin' && target) { frameCabin(target); camera.position.copy(cab.final); camLook.copy(cab.finalLook); camera.lookAt(camLook); }
}

export function setPaused(p) { paused = p; }
export function getAt() { return at; }
export function getMode() { return mode; }
export function debugState() {
  return { mode, at, target: target && target.id, pos: ship.pos.toArray().map(Math.round), speed: Math.round(ship.speed), boost: +ship.boost.toFixed(2), bumps };
}

// ── 흐름 ────────────────────────────────────────
export function showLaunch() { mode = 'launch'; launch.resetLaunch(); shipObj.object.visible = false; }
export function countdown() { launch.startCountdown(); }
// done('space'): 땅 위 장면이 끝나 우주로 넘어갈 때, done('ready'): 지구가 둥글게 보인 뒤 고를 준비가 됐을 때
export function liftOff(done) { launch.startLift(); onLaunchDone = done; sfx.lift(); }

function startAscend() {
  mode = 'ascend'; modeT = 0;
  const e = byId.earth;
  bodyPos(e, ship.pos).y += e.r + 1;
  ship.yaw = 0; ship.pitch = 1.2; ship.speed = 0; ship.scale = 1;
  shipObj.object.visible = true;
}

export function idleAt(id, { place = false } = {}) {
  at = id;
  const b = byId[id];
  if (place) {
    const bp = bodyPos(b);
    const out = bp.clone().setY(0).normalize();
    if (id === 'sun') out.set(0, 0, -1);
    ship.pos.copy(bp).addScaledVector(out, arriveRadius(b) * 0.85).add(V().set(0, b.r * 0.3, 0));
    const a = aimAngles(_d.subVectors(bp, ship.pos).normalize());
    ship.yaw = a.yaw; ship.pitch = 0;
  }
  ship.speed = 0; ship.boost = 0; ship.yawRate = ship.pitchRate = 0; ship.scale = 1;
  target = null;
  mode = 'idle';
  shipObj.object.visible = true;
  snapCamera();
}

export function fly(id, done) {
  target = byId[id];
  onArrive = done;
  mode = 'flight'; modeT = 0;
  pointer.down = false; pointer.touched = false;
  ship.align = 1.4;                   // 출발하면서 목적지 쪽으로 돌아선다
  ship.scale = 1;
  ship.speed = Math.max(ship.speed, 8);
  popups = [];
  syncCamera();
}

// 「목적지 보기」: 한 번에 목적지를 정면에 둔다
export function lookAtTarget() {
  if (mode !== 'flight') return;
  ship.align = 1.1;
  ship.boost = 0;
}

// ── 입력 ────────────────────────────────────────
function onDown(e) {
  if (mode === 'arrived') { tapArrived(e.clientX, e.clientY); return; }
  if (mode !== 'flight') return;
  pointer.down = true; pointer.id = e.pointerId; pointer.touched = true;
  pointer.x = e.clientX; pointer.y = e.clientY;
  try { e.target.setPointerCapture(e.pointerId); } catch {}
  e.preventDefault();
}
function onMove(e) {
  if (!pointer.down || e.pointerId !== pointer.id) return;
  pointer.x = e.clientX; pointer.y = e.clientY;
}
function onUp(e) {
  if (e.pointerId !== pointer.id) return;
  pointer.down = false; pointer.id = null;
}

// ── 한 프레임 ───────────────────────────────────
export function frame(dt) {
  if (paused) return;
  time += dt; modeT += dt;
  if (mode === 'launch') {
    hctx.setTransform(1, 0, 0, 1, 0, 0); hctx.clearRect(0, 0, hud.width, hud.height);
    launch.updateLaunch(dt, time, renderer);
    if (launch.liftProgress() >= 1) { startAscend(); if (onLaunchDone) onLaunchDone('space'); }
    return;
  }
  update(Math.min(dt, 1 / 20));
  updateWorld(dt, time);
  render();
  drawHud();
}

function inBelt(p) {
  const R = Math.hypot(p.x, p.z);
  const a = Math.atan2(p.x, -p.z);
  return R > BELT.r0 - 30 && R < BELT.r1 + 30 && Math.abs(a) < BELT.ang + 0.03 && Math.abs(p.y) < 60;
}
function nearOtherBody() {
  for (const b of BODIES) {
    if (b.id === 'sun' || (target && b.id === target.id)) continue;
    if (bodyPos(b, _t).distanceTo(ship.pos) < b.r * 5 + 120) return true;
  }
  return false;
}

function update(dt) {
  hotCool -= dt; tongCool -= dt; ship.slowT -= dt;
  let thrust = 0.25;

  if (mode === 'ascend') {
    // 지구를 떠나 올라가며 지구가 둥글게 드러난다
    const e = byId.earth, E = bodyPos(e);
    const k = clamp(modeT / ASCEND_DUR, 0, 1);
    const ease = k * k * (3 - 2 * k);
    ship.pos.set(E.x, E.y + e.r + 1 + 26 * ease, E.z - 6 * ease);
    ship.pitch = THREE.MathUtils.lerp(1.2, 0.15, ease); ship.yaw = 0;
    thrust = 1 - 0.6 * ease;
    camera.position.set(E.x + 2 + 6 * ease, E.y + e.r * (1.05 + 0.9 * ease), E.z + e.r * (0.55 + 2.4 * ease));
    camLook.copy(ship.pos).lerp(E, 0.25 + 0.2 * ease);
    camera.up.set(0, 1, 0);
    camera.lookAt(camLook);
    if (camera.fov !== 60) { camera.fov = 60; camera.updateProjectionMatrix(); }
    if (k >= 1) {
      // 지금 카메라 자리에서 이어지도록 우주선 방향만 정하고 떠 있기
      at = 'earth'; mode = 'idle'; ship.speed = 0;
      syncCamera();
      if (onLaunchDone) { const d = onLaunchDone; onLaunchDone = null; d('ready'); }
    }
  } else if (mode === 'flight' || mode === 'arriving') {
    thrust = steer(dt);
  } else if (mode === 'idle') {
    ship.speed *= Math.exp(-3 * dt);
    ship.pos.addScaledVector(fwd(), ship.speed * dt);
    chaseCamera(dt);
  } else if (mode === 'arrived') {
    ship.pos.lerp(arrivedView.park, 1 - Math.exp(-3 * dt));
    camera.position.lerp(arrivedView.cam, 1 - Math.exp(-2.5 * dt));
    camLook.lerp(arrivedView.look, 1 - Math.exp(-2.5 * dt));
    camera.up.lerp(arrivedView.up, 1 - Math.exp(-2.5 * dt));
    camera.lookAt(camLook);
    thrust = 0.15;
  } else if (mode === 'cabin-in' || mode === 'cabin') {
    updateCabin();
    thrust = 0.15;
  }
  updateFace(dt);

  // 우주선 모습
  const sc = THREE.MathUtils.lerp(shipObj.object.scale.x, ship.scale, 1 - Math.exp(-3 * dt));
  shipObj.object.scale.setScalar(sc);
  const bob = (mode === 'idle' || mode === 'arrived') ? Math.sin(time * 1.6) * 0.15 * sc : 0;
  shipObj.object.position.copy(ship.pos).y += bob;
  shipObj.object.rotation.set(ship.pitch, ship.yaw, 0, 'YXZ');
  shipObj.body.rotation.z = THREE.MathUtils.lerp(shipObj.body.rotation.z, clamp(ship.yawRate * 0.55, -0.7, 0.7), 1 - Math.exp(-5 * dt));
  ship.thrust = THREE.MathUtils.lerp(ship.thrust, thrust, 1 - Math.exp(-6 * dt));
  shipObj.update(dt, time, ship.thrust);

  updateRocks(dt, ship.pos);
  if (target && mode === 'flight') updateGuide(true, time, ship.pos, fwd(V()), upVec(V()), bodyPos(target), arriveRadius(target));
  else updateGuide(false);
  updateSparkles(dt);
  for (const p of popups) p.t += dt;
  popups = popups.filter(p => p.t < p.life);
}

function steer(dt) {
  const T = bodyPos(target);
  _d.subVectors(T, ship.pos);
  const dist = _d.length();
  _d.normalize();
  const ar = arriveRadius(target);
  const zone = Math.min(Math.max(160, target.r * 8), 420);
  const aim = aimAngles(_d);
  const facing = fwd().dot(_d);

  // 손가락: 누른 쪽으로 돈다 / 떼면 회전이 멎고 천천히 수평으로 돌아온다
  let wantYaw = 0, wantPitch = 0;
  if (pointer.down && mode === 'flight') {
    let nx = (pointer.x - W / 2) / (Math.min(W, H) * 0.42);
    let ny = (pointer.y - H * 0.55) / (Math.min(W, H) * 0.42);
    nx = clamp(nx, -1, 1); ny = clamp(ny, -1, 1);
    if (Math.abs(nx) < 0.08) nx = 0;
    if (Math.abs(ny) < 0.08) ny = 0;
    wantYaw = -nx * 1.25; wantPitch = -ny * 0.85;
  } else {
    wantPitch = -ship.pitch * 0.7;
  }
  const kr = 1 - Math.exp(-5 * dt);
  ship.yawRate += (wantYaw - ship.yawRate) * kr;
  ship.pitchRate += (wantPitch - ship.pitchRate) * kr;
  ship.yaw += ship.yawRate * dt;
  ship.pitch = clamp(ship.pitch + ship.pitchRate * dt, -1.15, 1.15);

  // 도움: 출발할 때·「목적지 보기」·목적지 가까이에서는 저절로 목적지를 정면에
  let assist = 0;
  if (ship.align > 0) { ship.align -= dt; assist = 1; }
  if (dist < ar + zone) assist = Math.max(assist, 1 - (dist - ar) / zone);
  if (mode === 'arriving') assist = 1;
  // 손을 떼고 조금 지나면 천천히 목적지 쪽 정면으로 돌아온다(길을 잃지 않게)
  if (!pointer.down) { ship.freeT += dt; if (ship.freeT > 0.4) assist = Math.max(assist, Math.min(0.5, (ship.freeT - 0.4) * 0.6)); }
  else { ship.freeT = 0; assist = Math.max(assist, 0.12); }   // 누르는 동안에도 아주 살짝 목적지 쪽으로
  const R = Math.hypot(ship.pos.x, ship.pos.z);
  if (R > byId.eris.orbit + 2500 || Math.abs(ship.pos.y) > 2500) assist = Math.max(assist, 0.5);   // 너무 멀리 벗어나면 살살 되돌린다
  if (assist > 0) {
    const k = 1 - Math.exp(-4 * assist * dt);
    ship.yaw = angLerp(ship.yaw, aim.yaw, k);
    ship.pitch = THREE.MathUtils.lerp(ship.pitch, aim.pitch, k);
    ship.yawRate *= 1 - k; ship.pitchRate *= 1 - k;
  }

  // 빠르기
  const belt = inBelt(ship.pos);
  if (!belt && facing > 0.8 && !nearOtherBody() && dist > ar + zone * 1.2 && mode === 'flight') ship.boost = Math.min(1, ship.boost + dt / 1.8);
  else ship.boost = Math.max(0, ship.boost - dt * 1.3);
  let want = belt ? BELT_SPEED : CRUISE * (1 + BOOST_MAX * ship.boost);
  if (ship.slowT > 0) want = Math.min(want, BUMP_SPEED);
  want = Math.min(want, 14 + Math.max(0, dist - ar) * 0.9);         // 목적지 가까이선 저절로 천천히
  if (mode === 'arriving') want = 0;
  ship.speed += (want - ship.speed) * (1 - Math.exp(-2.2 * dt));
  ship.pos.addScaledVector(fwd(), ship.speed * dt);

  // 태양 가까이는 못 간다
  const ds = ship.pos.length();
  if (ds < SUN_HOT) {
    ship.pos.multiplyScalar(SUN_HOT / ds);
    const a = aimAngles(_t.copy(ship.pos).normalize());
    ship.yaw = angLerp(ship.yaw, a.yaw, 0.08);
    if (hotCool <= 0 && mode === 'flight') { popup('앗 뜨거워!', ship.pos, '#ffd27a'); sfx.hot(); hotCool = 2.5; }
  }

  if (Math.abs(Math.hypot(ship.pos.x, ship.pos.z) - (BELT.r0 + BELT.r1) / 2) < (BELT.r1 - BELT.r0) / 2 + 40) collideRocks();

  if (mode === 'flight' && dist < ar) {
    mode = 'arriving'; modeT = 0;
    sfx.arrive();
    if (target.id === 'sun') popup('너무 뜨거워!', ship.pos, '#ffd27a', 1.6);
  }
  if (mode === 'arriving' && modeT > 0.9) arrive();

  chaseCamera(dt);
  return pointer.down ? 1 : 0.45 + 0.55 * ship.boost;
}

function collideRocks() {
  const f = fwd();
  for (const r of rocks) {
    if (Math.abs(r.p.z - ship.pos.z) > 14 || Math.abs(r.p.x - ship.pos.x) > 14) continue;
    const minD = r.r * 0.95 + SHIP_HIT;
    const d = r.p.distanceTo(ship.pos);
    if (d >= minD) continue;
    const n = _t.subVectors(ship.pos, r.p).normalize();
    ship.pos.copy(r.p).addScaledVector(n, minD);
    const fn = f.dot(n);
    if (fn < 0) {
      f.addScaledVector(n, -1.6 * fn).normalize();
      const a = aimAngles(f);
      ship.yaw = a.yaw; ship.pitch = clamp(a.pitch, -1.15, 1.15);
    }
    ship.speed *= 0.4; ship.slowT = 0.9; ship.boost = 0;
    if (r.hit <= 0 && tongCool <= 0) {
      popup('통!', ship.pos, '#fff2a8');
      sfx.tong();
      tongCool = 0.35; bumps++;
    }
    r.hit = 0.6;
  }
}

function chaseCamera(dt) {
  // 우주선 기준 자리(뒤쪽 위)를 부드럽게 따라간다 — 빨라져도 우주선이 멀어지지 않게
  const back = 7.2 + 3 * ship.boost;
  _e.set(ship.pitch * 0.55, ship.yaw, 0, 'YXZ');
  const want = _t.set(0, 2.1, back).applyEuler(_e);
  const k = 1 - Math.exp(-5 * dt);
  camOff.lerp(want, k);
  camera.position.copy(ship.pos).add(camOff);
  const look = V().copy(ship.pos).addScaledVector(fwd(), 10);
  camLookOff.lerp(look.sub(ship.pos), 1 - Math.exp(-7 * dt));
  camLook.copy(ship.pos).add(camLookOff);
  camera.up.lerp(_u.set(0, 1, 0), k);
  camera.lookAt(camLook);
  const fov = 60 + 14 * ship.boost;
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * k; camera.updateProjectionMatrix(); }
}
// 지금 카메라 자리에서 끊김 없이 따라가기 시작
function syncCamera() {
  camOff.subVectors(camera.position, ship.pos);
  camLookOff.subVectors(camLook, ship.pos);
}
function snapCamera() {
  _e.set(ship.pitch * 0.55, ship.yaw, 0, 'YXZ');
  camOff.set(0, 2.1, 7.2).applyEuler(_e);
  camera.position.copy(ship.pos).add(camOff);
  camLookOff.copy(fwd()).multiplyScalar(10);
  camLook.copy(ship.pos).add(camLookOff);
  camera.up.set(0, 1, 0);
  camera.lookAt(camLook);
  camera.fov = 60; camera.updateProjectionMatrix();
}

// ── 도착 화면: 천체와 우주선이 함께 보이게 ─────────────
function arrive() {
  mode = 'arrived'; modeT = 0;
  at = target.id;
  cab.tapped = false;
  ship.speed = 0; ship.boost = 0; ship.yawRate = ship.pitchRate = 0;
  frameArrival(target, true);
  const done = onArrive; onArrive = null;
  if (done) done(target.id);
}

function frameArrival(b, first) {
  const B = bodyPos(b);
  const scale = b.id === 'sun' ? 18 : clamp(b.r / 5, 1, 5.5);   // 사진처럼 보이게 우주선을 조금 키운다
  ship.scale = scale;
  const shipLen = SHIP_LEN * scale;
  // 우주선은 천체 옆(태양 방향과 직각 쪽, 지금 우주선이 있는 편)에 세운다 → 카메라가 해 쪽에서 밝은 낮 면을 본다
  const up0 = V().set(0, 1, 0);
  const sunDirB = V().copy(B).negate().setY(0).normalize();
  let v = V().subVectors(ship.pos, B).setY(0);
  if (v.lengthSq() < 1e-6) v.set(0, 0, 1);
  v.normalize();
  if (b.id !== 'sun') {
    const side = V().crossVectors(up0, sunDirB).normalize();
    v = side.multiplyScalar(side.dot(v) >= 0 ? 1 : -1).addScaledVector(sunDirB, 0.25).normalize();
  }
  const L = b.id === 'sun' ? arriveRadius(b) : b.r * 1.75 + shipLen * 1.1;
  const portrait = H > W;
  const up = V().set(0, 1, 0);
  // 가로 화면: 천체 옆에 우주선 / 세로 화면: 천체 아래에 우주선
  const dirSB = portrait ? V().copy(v).multiplyScalar(0.35).addScaledVector(up, -0.94).normalize() : V().copy(v).addScaledVector(up, -0.12).normalize();
  arrivedView.park.copy(B).addScaledVector(dirSB, L);
  const a = aimAngles(_d.subVectors(B, arrivedView.park).normalize());
  ship.yaw = a.yaw; ship.pitch = clamp(a.pitch, -0.6, 0.6);
  // 카메라는 천체-우주선 줄에 수직으로, 해가 비추는 쪽에서
  const w = V().crossVectors(dirSB, Math.abs(dirSB.y) < 0.7 ? up : v).normalize();
  if (b.id !== 'sun' && w.dot(V().copy(B).negate().normalize()) < 0) w.negate();
  const tanH = Math.tan(THREE.MathUtils.degToRad(60) / 2);
  const aspect = W / H;
  const along = (L + b.r + shipLen) / 2 * 1.2;
  const across = (b.id === 'haumea' ? b.r * 1.3 : b.id === 'saturn' ? b.r * 2.4 : b.r) * 1.25;
  const D = portrait ? Math.max(along / tanH, across / (tanH * aspect)) : Math.max(across / tanH * 1.15, along / (tanH * aspect));
  const mid = V().copy(B).addScaledVector(dirSB, (L - b.r * 0.2) / 2);
  arrivedView.cam.copy(mid).addScaledVector(w, D * 1.08).addScaledVector(up, D * 0.1);
  arrivedView.look.copy(mid).addScaledVector(up, D * 0.07);   // 위쪽 글자 자리를 비운다
  arrivedView.up.set(0, 1, 0);
  if (first) { camera.fov = 60; camera.updateProjectionMatrix(); }
  // 볼거리(대적점·하트…)가 카메라 쪽을 보게 돌려 둔다. 질감 가로 u 자리는 구에서 (-cos2πu, 0, sin2πu) 방향.
  if (b.faceU != null && first) {
    const u = b.faceU * Math.PI * 2;
    bodyObjs[b.id].spin.rotation.y = Math.atan2(-w.z, w.x) - Math.atan2(-Math.sin(u), -Math.cos(u)) - 0.25;
  }
}

// 도착 화면에서 누르기: 천체 → 반짝 + 우주선 안으로 (우주선은 main.js의 단추가 맡는다)
function tapArrived(x, y) {
  const id = pickBody(x, y);
  if (id && target && id === target.id) {
    bodyObjs[id].pulse = 0.8;
    burst(bodyPos(target), target.r);
    sfx.sparkle();
    cab.tapped = true;
    if (onBodyTap) onBodyTap(id);
  }
}

// ── 우주선 안: 카메라가 우주선 뒤로 다가가 조종석 창을 지나, 창 너머로 천체가 보이는 자리에 선다 ──
// 조종석(창틀·계기판·로봇)은 main.js 쪽 화면(cabin.js)이 그 위에 덮는다. 여기는 3D 카메라만 맡는다.
let onBodyTap = null;
const cab = { view: { x: 0.5, y: 0.4, rad: 150 }, final: V(), finalLook: V(), look0: V(), curve: null, onInside: null, inside: false, tapped: false };
const face = { on: false, t: 0, want: 0 };
export function setBodyTap(fn) { onBodyTap = fn; }

// view: 창 너머 천체를 둘 화면 자리 { x, y (0~1), rad (픽셀 반지름) }
function frameCabin(b) {
  const B = bodyPos(b);
  // 해가 비추는 쪽(도착 화면 카메라 쪽)에서 본다 → 밝은 낮 면
  const dir = V().subVectors(arrivedView.cam, B).normalize();
  // 고리가 있는 토성·하우메아는 고리가 실처럼 보이지 않게, 해가 비추는 고리 면 쪽에서 비스듬히 본다
  const lift = { saturn: 0.75, haumea: 0.28 }[b.id];
  if (lift) {
    const n = V().set(0, 1, 0).applyQuaternion(bodyObjs[b.id].spin.parent.getWorldQuaternion(new THREE.Quaternion()));
    if (n.dot(B) > 0) n.negate();   // 해가 비추는 쪽 고리 면
    dir.addScaledVector(n, lift).normalize();
  }
  const ext = { saturn: 2.5, haumea: 2.0, uranus: 1.4, sun: 1.6, pluto: 1.5 }[b.id] || 1;   // 고리·빛무리·카론까지 창 안에
  const tanH = Math.tan(THREE.MathUtils.degToRad(30));
  const D = b.r * ext * H / (2 * cab.view.rad * tanH);
  cab.final.copy(B).addScaledVector(dir, D);
  // 천체가 화면 (x, y)에 오도록 바라보는 곳을 옮긴다(카메라는 위가 하늘 위로 서 있으니 몇 번 맞춰 본다)
  const want = new THREE.Vector2(cab.view.x * 2 - 1, 1 - cab.view.y * 2), aim = want.clone();
  const up = V().set(0, 1, 0), m = new THREE.Matrix4(), q = new THREE.Quaternion(), vb = V();
  for (let i = 0; i < 6; i++) {
    const vCam = V().set(aim.x * tanH * (W / H), aim.y * tanH, -1).normalize();
    q.setFromRotationMatrix(m.lookAt(cab.final, B, up));
    q.multiply(new THREE.Quaternion().setFromUnitVectors(V().set(0, 0, -1), vCam).invert());
    cab.finalLook.copy(cab.final).addScaledVector(V().set(0, 0, -1).applyQuaternion(q), D);
    // 실제로 lookAt 했을 때 천체가 보이는 자리
    q.setFromRotationMatrix(m.lookAt(cab.final, cab.finalLook, up));
    vb.subVectors(B, cab.final).applyQuaternion(q.invert());
    aim.x += want.x - vb.x / -vb.z / (tanH * W / H);
    aim.y += want.y - vb.y / -vb.z / tanH;
  }
}

// onInside: 창을 지나는 순간(조종석 화면을 덮을 때) 부른다
export function enterCabin(view, onInside) {
  if (mode !== 'arrived' || !target) return false;
  cab.view = view; cab.onInside = onInside; cab.inside = false;
  frameCabin(target);
  const o = shipObj.object;
  o.updateMatrixWorld(true);
  const behind = o.localToWorld(V().set(0, 0.7, 2.6));     // 우주선 뒤쪽 위
  const canopy = o.localToWorld(V().set(0, 0.22, -0.45));   // 조종석 창 안
  cab.curve = new THREE.CatmullRomCurve3([camera.position.clone(), behind, canopy, cab.final.clone()], false, 'centripetal');
  cab.look0.copy(camLook);
  mode = 'cabin-in'; modeT = 0;
  setSpinScale(0.5);           // 창 너머 천체는 더 천천히 돈다(설명을 읽는 동안 오래 보이게)
  faceFeature();
  sfx.whoosh();
  return true;
}

export function setCabinView(view) {
  cab.view = view;
  if (target && (mode === 'cabin' || mode === 'cabin-in')) {
    frameCabin(target);
    if (mode === 'cabin') { camera.position.copy(cab.final); camLook.copy(cab.finalLook); camera.lookAt(camLook); }
    else cab.curve.points[3].copy(cab.final);
  }
}

export function exitCabin() {
  if (mode !== 'cabin' && mode !== 'cabin-in') return;
  mode = 'arrived'; modeT = 0;
  shipObj.object.visible = true;
  setSpinScale(1);
  face.on = false;
}

const ease = k => k < 0.5 ? 2 * k * k : 1 - (2 - 2 * k) ** 2 / 2;
const smooth = k => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };
function updateCabin() {
  const B = bodyPos(target);
  if (mode === 'cabin') {
    camera.position.copy(cab.final);
    camLook.copy(cab.finalLook);
  } else {
    const u = ease(clamp(modeT / CABIN_IN, 0, 1));
    cab.curve.getPoint(u, camera.position);
    // 창을 지날 때까지는 천체를 보고, 지난 뒤엔 창 너머 자리로
    if (u < 2 / 3) camLook.lerpVectors(cab.look0, B, smooth(u / 0.45));
    else camLook.lerpVectors(B, cab.finalLook, smooth((u - 2 / 3) * 3));
    if (u > 0.4 && !cab.inside) { cab.inside = true; if (cab.onInside) cab.onInside(); }   // 창틀이 먼저 덮이기 시작하고
    if (u > 0.66) shipObj.object.visible = false;                                          // 조종석 창에 닿을 때 우주선 겉을 감춘다
    if (modeT >= CABIN_IN) mode = 'cabin';
  }
  camera.up.lerp(_u.set(0, 1, 0), 0.2);
  camera.lookAt(camLook);
}

// 볼거리(하트·대적점…)를 지금 카메라 쪽으로 천천히 돌린다
export function faceFeature() {
  if (!target || target.faceU == null) return;
  const B = bodyPos(target);
  const w = V().subVectors(cab.final, B).normalize();
  const u = target.faceU * Math.PI * 2;
  face.want = Math.atan2(-w.z, w.x) - Math.atan2(-Math.sin(u), -Math.cos(u)) - 0.25;
  face.on = true; face.t = 0;
}
function updateFace(dt) {
  if (!face.on || !target) return;
  face.t += dt;
  const s = bodyObjs[target.id].spin;
  s.rotation.y = angLerp(s.rotation.y, face.want, 1 - Math.exp(-2.2 * dt));
  if (face.t > 3) face.on = false;
}

// 도착 화면: 잠시 뒤 천체 위에 「눌러 봐」 손가락 표시(한 번 누르면 그 도착에선 그만)
function drawBodyHint() {
  if (cab.tapped || modeT < 2.2 || !target) return;
  const s = toScreen(bodyPos(target));
  if (s.behind) return;
  const c = hctx, p = (time * 1.1) % 1;
  c.strokeStyle = `rgba(255,236,160,${0.85 * (1 - p)})`;
  c.lineWidth = 5;
  c.beginPath(); c.arc(s.x, s.y, 20 + p * 46, 0, Math.PI * 2); c.stroke();
  c.font = '48px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('👆', s.x + 8, s.y + 30);
  pill('누르면 우주선 안으로', s.x, s.y + 86, { size: 20, bg: 'rgba(255,140,190,0.9)' });
}

// 목적지 천체의 화면 위치(확인용)
export function targetScreen() { return target ? toScreen(bodyPos(target)) : null; }

// 우주선의 화면 위치와 크기(도착 화면 단추 자리)
export function shipScreen() {
  const o = shipObj.object;
  const p = V().copy(o.position).project(camera);
  const q = V().copy(o.position).addScaledVector(camera.up, SHIP_LEN * o.scale.x * 0.5).project(camera);
  const x = (p.x + 1) / 2 * W, y = (1 - p.y) / 2 * H;
  const size = clamp(Math.hypot(x - (q.x + 1) / 2 * W, y - (1 - q.y) / 2 * H) * 3.2, 130, 260);
  return { x, y, size };
}

// ── 반짝이 ──────────────────────────────────────
let sparkPts, sparks = [];
function makeSparkles() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(60 * 3), 3));
  sparkPts = new THREE.Points(g, new THREE.PointsMaterial({ size: 16, sizeAttenuation: false, map: glow(), color: 0xfff1a8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  sparkPts.frustumCulled = false;
  scene.add(sparkPts);
}
function burst(c, r) {
  for (let i = 0; i < 40; i++) {
    const d = V().randomDirection();
    sparks.push({ p: V().copy(c).addScaledVector(d, r * 1.02), v: d.multiplyScalar(r * (0.4 + Math.random() * 0.5)), t: 0 });
  }
  sparks = sparks.slice(-60);
}
function updateSparkles(dt) {
  const a = sparkPts.geometry.attributes.position;
  let n = 0;
  for (const s of sparks) {
    s.t += dt; s.p.addScaledVector(s.v, dt);
    if (s.t < 1.2) a.setXYZ(n++, s.p.x, s.p.y, s.p.z);
  }
  sparks = sparks.filter(s => s.t < 1.2);
  sparkPts.geometry.setDrawRange(0, n);
  a.needsUpdate = true;
}

function popup(text, worldPos, color = '#fff', life = 1.1) {
  popups.push({ text, p: worldPos.clone(), color, t: 0, life });
}

// ── 화면 위 2D 표시 ─────────────────────────────
function toScreen(p) {
  const v = _t.copy(p).project(camera);
  return { x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H, behind: v.z > 1 };
}
function roundRect(x, y, w, h, r) {
  const c = hctx;
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
const FONT = '"Jua", "Apple SD Gothic Neo", sans-serif';
function pill(text, x, y, { size = 16, bg = 'rgba(30,30,70,0.6)', fg = '#fff' } = {}) {
  const c = hctx;
  c.font = `${size}px ${FONT}`;
  const w = c.measureText(text).width + size;
  c.fillStyle = bg;
  roundRect(x - w / 2, y - size * 0.8, w, size * 1.6, size * 0.8); c.fill();
  c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(text, x, y + 1);
}

function drawHud() {
  const c = hctx;
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  c.clearRect(0, 0, W, H);
  if (mode === 'cabin-in' || mode === 'cabin') return;
  if (mode === 'ascend' || mode === 'arrived') { drawPopups(); if (mode === 'arrived') drawBodyHint(); return; }
  drawLabels();
  drawPopups();
  if (mode === 'flight') { drawEdge(); drawHint(); }
  drawMinimap();
}

function drawLabels() {
  const camPos = camera.position;
  for (const b of BODIES) {
    const p = bodyPos(b);
    const d = p.distanceTo(camPos);
    const isT = target && b.id === target.id;
    if (!isT && d > 2600 && b.r < 30) continue;
    const s = toScreen(p);
    if (s.behind || s.x < -50 || s.x > W + 50 || s.y < -50 || s.y > H + 50) continue;
    const rr = b.r / (d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * H / 2;   // 화면 위 반지름
    const y = Math.min(H - 80, s.y + Math.max(rr, 8) + 22);
    pill(b.kind === 'dwarf' ? `⭐ ${b.name}` : b.name, s.x, y,
      { size: isT ? 20 : 16, bg: isT ? 'rgba(255,214,110,0.92)' : 'rgba(30,30,70,0.6)', fg: isT ? '#4a3200' : '#fff' });
  }
  if (inBelt(ship.pos)) pill('소행성대', W / 2, (mapRect ? mapRect.y + mapRect.h : 90) + 26, { size: 17, bg: 'rgba(190,160,130,0.65)' });
}

function drawPopups() {
  const c = hctx;
  for (const p of popups) {
    const s = toScreen(p.p);
    if (s.behind) continue;
    const k = p.t / p.life;
    c.globalAlpha = 1 - k * k;
    const size = 34 * (1 + 0.25 * Math.sin(Math.min(1, p.t * 6) * Math.PI));
    c.font = `${size}px ${FONT}`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 6; c.strokeStyle = 'rgba(40,30,80,0.7)';
    c.strokeText(p.text, s.x, s.y - 40 - k * 40);
    c.fillStyle = p.color; c.fillText(p.text, s.x, s.y - 40 - k * 40);
    c.globalAlpha = 1;
  }
}

// 목적지가 화면 밖이면 가장자리에 그쪽을 가리키는 표시
function drawEdge() {
  const c = hctx;
  const p = bodyPos(target);
  const v = V().copy(p).applyMatrix4(camera.matrixWorldInverse);   // 카메라 기준(앞이 -z)
  const s = toScreen(p);
  const top = (mapRect ? mapRect.y + mapRect.h : 0) + 40, m = 60, bottom = H - m - 60;
  if (v.z < 0 && s.x > m && s.x < W - m && s.y > top && s.y < bottom) return;
  let dx = v.x, dy = -v.y;
  if (Math.hypot(dx, dy) < 1e-3) dy = 1;
  const cx = W / 2, cy = (top + bottom) / 2;
  const kx = dx === 0 ? Infinity : ((dx > 0 ? W - m : m) - cx) / dx;
  const ky = dy === 0 ? Infinity : ((dy > 0 ? bottom : top) - cy) / dy;
  const k = Math.min(Math.abs(kx), Math.abs(ky));
  const px = cx + dx * k, py = cy + dy * k, ang = Math.atan2(dy, dx);
  const pulse = 1 + 0.07 * Math.sin(time * 5);
  c.save(); c.translate(px, py); c.scale(pulse, pulse);
  c.fillStyle = 'rgba(255,216,110,0.95)';
  c.save(); c.rotate(ang);
  c.beginPath(); c.moveTo(50, 0); c.lineTo(30, -16); c.lineTo(30, 16); c.closePath(); c.fill();
  c.restore();
  c.fillStyle = 'rgba(30,30,80,0.88)';
  c.beginPath(); c.arc(0, 0, 30, 0, Math.PI * 2); c.fill();
  c.lineWidth = 4; c.strokeStyle = 'rgba(255,216,110,0.95)'; c.stroke();
  c.fillStyle = '#fff'; c.font = `15px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(target.name, 0, 1);
  c.restore();
}

function drawHint() {
  if (pointer.touched || modeT < 1.6) return;
  const x = W * 0.75, y = H * 0.5;
  const p = (time * 1.2) % 1;
  const c = hctx;
  c.strokeStyle = `rgba(255,255,255,${0.8 * (1 - p)})`;
  c.lineWidth = 4;
  c.beginPath(); c.arc(x, y, 18 + p * 40, 0, Math.PI * 2); c.stroke();
  c.font = '46px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('👆', x + 6, y + 28);
  pill('누른 쪽으로 돌아요', x, y + 82, { size: 18, bg: 'rgba(255,140,190,0.88)' });
}

// 미니 지도: 태양에서 바깥으로 순서대로. 「지금 여기」는 태양에서의 거리로 놓는다.
const MAP_DOT = { sun: 11, jupiter: 9, saturn: 8, uranus: 6.5, neptune: 6.5, earth: 5, venus: 5, mars: 4.5, mercury: 4 };
const MAP_COL = { sun: '#ffd166', mercury: '#bdb5b0', venus: '#f3d9a0', earth: '#6fb7f0', mars: '#e8866a', ceres: '#b9b4ad',
  jupiter: '#e3c19a', saturn: '#ecd59c', uranus: '#a6e6e2', neptune: '#7d9cf2', pluto: '#e6c4a4', haumea: '#eeeef6', makemake: '#e2a088', eris: '#f1f1f6' };
function mapX(R, x0, step) {
  const rs = MAP_ORDER.map(id => byId[id].orbit || 0);
  if (R <= rs[0]) return x0;
  for (let i = 0; i < rs.length - 1; i++) {
    if (R <= rs[i + 1]) return x0 + (i + (R - rs[i]) / (rs[i + 1] - rs[i])) * step;
  }
  const n = rs.length - 1;
  return x0 + (n + Math.min(0.6, (R - rs[n]) / 3000)) * step;
}
function drawMinimap() {
  const c = hctx;
  const side = Math.min(84, W * 0.1);
  const w = Math.min(W - side * 2, 980), h = 82;
  const x = (W - w) / 2, y = 10;
  mapRect = { x, y, w, h };
  c.fillStyle = 'rgba(20,20,60,0.62)';
  roundRect(x, y, w, h, 18); c.fill();
  const pad = 26, step = (w - pad * 2) / (MAP_ORDER.length - 1), x0 = x + pad, ly = y + 38;
  c.strokeStyle = 'rgba(200,210,255,0.35)'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(x0, ly); c.lineTo(x0 + step * (MAP_ORDER.length - 1), ly); c.stroke();
  // 소행성대
  const b0 = mapX(BELT.r0, x0, step), b1 = mapX(BELT.r1, x0, step);
  c.fillStyle = 'rgba(220,195,170,0.75)';
  for (let i = 0; i < 22; i++) {
    const t = (i * 0.618) % 1, yy = ly + (((i * 0.37) % 1) - 0.5) * 14;
    c.beginPath(); c.arc(b0 + (b1 - b0) * t, yy, 1.4, 0, Math.PI * 2); c.fill();
  }
  c.font = `12px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  MAP_ORDER.forEach((id, i) => {
    const b = byId[id], px = x0 + i * step;
    const isT = target && (target.id === id || (target.id === 'moon' && id === 'earth'));
    if (isT) {
      c.strokeStyle = `rgba(255,224,120,${0.6 + 0.4 * Math.sin(time * 5)})`; c.lineWidth = 3;
      c.beginPath(); c.arc(px, ly, (MAP_DOT[id] || 4) + 6, 0, Math.PI * 2); c.stroke();
    }
    c.fillStyle = MAP_COL[id];
    c.beginPath(); c.arc(px, ly, MAP_DOT[id] || 4, 0, Math.PI * 2); c.fill();
    if (id === 'saturn') { c.strokeStyle = MAP_COL.saturn; c.lineWidth = 1.5; c.beginPath(); c.ellipse(px, ly, 13, 4, -0.3, 0, Math.PI * 2); c.stroke(); }
    const label = id === 'earth' && target && target.id === 'moon' ? '지구·달' : b.name;
    c.fillStyle = isT ? '#ffe08a' : b.kind === 'dwarf' ? '#fff0b0' : 'rgba(235,235,255,0.88)';
    c.fillText(label, px, ly + (i % 2 ? 30 : 19));
  });
  // 지금 여기
  const R = Math.hypot(ship.pos.x, ship.pos.z);
  const shx = clamp(mapX(R, x0, step), x + 10, x + w - 10);
  c.fillStyle = '#ffffff';
  c.beginPath(); c.moveTo(shx + 7, ly); c.lineTo(shx - 6, ly - 5); c.lineTo(shx - 6, ly + 5); c.closePath(); c.fill();
  c.font = `12px ${FONT}`;
  const tw = c.measureText('지금 여기').width + 12;
  const px = clamp(shx, x + tw / 2 + 2, x + w - tw / 2 - 2);
  c.fillStyle = '#ff9ec7';
  roundRect(px - tw / 2, y + 4, tw, 18, 9); c.fill();
  c.beginPath(); c.moveTo(shx - 5, y + 21); c.lineTo(shx + 5, y + 21); c.lineTo(shx, y + 28); c.fill();
  c.fillStyle = '#fff'; c.fillText('지금 여기', px, y + 13.5);
}
