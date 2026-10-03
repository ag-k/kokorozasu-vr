// 第四章：小向から入り江を渡り、赤ノ江を経て赤崎へ（国土地理院の標高データから作った実地形）
// 原点は小向の浜（komukai.js と同じ）。x=東、z=南（m）。
// 小向 → 美田湾を南西へ下る → 湾を西へ渡る → 西岸の赤ノ江 → 南の赤崎（水路でおよそ 4km。場面を区切って省略する）
import * as THREE from 'three';
import { Stage } from './stage.js';
import { makeSmallBoat, makeShip, makeLantern, makeFlame } from '../core/props.js';
import { scatterTrees, scatterShoreRocks } from '../core/terrain.js';
import { MAPS } from './mapdata.js';

// 舟の道筋（区間ごと）
// 舟の場面が長くなりすぎないよう、各区間は物語の起きる所の少し手前から始める（道筋は同じ水路の上）
export const LEG_A = [{ x: -27.5, z: 27.4 }, { x: -50, z: 100 }];
export const LEG_B = [{ x: -2595, z: 1818 }, { x: -2650, z: 1830 }, { x: -2760, z: 1846 }];
// 最後は沖の船の横（左舷側 7m ほど）へ漕ぎ寄せる
export const LEG_C = [{ x: -2520, z: 2513 }, { x: -2480, z: 2555 }, { x: -2462, z: 2592 }, { x: -2443, z: 2611 }];
export const DROP_X = -2650; // 赤ノ江（笏の江）の手前で笏が落ちる
export const AKANOE = { x: -3126, z: 1773 };
export const AKASAKI = { x: -2577, z: 2556 };

function box(m, inset) {
  return { x0: m.x0 + inset, z0: m.z0 + inset, x1: m.x0 + m.size - inset, z1: m.z0 + m.size - inset };
}

export function buildAkanoe(game) {
  const st = new Stage(game);
  game.env.set('night');
  game.env.setWaves(0.08);

  // 赤ノ江・赤崎まわりは細かく、入り江全体は粗く
  const t = st.makeTerrain({ map: MAPS.akanoe, seed: 51, base: -6, redRock: 0.9, palette: { rock: '#6e5448', sand: '#7d6552' } });
  st.mapBackdrop(MAPS.crossing, box(MAPS.akanoe, 20));
  st.mapBackdrop(MAPS.crossingFar, box(MAPS.crossing, 90));
  st.root.add(scatterTrees(t, { count: 700, seed: 14, minH: 4, maxH: 400, maxSlope: 1.3, pineRatio: 0.7 }));
  st.root.add(scatterShoreRocks(t, { count: 320, seed: 41, color: '#8a5a48' }));

  // 小舟
  const boat = st.add(makeSmallBoat(), LEG_A[0].x, 0.05, LEG_A[0].z, Math.PI / 2);
  const fy = boat.userData.floorY;
  const rower = st.fig({ robe: '#4a4438', hat: 'kasa' }, -2.1, fy, 0, -Math.PI / 2, boat);
  // 忠顕は帝の後ろに控える（前方の視界をふさがない）
  const tadaaki = st.fig({ robe: '#3d4e66', robe2: '#e5dccb', hat: 'eboshi', seated: true }, -1.25, fy, -0.3, -Math.PI / 2, boat);
  const lantern = makeLantern();
  st.add(lantern, 1.9, 0.2, 0.3, 0, boat);
  lantern.userData.halo.material.opacity = 0.6;

  // 赤崎の沖で待つ船（船首を沖＝南東へ）
  const ship = st.add(makeShip({ length: 13, beam: 3.8, cabin: false, hatch: true, cargo: true }), AKASAKI.x + 140, 0, AKASAKI.z + 50, -Math.PI / 4);
  st.add(makeFlame({ size: 0.35, glow: 1.6 }), -4.8, ship.userData.deckY + 1.5, 0, 0, ship);
  st.fig({ robe: '#5b5344', hat: 'topknot' }, -3, ship.userData.deckY, 1.2, 0, ship);

  const capeLook = new THREE.Vector3(AKASAKI.x, 8, AKASAKI.z);
  const akanoeLook = new THREE.Vector3(AKANOE.x, 6, AKANOE.z);
  return { st, terrain: t, boat, rower, tadaaki, lantern, ship, capeLook, akanoeLook, playerSeat: new THREE.Vector3(-0.4, fy, 0) };
}
