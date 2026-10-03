// 第三章後半：小向（美田湾の東岸）。国土地理院の標高データから作った実地形。
// 原点は小向の浜。x=東、z=南（m）。入り江（美田湾）は西に広がり、南へ下ると赤ノ江・赤崎のある湾へ出る。
import * as THREE from 'three';
import { Stage } from './stage.js';
import { makeHouse, makeRock, makeSmallBoat, makeLantern, C } from '../core/props.js';
import { scatterTrees, scatterGrass, scatterShoreRocks } from '../core/terrain.js';
import { yawTo } from '../core/util.js';
import { MAPS } from './mapdata.js';

export const K = {
  stone: { x: 22, z: -8 },
  kimura: { x: 48, z: -28 },
  landing: { x: -15, z: 12 },
  boatAt: { x: -27.5, z: 27.4 }, // 舟を着ける所（波打ち際のすぐ沖。浜に乗り上げない深さ）
  arrive: { x: 40, z: -22 },
};

function box(m, inset) {
  return { x0: m.x0 + inset, z0: m.z0 + inset, x1: m.x0 + m.size - inset, z1: m.z0 + m.size - inset };
}

export function buildKomukai(game) {
  const st = new Stage(game);
  game.env.set('night');
  game.env.setWaves(0.07);

  const t = st.makeTerrain({
    map: MAPS.komukai, seed: 61, base: -6,
    pads: [
      { x: K.stone.x, z: K.stone.z, r: 3, dh: 0, blend: 3 },
      { x: K.kimura.x, z: K.kimura.z, r: 5, dh: 0.2, blend: 4 },
    ],
    // 木村家の方から腰掛けの石を経て、舟を着ける波打ち際へ
    paths: [{ pts: [[90, -60], [60, -40], [K.stone.x + 4, K.stone.z - 2], [K.landing.x + 3, K.landing.z - 2], [K.boatAt.x + 5, K.boatAt.z - 4]], w: 2.4 }],
  });
  // 周りの山と入り江（中景・遠景）
  st.mapBackdrop(MAPS.crossing, box(MAPS.komukai, 20));
  st.mapBackdrop(MAPS.crossingFar, box(MAPS.crossing, 90));

  st.root.add(scatterTrees(t, {
    count: 600, seed: 21, minH: 3, maxH: 300, maxSlope: 1.3, pineRatio: 0.5,
    exclude: [{ x: K.stone.x, z: K.stone.z, r: 10 }, { x: K.kimura.x, z: K.kimura.z, r: 12 }, { x: 70, z: -5, r: 10 }, { x: 35, z: -60, r: 10 }],
  }));

  st.root.add(scatterGrass(t, {
    count: 1800, seed: 31, areas: [{ x: 40, z: -30, r: 45 }],
    exclude: [{ x: K.stone.x, z: K.stone.z, r: 2 }, { x: K.kimura.x, z: K.kimura.z, r: 4 }, { x: 70, z: -5, r: 4 }, { x: 35, z: -60, r: 4 }],
  }));
  st.root.add(scatterShoreRocks(t, { count: 160, seed: 33, area: { x: 0, z: 0, w: 560, d: 560 } }));

  // 浜の家々と木村家
  const kY = t.heightAt(K.kimura.x, K.kimura.z);
  const kimuraYaw = yawTo(K.kimura.x, K.kimura.z, -100, 100);
  const kimura = st.add(makeHouse({ w: 5, d: 4, h: 2.0, roof: 'gable', roofColor: C.thatch, floor: 0.3, sudare: false, veranda: false, roofH: 1.5 }), K.kimura.x, kY, K.kimura.z, kimuraYaw);
  for (const [x, z, s] of [[70, -5, 0.9], [35, -60, 1]]) {
    st.put(makeHouse({ w: 4.5 * s, d: 3.6 * s, h: 1.9, roof: 'gable', roofColor: C.thatch, floor: 0.3, sudare: false, veranda: false, roofH: 1.4 }), x, z, yawTo(x, z, -100, 100), -0.1);
  }
  // 家の戸口の灯り
  const lamp = makeLantern();
  st.add(lamp, K.kimura.x - 2.6, kY + 0.1, K.kimura.z + 1.8);

  // 御腰掛けの石
  const stoneY = t.heightAt(K.stone.x, K.stone.z);
  const stone = makeRock(0.75, 42, '#8b867d');
  stone.scale.set(1.2, 0.55, 1.0);
  st.add(stone, K.stone.x, stoneY + 0.15, K.stone.z, 0.4);
  st.addPlatform(K.stone.x, K.stone.z, 0.7, 0.6, stoneY + 0.45);

  // 網干し
  for (let i = 0; i < 3; i++) st.put(makeRock(0.4, 300 + i, '#6f6a60'), K.landing.x + 6 + i * 2.2, K.landing.z - 5 - i, i);

  // 迎えの小舟
  const boat = st.add(makeSmallBoat(), -75, 0.05, 88, Math.PI * 0.75);
  const rower = st.fig({ robe: '#4a4438', hat: 'kasa' }, -2.1, boat.userData.floorY, 0, -Math.PI / 2, boat);
  const boatLamp = makeLantern();
  st.add(boatLamp, 1.9, 0.2, 0.3, 0, boat);

  st.freeNav({ region: (x, z) => Math.hypot(x - 30, z + 20) < 60, minH: 0.4 });
  game.nav.mode = 'none';

  return { st, terrain: t, kimura, kimuraYaw, kY, stone, stoneY, boat, rower, boatLamp, lamp };
}
