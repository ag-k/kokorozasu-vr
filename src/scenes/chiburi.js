// 第一章：知夫里島（仁夫里浜・仁夫里坊・古海坊）
import * as THREE from 'three';
import { Stage } from './stage.js';
import { makeSmallBoat, makeHouse, makeRock, makeFigure, C } from '../core/props.js';
import { scatterTrees, scatterGrass, scatterShoreRocks } from '../core/terrain.js';
import { Panel, FONT, ensureFont, drawVertical } from '../core/ui.js';
import { distToPath } from '../core/util.js';

export const CHIBURI = {
  beach: new THREE.Vector3(0, 0, 4),
  nibu: { x: 26, z: -64 },
  furumi: { x: 58, z: -88 },
};

// 上陸する浜（x=0）から、赤ハゲ山の仁夫里坊へ
const PATH = [[0, 2], [0, -12], [3, -20], [10, -28], [18, -40], [24, -52], [26, -60]];
const PATH2 = [[29, -66], [38, -74], [48, -82], [56, -84]];

export function buildChiburi(game) {
  const st = new Stage(game);
  game.env.set('day');
  game.env.setWaves(0.14);

  const t = st.makeTerrain({
    size: 700, seg: 140, cx: 30, cz: -80, seed: 12, base: -12, forest: 0.3,
    islands: [
      { x: 40, z: -150, rx: 300, rz: 210, h: 16, pow: 1.1, rough: 4, wobble: 0.25 },
      { x: 27, z: -68, rx: 95, rz: 85, h: 34, pow: 0.9, rough: 2, wobble: 0.12, off: 1 },
      { x: -60, z: -40, rx: 120, rz: 90, h: 18, rough: 4, off: 2 },
    ],
    bays: [{ x: -2, z: 40, rx: 40, rz: 45, depth: 3 }],
    pads: [
      { x: CHIBURI.nibu.x, z: CHIBURI.nibu.z, r: 9 },
      { x: CHIBURI.furumi.x, z: CHIBURI.furumi.z, r: 8 },
    ],
    paths: [{ pts: PATH, w: 2.2 }, { pts: PATH2, w: 2 }],
  });
  // 島前の島々（北に西ノ島、北東に中ノ島）
  st.backdrop({
    size: 6000, seg: 90, cx: 0, cz: -900, seed: 13, base: -30,
    mask: (x, z) => (Math.hypot(x - 30, z + 80) > 420 ? 1 : 0),
    islands: [
      { x: -350, z: -1150, rx: 800, rz: 300, h: 200, rough: 30 },
      { x: 700, z: -900, rx: 380, rz: 330, h: 150, rough: 25, off: 4 },
      { x: -1100, z: -500, rx: 300, rz: 250, h: 120, rough: 20, off: 8 },
    ],
  });

  // 木々：赤ハゲ山の上は草地、麓に林
  st.root.add(scatterTrees(t, {
    count: 450, seed: 5, minH: 2, maxH: 26,
    density: (x, z, h) => (h < 12 ? 0.6 : h < 20 ? 0.2 : 0.02) * (distToPath(x, z, PATH) > 6 ? 1 : 0),
    exclude: [{ x: CHIBURI.nibu.x, z: CHIBURI.nibu.z, r: 16 }, { x: CHIBURI.furumi.x, z: CHIBURI.furumi.z, r: 14 }, { x: 0, z: 0, r: 14 }],
  }));
  st.root.add(scatterGrass(t, {
    count: 2600, seed: 8,
    areas: [{ x: 10, z: -30, r: 40 }, { x: CHIBURI.nibu.x, z: CHIBURI.nibu.z, r: 30 }, { x: CHIBURI.furumi.x, z: CHIBURI.furumi.z, r: 25 }, { x: 40, z: -60, r: 45 }],
    exclude: [{ x: CHIBURI.nibu.x, z: CHIBURI.nibu.z, r: 5 }, { x: CHIBURI.furumi.x, z: CHIBURI.furumi.z, r: 4.5 }],
  }));
  st.root.add(scatterShoreRocks(t, { count: 220, seed: 21, area: { x: 30, z: -80, w: 650, d: 650 } }));
  st.gulls(0, -10, 6, 70, 28);
  for (let i = 0; i < 14; i++) {
    const a = i * 2.3, r = 30 + (i * 37) % 60;
    const x = 30 + Math.cos(a) * r, z = -60 + Math.sin(a) * r;
    if (t.heightAt(x, z) > 1) st.put(makeRock(0.6 + (i % 3) * 0.4, i + 3), x, z, a, 0.1);
  }

  // 仁夫里坊
  const nibuY = t.heightAt(CHIBURI.nibu.x, CHIBURI.nibu.z);
  const nibu = makeHouse({ w: 6, d: 4.6, roof: 'gable', roofColor: '#6d5d47', floor: 0.5, logs: true, post: '#4a3a2c' });
  st.add(nibu, CHIBURI.nibu.x, nibuY, CHIBURI.nibu.z, Math.PI * 0.9);
  const monk = st.fig({ robe: '#3a3834', robe2: '#d8d0c0', hat: 'bald', kesa: '#8a6a3a' }, 0, 0, 0);
  monk.position.set(CHIBURI.nibu.x - 0.8, nibuY, CHIBURI.nibu.z + 3.8);
  st.face(monk, 0, 0);

  // 古海坊（宝形造の小堂と地蔵）
  const fY = t.heightAt(CHIBURI.furumi.x, CHIBURI.furumi.z);
  const furumi = makeHouse({ w: 4.4, d: 4.4, roof: 'pyramid', roofColor: '#5f4c3c', floor: 0.6, sudare: false, open: true });
  const furumiYaw = Math.PI * 0.75;
  st.add(furumi, CHIBURI.furumi.x, fY, CHIBURI.furumi.z, furumiYaw);
  const jizo = makeFigure({ robe: '#8f8a80', robe2: '#8f8a80', skin: '#9a958b', hat: 'bald', h: 0.95, prop: 'staff', sleeves: true });
  furumi.add(jizo);
  jizo.position.set(0, 0.6 + 0.35, 0.8);
  const pedestal = makeRock(0.35, 7, '#7b776f');
  pedestal.scale.set(1, 0.6, 1);
  furumi.add(pedestal);
  pedestal.position.set(0, 0.75, 0.8);
  st.figs.push(jizo);

  // 扁額（名を記す）
  const plaque = new Panel(0.5, 1.0, { ppm: 500, overlay: false, order: 5 });
  plaque.mat.transparent = false;
  plaque.mat.depthWrite = true;
  const drawPlaque = (progress) => {
    const ctx = plaque.ctx, W = plaque.W, H = plaque.H;
    ctx.fillStyle = '#3a2a1c'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#5a4430'; ctx.fillRect(16, 16, W - 32, H - 32);
    if (progress > 0) {
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, W, 30 + (H - 30) * progress); ctx.clip();
      ctx.fillStyle = '#e9d9a6';
      ctx.font = `700 40px ${FONT}`;
      drawVertical(ctx, '松尾山', W / 2 + 70, 70, 40, H - 100);
      ctx.font = `700 96px ${FONT}`;
      drawVertical(ctx, '松養寺', W / 2 - 10, 80, 96, H - 100);
      ctx.restore();
    }
    plaque.commit();
  };
  ensureFont('松尾山松養寺').then(() => drawPlaque(0));
  furumi.add(plaque.mesh);
  // 入口上の横木（長押）に隠れないよう、その下の手前に掛ける
  plaque.mesh.position.set(0, 0.6 + 1.74, -2.34);
  plaque.mesh.rotation.y = Math.PI;
  plaque.mesh.scale.setScalar(0.8);

  // 小舟
  const boat = st.add(makeSmallBoat(), 0, 0.05, 46, Math.PI / 2);
  const rower = st.fig({ robe: '#5b5344', hat: 'kasa' }, -2.1, boat.userData.floorY, 0, -Math.PI / 2, boat);
  const tadaaki = st.fig({ robe: '#3d4e66', robe2: '#e5dccb', hat: 'eboshi', seated: true }, -1.25, boat.userData.floorY, -0.3, -Math.PI / 2, boat);

  // 波打ち際（舟を着ける所と上陸地点）
  let shoreZ = 30;
  while (t.heightAt(0, shoreZ) < -0.5 && shoreZ > -60) shoreZ -= 0.5;
  let landZ = shoreZ;
  while (t.heightAt(0, landZ) < 0.6 && landZ > -80) landZ -= 0.5;
  landZ -= 1;

  // 浜の人々
  const villagers = [
    st.figOnGround({ robe: '#6a5a44', hat: 'topknot' }, -5, landZ - 2, 0),
    st.figOnGround({ robe: '#7a6a5a', hat: 'long', h: 1.5 }, -7, landZ - 4, 0),
    st.figOnGround({ robe: '#5d5a52', hat: 'kasa' }, 6, landZ - 3, 0),
  ];
  villagers.forEach((v) => st.face(v, 0, 10));

  // 移動範囲
  st.freeNav({
    region: (x, z) => Math.hypot(x - 28, z + 50) < 95,
    minH: 0.3,
  });
  game.nav.mode = 'none';

  return { st, terrain: t, boat, rower, tadaaki, monk, nibu, furumi, furumiYaw, plaque, drawPlaque, villagers, fY, nibuY, shoreZ, landZ };
}
