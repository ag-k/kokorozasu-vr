// 人物・建物・舟・灯り・持ち物などのプロップ生成
import * as THREE from 'three';
import { Builder, MAT, hullGeometry, hullHalfWidth, hullWaterline, deckGeometry, hullRails } from './builder.js';
import { mulberry32, displaceShared } from './util.js';

export const C = {
  kuroki: '#35291f', wood: '#8a6a48', woodDark: '#5e4630', plank: '#9a7b56',
  thatch: '#6f5e48', bark: '#5d4336', tatami: '#aaa36b', plaster: '#d6cdb8',
  sudare: '#b39a68', fence: '#6b5a3e', stone: '#8a857c', straw: '#b8a26c',
  skin: '#e3c6a6', hair: '#1a1613', black: '#161412', iron: '#2d2d31',
};

// ---- テクスチャ ----
let _glowTex;
export function glowTexture() {
  if (_glowTex) return _glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  _glowTex = new THREE.CanvasTexture(c);
  _glowTex.userData.shared = true;
  return _glowTex;
}

export function makeGlow(color = 0xffb060, size = 1, opacity = 1) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  }));
  s.scale.setScalar(size);
  return s;
}

// ---- 炎・灯り ----
export function makeFlame({ size = 1, color = 0xffa040, glow = 2.2 } = {}) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.ConeGeometry(0.09 * size, 0.32 * size, 6),
    new THREE.MeshBasicMaterial({ color: 0xffd080, fog: false })
  );
  core.position.y = 0.14 * size;
  const outer = new THREE.Mesh(
    new THREE.ConeGeometry(0.14 * size, 0.42 * size, 6),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, fog: false, depthWrite: false })
  );
  outer.position.y = 0.17 * size;
  const halo = makeGlow(color, glow * size, 0.9);
  halo.position.y = 0.2 * size;
  core.userData.noShadow = outer.userData.noShadow = true;
  g.add(outer, core, halo);
  const seed = Math.random() * 100;
  g.userData.update = (t) => {
    const f = 0.85 + Math.sin(t * 13 + seed) * 0.08 + Math.sin(t * 23.7 + seed * 2) * 0.07;
    core.scale.set(1, f, 1); outer.scale.set(1.05 - f * 0.1, f * 1.1, 1.05 - f * 0.1);
    halo.material.opacity = 0.65 + f * 0.25;
    outer.rotation.y = t * 2;
  };
  g.userData.flicker = true;
  return g;
}

export function makeLantern({ color = 0xffc070 } = {}) {
  const g = new THREE.Group();
  const b = new Builder();
  b.cyl(0.03, 0.03, 0.4, 4, C.woodDark, 0, 0.36, 0);
  b.box(0.18, 0.02, 0.02, C.woodDark, 0, 0.56, 0);
  const frame = b.mesh(MAT.figure);
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.1, 0.22, 8),
    new THREE.MeshBasicMaterial({ color: 0xffd7a0, fog: false })
  );
  body.position.y = 0.1;
  body.userData.noShadow = true;
  const halo = makeGlow(color, 1.1, 0.85);
  halo.position.y = 0.1;
  g.add(frame, body, halo);
  g.userData.halo = halo; g.userData.body = body;
  return g;
}

// ---- 人物 ----
// 人形風の人物。顔は絵巻物の「引目鉤鼻」のように細い目と眉だけを描く。1 メッシュにまとめる。
// layers: 裾と袖口にのぞく重ねの色（襲の色目）
export function makeFigure(opt = {}) {
  const o = Object.assign({
    robe: '#4a5a6a', robe2: '#d9d2c0', skin: C.skin, hair: C.hair, hat: 'none', h: 1.62,
    seated: false, armor: false, kesa: null, prop: null, sleeves: true, belt: null, layers: null, female: false,
  }, opt);
  if (o.hat === 'long') o.female = true;
  const b = new Builder();
  const S = o.h / 1.62;
  const lathe = (pts, col, seg = 14) => b.geo(new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0] * S, p[1] * S)), seg), col);
  const layers = o.layers || [o.robe2];
  const darker = new THREE.Color(o.robe).multiplyScalar(0.72);
  let neckY, shoulderY, handY, handZ;
  if (!o.seated) {
    // 裾に重ねの色をのぞかせる
    layers.forEach((c, i) => lathe([[0.3 - i * 0.008, 0], [0.3 - i * 0.008, 0.03 + i * 0.025], [0.26, 0.09 + i * 0.03]], c));
    lathe([[0.27, 0.04], [0.285, 0.1], [0.24, 0.45], [0.205, 0.82], [0.2, 1.1], [0.16, 1.27], [0.08, 1.37]], o.robe);
    neckY = 1.37 * S; shoulderY = 1.2 * S; handY = 0.92 * S; handZ = 0.3 * S;
    b.cyl(0.075 * S, 0.125 * S, 0.1 * S, 12, o.robe2, 0, 1.33 * S, 0);
    // 襟の合わせ
    b.box(0.03 * S, 0.34 * S, 0.02 * S, o.robe2, 0.035 * S, 1.17 * S, 0.19 * S, 0.12, 0, 0.35);
    if (o.belt) b.cyl(0.212 * S, 0.215 * S, 0.06 * S, 12, o.belt, 0, 0.84 * S, 0);
    if (o.armor) {
      // 大鎧：胴と、色糸で綴った札（威し）
      b.cyl(0.22 * S, 0.25 * S, 0.5 * S, 10, '#2f2a26', 0, 1.02 * S, 0);
      for (let i = 0; i < 5; i++) b.cyl(0.255 * S, 0.26 * S, 0.025 * S, 10, i % 2 ? '#7b2a22' : '#a2382c', 0, (0.8 + i * 0.1) * S, 0);
      for (const s of [1, -1]) {
        b.box(0.05 * S, 0.34 * S, 0.3 * S, '#2f2a26', s * 0.31 * S, 1.07 * S, 0, 0, 0, s * 0.28);
        for (let i = 0; i < 3; i++) b.box(0.055 * S, 0.02 * S, 0.31 * S, '#a2382c', s * (0.3 + i * 0.012) * S, (0.96 + i * 0.1) * S, 0, 0, 0, s * 0.28);
      }
      b.cyl(0.25 * S, 0.31 * S, 0.34 * S, 10, '#2f2a26', 0, 0.56 * S, 0); // 草摺
      for (let i = 0; i < 3; i++) b.cyl(0.26 * S + i * 0.02 * S, 0.27 * S + i * 0.02 * S, 0.02 * S, 10, '#a2382c', 0, (0.44 + i * 0.1) * S, 0);
    }
    if (o.kesa) b.box(0.08 * S, 0.9 * S, 0.45 * S, o.kesa, 0, 1.0 * S, 0, 0, 0, 0.5);
  } else {
    layers.forEach((c, i) => lathe([[0.37 - i * 0.01, 0], [0.37 - i * 0.01, 0.025 + i * 0.02], [0.3, 0.08 + i * 0.025]], c));
    lathe([[0.34, 0.03], [0.35, 0.09], [0.27, 0.32], [0.2, 0.6], [0.14, 0.77], [0.07, 0.83]], o.robe);
    neckY = 0.83 * S; shoulderY = 0.68 * S; handY = 0.44 * S; handZ = 0.33 * S;
    b.cyl(0.075 * S, 0.125 * S, 0.08 * S, 12, o.robe2, 0, 0.8 * S, 0);
    b.box(0.03 * S, 0.26 * S, 0.02 * S, o.robe2, 0.035 * S, 0.66 * S, 0.19 * S, 0.3, 0, 0.35);
    if (o.kesa) b.box(0.08 * S, 0.6 * S, 0.42 * S, o.kesa, 0, 0.5 * S, 0, 0, 0, 0.5);
  }
  if (o.sleeves) {
    // 広い袖：肩から前へ下ろし、袖口を体の前で寄せる。組んだ手は袖口の間からのぞく
    const up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion(), e = new THREE.Euler();
    for (const s of [1, -1]) {
      const sh = new THREE.Vector3(s * 0.2 * S, shoulderY, 0.02 * S);           // 肩
      const cuff = new THREE.Vector3(s * 0.085 * S, handY + 0.02 * S, handZ - 0.02 * S); // 袖口
      const axis = sh.clone().sub(cuff);
      const len = axis.length();
      q.setFromUnitVectors(up, axis.normalize());
      e.setFromQuaternion(q);
      const mid = sh.clone().add(cuff).multiplyScalar(0.5);
      b.geo(new THREE.CylinderGeometry(0.07 * S, 0.13 * S, len, 10, 1, true), o.robe, mid.x, mid.y, mid.z, e.x, e.y, e.z);
      // 袖口：重ねの色の縁と、奥の暗がり
      const rimPos = cuff.clone().addScaledVector(axis, 0.012 * S);
      b.geo(new THREE.CylinderGeometry(0.128 * S, 0.128 * S, 0.028 * S, 10, 1, true), layers[0], rimPos.x, rimPos.y, rimPos.z, e.x, e.y, e.z);
      const dark = new THREE.CircleGeometry(0.12 * S, 10);
      dark.rotateX(Math.PI / 2); // 円の面を袖の軸（上向き）に垂直に
      b.geo(dark, darker, cuff.x + axis.x * 0.03 * S, cuff.y + axis.y * 0.03 * S, cuff.z + axis.z * 0.03 * S, e.x, e.y, e.z);
      // 肩の丸み
      b.sphere(0.075 * S, o.robe, s * 0.19 * S, shoulderY - 0.01 * S, 0.01 * S, 1, 0.8, 1, 10, 8);
    }
    // 両手（袖口のすぐ前で重ねる）
    b.sphere(0.042 * S, o.skin, 0.022 * S, handY + 0.005 * S, handZ + 0.012 * S, 1.3, 0.85, 1.05, 10, 8);
    b.sphere(0.042 * S, o.skin, -0.02 * S, handY + 0.018 * S, handZ + 0.026 * S, 1.3, 0.85, 1.05, 10, 8);
  }
  const headY = neckY + 0.12 * S;
  b.sphere(0.105 * S, o.skin, 0, headY, 0, 0.95, 1.1, 1, 14, 12);
  b.sphere(0.02 * S, o.skin, 0.1 * S, headY, -0.005 * S, 0.6, 1.2, 0.8, 6, 5); // 耳
  b.sphere(0.02 * S, o.skin, -0.1 * S, headY, -0.005 * S, 0.6, 1.2, 0.8, 6, 5);
  // 顔：引目（細い目）・眉・小さな口
  const ink = '#2a2320';
  for (const s of [1, -1]) {
    b.box(0.032 * S, 0.0045 * S, 0.016 * S, ink, s * 0.036 * S, headY + 0.008 * S, 0.1 * S, 0, s * -0.3, s * 0.08);
    b.box(0.028 * S, 0.007 * S, 0.016 * S, ink, s * 0.037 * S, headY + (o.female ? 0.058 : 0.042) * S, 0.096 * S, 0, s * -0.3, s * -0.12);
  }
  b.box(0.014 * S, 0.006 * S, 0.014 * S, o.female ? '#a8322e' : '#8c5a4a', 0, headY - 0.05 * S, 0.1 * S);
  const hairSphere = (y, sy = 0.85, r = 0.108) => b.sphere(r * S, o.hair, 0, headY + y * S, -0.012 * S, 1, sy, 1, 12, 8);
  switch (o.hat) {
    case 'eboshi':
      hairSphere(0.03, 0.8);
      b.cyl(0.07 * S, 0.1 * S, 0.32 * S, 10, C.black, 0, headY + 0.21 * S, -0.035 * S, -0.28, 0, 0);
      b.box(0.02 * S, 0.1 * S, 0.1 * S, C.black, 0, headY + 0.33 * S, -0.09 * S, -0.5, 0, 0); // 折り
      b.box(0.006 * S, 0.004 * S, 0.21 * S, '#4a3a30', 0, headY - 0.07 * S, 0.02 * S, -0.1, 0, 0); // 顎紐
      break;
    case 'kanmuri':
      hairSphere(0.03, 0.8);
      b.cyl(0.09 * S, 0.1 * S, 0.1 * S, 12, C.black, 0, headY + 0.1 * S, 0);
      b.box(0.04 * S, 0.22 * S, 0.02 * S, C.black, 0, headY + 0.14 * S, -0.12 * S, -0.5, 0, 0);
      break;
    case 'kasa':
      hairSphere(0.02);
      b.cone(0.31 * S, 0.15 * S, 14, '#b59a5c', 0, headY + 0.13 * S, 0);
      b.cyl(0.31 * S, 0.31 * S, 0.012 * S, 14, '#8e7644', 0, headY + 0.06 * S, 0);
      break;
    case 'helmet':
      b.sphere(0.13 * S, C.iron, 0, headY + 0.04 * S, 0, 1, 0.78, 1, 12, 8);
      b.cyl(0.24 * S, 0.26 * S, 0.02 * S, 12, C.iron, 0, headY - 0.01 * S, -0.02 * S, -0.22, 0, 0); // しころ
      for (let i = 0; i < 2; i++) b.cyl((0.2 + i * 0.03) * S, (0.23 + i * 0.03) * S, 0.02 * S, 12, '#a2382c', 0, headY - (0.04 + i * 0.035) * S, -0.03 * S, -0.22, 0, 0);
      for (const s of [1, -1]) b.box(0.02 * S, 0.14 * S, 0.12 * S, '#c49a3e', s * 0.07 * S, headY + 0.16 * S, 0.07 * S, 0, s * 0.3, s * 0.3); // 鍬形
      break;
    case 'long':
      b.sphere(0.115 * S, o.hair, 0, headY + 0.022 * S, -0.018 * S, 1, 1, 1, 12, 8);
      b.box(0.24 * S, (o.seated ? 0.72 : 1.02) * S, 0.06 * S, o.hair, 0, headY - (o.seated ? 0.42 : 0.56) * S, -0.13 * S);
      for (const s of [1, -1]) b.box(0.035 * S, 0.22 * S, 0.05 * S, o.hair, s * 0.1 * S, headY - 0.1 * S, 0.02 * S); // 鬢
      break;
    case 'bald':
      break;
    case 'topknot':
      hairSphere(0.02);
      b.box(0.04 * S, 0.04 * S, 0.12 * S, o.hair, 0, headY + 0.11 * S, -0.04 * S);
      break;
    case 'hood':
      b.sphere(0.13 * S, o.robe, 0, headY + 0.02 * S, -0.02 * S, 1, 1.05, 1.05, 12, 8);
      break;
    default:
      hairSphere(0.02);
  }
  if (o.prop === 'spear') {
    b.cyl(0.018, 0.018, 2.5 * S, 5, C.woodDark, 0.3 * S, 1.2 * S, 0.12 * S);
    b.cone(0.03, 0.28 * S, 5, '#c9c9cf', 0.3 * S, 2.59 * S, 0.12 * S);
  }
  if (o.prop === 'staff') b.cyl(0.02, 0.02, 1.6 * S, 5, C.woodDark, 0.3 * S, 0.8 * S, 0.12 * S);
  // 顔の向き（正面 -Z に合わせるため回転）
  const geo = b.merged();
  geo.rotateY(Math.PI);
  const mesh = new THREE.Mesh(geo, MAT.figure);
  const g = new THREE.Group();
  g.add(mesh);
  g.userData.headY = headY;
  g.userData.phase = Math.random() * 10;
  g.userData.body = mesh;
  if (o.prop === 'torch') {
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.7, 5), new THREE.MeshLambertMaterial({ color: C.woodDark }));
    stick.position.set(-0.28 * S, 1.25 * S, -0.22 * S);
    stick.rotation.x = 0.35;
    const fl = makeFlame({ size: 0.9 });
    fl.position.set(-0.28 * S, 1.62 * S, -0.35 * S);
    g.add(stick, fl);
    g.userData.flame = fl;
  }
  if (o.prop === 'lantern') {
    const lan = makeLantern();
    lan.position.set(-0.26 * S, 0.62 * S, -0.3 * S);
    g.add(lan);
    g.userData.lantern = lan;
  }
  return g;
}

// 人物の待機アニメ（呼吸と話す時のうなずき）
export function animateFigure(fig, t, talking = false) {
  const u = fig.userData;
  const m = u.body;
  const k = Math.sin(t * 1.6 + u.phase);
  m.scale.y = 1 + k * 0.006;
  m.rotation.x = talking ? Math.sin(t * 7 + u.phase) * 0.025 : 0;
}

// プレイヤー（帝）の手と袖
export function makeHandModel(side = 'right') {
  const g = new THREE.Group();
  const b = new Builder();
  const s = side === 'left' ? -1 : 1;
  b.geo(new THREE.CylinderGeometry(0.065, 0.14, 0.34, 8, 1, true), '#ebe4d2', 0, 0.0, 0.2, Math.PI / 2, 0, 0);
  b.geo(new THREE.CylinderGeometry(0.06, 0.1, 0.3, 8, 1, true), '#c7b58a', 0, 0.0, 0.2, Math.PI / 2, 0, 0, 0.9, 0.9, 0.95);
  b.box(0.075, 0.035, 0.1, C.skin, 0, 0, -0.02);
  b.box(0.07, 0.03, 0.06, C.skin, 0, -0.012, -0.09, 0.35, 0, 0);
  b.box(0.022, 0.028, 0.06, C.skin, s * 0.045, 0.005, -0.03, 0, s * -0.4, 0);
  const m = b.mesh(MAT.vcDouble);
  g.add(m);
  return g;
}

// ---- 建物 ----
function logWall(b, x0, z0, x1, z1, y0, h, color, r = 0.12) {
  const prev = b._kind;
  b.kind('bark');
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(2, Math.round(len / (r * 2.05)));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    // 丸太ごとに少し色を変える
    const c = new THREE.Color(color).multiplyScalar(0.85 + ((i * 37) % 11) / 36);
    b.cyl(r * 0.95, r, h, 6, c, x0 + (x1 - x0) * t, y0 + h / 2, z0 + (z1 - z0) * t, 0, i * 1.3, 0);
  }
  b.kind(prev);
}

function sudareBlind(b, w, h, x, y, z, ry = 0, color = C.sudare, pitch = 0.05, slat = 0.018) {
  // すだれ：細い横桟を重ねて向こうが透けるように
  const prev = b._kind;
  b.kind('plain');
  const n = Math.round(h / pitch);
  for (let i = 0; i < n; i++) {
    const yy = y - h / 2 + (i + 0.5) * (h / n);
    b.box(w, slat, 0.012, color, x, yy, z, 0, ry, 0);
  }
  b.box(w + 0.04, 0.04, 0.03, '#6d4c33', x, y + h / 2, z, 0, ry, 0);
  b.box(w + 0.04, 0.04, 0.03, '#6d4c33', x, y - h / 2, z, 0, ry, 0);
  b.kind(prev);
}

// 黒木御所。正面（縁側）は -Z 方向。原点は床下の地面中央。
export function makeGosho() {
  const b = new Builder();
  const W = 10, D = 7, FY = 0.7, H = 2.5;
  // 床下の束と床
  b.kind('wood');
  b.box(W, 0.14, D, '#6e5238', 0, FY - 0.07, 0);
  b.kind('bark');
  for (let x = -W / 2; x <= W / 2 + 0.01; x += 2.5) {
    for (const z of [-D / 2, 0, D / 2]) b.cyl(0.13, 0.15, FY + H + 0.3, 6, C.kuroki, x, (FY + H + 0.3) / 2, z);
  }
  // 縁側
  b.kind('wood');
  b.box(W + 0.6, 0.1, 1.4, '#8a6b4a', 0, FY - 0.05, -D / 2 - 0.7);
  for (let x = -W / 2 - 0.2; x <= W / 2 + 0.3; x += 2.6) b.cyl(0.09, 0.1, FY, 5, C.kuroki, x, FY / 2, -D / 2 - 1.3);
  // 階段
  for (let i = 0; i < 3; i++) b.box(1.8, 0.1, 0.35, '#7c5e40', 0, FY - 0.2 - i * 0.2, -D / 2 - 1.55 - i * 0.3);
  // 黒木の壁（背面・側面）
  logWall(b, -W / 2, D / 2, W / 2, D / 2, FY, H, C.kuroki);
  logWall(b, -W / 2, -D / 2 + 1.2, -W / 2, D / 2, FY, H, C.kuroki);
  logWall(b, W / 2, -D / 2 + 1.2, W / 2, D / 2, FY, H, C.kuroki);
  // 正面の長押と蔀戸（はね上げ）
  b.box(W, 0.2, 0.2, C.kuroki, 0, FY + H, -D / 2);
  for (let i = 0; i < 4; i++) {
    const x = -W / 2 + 1.25 + i * 2.5;
    if (i === 1 || i === 2) continue;
    b.box(2.3, 1.2, 0.06, '#4a3a2c', x, FY + H - 0.3, -D / 2 - 0.55, -1.1, 0, 0);
  }
  sudareBlind(b, 2.3, 0.9, -1.25, FY + H - 0.55, -D / 2 + 0.05);
  sudareBlind(b, 2.3, 0.9, 1.25, FY + H - 0.55, -D / 2 + 0.05);
  // 屋根（切妻・茅葺風）
  b.kind('thatch');
  b.gable(W + 2.6, D + 3.2, 2.4, C.thatch, 0, FY + H + 0.25, -0.35);
  b.box(W + 2.7, 0.3, 0.5, '#4c3f30', 0, FY + H + 2.66, -0.35);
  // 室内
  b.kind('tatami');
  for (let i = 0; i < 3; i++) b.box(1.8, 0.06, 0.9, C.tatami, -2.5 + i * 2, FY + 0.03, 1.2);
  b.box(1.8, 0.08, 0.9, '#b1a771', 0, FY + 0.06, -0.8);
  b.kind('wood');
  b.box(0.9, 0.3, 0.4, '#3d2a1c', 0, FY + 0.3, 0.2); // 文机
  b.kind('plain');
  b.box(0.5, 0.01, 0.3, '#efe8d6', 0.1, FY + 0.46, 0.2);
  for (let i = 0; i < 4; i++) b.box(0.6, 1.5, 0.03, i % 2 ? '#c7a760' : '#b9974f', 3.2 + i * 0.5, FY + 0.75, 2.6, 0, i % 2 ? 0.5 : -0.5, 0);
  b.cyl(0.02, 0.05, 1.1, 5, '#2d241c', -3.6, FY + 0.55, -1.2);
  const m = b.mesh();
  const g = new THREE.Group();
  g.add(m);
  const lampFire = makeFlame({ size: 0.3, glow: 1.2 });
  lampFire.position.set(-3.6, FY + 1.12, -1.2);
  g.add(lampFire);
  g.userData.lampFire = lampFire;
  g.userData.floorY = FY;
  g.userData.platforms = [
    { x: 0, z: 0, hw: W / 2, hd: D / 2, y: FY },
    { x: 0, z: -D / 2 - 0.7, hw: W / 2 + 0.3, hd: 0.7, y: FY },
  ];
  g.userData.veranda = new THREE.Vector3(0, FY, -D / 2 - 0.8);
  g.userData.inside = new THREE.Vector3(0, FY, 0.4);
  return g;
}

// 柴垣と門
export function makeFence(points, { gapIndex = -1, h = 1.3, color = C.fence } = {}) {
  const b = new Builder();
  for (let i = 0; i < points.length - 1; i++) {
    if (i === gapIndex) continue;
    const [x0, z0] = points[i], [x1, z1] = points[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const ang = Math.atan2(-(z1 - z0), x1 - x0);
    b.kind('thatch');
    b.box(len, h, 0.18, color, (x0 + x1) / 2, h / 2, (z0 + z1) / 2, 0, ang, 0);
    b.kind('bark');
    b.box(len, 0.06, 0.24, '#4d3f2a', (x0 + x1) / 2, h * 0.7, (z0 + z1) / 2, 0, ang, 0);
    const n = Math.floor(len / 2.2);
    for (let k = 0; k <= n; k++) {
      const t = n ? k / n : 0;
      b.cyl(0.06, 0.07, h + 0.15, 4, C.kuroki, x0 + (x1 - x0) * t, (h + 0.15) / 2, z0 + (z1 - z0) * t);
    }
  }
  return b.mesh();
}

export function makeGate(width = 2.6, ry = 0) {
  const b = new Builder();
  b.kind('bark');
  b.cyl(0.14, 0.16, 2.8, 8, C.kuroki, -width / 2, 1.4, 0);
  b.cyl(0.14, 0.16, 2.8, 8, C.kuroki, width / 2, 1.4, 0);
  b.box(width + 0.8, 0.18, 0.2, C.kuroki, 0, 2.6, 0);
  b.kind('thatch');
  b.gable(width + 1.4, 1.2, 0.5, C.bark, 0, 2.75, 0);
  b.kind('wood');
  // 開いた扉（柱の蝶番で内へ大きく開き、通り道をふさがない）
  const dw = width / 2 - 0.12, open = 1.4;
  for (const s of [-1, 1]) {
    b.box(dw, 2.1, 0.06, '#5a4431', s * (width / 2 - 0.1 - Math.cos(open) * dw / 2), 1.2, 0.1 + Math.sin(open) * dw / 2, 0, s * open, 0);
  }
  const m = b.mesh();
  m.rotation.y = ry;
  return m;
}

// 汎用の小さな建物。正面 -Z。
export function makeHouse(opt = {}) {
  const o = Object.assign({
    w: 6, d: 4.5, h: 2.3, floor: 0.5, roof: 'gable', roofColor: C.thatch, wall: C.wood, post: C.woodDark,
    open: true, sudare: true, veranda: true, roofH: 1.8, logs: false,
  }, opt);
  const b = new Builder();
  const { w, d, h, floor: FY } = o;
  b.kind('wood');
  if (FY > 0) b.box(w, 0.12, d, '#6e5238', 0, FY - 0.06, 0);
  for (const x of [-w / 2, 0, w / 2]) {
    for (const z of [-d / 2, d / 2]) {
      if (x === 0 && z < 0) continue; // 正面中央は柱を立てない（中が見えるように）
      // 斜面でも浮かないよう、柱は地面の下まで伸ばす
      b.cyl(0.1, 0.11, FY + h + 2, 6, o.post, x, (FY + h - 2) / 2, z);
    }
  }
  if (o.logs) {
    logWall(b, -w / 2, d / 2, w / 2, d / 2, FY, h, o.post, 0.1);
    logWall(b, -w / 2, -d / 2, -w / 2, d / 2, FY, h, o.post, 0.1);
    logWall(b, w / 2, -d / 2, w / 2, d / 2, FY, h, o.post, 0.1);
  } else {
    b.box(w, h, 0.08, o.wall, 0, FY + h / 2, d / 2);
    b.box(0.08, h, d, o.wall, -w / 2, FY + h / 2, 0);
    b.box(0.08, h, d, o.wall, w / 2, FY + h / 2, 0);
  }
  b.box(w, 0.16, 0.16, o.post, 0, FY + h, -d / 2);
  if (!o.open) {
    b.box(w * 0.3, h, 0.08, o.wall, -w * 0.35, FY + h / 2, -d / 2);
    b.box(w * 0.3, h, 0.08, o.wall, w * 0.35, FY + h / 2, -d / 2);
  }
  if (o.sudare) sudareBlind(b, w * 0.8, h * 0.45, 0, FY + h - h * 0.25, -d / 2 - 0.03);
  if (o.veranda && FY > 0) {
    b.box(w + 0.3, 0.08, 0.9, '#8a6b4a', 0, FY - 0.04, -d / 2 - 0.45);
    b.box(1.2, 0.08, 0.3, '#7c5e40', 0, FY * 0.5, -d / 2 - 1.05);
  }
  b.kind('thatch');
  if (o.roof === 'gable') b.gable(w + 1.6, d + 1.8, o.roofH, o.roofColor, 0, FY + h + 0.05, 0);
  else b.pyramid(w + 1.8, d + 1.8, o.roofH, o.roofColor, 0, FY + h + 0.05, 0);
  if (o.roof === 'gable') b.box(w + 1.7, 0.2, 0.35, '#4c3f30', 0, FY + h + o.roofH + 0.1, 0);
  else b.box(0.3, 0.4, 0.3, '#4c3f30', 0, FY + h + o.roofH + 0.1, 0);
  const g = new THREE.Group();
  g.add(b.mesh());
  g.userData.floorY = FY;
  g.userData.platform = { hw: w / 2 + 0.2, hd: d / 2 + (o.veranda ? 0.9 : 0), y: FY, zOff: o.veranda ? -0.45 : 0 };
  return g;
}

// 櫓（見張り台）
export function makeTower(h = 6) {
  const b = new Builder();
  b.kind('wood');
  for (const x of [-1, 1]) for (const z of [-1, 1]) b.cyl(0.1, 0.13, h, 6, C.woodDark, x, h / 2, z, x * 0.04, 0, z * 0.04);
  b.box(2.6, 0.12, 2.6, C.wood, 0, h, 0);
  for (let i = 0; i < 3; i++) b.box(2.4, 0.08, 0.08, C.woodDark, 0, h * (0.3 + i * 0.25), 1, 0, 0, 0.3 * (i % 2 ? 1 : -1));
  b.box(2.6, 0.6, 0.08, C.wood, 0, h + 0.35, 1.3);
  b.box(2.6, 0.6, 0.08, C.wood, 0, h + 0.35, -1.3);
  b.box(0.08, 0.6, 2.6, C.wood, 1.3, h + 0.35, 0);
  b.kind('thatch');
  b.pyramid(3.4, 3.4, 1.0, C.bark, 0, h + 1.9, 0);
  b.kind('wood');
  for (const x of [-1.2, 1.2]) for (const z of [-1.2, 1.2]) b.cyl(0.05, 0.05, 1.9, 4, C.woodDark, x, h + 0.95, z);
  const g = new THREE.Group();
  g.add(b.mesh());
  const fire = makeFlame({ size: 1.4, glow: 5 });
  fire.position.set(0, h + 0.2, 0);
  g.add(fire);
  g.userData.fire = fire;
  return g;
}

// 篝火
export function makeBonfire(size = 1) {
  const g = new THREE.Group();
  const b = new Builder();
  for (let i = 0; i < 3; i++) b.cyl(0.03 * size, 0.03 * size, 1.1 * size, 4, C.woodDark, 0, 0.5 * size, 0, 0.35, i * 2.1, 0);
  b.cyl(0.25 * size, 0.18 * size, 0.2 * size, 6, C.iron, 0, 0.95 * size, 0);
  g.add(b.mesh());
  const fire = makeFlame({ size: 1.2 * size, glow: 4 * size });
  fire.position.y = 1.0 * size;
  g.add(fire);
  g.userData.fire = fire;
  return g;
}

// 旗（佐々木氏の四つ目結を簡略化）
export function makeBanner(mark = 'yotsume') {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 192;
  const g = c.getContext('2d');
  g.fillStyle = '#e9e4d6'; g.fillRect(0, 0, 64, 192);
  g.fillStyle = '#1b1b1b';
  if (mark === 'yotsume') {
    const cx = 32, cy = 50, s = 9;
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      g.save(); g.translate(cx + dx * s * 1.2, cy + dy * s * 1.2); g.rotate(Math.PI / 4);
      g.fillRect(-s * 0.7, -s * 0.7, s * 1.4, s * 1.4);
      g.fillStyle = '#e9e4d6'; g.fillRect(-s * 0.35, -s * 0.35, s * 0.7, s * 0.7); g.fillStyle = '#1b1b1b';
      g.restore();
    }
  } else if (mark === 'hokake') {
    g.fillRect(28, 20, 4, 60);
    g.beginPath(); g.moveTo(14, 26); g.lineTo(48, 26); g.lineTo(46, 64); g.lineTo(16, 64); g.closePath(); g.fill();
    g.beginPath(); g.ellipse(32, 80, 22, 7, 0, 0, Math.PI); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const grp = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 4.2, 5), new THREE.MeshLambertMaterial({ color: C.woodDark }));
  pole.position.y = 2.1;
  const flagGeo = new THREE.PlaneGeometry(0.7, 2.1, 1, 6);
  flagGeo.translate(0.37, 0, 0);
  const flag = new THREE.Mesh(flagGeo, new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
  flag.position.y = 2.9;
  grp.add(pole, flag);
  const base = flagGeo.attributes.position.array.slice();
  const seed = Math.random() * 10;
  grp.userData.update = (t) => {
    const p = flagGeo.attributes.position.array;
    for (let i = 0; i < p.length; i += 3) {
      const x = base[i], y = base[i + 1];
      p[i + 2] = Math.sin(t * 2.4 + y * 2 + seed) * 0.06 * (x / 0.74);
    }
    flagGeo.attributes.position.needsUpdate = true;
  };
  return grp;
}

// ---- 舟 ----
export function makeSmallBoat({ color = '#8b6a47', length = 5.2, beam = 1.35 } = {}) {
  const g = new THREE.Group();
  const HO = { sheer: 0.28 };
  const hull = hullGeometry(length, beam, 0.55, HO);
  const b = new Builder();
  b.kind('wood');
  b.geo(hull, color, 0, 0.25, 0);
  // 船首材（左右の舷の合わせ目を覆う）
  b.box(0.09, 0.42, 0.09, '#5e452e', length / 2 - 0.03, 0.47, 0);
  // 床板と梁（船体の形に沿わせ、外にはみ出さない）
  b.geo(deckGeometry(length, beam, 0.55, HO, -0.12 - 0.25, 0.04, 0.03), '#6d5236', 0, 0.25, 0);
  // 梁（座る板）：その位置の船体の幅に合わせる
  for (const x of [0.6, -1.2]) {
    const w = hullHalfWidth(length, beam, 0.55, HO, x / length + 0.5, 0.12 - 0.25) * 2 - 0.04;
    b.box(0.18, 0.05, w, '#6d5236', x, 0.12, 0);
  }
  hullRails(b, length, beam, 0.55, HO, 0.27, '#5e452e', 0.06);
  const m = b.mesh(MAT.vcDouble);
  g.add(m);
  // 艪
  const oar = new Builder();
  oar.box(3.0, 0.06, 0.06, '#7a5e40', -1.5, 0, 0);
  oar.box(0.9, 0.02, 0.18, '#7a5e40', -3.1, 0, 0);
  const oarMesh = oar.mesh(MAT.figure);
  oarMesh.position.set(-length / 2 + 0.3, 0.45, 0);
  oarMesh.rotation.z = 0.45;
  g.add(oarMesh);
  g.userData.oar = oarMesh;
  g.userData.floorY = -0.1;
  g.userData.hull = m;
  // 舟の下の水面を抜く形
  g.userData.waterline = hullWaterline(length, beam, 0.55, HO);
  return g;
}

function sailTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#cbb991'; g.fillRect(0, 0, 128, 128);
  // 筵帆の編み目
  for (let x = 0; x < 128; x += 16) { g.fillStyle = 'rgba(90,70,40,0.35)'; g.fillRect(x, 0, 2, 128); }
  for (let y = 0; y < 128; y += 4) { g.fillStyle = y % 8 ? 'rgba(255,255,255,0.05)' : 'rgba(80,60,30,0.12)'; g.fillRect(0, y, 128, 2); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 帆船（護送船・商人船）。x が船首。甲板の高さ deckY。
export function makeShip({ length = 14, beam = 4, cabin = true, hatch = true, cargo = true } = {}) {
  const g = new THREE.Group();
  const b = new Builder();
  b.kind('wood');
  const HO = { sheer: 0.6, bluntStern: 0.55 };
  const hull = hullGeometry(length, beam, 1.9, HO);
  b.geo(hull, '#7a5b3d', 0, 1.0, 0);
  // 船首材（左右の舷の合わせ目を覆う）
  b.box(0.16, 1.3, 0.16, '#5e452e', length / 2 - 0.05, 1.28, 0);
  hullRails(b, length, beam, 1.9, HO, 1.02, '#5e452e', 0.1);
  const deckY = 0.62;
  const hx = 0.5, hw = 1.2; // 船倉の口
  // 甲板は船体の形に沿わせる（外にはみ出さない）
  const holes = hatch ? [[hx - hw / 2, -hw / 2, hx + hw / 2, hw / 2]] : [];
  b.geo(deckGeometry(length, beam, 1.9, HO, deckY + 0.05 - 1.0, 0.1, 0.05, holes), '#8e6f4c', 0, 1.0, 0);
  if (hatch) {
    b.box(hw + 0.2, 0.18, 0.1, '#5e452e', hx, deckY + 0.08, hw / 2);
    b.box(hw + 0.2, 0.18, 0.1, '#5e452e', hx, deckY + 0.08, -hw / 2);
    // 船倉の床
    b.box(length * 0.5, 0.08, beam * 0.5, '#5a4330', 0, -0.55, 0);
  }
  // 帆柱
  const mastX = 2.2;
  b.cyl(0.13, 0.17, 10, 6, '#6a5238', mastX, deckY + 5, 0);
  b.cyl(0.07, 0.07, 6, 5, '#6a5238', mastX + 0.18, deckY + 8.6, 0, Math.PI / 2, 0, 0);
  // 舵
  b.box(0.2, 2.2, 0.8, '#5e452e', -length / 2 - 0.1, 0.3, 0, 0, 0, -0.3);
  if (cabin) {
    // 屋形（前と横が開いた船室）。中で人が座り、立てる高さにする
    const cx = -length / 2 + 2.6, cw = beam * 0.8, ch = 2.05;
    b.box(0.08, ch, cw, '#7b5f41', cx - 1.6, deckY + ch / 2, 0); // 後ろの板壁
    for (const x of [cx - 1.6, cx + 1.6]) for (const z of [-cw / 2, cw / 2]) b.box(0.1, ch, 0.1, '#5e452e', x, deckY + ch / 2, z);
    for (const z of [-cw / 2, cw / 2]) {
      b.box(3.2, 0.4, 0.05, '#7b5f41', cx, deckY + 0.2, z); // 横の腰板
      b.box(3.3, 0.1, 0.12, '#5e452e', cx, deckY + ch - 0.05, z); // 桁
    }
    b.box(0.12, 0.1, cw, '#5e452e', cx + 1.6, deckY + ch - 0.05, 0);
    b.gable(3.8, beam * 0.95, 0.7, C.bark, cx, deckY + ch, 0, Math.PI / 2);
  }
  if (cargo) {
    for (let i = 0; i < 6; i++) {
      const x = -1.6 - (i % 3) * 0.9, z = (Math.floor(i / 3) - 0.5) * 1.0;
      b.cyl(0.28, 0.28, 0.85, 8, C.straw, x, deckY + 0.33 + (i === 5 ? 0.5 : 0), z, 0, 0, Math.PI / 2);
    }
    b.box(0.8, 0.6, 0.6, '#6f5438', 4.2, deckY + 0.35, 0.8);
    b.box(0.8, 0.6, 0.6, '#6f5438', 4.2, deckY + 0.35, -0.8);
  }
  const m = b.mesh(MAT.vcDouble);
  g.add(m);
  // 帆（風で膨らむ）
  const sailGeo = new THREE.PlaneGeometry(5.4, 6.2, 8, 8);
  const sail = new THREE.Mesh(sailGeo, new THREE.MeshLambertMaterial({ map: sailTexture(), side: THREE.DoubleSide }));
  sail.rotation.y = Math.PI / 2;
  sail.position.set(mastX + 0.25, deckY + 5.4, 0);
  g.add(sail);
  const base = sailGeo.attributes.position.array.slice();
  let wind = 1, windT = 1;
  g.userData.setWind = (w) => { windT = w; };
  g.userData.update = (t, dt) => {
    wind += (windT - wind) * Math.min(1, dt * 1.2);
    const p = sailGeo.attributes.position.array;
    for (let i = 0; i < p.length; i += 3) {
      const x = base[i], y = base[i + 1];
      const u = x / 5.4 + 0.5, v = y / 6.2 + 0.5;
      const belly = Math.sin(Math.PI * u) * Math.sin(Math.PI * (0.15 + v * 0.85));
      const flap = Math.sin(t * 3 + u * 6 + v * 3) * 0.08 * (1 - wind) * (1 - v);
      p[i + 2] = belly * 0.9 * wind + flap;
      p[i + 1] = y - (1 - wind) * 0.15 * (1 - v);
    }
    sailGeo.attributes.position.needsUpdate = true;
    sailGeo.computeVertexNormals();
  };
  g.userData.deckY = deckY;
  g.userData.hatch = new THREE.Vector3(hx, deckY, 0);
  g.userData.hold = new THREE.Vector3(hx, -0.5, 0);
  g.userData.hull = m;
  g.userData.length = length;
  g.userData.beam = beam;
  // 船の下の水面を抜く形
  g.userData.waterline = hullWaterline(length, beam, 1.9, HO);
  return g;
}

// 輿（手輿）。すだれ越しに外が見える。正面 -Z。
export function makePalanquin() {
  const g = new THREE.Group();
  const b = new Builder();
  const W = 1.1, L = 1.4, H = 1.35, Y0 = 0.75;
  b.box(W, 0.08, L, '#3f2d20', 0, Y0, 0);
  for (const x of [-W / 2, W / 2]) for (const z of [-L / 2, L / 2]) b.box(0.07, H, 0.07, C.black, x, Y0 + H / 2, z);
  // 背面は板、前と横はすだれ
  b.box(W, H, 0.04, '#2d211a', 0, Y0 + H / 2, L / 2);
  sudareBlind(b, W - 0.06, H * 0.62, 0, Y0 + H * 0.58, -L / 2, 0, C.sudare, 0.08, 0.01);
  sudareBlind(b, L - 0.06, H * 0.62, W / 2, Y0 + H * 0.58, 0, Math.PI / 2, C.sudare, 0.08, 0.01);
  sudareBlind(b, L - 0.06, H * 0.62, -W / 2, Y0 + H * 0.58, 0, Math.PI / 2, C.sudare, 0.08, 0.01);
  b.box(W, 0.3, 0.03, '#2d211a', 0, Y0 + 0.15, -L / 2);
  b.box(0.03, 0.3, L, '#2d211a', W / 2, Y0 + 0.15, 0);
  b.box(0.03, 0.3, L, '#2d211a', -W / 2, Y0 + 0.15, 0);
  b.gable(L + 0.4, W + 0.5, 0.35, '#2a2019', 0, Y0 + H, 0, Math.PI / 2);
  // 轅（ながえ）
  b.kind('wood');
  b.box(0.08, 0.08, 4.2, '#4a3627', W / 2 + 0.06, Y0 + 0.15, 0);
  b.box(0.08, 0.08, 4.2, '#4a3627', -W / 2 - 0.06, Y0 + 0.15, 0);
  g.add(b.mesh(MAT.vcDouble));
  g.userData.seat = new THREE.Vector3(0, Y0 + 0.05, 0.1);
  return g;
}

// ---- 持ち物 ----
export function makeShaku() {
  const b = new Builder();
  b.box(0.065, 0.34, 0.012, '#efe2bd', 0, 0.12, 0);
  b.box(0.06, 0.02, 0.013, '#c9b58a', 0, 0.28, 0);
  const m = b.mesh(MAT.figure);
  const g = new THREE.Group();
  g.add(m);
  return g;
}

export function makeKakebotoke() {
  const b = new Builder();
  b.cyl(0.11, 0.11, 0.015, 16, '#b08a45', 0, 0, 0, Math.PI / 2, 0, 0);
  b.cyl(0.09, 0.09, 0.018, 16, '#c9a45a', 0, 0, 0.002, Math.PI / 2, 0, 0);
  b.sphere(0.03, '#8e3b2e', 0, 0.02, 0.012, 1, 1.2, 0.5);
  b.sphere(0.02, '#8e3b2e', 0, 0.065, 0.012, 1, 1, 0.5);
  b.geo(new THREE.TorusGeometry(0.018, 0.004, 4, 8), '#8a6a35', -0.05, 0.115, 0);
  b.geo(new THREE.TorusGeometry(0.018, 0.004, 4, 8), '#8a6a35', 0.05, 0.115, 0);
  const g = new THREE.Group();
  g.add(b.mesh(MAT.figure));
  return g;
}

export function makeShari() {
  const b = new Builder();
  b.box(0.07, 0.02, 0.07, '#b08a45', 0, 0, 0);
  b.cyl(0.02, 0.028, 0.03, 8, '#c9a45a', 0, 0.025, 0);
  b.cone(0.05, 0.03, 8, '#b08a45', 0, 0.09, 0);
  b.cyl(0.005, 0.005, 0.05, 4, '#c9a45a', 0, 0.13, 0);
  const g = new THREE.Group();
  g.add(b.mesh(MAT.figure));
  const crystal = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff1d0 }));
  crystal.position.y = 0.055;
  g.add(crystal);
  const glow = makeGlow(0xffe0a0, 0.25, 0.8);
  glow.position.y = 0.055;
  g.add(glow);
  return g;
}

export function makeBale() {
  const b = new Builder();
  b.kind('thatch');
  b.cyl(0.3, 0.3, 0.85, 8, C.straw, 0, 0, 0, 0, 0, Math.PI / 2);
  b.cyl(0.31, 0.31, 0.05, 8, '#8f7a4a', 0.25, 0, 0, 0, 0, Math.PI / 2);
  b.cyl(0.31, 0.31, 0.05, 8, '#8f7a4a', -0.25, 0, 0, 0, 0, Math.PI / 2);
  return b.mesh(MAT.figure);
}

export function makeRock(size = 1, seed = 1, color = C.stone) {
  // 角を位置ごとにまとめて動かす（面が裂けない）
  const geo = displaceShared(new THREE.DodecahedronGeometry(size, 0), seed,
    (x, y, z, rnd) => [x * (0.8 + rnd() * 0.4), y * (0.6 + rnd() * 0.3), z * (0.8 + rnd() * 0.4)]);
  const b = new Builder();
  b.geo(geo, color);
  return b.mesh();
}

// 掛け軸（毘沙門天の絵像を簡略に描く）
export function makeScroll() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#6b4a2e'; g.fillRect(0, 0, 256, 512);
  g.fillStyle = '#8c6a3a'; g.fillRect(14, 30, 228, 452);
  g.fillStyle = '#e9dfc4'; g.fillRect(34, 70, 188, 372);
  // 光背
  g.strokeStyle = '#c9982f'; g.lineWidth = 5;
  g.beginPath(); g.arc(128, 170, 62, 0, Math.PI * 2); g.stroke();
  g.fillStyle = 'rgba(214,168,72,0.25)'; g.fill();
  // 身体
  g.fillStyle = '#7a2e22';
  g.beginPath(); g.moveTo(96, 400); g.lineTo(104, 230); g.lineTo(152, 230); g.lineTo(160, 400); g.closePath(); g.fill();
  g.fillStyle = '#2c3b4f';
  g.fillRect(100, 240, 56, 60);
  g.fillStyle = '#c9982f';
  for (let y = 246; y < 300; y += 9) g.fillRect(102, y, 52, 2);
  // 頭と兜
  g.fillStyle = '#d9b891'; g.beginPath(); g.arc(128, 196, 22, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#c9982f'; g.beginPath(); g.moveTo(104, 186); g.lineTo(128, 150); g.lineTo(152, 186); g.closePath(); g.fill();
  // 宝塔と戟
  g.fillStyle = '#c9982f'; g.fillRect(170, 222, 22, 26); g.beginPath(); g.moveTo(166, 222); g.lineTo(181, 204); g.lineTo(196, 222); g.fill();
  g.strokeStyle = '#3b2a1a'; g.lineWidth = 4; g.beginPath(); g.moveTo(80, 120); g.lineTo(80, 420); g.stroke();
  g.fillStyle = '#9aa0a8'; g.beginPath(); g.moveTo(80, 100); g.lineTo(72, 126); g.lineTo(88, 126); g.fill();
  // 足元の邪鬼
  g.fillStyle = '#4a3a2c'; g.beginPath(); g.ellipse(128, 418, 44, 12, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#3a2a1a'; g.fillRect(118, 0, 20, 34); g.fillRect(0, 480, 256, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1.2), new THREE.MeshBasicMaterial({ map: tex, color: 0xd8d0c0 }));
  return m;
}

// カモメ（白い体と、羽ばたく翼）
export function makeGull() {
  const g = new THREE.Group();
  const b = new Builder();
  b.sphere(0.13, '#f1f0ea', 0, 0, 0, 1, 0.8, 2.2, 8, 6);
  b.cone(0.05, 0.12, 5, '#d9a441', 0, 0, 0.32, Math.PI / 2, 0, 0);
  b.box(0.2, 0.02, 0.14, '#e8e6df', 0, 0, -0.3);
  const body = b.mesh(MAT.figure);
  g.add(body);
  const wings = [1, -1].map((s) => {
    const wb = new Builder();
    wb.box(0.55, 0.015, 0.18, '#f4f3ee', s * 0.28, 0, 0);
    wb.box(0.28, 0.016, 0.12, '#5a5d63', s * 0.62, 0, -0.02);
    const w = wb.mesh(MAT.figure);
    g.add(w);
    return w;
  });
  g.userData.wings = wings;
  g.scale.setScalar(1.3);
  return g;
}
