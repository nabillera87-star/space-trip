// 발사 장면: 지구 표면의 발사대 → 하늘을 뚫고 올라감 → (화면이 부드럽게 넘어가) 지구가 둥글게 보이는 우주.
// 이 파일은 땅 위 부분만 그린다. 우주로 넘어간 뒤는 flight.js의 'ascend' 모드가 잇는다.

import * as THREE from 'three';
import { createShip, glow, SHIP_LEN } from './ship.js';

export const LIFT_DUR = 5.2;       // 땅을 떠나 화면이 넘어가기까지(초)
const SHIP_SCALE = 6;              // 발사대 위에서는 크게 보이게(가까이서 보는 장면)

let scene, cam, ship, sky, stars, clouds = [], puffs = [];
let phase = 'ready', t = 0, alt = 0;

const skyVS = `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec3 vP;
  void main() { vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
  }`;
const skyFS = `
  #include <logdepthbuf_pars_fragment>
  uniform float space; varying vec3 vP;
  void main() {
    #include <logdepthbuf_fragment>
    float h = clamp(vP.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 dayTop = vec3(0.36, 0.66, 0.98), dayBot = vec3(0.80, 0.92, 1.0);
    vec3 spTop = vec3(0.10, 0.11, 0.30), spBot = vec3(0.22, 0.24, 0.52);
    vec3 day = mix(dayBot, dayTop, smoothstep(0.45, 0.95, h));
    vec3 sp = mix(spBot, spTop, smoothstep(0.3, 0.9, h));
    gl_FragColor = vec4(mix(day, sp, space), 1.0);
  }`;

export function initLaunch() {
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(55, 1, 0.1, 20000);

  sky = new THREE.Mesh(new THREE.SphereGeometry(9000, 32, 16),
    new THREE.ShaderMaterial({ uniforms: { space: { value: 0 } }, vertexShader: skyVS, fragmentShader: skyFS, side: THREE.BackSide, depthWrite: false }));
  scene.add(sky);

  // 별(높이 올라가면 나타난다)
  const n = 900, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 0.9 + 0.1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    pos.set([Math.cos(a) * s * 8000, u * 8000, Math.sin(a) * s * 8000], i * 3);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, map: glow(), color: 0xfff8e8, transparent: true, opacity: 0, depthWrite: false }));
  scene.add(stars);

  scene.add(new THREE.HemisphereLight(0xdff0ff, 0x6fae6a, 1.4));
  const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
  sun.position.set(40, 80, 30);
  scene.add(sun);

  // 땅: 풀밭 + 멀리 둥근 언덕들
  const ground = new THREE.Mesh(new THREE.CircleGeometry(6000, 64), new THREE.MeshLambertMaterial({ color: 0x8fd18f }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const hillMat = new THREE.MeshLambertMaterial({ color: 0x7cc489 });
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * Math.PI * 2 + 0.3, d = 500 + (i % 3) * 250;
    const h = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), hillMat);
    h.scale.set(160 + (i % 4) * 60, 50 + (i % 3) * 30, 160);
    h.position.set(Math.cos(a) * d, -10, Math.sin(a) * d);
    scene.add(h);
  }

  // 발사대: 받침 + 탑 + 팔
  const padMat = new THREE.MeshStandardMaterial({ color: 0xd9dbe6, roughness: 0.6 });
  const towerMat = new THREE.MeshStandardMaterial({ color: 0xf2a65a, roughness: 0.5 });
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(9, 10, 1.2, 40), padMat);
  pad.position.y = 0.6;
  scene.add(pad);
  const H = 22;
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.35, H, 0.35), towerMat);
    leg.position.set(9 + x * 1.2, H / 2 + 1, z * 1.2);
    scene.add(leg);
  }
  for (let y = 3; y < H; y += 3) {
    for (const z of [-1.2, 1.2]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.22, 0.22), towerMat);
      bar.position.set(9, y, z);
      scene.add(bar);
    }
  }
  const arm = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.4, 0.6), towerMat);
  arm.position.set(5.5, H * 0.72, 0);
  scene.add(arm);

  // 우주선: 코가 하늘을 보게
  ship = createShip();
  ship.object.scale.setScalar(SHIP_SCALE);
  ship.object.rotation.x = Math.PI / 2;          // -Z(코) → +Y
  scene.add(ship.object);

  // 구름(하늘 높이 여기저기)
  const cloudMat = new THREE.SpriteMaterial({ map: glow(), color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false });
  for (let i = 0; i < 40; i++) {
    const g = new THREE.Group();
    const y = 120 + Math.random() * 900, a = Math.random() * Math.PI * 2, d = 30 + Math.random() * 160;
    for (let k = 0; k < 5; k++) {
      const s = new THREE.Sprite(cloudMat);
      s.scale.setScalar(30 + Math.random() * 30);
      s.position.set((Math.random() - 0.5) * 50, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 30);
      g.add(s);
    }
    g.position.set(Math.cos(a) * d, y, Math.sin(a) * d);
    scene.add(g);
    clouds.push(g);
  }
  resetLaunch();
}

export function resetLaunch() {
  phase = 'ready'; t = 0; alt = 0;
  for (const p of puffs) scene.remove(p.s);
  puffs = [];
  placeShip();
}
export function startCountdown() { phase = 'count'; t = 0; }
export function startLift() { phase = 'lift'; t = 0; }
export function launchPhase() { return phase; }
export function liftProgress() { return phase === 'lift' ? t / LIFT_DUR : 0; }

function placeShip() {
  const base = SHIP_LEN * SHIP_SCALE * 0.62 + 1.2;
  ship.object.position.set(0, base + alt, 0);
}

const puffMat = [0xffffff, 0xffe6f0, 0xfff3d6, 0xe6ecff].map(c => new THREE.SpriteMaterial({ map: glow(), color: c, transparent: true, depthWrite: false }));
function puff(scale = 1) {
  const s = new THREE.Sprite(puffMat[Math.floor(Math.random() * puffMat.length)].clone());
  const p = ship.object.position;
  s.position.set(p.x + (Math.random() - 0.5) * 3, p.y - SHIP_LEN * SHIP_SCALE * 0.6, p.z + (Math.random() - 0.5) * 3);
  s.scale.setScalar(4 * scale);
  scene.add(s);
  puffs.push({ s, life: 0, vx: (Math.random() - 0.5) * 6, vz: (Math.random() - 0.5) * 6, grow: 6 + Math.random() * 6 });
}

export function updateLaunch(dt, time, renderer) {
  t += dt;
  if (phase === 'lift') alt = 9 * t * t * t;     // 처음엔 천천히, 점점 빠르게
  placeShip();
  const rate = phase === 'lift' ? 40 : phase === 'count' ? 8 : 0;
  if (rate && Math.random() < rate * dt) puff(phase === 'lift' ? 1.4 : 0.8);
  if (phase === 'lift' && alt < 30 && Math.random() < 30 * dt) puff(2);   // 발사대 둘레 부드러운 연기
  for (const p of puffs) {
    p.life += dt;
    p.s.position.x += p.vx * dt; p.s.position.z += p.vz * dt;
    p.s.scale.setScalar(p.s.scale.x + p.grow * dt);
    p.s.material.opacity = Math.max(0, 0.9 * (1 - p.life / 2.6));
  }
  puffs = puffs.filter(p => { if (p.life > 2.6) { scene.remove(p.s); p.s.material.dispose(); return false; } return true; });

  const space = THREE.MathUtils.clamp((alt - 150) / 900, 0, 1);
  sky.material.uniforms.space.value = space;
  stars.material.opacity = space;
  ship.update(dt, time, phase === 'lift' ? 1 : phase === 'count' ? 0.35 : 0.05);

  // 카메라: 처음엔 땅에서 올려다보고, 뜨면 옆에서 따라 오른다
  const p = ship.object.position;
  const follow = THREE.MathUtils.clamp(alt / 60, 0, 1);
  cam.position.set(30 - 6 * follow, 7 + (p.y - 8) * follow * 0.92, 40 - 10 * follow);
  cam.lookAt(0, THREE.MathUtils.lerp(9, p.y + 4, follow), 0);
  cam.aspect = window.innerWidth / window.innerHeight;
  cam.updateProjectionMatrix();
  sky.position.copy(cam.position); stars.position.copy(cam.position);
  renderer.render(scene, cam);
}
