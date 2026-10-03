// 우주선 모델. 오리지널 디자인: 날렵한 은색 선체 + 뒤로 젖힌 날개 + 쌍발 엔진 + 조종석 창.
// 더 좋은 모델(glTF 등)로 바꿀 때는 이 파일의 createShip()만 바꾸면 된다.
// 약속: 길이 약 SHIP_LEN, 앞(코)은 -Z, 위는 +Y, 원점은 선체 가운데.
// 돌려주는 것: { object, update(dt, t, thrust 0~1) }

import * as THREE from 'three';

export const SHIP_LEN = 2.4;

let envTex = null;
export function setShipEnv(tex) { envTex = tex; }

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let GLOW = null;
export function glow() { return GLOW || (GLOW = glowTexture()); }

export function createShip() {
  const L = SHIP_LEN;
  const root = new THREE.Group();
  const body = new THREE.Group();          // 기울기(뱅크) 연출은 body에만
  root.add(body);

  const metal = new THREE.MeshStandardMaterial({ color: 0xdfe6f0, metalness: 0.75, roughness: 0.28, envMap: envTex, envMapIntensity: 1.2 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x4a5368, metalness: 0.6, roughness: 0.4, envMap: envTex });
  const accent = new THREE.MeshStandardMaterial({ color: 0x5fd4d0, metalness: 0.3, roughness: 0.35, emissive: 0x1d6f6c, emissiveIntensity: 0.6, envMap: envTex });
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fd8ff, metalness: 0.1, roughness: 0.05, emissive: 0x2a5d8a, emissiveIntensity: 0.5, transparent: true, opacity: 0.88, envMap: envTex, envMapIntensity: 2 });

  // 선체: 옆에서 본 윤곽을 돌려 만든 날렵한 몸통(코가 -Z)
  const prof = [];
  const N = 16;
  for (let i = 0; i <= N; i++) {
    const t = i / N;                      // 0 = 꼬리, 1 = 코
    const r = 0.27 * Math.pow(Math.sin(Math.PI * (0.18 + 0.82 * t)), 0.8) * (t > 0.7 ? 1 - (t - 0.7) * 1.9 : 1);
    prof.push(new THREE.Vector2(Math.max(0.005, r), (t - 0.45) * L));
  }
  const hullGeo = new THREE.LatheGeometry(prof, 24);
  hullGeo.rotateX(-Math.PI / 2);          // 축을 Y에서 -Z로
  hullGeo.scale(1, 0.72, 1);              // 살짝 납작하게
  const hull = new THREE.Mesh(hullGeo, metal);
  body.add(hull);

  // 등줄기 띠
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, L * 0.55), accent);
  stripe.position.set(0, 0.19, 0.15);
  body.add(stripe);

  // 조종석 창
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), glass);
  canopy.scale.set(0.85, 0.75, 2.1);
  canopy.position.set(0, 0.13, -L * 0.18);
  body.add(canopy);

  // 날개: 뒤로 젖힌 삼각 날개(두께 있게)
  const ws = new THREE.Shape();
  ws.moveTo(0, -0.25);
  ws.lineTo(1.05, 0.55);
  ws.lineTo(1.0, 0.78);
  ws.lineTo(0.0, 0.62);
  ws.closePath();
  const wingGeo = new THREE.ExtrudeGeometry(ws, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.02, bevelSegments: 1 });
  wingGeo.rotateX(Math.PI / 2);            // 모양을 XZ 평면으로
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(wingGeo, metal);
    w.scale.set(s, 1, 1);
    w.position.set(s * 0.12, -0.02, 0.05);
    w.rotation.z = s * -0.06;              // 살짝 아래로
    body.add(w);
    // 날개 끝 띠
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.3), accent);
    tip.position.set(s * 1.13, -0.04, 0.7);
    body.add(tip);
  }

  // 꼬리 지느러미(두 장, 바깥으로 기울게)
  const fs = new THREE.Shape();
  fs.moveTo(0, 0); fs.lineTo(0.45, 0); fs.lineTo(0.62, 0.42); fs.lineTo(0.45, 0.45); fs.closePath();
  const finGeo = new THREE.ExtrudeGeometry(fs, { depth: 0.03, bevelEnabled: false });
  finGeo.rotateY(-Math.PI / 2);
  for (const s of [-1, 1]) {
    const f = new THREE.Mesh(finGeo, accent);
    f.position.set(s * 0.18, 0.08, 0.55);
    f.rotation.z = s * -0.35;
    body.add(f);
  }

  // 쌍발 엔진 + 빛나는 불꽃
  const flames = [];
  const engGeo = new THREE.CylinderGeometry(0.13, 0.16, 0.7, 18);
  engGeo.rotateX(Math.PI / 2);
  const ringGeo = new THREE.TorusGeometry(0.13, 0.025, 8, 24);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x9ff3ff });
  const flameMat = new THREE.SpriteMaterial({ map: glow(), color: 0x8fe9ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const coreMat = new THREE.SpriteMaterial({ map: glow(), color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const plumeGeo = new THREE.ConeGeometry(0.12, 1, 16, 1, true);
  plumeGeo.translate(0, -0.5, 0);          // 밑동이 원점, 끝이 -Y
  plumeGeo.rotateX(-Math.PI / 2);          // 끝이 +Z(뒤)
  const plumeMat = new THREE.MeshBasicMaterial({ color: 0x7fdcff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(engGeo, dark);
    e.position.set(s * 0.32, -0.02, 0.85);
    body.add(e);
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(s * 0.32, -0.02, 1.2);
    body.add(ring);
    const f = new THREE.Sprite(flameMat);
    f.position.set(s * 0.32, -0.02, 1.4);
    const c = new THREE.Sprite(coreMat);
    c.position.set(s * 0.32, -0.02, 1.27);
    // 뒤로 뻗는 불꽃 기둥(길이는 추진력에 따라)
    const plume = new THREE.Mesh(plumeGeo, plumeMat);
    plume.position.set(s * 0.32, -0.02, 1.22);
    body.add(f, c, plume);
    flames.push({ f, c, plume });
  }

  // 날개 끝 표시등
  const navL = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: 0xff8fb8, blending: THREE.AdditiveBlending, depthWrite: false }));
  const navR = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: 0x8fffc0, blending: THREE.AdditiveBlending, depthWrite: false }));
  navL.position.set(-1.15, -0.02, 0.85); navR.position.set(1.15, -0.02, 0.85);
  body.add(navL, navR);

  let flick = 0;
  return {
    object: root,
    body,
    update(dt, t, thrust = 0.3) {
      flick = 0.85 + 0.15 * Math.sin(t * 37) * Math.sin(t * 23);
      const len = (0.35 + 1.4 * thrust) * flick;
      for (const { f, c, plume } of flames) {
        f.scale.setScalar(0.42 + 0.25 * thrust);
        f.position.z = 1.25 + len * 0.3;
        f.material.opacity = 0.55 + 0.4 * thrust;
        c.scale.setScalar(0.26);
        plume.scale.set(1, 1, len);
      }
      const blink = (Math.sin(t * 3) > 0.6) ? 0.9 : 0.25;
      navL.material.opacity = navR.material.opacity = blink;
      navL.scale.setScalar(0.3); navR.scale.setScalar(0.3);
    },
  };
}
