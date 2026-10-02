// 海の舞台（序章の配流の船、第五章の商人船、終章の伯耆の浜）
import * as THREE from 'three';
import { Stage } from './stage.js';
import { makeShip, makeSmallBoat, makeBale, makeBanner, makeFlame, C } from '../core/props.js';
import { scatterTrees, scatterGrass } from '../core/terrain.js';

// 序章：隠岐へ向かう護送の船
export function buildExileSea(game) {
  const st = new Stage(game);
  game.env.set('dawnMist');
  game.env.setWaves(0.32);

  // 遠くの島影（隠岐・島前の島々）
  st.backdrop({
    size: 5000, seg: 80, cz: -1400, seed: 21, base: -30,
    islands: [
      { x: -500, z: -1500, rx: 520, rz: 260, h: 190, rough: 30 },
      { x: 250, z: -1650, rx: 420, rz: 240, h: 150, rough: 25, off: 3 },
      { x: 700, z: -1300, rx: 260, rz: 180, h: 110, rough: 20, off: 7 },
      { x: -1100, z: -1250, rx: 200, rz: 140, h: 90, rough: 20, off: 9 },
    ],
    palette: { grass: '#4f6048', grass2: '#44573f', forest: '#3a4c36' },
  });

  const ship = st.add(makeShip({ length: 14, beam: 4, cabin: true, hatch: false, cargo: false }), 0, 0, 0, Math.PI / 2);
  const deck = ship.userData.deckY;

  const tadaaki = st.fig({ robe: '#3d4e66', robe2: '#e5dccb', hat: 'eboshi' }, 3.2, deck, 1.1, 0, ship);
  tadaaki.rotation.y = -Math.PI / 2 + 0.6;
  const tsubone = st.fig({ robe: '#8a3548', robe2: '#e9c9a8', layers: ['#d8a640', '#4f7d4f', '#efe3c8'], hat: 'long', seated: true, h: 1.55 }, -3.1, deck, -0.9, 0, ship);
  tsubone.rotation.y = -Math.PI / 2 - 0.3;
  st.fig({ robe: '#6c5a8a', robe2: '#e5dccb', hat: 'eboshi' }, -3.4, deck, 0.35, -Math.PI / 2, ship); // 行房（屋形の中、局のそばに控える）
  // 警固の武士
  const guards = [
    // 屋形の前に立つ（槍が屋根に刺さらないよう外に）
    st.fig({ robe: '#3b3a36', armor: true, hat: 'helmet', prop: 'spear' }, -1.9, deck, 1.1, -Math.PI / 2, ship),
    st.fig({ robe: '#3b3a36', armor: true, hat: 'helmet', prop: 'spear' }, -1.9, deck, -1.1, -Math.PI / 2, ship),
    // 船首寄りは船幅が狭いので、中ほどに立たせる（船べりにめり込まない）
    st.fig({ robe: '#3b3a36', armor: true, hat: 'helmet', prop: 'spear' }, 5.0, deck, -0.75, 0, ship),
  ];
  guards[2].rotation.y = Math.PI * 0.85;
  // 船頭
  st.fig({ robe: '#5b5344', hat: 'kasa' }, -6.4, deck, 0, -Math.PI / 2, ship);

  st.gulls(0, -40, 4, 40, 18);

  // 護送の小舟
  const escorts = [];
  for (const [x, z] of [[-26, 18], [24, 30]]) {
    const b = st.add(makeSmallBoat({ length: 6, beam: 1.6 }), x, 0.05, z, Math.PI / 2);
    st.fig({ robe: '#5b5344', hat: 'kasa' }, -2.3, b.userData.floorY, 0, -Math.PI / 2, b);
    for (let i = 0; i < 3; i++) st.fig({ robe: '#3b3a36', armor: true, hat: 'helmet', prop: i === 1 ? 'spear' : null, seated: true }, 1.4 - i * 1.1, b.userData.floorY, 0, -Math.PI / 2, b);
    escorts.push(b);
  }

  // 前進（船ごと進む）
  const speed = 1.3;
  game.addUpdater((dt) => {
    const t = game.time;
    ship.position.z -= speed * dt;
    ship.userData.hull.rotation.x = Math.sin(t * 0.7) * 0.012;
    ship.userData.hull.rotation.z = Math.sin(t * 0.5) * 0.008;
    escorts.forEach((b, i) => {
      b.position.z -= speed * dt;
      b.position.y = 0.05 + Math.sin(t * 0.9 + i) * 0.08;
      b.rotation.z = Math.sin(t * 0.8 + i) * 0.03;
      const oar = b.userData.oar;
      oar.rotation.y = Math.sin(t * 1.4 + i) * 0.35;
    });
  });

  return {
    st, ship, tadaaki, tsubone, guards,
    islandsPoint: () => new THREE.Vector3(ship.position.x - 100, 40, ship.position.z - 1400),
    playerPos: new THREE.Vector3(4.2, deck, 0.2),
  };
}

// 第五章：商人船で追手を振り切る
export function buildEscapeSea(game) {
  const st = new Stage(game);
  game.env.set('predawn');
  game.env.setWaves(0.3);

  // 後方（北西）に遠ざかる西ノ島の影
  st.backdrop({
    size: 5000, seg: 80, cx: -900, cz: -900, seed: 33, base: -30,
    islands: [
      { x: -1100, z: -1100, rx: 700, rz: 420, h: 220, rough: 30 },
      { x: -300, z: -1500, rx: 420, rz: 300, h: 160, rough: 25, off: 3 },
      { x: -1600, z: -300, rx: 380, rz: 260, h: 120, rough: 25, off: 6 },
    ],
    palette: { grass: '#3d4a44', grass2: '#34403b', forest: '#2e3a34' },
  });

  const heading = -Math.PI / 4; // 南東へ
  const ship = st.add(makeShip({ length: 14, beam: 4, cabin: false, hatch: true, cargo: true }), 0, 0, 0, heading);
  const deck = ship.userData.deckY;
  const sendo = st.fig({ robe: '#5b5344', hat: 'topknot', belt: '#2d2a26' }, -4.5, deck, 0.8, 0, ship);
  sendo.rotation.y = -Math.PI / 2;
  const tadaaki = st.fig({ robe: '#3d4e66', robe2: '#e5dccb', hat: 'eboshi' }, 3.4, deck, -1.1, Math.PI * 0.8, ship);
  const crew = [
    st.fig({ robe: '#6a5a44', hat: 'topknot' }, 5.0, deck, 0.75, Math.PI / 2, ship),
    st.fig({ robe: '#5d5a52', hat: 'topknot' }, -2.6, deck, -1.2, -Math.PI / 2, ship),
  ];
  const lantern = makeFlame({ size: 0.35, glow: 1.5 });
  st.add(lantern, -5.2, deck + 1.6, 0, 0, ship);

  // 船倉を覆う俵（隠れる場面で積まれる）
  const bales = [];
  const hx = ship.userData.hatch.x;
  // 船倉の口（x: hx±0.6, z: ±0.6）を覆うように二段に積む
  const slots = [[-0.38, -0.3, 0], [0.4, -0.3, 0], [-0.38, 0.32, 0], [0.4, 0.32, 0], [0, 0, 1], [0.1, 0.5, 1]];
  for (const [dx, dz, layer] of slots) {
    const b = makeBale();
    b.position.set(hx + dx, deck + 0.3 + layer * 0.5, dz);
    b.rotation.y = layer ? 0.5 + dz : (dz > 0 ? 0.05 : -0.05);
    b.visible = false;
    ship.add(b);
    bales.push(b);
  }

  // 追手の舟
  const pursuers = [];
  for (let i = 0; i < 3; i++) {
    const b = makeSmallBoat({ length: 6, beam: 1.6 });
    st.add(b, 0, 0.05, 0, 0);
    st.fig({ robe: '#5b5344', hat: 'kasa' }, -2.3, b.userData.floorY, 0, -Math.PI / 2, b);
    const g1 = st.fig({ robe: '#3b3a36', armor: true, hat: 'helmet', prop: 'torch' }, 1.2, b.userData.floorY, 0.2, -Math.PI / 2, b);
    st.fig({ robe: '#3b3a36', armor: true, hat: 'helmet', prop: 'spear' }, 0.1, b.userData.floorY, -0.2, -Math.PI / 2, b);
    b.visible = false;
    pursuers.push({ boat: b, torch: g1 });
  }

  return { st, ship, sendo, tadaaki, crew, bales, pursuers, heading, deck, playerPos: new THREE.Vector3(3.9, deck, 0) };
}

// 終章：伯耆の浜と船上山
export function buildHoki(game) {
  const st = new Stage(game);
  game.env.set('morning');
  game.env.setWaves(0.22);
  const t = st.makeTerrain({
    size: 900, seg: 120, cz: 380, seed: 44, base: -12,
    islands: [
      { x: 0, z: 580, rx: 900, rz: 520, h: 40, rough: 12, pow: 0.9, wobble: 0.12 },
    ],
  });
  st.backdrop({
    size: 6000, seg: 80, cz: 1600, seed: 45, base: -20, mask: (x, z) => (z > 600 ? 1 : 0),
    islands: [
      { x: 0, z: 2100, rx: 2600, rz: 1200, h: 90, rough: 30 },
      // 船上山（頂が平らな山）
      { x: 450, z: 1700, rx: 380, rz: 220, h: 330, pow: 0.35, rough: 12, wobble: 0.1 },
      { x: -900, z: 1900, rx: 500, rz: 400, h: 260, rough: 40, off: 5 },
    ],
  });

  const ship = st.add(makeShip({ length: 14, beam: 4, cabin: false, hatch: true, cargo: true }), 0, 0, -60, -Math.PI / 2);
  const deck = ship.userData.deckY;
  st.fig({ robe: '#5b5344', hat: 'topknot', belt: '#2d2a26' }, -4.5, deck, 0.8, -Math.PI / 2, ship);
  const tadaaki = st.fig({ robe: '#3d4e66', robe2: '#e5dccb', hat: 'eboshi' }, 3.0, deck, -1.1, -Math.PI / 2, ship);

  // 浜で迎える人々
  let beachZ = 150;
  while (t.heightAt(0, beachZ) < 1.2 && beachZ < 400) beachZ += 2;
  const greeters = [];
  for (let i = 0; i < 9; i++) {
    const x = -14 + i * 3.5 + (i % 2) * 0.8;
    const z = beachZ + 2 + (i % 3) * 2;
    const f = st.figOnGround({ robe: i === 4 ? '#6b2a22' : '#3b3a36', armor: true, hat: 'helmet', prop: i % 3 === 0 ? 'spear' : null }, x, z, Math.PI);
    greeters.push(f);
  }
  for (const x of [-18, -6, 6, 18]) st.put(makeBanner('hokake'), x, beachZ + 9, 0);
  // 白い浜と松林
  st.root.add(scatterTrees(t, {
    count: 650, seed: 46, minH: 2.5, maxH: 200, pineRatio: 0.85, avoidPaths: 0,
    area: { x: 0, z: beachZ + 170, w: 800, d: 300 },
    exclude: [{ x: 0, z: beachZ + 6, r: 26 }],
  }));
  st.root.add(scatterGrass(t, { count: 1500, seed: 47, areas: [{ x: 0, z: beachZ + 25, r: 60 }], exclude: [{ x: 0, z: beachZ + 5, r: 16 }] }));
  st.gulls(0, beachZ - 60, 8, 70, 22);

  return { st, ship, tadaaki, greeters, deck, beachZ, terrain: t, playerPos: new THREE.Vector3(4.2, deck, 0.2), sensyo: new THREE.Vector3(450, 300, 1700) };
}

export { C };
