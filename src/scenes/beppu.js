// 第二章・第三章前半：西ノ島 別府（国土地理院の標高データから作った実地形）
// 原点は黒木御所跡の碑（天皇山の頂、標高約39m）。x=東、z=南（m）。
// 御所の建物・柵は、丘の頂でいちばん平らな所（原点の少し南）に据えている。
// 実際の位置関係：別府港は御所の南西約560m、見付島は港のすぐ南（御所から南南西へ約660m）、
// 隠岐判官館跡は御所の西北西約220mの台地。湾は御所の南〜南東に開く。
// 三位の局屋敷跡・千福寺御座所跡は正確な位置が分からないため、御所の麓に置いている。
import * as THREE from 'three';
import { Stage } from './stage.js';
import {
  makeGosho, makeFence, makeGate, makeHouse, makeTower, makeBonfire, makeBanner, makeSmallBoat, makeRock,
  makeScroll, makePalanquin, makeFlame, C,
} from '../core/props.js';
import { scatterTrees, makeTree, makeShrubs, scatterGrass, scatterShoreRocks } from '../core/terrain.js';
import { Builder, MAT } from '../core/builder.js';
import { distToPath, yawTo } from '../core/util.js';
import { MAPS } from './mapdata.js';

// 標高の倍率。実際の天皇山（約 40m）は斜面が急すぎて歩きにくいので、海面を基準に 0.6 倍に縮める
// （高さをそろって縮めるので、御所から湾・見付島への見通しは変わらない）
export const V_SCALE = 0.6;

export const B = {
  gosho: { x: -2, z: 9, h: 40 * V_SCALE },
  tsubone: { x: -75, z: 2 },
  senpuku: { x: -55, z: -47 },
  hangan: { x: -216, z: -57 },
  port: { x: -339, z: 452 },
  mitsuke: { x: -282, z: 599 },
};

// 御所の区画（建物の向きを 180° 回しているので、区画内の座標 lx,lz は世界座標で逆向き）
const G = B.gosho;
export const toWorld = (lx, lz) => [G.x - lx, G.z - lz];
const FENCE_BACK = 8.5; // 門のある北側の柵（区画内の z）

// 輿が止まる所から、判官館の南の浜沿いを西へ抜ける（第三章）
export const PAL_ROUTE = [toWorld(0, 6), toWorld(0, FENCE_BACK + 1), [-2, -6], [-5, -15], [-10, -27], [-18, -38]];
export const HOPS = [[-30, -45], [-52, -35], [-72, -15], [-95, 1], [-120, 12], [-145, 20], [-170, 28], [-198, 36], [-228, 44]];
export const PATROL = { a: [-138, -30], b: [-170, 36] };

// 御所の門から、千福寺・三位の局の屋敷・判官館・浜へ続く道
// grade: 一定の傾きでならした坂道（急な斜面を切り通して歩きやすくする）
const PATHS = [
  { pts: [toWorld(0, FENCE_BACK + 0.5), [-2, -6], [-5, -15], [-10, -27], [-20, -41], [-38, -47], [-50, -47]], w: 2.6, grade: true },
  { pts: [[-20, -44], [-45, -30], [-62, -12], [-70, -2]], w: 2.2, grade: true },
  // 門から西へ下り、三位の局の屋敷の前へ
  { pts: [toWorld(0, FENCE_BACK + 0.5), [-8, -3], [-20, -6], [-36, -5], [-52, -1], [-64, 1.5], [-70, 2]], w: 2.4, grade: true },
  { pts: [[-50, -47], [-72, -15], [-95, 1], [-120, 12], [-145, 20], [-170, 28], [-198, 36], [-240, 46]], w: 2 },
  { pts: [[-120, 12], [-150, -10], [-190, -40], [-205, -52]], w: 2 },
];

export function buildBeppu(game, { night = false } = {}) {
  const st = new Stage(game);
  game.env.set(night ? 'night' : 'afternoon');
  game.env.setWaves(0.12);

  const gy = B.gosho.h;
  st.mapVScale = V_SCALE;
  const t = st.makeTerrain({
    map: MAPS.beppu, seed: 31, base: -6, vScale: V_SCALE,
    pads: [
      { x: G.x, z: G.z - 0.5, r: 10, h: gy, blend: 5 },
      { x: B.tsubone.x, z: B.tsubone.z, r: 6, dh: 0.3, blend: 5 },
      { x: B.senpuku.x, z: B.senpuku.z, r: 6, dh: 0.2, blend: 5 },
      { x: B.hangan.x, z: B.hangan.z, r: 16, blend: 8 },
    ],
    paths: PATHS,
  });
  // 島前の島々（遠景も標高データから）
  const nb = MAPS.beppu;
  st.mapBackdrop(MAPS.beppuFar, { x0: nb.x0 + 80, z0: nb.z0 + 80, x1: nb.x0 + nb.size - 80, z1: nb.z0 + nb.size - 80 });

  const hopEx = HOPS.map(([x, z]) => ({ x, z, r: 3 }));
  st.root.add(scatterTrees(t, {
    count: 950, seed: 9, minH: 2, maxH: 400, pineRatio: 0.5, maxSlope: 1.4,
    area: { x: -120, z: 60, w: 1100, d: 1100 },
    exclude: [
      { x: G.x, z: G.z, r: 17 }, { x: B.tsubone.x, z: B.tsubone.z, r: 10 }, { x: B.senpuku.x, z: B.senpuku.z, r: 10 },
      { x: B.hangan.x, z: B.hangan.z, r: 24 }, { x: B.port.x, z: B.port.z, r: 60 },
      // 縁側からの眺め（南）を遮らない
      { x: G.x, z: G.z + 22, r: 14 }, { x: G.x - 16, z: G.z + 32, r: 12 }, { x: G.x + 16, z: G.z + 30, r: 12 }, { x: G.x - 30, z: G.z + 20, r: 10 },
      ...hopEx,
    ],
    density: (x, z, h) => (h < 4 ? 0.15 : 0.35 + 0.35 * Math.sin(x * 0.02) * Math.cos(z * 0.017)),
  }));

  // 草むらと磯の岩
  st.root.add(scatterGrass(t, {
    count: 2600, seed: 4,
    areas: [
      { x: G.x, z: G.z, r: 45 }, { x: B.tsubone.x, z: B.tsubone.z, r: 22 }, { x: B.senpuku.x, z: B.senpuku.z, r: 22 },
      { x: -60, z: -30, r: 35 }, { x: -140, z: 10, r: 60 }, { x: B.hangan.x, z: B.hangan.z, r: 35 },
    ],
    exclude: [{ x: G.x, z: G.z - 0.8, r: 11.5 }, { x: B.tsubone.x, z: B.tsubone.z, r: 5 }, { x: B.senpuku.x, z: B.senpuku.z, r: 5 }, { x: B.hangan.x, z: B.hangan.z, r: 16 }],
  }));
  st.root.add(scatterShoreRocks(t, { count: 280, seed: 12, area: { x: -120, z: 170, w: 950, d: 950 } }));

  // ---- 黒木御所（正面の縁側は南の湾に向く）----
  const compound = new THREE.Group();
  st.add(compound, G.x, gy, G.z, Math.PI);
  // 区画の下の土台（石垣）。地面が下がる所では石垣として見え、柵や門が浮かない
  const base = new Builder();
  base.kind('stone');
  base.box(18.6, 6, FENCE_BACK + 7.2, '#6c6558', 0, -3.06, (FENCE_BACK - 6.9) / 2);
  // 区画の中の地面（砂利）
  base.kind('plaster');
  base.box(18.9, 0.25, FENCE_BACK + 7.5, '#a99b80', 0, -0.095, (FENCE_BACK - 6.9) / 2);
  base.kind('stone');
  // 門の外の石段（土台から坂道へ下りる）
  for (let i = 0; i < 5; i++) {
    const top = -(i + 1) * 0.42, zc = FENCE_BACK + 0.95 + i * 0.85;
    base.box(3.4, 3, 0.9, '#77705f', 0, top - 1.5, zc);
  }
  st.add(base.mesh(), 0, 0, 0, 0, compound);
  for (let i = 0; i < 5; i++) {
    const [sx, sz] = toWorld(0, FENCE_BACK + 0.95 + i * 0.85);
    st.addPlatform(sx, sz, 1.7, 0.45, gy - (i + 1) * 0.42);
  }
  const gosho = st.add(makeGosho(), 0, 0, 0, 0, compound);
  st.add(makeFence([[-9, -6.5], [-9, FENCE_BACK], [-1.6, FENCE_BACK], [1.6, FENCE_BACK], [9, FENCE_BACK], [9, -6.5]], { gapIndex: 2 }), 0, 0, 0, 0, compound);
  st.add(makeGate(3), 0, 0, FENCE_BACK, 0, compound);
  // 区画の中は土台の高さで歩ける
  st.addPlatform(G.x, G.z + (6.9 - FENCE_BACK) / 2, 9.2, (FENCE_BACK + 6.9) / 2, gy);
  st.addPlatform(G.x, G.z, 5, 3.5, gy + gosho.userData.floorY);
  st.addPlatform(G.x, G.z + 4.2, 5.3, 0.7, gy + gosho.userData.floorY);
  const verandaPos = new THREE.Vector3(G.x, gy + gosho.userData.floorY, G.z + 4.3);
  // 縁側からの眺めを縁取る松と、丘の上の低い茂み・石
  for (const [x, z, s, r] of [[-11, 13, 1.3, 0.4], [-14, 6, 1.1, 2.2], [14, 0, 1.2, 1.2]]) st.put(makeTree('pine', s), G.x + x, G.z + z, r, -0.3);
  const shrubs = [];
  for (let k = 0; k < 46; k++) {
    const a = k * 2.399, r = 12.5 + (k * 7.3) % 15;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (z > -16 && z < -6 && Math.abs(x) < 4) continue; // 門の前の道
    shrubs.push([G.x + x, G.z + z, 0.8 + (k % 3) * 0.25]);
  }
  st.root.add(makeShrubs(t, shrubs, 12));
  for (const [x, z, s] of [[7, 13, 0.7], [-7, 14, 0.55], [3, 17, 0.5], [-14, -2, 0.6], [15, -6, 0.7]]) st.put(makeRock(s, 60 + x, '#7d776d'), G.x + x, G.z + z, x, 0.05);

  // ---- 三位の局屋敷（御所の西の麓）----
  const tsY = t.heightAt(B.tsubone.x, B.tsubone.z);
  const tsYaw = yawTo(B.tsubone.x, B.tsubone.z, G.x, G.z);
  const tsHouse = st.add(makeHouse({ w: 6, d: 4.5, roof: 'gable', roofColor: C.bark, floor: 0.6, logs: true, post: C.kuroki }), B.tsubone.x, tsY, B.tsubone.z, tsYaw);
  const up = new THREE.Vector3(0, 1, 0);
  const tsFront = new THREE.Vector3(0, 0.6, -2.7).applyAxisAngle(up, tsYaw).add(tsHouse.position);
  st.addPlatform(tsHouse.position.x, tsHouse.position.z, 3.2, 3.2, tsY + 0.6, tsYaw);
  const tsubone = st.fig({ robe: '#8a3548', robe2: '#e9c9a8', layers: ['#d8a640', '#4f7d4f', '#efe3c8'], hat: 'long', seated: true, h: 1.55 }, tsFront.x, tsFront.y, tsFront.z);
  tsubone.rotation.y = tsYaw;
  const maid = st.fig({ robe: '#6b6a4a', robe2: '#e0d6c0', layers: ['#b98a8a', '#efe3c8'], hat: 'long', seated: true, h: 1.45 }, 0, 0, 0);
  maid.position.copy(new THREE.Vector3(1.6, 0.6, -1.6).applyAxisAngle(up, tsYaw).add(tsHouse.position));
  maid.rotation.y = tsYaw - 0.6;

  // ---- 千福寺（御所の北の麓）----
  const sfY = t.heightAt(B.senpuku.x, B.senpuku.z);
  const sfYaw = yawTo(B.senpuku.x, B.senpuku.z, G.x, G.z);
  const senpuku = st.add(makeHouse({ w: 5, d: 5, roof: 'pyramid', roofColor: '#4d3d31', floor: 0.7, sudare: false, open: true, wall: '#7a5c3e' }), B.senpuku.x, sfY, B.senpuku.z, sfYaw);
  st.addPlatform(senpuku.position.x, senpuku.position.z, 2.7, 3.2, sfY + 0.7, sfYaw);
  const scroll = makeScroll();
  senpuku.add(scroll);
  scroll.position.set(0, 0.7 + 1.35, 2.4);
  scroll.rotation.y = Math.PI;
  const altar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.6, 0.6), new THREE.MeshLambertMaterial({ color: '#3d2a1c' }));
  altar.position.set(0, 0.7 + 0.3, 1.9);
  senpuku.add(altar);
  st.add(makeFlame({ size: 0.25, glow: 0.9 }), 0.5, 0.7 + 0.72, 1.9, 0, senpuku);
  const priest = st.fig({ robe: '#2f2d2a', robe2: '#d8d0c0', hat: 'bald', kesa: '#8a6a3a', seated: true }, 0, 0, 0);
  priest.position.copy(new THREE.Vector3(-1.4, 0.7, 0.6).applyAxisAngle(up, sfYaw).add(senpuku.position));
  priest.rotation.y = sfYaw + Math.PI * 0.5;

  // ---- 隠岐判官館（西北西の台地から湾を見下ろす）----
  const hgY = t.heightAt(B.hangan.x, B.hangan.z);
  const hangan = new THREE.Group();
  st.add(hangan, B.hangan.x, hgY, B.hangan.z, yawTo(B.hangan.x, B.hangan.z, -120, 200));
  const hgBase = new Builder();
  hgBase.kind('stone');
  hgBase.box(28.6, 5, 20.6, '#6c6558', 0, -2.56, 2);
  st.add(hgBase.mesh(), 0, 0, 0, 0, hangan);
  st.add(makeHouse({ w: 12, d: 7, roof: 'gable', roofColor: C.bark, floor: 0.6 }), 0, 0, 2, 0, hangan);
  st.add(makeHouse({ w: 6, d: 4, roof: 'gable', roofColor: C.bark, floor: 0.4, sudare: false }), -8, 0, 6, 0.3, hangan);
  const tower = st.add(makeTower(7), 8, 0, -3, 0, hangan);
  st.add(makeFence([[-14, -8], [-14, 12], [14, 12], [14, -8], [2, -8]]), 0, 0, 0, 0, hangan);
  const banners = [];
  for (const x of [-4, 0, 4]) banners.push(st.add(makeBanner('yotsume'), x, 0, -9, 0, hangan));
  const hgGuards = [
    st.fig({ robe: '#3b3a36', armor: true, hat: 'helmet', prop: 'spear' }, -1.5, 0, -8.5, 0, hangan),
    st.fig({ robe: '#3b3a36', armor: true, hat: 'helmet', prop: 'spear' }, 1.5, 0, -8.5, 0, hangan),
    st.fig({ robe: '#3b3a36', armor: true, hat: 'helmet' }, 8, 7.1, -3, 0, hangan),
  ];
  const hanganLook = new THREE.Vector3(B.hangan.x, hgY + 6, B.hangan.z);

  // ---- 見付島（港のすぐ南の小島。御所を見張る）----
  const mx = B.mitsuke.x, mz = B.mitsuke.z;
  const mY = t.heightAt(mx + 10, mz - 8);
  const mitsukeHut = st.add(makeHouse({ w: 2.6, d: 2.2, h: 1.8, roof: 'gable', roofColor: C.thatch, floor: 0, sudare: false, roofH: 1.0 }), mx + 10, mY - 0.2, mz - 8, yawTo(mx, mz, 0, 0));
  const watcher = st.fig({ robe: '#3b3a36', armor: true, hat: 'helmet', prop: 'spear' }, mx + 16, t.heightAt(mx + 16, mz - 14), mz - 14);
  st.face(watcher, 0, 0);
  const mitsukeLook = new THREE.Vector3(mx, t.heightAt(mx, mz) + 4, mz);

  // ---- 湾の釣舟 ----
  const fishing = [];
  // 縁側から実際に見える沖に置く（手前の海は丘の丸みに隠れて見えない）
  for (const [x, z, r, s] of [[165, 168, 12, 1], [140, 250, 18, -1], [260, 330, 25, 1], [-150, 520, 20, -1]]) {
    const b = st.add(makeSmallBoat({ length: 5.5, beam: 1.4 }), x, 0.05, z, 0);
    st.fig({ robe: '#5b5344', hat: 'kasa', seated: true }, -1.4, b.userData.floorY, 0, -Math.PI / 2, b);
    // 遠くからも見えるよう小さな筵帆を張る
    const sb = new Builder();
    sb.cyl(0.05, 0.06, 3.4, 5, '#5e452e', 0.6, 1.7, 0);
    sb.box(0.04, 2.2, 1.9, '#cdb98f', 0.72, 2.2, 0);
    st.add(sb.mesh(MAT.vcDouble), 0, 0, 0, 0, b);
    fishing.push({ b, x, z, r, s, a: Math.random() * 6 });
  }
  if (!night) {
    st.gulls(60, 200, 7, 90, 30);
    game.addUpdater((dt) => {
      const tm = game.time;
      for (const fb of fishing) {
        fb.a += dt * 0.03 * fb.s * (10 / fb.r);
        fb.b.position.x = fb.x + Math.cos(fb.a) * fb.r;
        fb.b.position.z = fb.z + Math.sin(fb.a) * fb.r;
        fb.b.rotation.y = -fb.a + (fb.s > 0 ? -Math.PI / 2 : Math.PI / 2);
        fb.b.position.y = 0.05 + Math.sin(tm + fb.x) * 0.04;
      }
    });
  } else {
    fishing.forEach((f) => { f.b.visible = false; });
  }

  // 身を隠す岩（第三章）
  const hopRocks = HOPS.map(([x, z], i) => st.put(makeRock(0.9 + (i % 2) * 0.3, 100 + i, '#6f6a60'), x - 1.2, z + 1.4, i * 1.7, 0.2));

  st.freeNav({
    region: (x, z) => night || Math.hypot(x + 35, z + 18) < 95,
    minH: 0.5,
  });

  // 御所の区画内の座標 → 世界座標（高さは土台の上）
  const goshoWorld = (lx, ly, lz) => { const [x, z] = toWorld(lx, lz); return new THREE.Vector3(x, gy + ly, z); };

  return {
    st, terrain: t, compound, gosho, verandaPos, goshoWorld, fenceBack: FENCE_BACK, tsubone, tsHouse, tsFront, maid, senpuku, scroll, priest, sfYaw,
    hangan, tower, banners, hgGuards, hanganLook, watcher, mitsukeLook, mitsukeHut, fishing, gy, hopRocks,
  };
}

// 夜の追加要素（第三章）
export function addBeppuNight(game, S) {
  const { st, terrain: t } = S;
  const mx = B.mitsuke.x, mz = B.mitsuke.z;
  st.add(makeBonfire(1.3), mx + 14, t.heightAt(mx + 14, mz - 11), mz - 11);
  st.add(makeBonfire(1.2), 0, 0, -9.5, 0, S.hangan);
  // 門（北側）の外の警固
  const gateGuards = [2.4, -2.4].map((lx, i) => {
    const [x, z] = toWorld(lx, FENCE_BACK + 2);
    const f = st.figOnGround({ robe: '#3b3a36', armor: true, hat: 'helmet', prop: i ? 'spear' : 'torch' }, x, z);
    f.rotation.y = 0; // 北（外）を向く
    return f;
  });
  const [bx, bz] = toWorld(-3.8, FENCE_BACK + 2.8);
  st.put(makeBonfire(0.8), bx, bz);
  // 巡回の武士（松明）と、見張りの光の扇
  const patrol = st.fig({ robe: '#3b3a36', armor: true, hat: 'helmet', prop: 'torch' }, 0, -50, 0);
  const fanGeo = new THREE.CircleGeometry(1, 20, Math.PI / 2 - 0.62, 1.24);
  fanGeo.rotateX(-Math.PI / 2);
  const fan = new THREE.Mesh(fanGeo, new THREE.MeshBasicMaterial({ color: 0xffa050, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  fan.renderOrder = 5;
  st.root.add(fan);
  return { gateGuards, patrol, fan };
}

export { makePalanquin };
