// 천체 자료와 3D 세계 배치.
// 태양은 원점. 행성은 태양 둘레 궤도(XZ 평면) 위, 대체로 -Z 방향 한 줄에 놓는다.
// 거리: 실제 평균 거리(au)를 au^0.6으로 줄여 순서는 지키고 먼 곳도 갈 만하게 한다.
// 크기: 지구 반지름=1 기준 실제 값을 ^0.65로 줄여 목성이 여전히 압도적으로 크게 남긴다.

const DIST_K = 2000;   // 지구가 태양에서 2000 떨어진다
const DIST_P = 0.6;
const SIZE_K = 10;     // 지구 반지름 10
const SIZE_P = 0.65;

// kind: star | planet | dwarf | moon | home
// ang: 궤도 위 각도(라디안, 0이면 태양에서 정확히 -Z 방향), y: 궤도면에서 위아래(왜소행성의 기운 궤도를 살짝)
// tilt: 자전축 기울기(라디안), spin: 화면에서 보이는 자전 빠르기(라디안/초, 음수면 반대로)
// tex: assets/tex/ 안 질감 파일, faceU: 도착할 때 카메라 쪽으로 돌려 둘 질감 가로 위치(목성 대적점·명왕성 하트·지구의 한국·화성 협곡)
export const BODIES = [
  { id: 'sun',      name: '태양',    kind: 'star',   au: 0,    re: 109,   ang: 0,     y: 0,   tilt: 0.13, spin: 0.03,  tex: '2k_sun.jpg',               fact: '너무 뜨거워! 여기서 볼게' },
  { id: 'mercury',  name: '수성',    kind: 'planet', au: 0.39, re: 0.38,  ang: 0.07,  y: 0,   tilt: 0,    spin: 0.05,  tex: '2k_mercury.jpg',           fact: '태양이랑 제일 가까워' },
  { id: 'venus',    name: '금성',    kind: 'planet', au: 0.72, re: 0.95,  ang: -0.06, y: 0,   tilt: 0.05, spin: -0.04, tex: '2k_venus_atmosphere.jpg',  fact: '두꺼운 구름에 덮인 제일 뜨거운 행성' },
  { id: 'earth',    name: '지구',    kind: 'home',   au: 1.0,  re: 1,     ang: 0,     y: 0,   tilt: 0.41, spin: 0.08,  tex: '2k_earth_daymap.jpg', faceU: 0.853,      fact: '우리 집이야!' },
  { id: 'moon',     name: '달',      kind: 'moon',   au: 1.0,  re: 0.27,  near: 'earth', off: [-48, 8, -40], tilt: 0.1, spin: 0.03, tex: '2k_moon.jpg', fact: '지구 곁을 도는 친구야' },
  { id: 'mars',     name: '화성',    kind: 'planet', au: 1.52, re: 0.53,  ang: 0.05,  y: 0,   tilt: 0.44, spin: 0.08,  tex: '2k_mars.jpg', faceU: 0.33,              fact: '빨간 모래 행성이야' },
  { id: 'ceres',    name: '세레스',  kind: 'dwarf',  au: 2.77, re: 0.074, ang: -0.035, y: 30, tilt: 0.07, spin: 0.15,  tex: '2k_ceres_dawn.jpg',        fact: '소행성대 한가운데 사는 왜소행성' },
  { id: 'jupiter',  name: '목성',    kind: 'planet', au: 5.2,  re: 11.2,  ang: 0.02,  y: 0,   tilt: 0.05, spin: 0.16,  tex: '2k_jupiter.jpg', faceU: 0.373,           fact: '제일 큰 행성! 빨간 큰 점이 있어' },
  { id: 'saturn',   name: '토성',    kind: 'planet', au: 9.5,  re: 9.45,  ang: -0.03, y: 0,   tilt: 0.47, spin: 0.14,  tex: '2k_saturn.jpg',            fact: '멋진 고리가 있어' },
  { id: 'uranus',   name: '천왕성',  kind: 'planet', au: 19.2, re: 4.0,   ang: 0.025, y: 0,   tilt: 1.71, tiltX: 0.4, spin: -0.1,  tex: '2k_uranus.jpg',            fact: '옆으로 누워서 돌아' },
  { id: 'neptune',  name: '해왕성',  kind: 'planet', au: 30.1, re: 3.88,  ang: -0.02, y: 0,   tilt: 0.49, spin: 0.1,   tex: '2k_neptune.jpg',           fact: '바람이 아주 세게 불어' },
  { id: 'pluto',    name: '명왕성',  kind: 'dwarf',  au: 39.5, re: 0.19,  ang: 0.018, y: 260, tilt: 0.3,  spin: 0.05,  tex: '2k_pluto_newhorizons.jpg', faceU: 0.5, fact: '커다란 하트 무늬가 있어' },
  { id: 'haumea',   name: '하우메아', kind: 'dwarf', au: 43.1, re: 0.13,  ang: -0.016, y: 300, tilt: 0.2, tiltX: 0.5, spin: 0.7,   tex: '2k_haumea_fictional.jpg',  fact: '럭비공처럼 길쭉하고 빙글빙글 빨리 돌아' },
  { id: 'makemake', name: '마케마케', kind: 'dwarf', au: 45.8, re: 0.11,  ang: 0.014, y: 220, tilt: 0.1,  spin: 0.12,  tex: '2k_makemake_fictional.jpg', fact: '아주 멀고 추운 곳이야' },
  { id: 'eris',     name: '에리스',  kind: 'dwarf',  au: 67.8, re: 0.18,  ang: -0.012, y: -420, tilt: 0.3, spin: 0.08, tex: '2k_eris_fictional.jpg',    fact: '명왕성만큼 크고 아주아주 멀어' },
];

export const byId = Object.fromEntries(BODIES.map(b => [b.id, b]));

export const distOf = au => DIST_K * Math.pow(au, DIST_P);

// 세계 좌표·반지름 계산
for (const b of BODIES) {
  let r = SIZE_K * Math.pow(b.re, SIZE_P);
  // 왜소행성은 다섯 살 눈에 보이도록 최소 크기를 둔다(그래도 행성보다 작다)
  if (b.kind === 'dwarf') r = Math.max(r, 3 + b.re * 8);
  b.r = r;
  if (b.near) continue;
  const R = distOf(b.au);
  b.orbit = R;
  b.pos = [R * Math.sin(b.ang), b.y, -R * Math.cos(b.ang)];
}
for (const b of BODIES) {
  if (!b.near) continue;
  const p = byId[b.near];
  b.pos = [p.pos[0] + b.off[0], p.pos[1] + b.off[1], p.pos[2] + b.off[2]];
}

// 소행성대: 화성과 목성 사이(실제 약 2.2~3.3 au). 지나가는 길목(각도 ±0.3)에만 바위를 둔다.
export const BELT = { r0: distOf(2.2), r1: distOf(3.3), ang: 0.3, halfY: 12 };

// 미니 지도에 놓는 순서(지구 곁의 달은 빼고 해 바깥쪽으로)
export const MAP_ORDER = ['sun', 'mercury', 'venus', 'earth', 'mars', 'ceres', 'jupiter', 'saturn',
  'uranus', 'neptune', 'pluto', 'haumea', 'makemake', 'eris'];

// 고르는 화면의 줄
export const PICK_ROWS = [
  { title: '행성', ids: ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'] },
  { title: '⭐ 왜소행성 ⭐', ids: ['ceres', 'pluto', 'haumea', 'makemake', 'eris'], special: true },
  { title: '', ids: ['moon', 'sun', 'earth'] },
];

// 도착 판정 거리(천체 중심에서, 넉넉하게). 태양은 「너무 뜨거워!」로 멀리서 멈춘다.
export function arriveRadius(b) {
  if (b.id === 'sun') return b.r + 450;
  return b.r * 2.6 + 8;
}
// 태양에 이보다 가까이는 못 간다
export const SUN_HOT = byId.sun.r + 330;
