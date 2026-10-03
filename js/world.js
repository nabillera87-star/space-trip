// 3D 우주: 렌더러·카메라·천체·하늘·소행성대·길 안내(빛나는 점선 길 + 화살표).

import * as THREE from 'three';
import { RoomEnvironment } from '../vendor/RoomEnvironment.js';
import { BODIES, byId, BELT } from './data.js';
import { glow, setShipEnv } from './ship.js';

export let renderer, scene, camera;
export const bodyObjs = {};        // id → { b, group, spin, mesh, pulse }
export const rocks = [];           // 소행성 { p, r, ... }
let sky, stars, dust, dustPos;
const TEX = 'assets/tex/';
const loader = new THREE.TextureLoader();
let maxAniso = 1;

function tex(name, srgb = true) {
  const t = loader.load(TEX + name);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  return t;
}

export function initWorld(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));   // 아이패드에서 부드럽게
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  maxAniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.2, 80000);

  // 우주선 금속 반사용 환경(우주선 재질에만 쓴다 — 행성의 밤 쪽은 밝히지 않게)
  const pmrem = new THREE.PMREMGenerator(renderer);
  setShipEnv(pmrem.fromScene(new RoomEnvironment(), 0.04).texture);

  // 빛: 태양에서 오는 빛 + 무섭지 않게 밤 쪽도 은은히 보이는 주변광
  const sunLight = new THREE.PointLight(0xfff4e6, 2.6, 0, 0);
  scene.add(sunLight);
  scene.add(new THREE.AmbientLight(0x8890c0, 0.55));

  makeSky();
  for (const b of BODIES) bodyObjs[b.id] = makeBody(b);
  makeBelt();
  makeDust();
  makeGuide();
  resizeWorld();
}

export function resizeWorld() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

// ── 하늘: 은하수 + 또렷한 별 ─────────────────────
function makeSky() {
  // 어둡지만 무섭지 않게: 새까만 대신 깊은 남색 바탕 위에 은하수를 더한다
  scene.background = new THREE.Color(0x0d1033);
  const m = new THREE.MeshBasicMaterial({ map: tex('2k_stars_milky_way.jpg'), side: THREE.BackSide, depthWrite: false, color: 0xb0b6d8, transparent: true, blending: THREE.AdditiveBlending });
  sky = new THREE.Mesh(new THREE.SphereGeometry(60000, 48, 24), m);
  sky.renderOrder = -10;
  scene.add(sky);

  const n = 2600;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const palette = [[1, 0.97, 0.9], [0.85, 0.9, 1], [1, 0.88, 0.95], [0.9, 1, 0.95]];
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    pos.set([Math.cos(a) * s * 50000, u * 50000, Math.sin(a) * s * 50000], i * 3);
    const c = palette[i % 4], k = 0.45 + Math.random() * 0.55;
    col.set([c[0] * k, c[1] * k, c[2] * k], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, map: glow(), transparent: true, depthWrite: false }));
  stars.renderOrder = -9;
  scene.add(stars);
}

// 가까이 떠 있는 먼지: 날아가는 빠르기를 느끼게
function makeDust() {
  const n = 500;
  dustPos = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++) dustPos[i] = (Math.random() - 0.5) * 160;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  dust = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.35, color: 0xc8d0ff, map: glow(), transparent: true, opacity: 0.55, depthWrite: false }));
  dust.frustumCulled = false;
  scene.add(dust);
}

// ── 천체 ────────────────────────────────────────
const rimVS = `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec3 vN; varying vec3 vV;
  void main() {
    vN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
    #include <logdepthbuf_vertex>
  }`;
const rimFS = `
  #include <logdepthbuf_pars_fragment>
  uniform vec3 color; uniform float power; uniform float strength;
  varying vec3 vN; varying vec3 vV;
  void main() {
    #include <logdepthbuf_fragment>
    float f = pow(1.0 - max(dot(vN, vV), 0.0), power);
    gl_FragColor = vec4(color, f * strength);
  }`;
function rim(color, power, strength) {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, power: { value: power }, strength: { value: strength } },
    vertexShader: rimVS, fragmentShader: rimFS,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
}

function ringGeometry(inner, outer, seg = 128) {
  const geo = new THREE.RingGeometry(inner, outer, seg, 1);
  const p = geo.attributes.position, uv = geo.attributes.uv, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    uv.setXY(i, (v.length() - inner) / (outer - inner), 0.5);
  }
  geo.rotateX(-Math.PI / 2);
  return geo;
}

function bandTexture(bands) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 4;
  const g = c.getContext('2d');
  for (const [x0, x1, a] of bands) {
    g.fillStyle = `rgba(220,235,240,${a})`;
    g.fillRect(x0 * 256, 0, (x1 - x0) * 256, 4);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeBody(b) {
  const group = new THREE.Group();
  group.position.fromArray(b.pos);
  const tilt = new THREE.Group();
  tilt.rotation.z = b.tilt;
  tilt.rotation.x = b.tiltX || 0;
  group.add(tilt);
  const spin = new THREE.Group();
  tilt.add(spin);
  const seg = b.r > 20 ? 96 : 64;
  const geo = new THREE.SphereGeometry(b.r, seg, seg / 2);
  let mat;
  if (b.id === 'sun') {
    mat = new THREE.MeshBasicMaterial({ map: tex(b.tex), color: 0xffffff });
  } else {
    mat = new THREE.MeshStandardMaterial({ map: tex(b.tex), roughness: 1, metalness: 0 });
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.bodyId = b.id;
  spin.add(mesh);

  if (b.id === 'sun') {
    // 빛나는 태양: 겹친 빛무리
    for (const [k, op, col] of [[2.6, 0.75, 0xffd27a], [6, 0.35, 0xffb760], [14, 0.14, 0xff9a50]]) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: col, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false }));
      s.scale.setScalar(b.r * k);
      group.add(s);
    }
    const corona = new THREE.Mesh(new THREE.SphereGeometry(b.r * 1.04, 64, 32), rim(0xffc070, 2.0, 1.2));
    group.add(corona);
  }
  if (b.id === 'earth') {
    const clouds = new THREE.Mesh(new THREE.SphereGeometry(b.r * 1.012, 64, 32),
      new THREE.MeshStandardMaterial({ alphaMap: tex('2k_earth_clouds.jpg', false), color: 0xffffff, transparent: true, depthWrite: false, roughness: 1 }));
    spin.add(clouds);
    clouds.userData.drift = 0.01;
    group.add(new THREE.Mesh(new THREE.SphereGeometry(b.r * 1.05, 64, 32), rim(0x6fb4ff, 2.6, 1.3)));
  }
  if (b.id === 'venus') group.add(new THREE.Mesh(new THREE.SphereGeometry(b.r * 1.04, 48, 24), rim(0xffe2a0, 3, 0.8)));
  if (b.id === 'neptune' || b.id === 'uranus') group.add(new THREE.Mesh(new THREE.SphereGeometry(b.r * 1.04, 48, 24), rim(b.id === 'neptune' ? 0x7aa6ff : 0xa6fff4, 3, 0.7)));
  if (b.id === 'saturn') {
    const ring = new THREE.Mesh(ringGeometry(b.r * 1.24, b.r * 2.27, 160),
      new THREE.MeshLambertMaterial({ map: tex('2k_saturn_ring_alpha.png'), transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    tilt.add(ring);
  }
  if (b.id === 'uranus') {
    const ring = new THREE.Mesh(ringGeometry(b.r * 1.6, b.r * 2.05, 128),
      new THREE.MeshBasicMaterial({ map: bandTexture([[0.05, 0.1, 0.35], [0.4, 0.45, 0.3], [0.9, 1, 0.6]]), transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    tilt.add(ring);
  }
  if (b.id === 'haumea') {
    // 길쭉한 달걀 모양(세 축 길이가 다르다) + 가는 고리
    mesh.scale.set(1.0, 0.51, 0.8);
    const ring = new THREE.Mesh(ringGeometry(b.r * 2.1, b.r * 2.3, 128),
      new THREE.MeshBasicMaterial({ map: bandTexture([[0, 1, 0.55]]), transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    tilt.add(ring);
  }
  if (b.id === 'pluto') {
    // 명왕성의 큰 달 카론
    const orbit = new THREE.Group();
    tilt.add(orbit);
    const charon = new THREE.Mesh(new THREE.SphereGeometry(b.r * 0.52, 32, 16),
      new THREE.MeshStandardMaterial({ map: tex('2k_moon.jpg'), color: 0xc8c2c0, roughness: 1 }));
    charon.position.set(b.r * 4.2, 0, 0);
    orbit.add(charon);
    orbit.userData.orbit = 0.12;
    group.userData.charonOrbit = orbit;
  }
  if (b.kind === 'dwarf') {
    // 왜소행성은 은은한 별빛으로 눈에 띄게
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: 0xfff0a8, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.scale.setScalar(b.r * 6);
    group.add(s);
  }
  scene.add(group);
  return { b, group, spin, mesh, pulse: 0 };
}

// ── 소행성대 ────────────────────────────────────
function rockGeometry(seed) {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const p = g.attributes.position, v = new THREE.Vector3();
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const bumps = Array.from({ length: 6 }, () => [new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(), 0.12 + rnd() * 0.2]);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    let k = 1;
    for (const [d, a] of bumps) k -= a * Math.max(0, v.dot(d)) ** 3;
    v.multiplyScalar(k);
    v.x *= 1.25;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

const ROCK_VARIANTS = 4;
let rockMeshes = [];
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
function makeBelt() {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const step = 46;
  const ceres = new THREE.Vector3().fromArray(byId.ceres.pos);
  for (let R = BELT.r0 + step / 2; R < BELT.r1; R += step) {
    const span = BELT.ang * R;
    for (let lat = -span; lat < span; lat += step) {
      if (rnd() < 0.32) continue;                     // 띄엄띄엄
      const rr = R + (rnd() - 0.5) * 18;
      const a = (lat + (rnd() - 0.5) * 18) / rr;
      const p = new THREE.Vector3(rr * Math.sin(a), (rnd() - 0.5) * 2 * BELT.halfY, -rr * Math.cos(a));
      if (p.distanceTo(ceres) < byId.ceres.r * 6 + 30) continue;
      rocks.push({
        p, r: 2.6 + rnd() * 4.2, v: Math.floor(rnd() * ROCK_VARIANTS),
        axis: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(),
        ang: rnd() * 6.28, spin: 0.15 + rnd() * 0.35,
        sx: 0.8 + rnd() * 0.4, hit: 0,
      });
    }
  }
  const mats = [0xa8998c, 0x9c948f, 0xb3a291, 0x958b86].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 1, flatShading: true }));
  for (let v = 0; v < ROCK_VARIANTS; v++) {
    const list = rocks.filter(r => r.v === v);
    const im = new THREE.InstancedMesh(rockGeometry(1000 + v * 77), mats[v], list.length);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    list.forEach((r, i) => { r.idx = i; });
    rockMeshes.push(im);
    scene.add(im);
  }
  updateRocks(0, new THREE.Vector3(1e9, 0, 0), true);
}

// 가까운 바위만 돌린다(먼 바위는 그대로 둬도 보이지 않는다)
export function updateRocks(dt, near, all = false) {
  const dirty = new Set();
  for (const r of rocks) {
    const close = all || Math.abs(r.p.z - near.z) < 1500;
    if (!close) continue;
    r.ang += r.spin * dt;
    r.hit = Math.max(0, r.hit - dt);
    _q.setFromAxisAngle(r.axis, r.ang);
    const k = r.r * (1 + 0.12 * Math.sin(r.hit * 20) * r.hit);
    _s.set(k * r.sx, k, k);
    _m.compose(r.p, _q, _s);
    rockMeshes[r.v].setMatrixAt(r.idx, _m);
    dirty.add(r.v);
  }
  for (const v of dirty) rockMeshes[v].instanceMatrix.needsUpdate = true;
}

// ── 길 안내: 빛나는 점선 길 + 우주선 앞 화살표 ───────────
const PATH_N = 90;
let pathPts, pathPos, pathCol, arrow;
function makeGuide() {
  pathPos = new Float32Array(PATH_N * 3);
  pathCol = new Float32Array(PATH_N * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pathPos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(pathCol, 3));
  pathPts = new THREE.Points(g, new THREE.PointsMaterial({ size: 11, sizeAttenuation: false, map: glow(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  pathPts.frustumCulled = false;
  pathPts.visible = false;
  scene.add(pathPts);

  // 화살표: 납작한 화살 모양(+Z가 앞). 넓은 면이 늘 카메라를 보게 돌린다.
  arrow = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(0, 1.1); shape.lineTo(0.95, 0.05); shape.lineTo(0.38, 0.05); shape.lineTo(0.38, -0.9);
  shape.lineTo(-0.38, -0.9); shape.lineTo(-0.38, 0.05); shape.lineTo(-0.95, 0.05); shape.closePath();
  const flat = new THREE.ShapeGeometry(shape);
  flat.rotateX(Math.PI / 2);                 // 모양의 위(+Y)를 +Z로
  const edge = new THREE.Mesh(flat, new THREE.MeshBasicMaterial({ color: 0x5a3a00, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
  edge.scale.setScalar(1.18);
  const face = new THREE.Mesh(flat, new THREE.MeshBasicMaterial({ color: 0xffd86e, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }));
  face.position.y = 0.01;
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: 0xffd86e, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.scale.setScalar(3);
  arrow.add(halo, edge, face);
  arrow.renderOrder = 5;
  arrow.visible = false;
  scene.add(arrow);
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _mm = new THREE.Matrix4();
// ship: 우주선 위치, fwd/up: 우주선 앞·위 방향, target: 목적지 위치, stop: 목적지 앞 멈출 거리
export function updateGuide(show, t, ship, fwd, up, target, stop) {
  pathPts.visible = arrow.visible = show;
  if (!show) return;
  _d.subVectors(target, ship);
  const dist = _d.length() - stop;
  _d.normalize();
  // 점선 길: 우주선 가까이는 촘촘, 멀리는 성기게(앞으로 흘러가는 빛)
  const phase = (t * 1.2) % 1;
  let n = 0;
  for (let i = 0; i < PATH_N; i++) {
    const s = 4 * Math.pow(1.11, i + phase) - 2;
    if (s > dist) break;
    _a.copy(ship).addScaledVector(_d, s + 2);
    pathPos.set([_a.x, _a.y, _a.z], n * 3);
    const k = Math.min(1, (i + phase) / 3) * (0.55 + 0.45 * Math.sin((i + phase) * 0.9 - t * 4) ** 2);
    pathCol.set([1 * k, 0.93 * k, 0.6 * k], n * 3);
    n++;
  }
  pathPts.geometry.setDrawRange(0, n);
  pathPts.geometry.attributes.position.needsUpdate = true;
  pathPts.geometry.attributes.color.needsUpdate = true;

  // 화살표: 우주선 앞 조금 위에 떠서 목적지 쪽을 가리킨다.
  // 목적지가 거의 정면이면 화살이 화면 속으로 누워 버리므로, 위로 살짝 세워 「앞으로」처럼 보이게 한다.
  arrow.position.copy(ship).addScaledVector(fwd, 4.5).addScaledVector(up, 1.0);
  const toCam = _a.subVectors(camera.position, arrow.position).normalize();
  const camUp = _b.set(0, 1, 0).applyQuaternion(camera.quaternion);
  const ahead = Math.max(0, -_d.dot(toCam));
  const axis = _c.copy(_d).addScaledVector(camUp, 0.8 * ahead).normalize();
  const xAx = _x.crossVectors(toCam, axis).normalize();
  const yAx = _y.crossVectors(axis, xAx);
  _mm.makeBasis(xAx, yAx, axis);
  arrow.quaternion.setFromRotationMatrix(_mm);
  arrow.scale.setScalar(0.9 * (1 + 0.08 * Math.sin(t * 5)));
}

// ── 매 프레임 ───────────────────────────────────
export function updateWorld(dt, t) {
  for (const id in bodyObjs) {
    const o = bodyObjs[id];
    o.spin.rotation.y += o.b.spin * dt;
    for (const c of o.spin.children) if (c.userData.drift) c.rotation.y += c.userData.drift * dt;
    if (o.group.userData.charonOrbit) o.group.userData.charonOrbit.rotation.y += 0.12 * dt;
    if (o.pulse > 0) {
      o.pulse = Math.max(0, o.pulse - dt);
      o.spin.scale.setScalar(1 + 0.05 * Math.sin(o.pulse * 18) * o.pulse);
    }
  }
  // 하늘은 카메라를 따라다닌다(언제나 멀리 있는 것처럼)
  sky.position.copy(camera.position);
  stars.position.copy(camera.position);
  // 먼지: 카메라 둘레 160 상자 안에서 되감기
  const c = camera.position;
  for (let i = 0; i < dustPos.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const cc = k === 0 ? c.x : k === 1 ? c.y : c.z;
      let v = dustPos[i + k] - cc;
      if (v > 80) dustPos[i + k] -= 160; else if (v < -80) dustPos[i + k] += 160;
    }
  }
  dust.geometry.attributes.position.needsUpdate = true;
}

export function render() { renderer.render(scene, camera); }

// 화면 좌표 → 누른 천체 id(없으면 null)
const ray = new THREE.Raycaster();
export function pickBody(x, y) {
  ray.setFromCamera(new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1), camera);
  const meshes = Object.values(bodyObjs).map(o => o.mesh);
  const hit = ray.intersectObjects(meshes, false)[0];
  return hit ? hit.object.userData.bodyId : null;
}
