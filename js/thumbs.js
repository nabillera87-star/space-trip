// 고르는 화면 카드 그림: 실제 질감을 입힌 구를 작은 렌더러로 한 번씩 찍어 이미지로 쓴다.

import * as THREE from 'three';
import { byId } from './data.js';

const SIZE = 256;

function ring(inner, outer, mat) {
  const geo = new THREE.RingGeometry(inner, outer, 96, 1);
  const p = geo.attributes.position, uv = geo.attributes.uv, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); uv.setXY(i, (v.length() - inner) / (outer - inner), 0.5); }
  geo.rotateX(-Math.PI / 2);
  return new THREE.Mesh(geo, mat);
}

// ids의 썸네일을 만들어 { id: dataURL } 로 돌려준다
export function makeThumbs(ids) {
  return new Promise(resolve => {
    const canvas = document.createElement('canvas');
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setSize(SIZE, SIZE, false);
    const manager = new THREE.LoadingManager();
    const loader = new THREE.TextureLoader(manager);
    const items = ids.map(id => {
      const b = byId[id];
      const scene = new THREE.Scene();
      scene.add(new THREE.AmbientLight(0xaab0dd, 0.9));
      const sun = new THREE.DirectionalLight(0xffffff, 2.4);
      sun.position.set(-3, 2, 4);
      scene.add(sun);
      const t = loader.load('assets/tex/' + b.tex);
      t.colorSpace = THREE.SRGBColorSpace;
      const mat = id === 'sun' ? new THREE.MeshBasicMaterial({ map: t }) : new THREE.MeshStandardMaterial({ map: t, roughness: 1 });
      const g = new THREE.Group();
      g.rotation.z = Math.min(b.tilt, 0.5);
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), mat);
      m.rotation.y = id === 'pluto' ? 0 : -0.6;
      if (id === 'pluto') m.rotation.y = Math.PI / 2;   // 하트가 앞으로
      if (id === 'haumea') m.scale.set(1.0, 0.51, 0.8);
      g.add(m);
      let camZ = 3.0;
      if (id === 'saturn') {
        const rt = loader.load('assets/tex/2k_saturn_ring_alpha.png');
        rt.colorSpace = THREE.SRGBColorSpace;
        const rm = ring(1.24, 2.27, new THREE.MeshLambertMaterial({ map: rt, transparent: true, side: THREE.DoubleSide }));
        g.add(rm);
        g.rotation.x = 0.35;
        camZ = 5.4;
      }
      if (id === 'haumea') {
        g.add(ring(2.1, 2.25, new THREE.MeshBasicMaterial({ color: 0xdde6f0, transparent: true, opacity: 0.5, side: THREE.DoubleSide })));
        g.rotation.x = 0.3;
        camZ = 4.4;
      }
      if (id === 'sun') camZ = 3.3;
      scene.add(g);
      const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
      cam.position.set(0, 0, camZ);
      return { id, scene, cam };
    });
    manager.onLoad = () => {
      const out = {};
      for (const it of items) {
        r.clear();
        r.render(it.scene, it.cam);
        out[it.id] = canvas.toDataURL('image/png');
      }
      r.dispose();
      r.forceContextLoss();
      resolve(out);
    };
  });
}
