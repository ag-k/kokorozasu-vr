// プログラムで作るテクスチャ（画像ファイルを使わない）
// ・ノイズ（地形・海の細部）  ・海のさざ波の法線  ・雲  ・建物の質感（木・黒木・茅・畳・漆喰・石垣）
import * as THREE from 'three';
import { mulberry32 } from './util.js';

const cache = new Map();
function once(key, fn) {
  if (!cache.has(key)) {
    const t = fn();
    t.userData.shared = true;
    cache.set(key, t);
  }
  return cache.get(key);
}

// 端がつながる（タイル可能な）値ノイズ
function tileNoise(size, period, seed) {
  const rnd = mulberry32(seed);
  const lat = new Float32Array(period * period);
  for (let i = 0; i < lat.length; i++) lat[i] = rnd();
  const out = new Float32Array(size * size);
  const f = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) {
    const fy = (y / size) * period, iy = Math.floor(fy), ty = f(fy - iy);
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * period, ix = Math.floor(fx), tx = f(fx - ix);
      const x0 = ix % period, x1 = (ix + 1) % period, y0 = iy % period, y1 = (iy + 1) % period;
      const a = lat[y0 * period + x0], b = lat[y0 * period + x1], c = lat[y1 * period + x0], d = lat[y1 * period + x1];
      out[y * size + x] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    }
  }
  return out;
}

function tileFbm(size, basePeriod, octaves, seed) {
  const out = new Float32Array(size * size);
  let amp = 0.5, total = 0, period = basePeriod;
  for (let o = 0; o < octaves; o++) {
    const n = tileNoise(size, period, seed + o * 17);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    total += amp; amp *= 0.5; period *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function dataTexture(size, channels) {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    for (let c = 0; c < 4; c++) data[i * 4 + c] = Math.max(0, Math.min(255, Math.round((channels[c] ? channels[c][i] : 1) * 255)));
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

// RGBA に周波数の違うノイズを入れた汎用テクスチャ（線形色空間のデータとして使う）
export function noiseTexture() {
  return once('noise', () => {
    const S = 256;
    return dataTexture(S, [tileFbm(S, 4, 4, 11), tileFbm(S, 8, 4, 23), tileFbm(S, 16, 3, 37), tileFbm(S, 32, 2, 51)]);
  });
}

// 海のさざ波の法線マップ
export function waterNormalTexture() {
  return once('waterNormal', () => {
    const S = 256;
    const h = tileFbm(S, 8, 5, 71);
    const nx = new Float32Array(S * S), ny = new Float32Array(S * S), nz = new Float32Array(S * S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const l = h[y * S + ((x + S - 1) % S)], r = h[y * S + ((x + 1) % S)];
        const u = h[((y + S - 1) % S) * S + x], d = h[((y + 1) % S) * S + x];
        let vx = (l - r) * 6, vy = (u - d) * 6, vz = 1;
        const len = Math.hypot(vx, vy, vz);
        vx /= len; vy /= len; vz /= len;
        const i = y * S + x;
        nx[i] = vx * 0.5 + 0.5; ny[i] = vy * 0.5 + 0.5; nz[i] = vz * 0.5 + 0.5;
      }
    }
    return dataTexture(S, [nx, ny, nz]);
  });
}

// 空の雲（横方向につながる帯）。a: 雲の濃さ
export function cloudTexture() {
  return once('clouds', () => {
    const W = 1024, H = 256, S = 512;
    const n1 = tileFbm(S, 12, 5, 91);
    const n2 = tileFbm(S, 5, 3, 97);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const img = g.createImageData(W, H);
    const dens = (sx, sy) => {
      sx = ((sx % S) + S) % S; sy = ((sy % S) + S) % S;
      return n1[sy * S + sx] * 0.8 + n2[sy * S + sx] * 0.45 - 0.08;
    };
    for (let y = 0; y < H; y++) {
      const v = y / H; // 0=天頂側, 1=地平線側
      const band = Math.min(1, v / 0.3) * Math.min(1, (1 - v) / 0.12);
      // 地平線に近いほど雲を横長に（遠近感）
      const sy = Math.floor(Math.pow(v, 0.7) * S * 0.9);
      for (let x = 0; x < W; x++) {
        const sx = Math.floor((x / W) * S);
        const d = dens(sx, sy);
        let a = Math.min(1, Math.max(0, (d - 0.5) / 0.14)) * band;
        // 上から光が当たって上側が明るく、下側が暗い
        const lit = dens(sx, sy - 6) - d;
        const shade = Math.max(0.55, Math.min(1, 0.86 - lit * 2.2 + (d - 0.5) * 0.3));
        const i = (y * W + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(255 * shade);
        img.data[i + 3] = Math.round(255 * a);
      }
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    return t;
  });
}

// ---- 建物の質感（明るさの変化だけを持つ灰色。色は頂点色で付ける）----
function canvasTex(key, size, draw) {
  return once(key, () => {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    draw(g, size, mulberry32(key.length * 97 + size));
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return t;
  });
}

const gray = (v, a = 1) => `rgba(${v | 0},${v | 0},${v | 0},${a})`;

export const SURFACE = {
  // 板（縦目の木目と板の継ぎ目）。1 リピート = 1.2m
  wood: { size: 1.2, tex: () => canvasTex('wood', 256, (g, S, r) => {
    g.fillStyle = gray(222); g.fillRect(0, 0, S, S);
    for (let i = 0; i < 260; i++) {
      const x = r() * S, w = 0.5 + r() * 1.6;
      g.fillStyle = gray(150 + r() * 70, 0.35);
      g.fillRect(x, 0, w, S);
    }
    for (let k = 0; k < 5; k++) {
      const x = (k / 5) * S;
      g.fillStyle = gray(95, 0.9); g.fillRect(x, 0, 2, S);
      g.fillStyle = gray(245, 0.4); g.fillRect(x + 2, 0, 1, S);
    }
    for (let i = 0; i < 6; i++) { g.fillStyle = gray(120, 0.6); g.beginPath(); g.ellipse(r() * S, r() * S, 2 + r() * 3, 5 + r() * 6, 0, 0, 6.3); g.fill(); }
  }) },
  // 皮付きの丸太（黒木）。縦の割れ目
  bark: { size: 0.8, tex: () => canvasTex('bark', 256, (g, S, r) => {
    g.fillStyle = gray(200); g.fillRect(0, 0, S, S);
    for (let i = 0; i < 400; i++) {
      const x = r() * S, y = r() * S, h = 10 + r() * 50;
      g.fillStyle = gray(80 + r() * 60, 0.6);
      g.fillRect(x, y, 1 + r() * 2.5, h);
    }
    for (let i = 0; i < 300; i++) { g.fillStyle = gray(240, 0.25); g.fillRect(r() * S, r() * S, 2 + r() * 4, 1); }
  }) },
  // 茅葺き・檜皮葺き（斜面に沿う細い藁の筋と段）
  thatch: { size: 1.4, tex: () => canvasTex('thatch', 256, (g, S, r) => {
    g.fillStyle = gray(205); g.fillRect(0, 0, S, S);
    for (let i = 0; i < 1400; i++) {
      const x = r() * S, y = r() * S, h = 8 + r() * 26;
      g.strokeStyle = gray(120 + r() * 120, 0.55); g.lineWidth = 0.8 + r();
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 3, y + h); g.stroke();
    }
    for (let k = 0; k < 4; k++) {
      const y = (k / 4) * S;
      const gr = g.createLinearGradient(0, y, 0, y + S / 4);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.85, 'rgba(0,0,0,0.12)'); gr.addColorStop(1, 'rgba(0,0,0,0.35)');
      g.fillStyle = gr; g.fillRect(0, y, S, S / 4);
    }
  }) },
  // 畳（い草の目と縁）
  tatami: { size: 0.9, tex: () => canvasTex('tatami', 256, (g, S, r) => {
    g.fillStyle = gray(225); g.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 3) { g.fillStyle = gray(185 + r() * 25, 0.7); g.fillRect(0, y, S, 1); }
    g.fillStyle = gray(70); g.fillRect(0, 0, S, 10); g.fillRect(0, S / 2, S, 10);
  }) },
  // 漆喰・土壁
  plaster: { size: 2, tex: () => canvasTex('plaster', 256, (g, S, r) => {
    g.fillStyle = gray(230); g.fillRect(0, 0, S, S);
    for (let i = 0; i < 700; i++) { g.fillStyle = gray(190 + r() * 60, 0.25); g.beginPath(); g.arc(r() * S, r() * S, 1 + r() * 5, 0, 6.3); g.fill(); }
  }) },
  // 石垣（不揃いな石と目地）
  stone: { size: 2.4, tex: () => canvasTex('stone', 256, (g, S, r) => {
    g.fillStyle = gray(90); g.fillRect(0, 0, S, S);
    const rows = 6;
    for (let row = 0; row < rows; row++) {
      let x = -r() * 40;
      const y0 = (row / rows) * S, h = S / rows;
      while (x < S) {
        const w = 28 + r() * 44;
        const v = 170 + r() * 70;
        g.fillStyle = gray(v);
        g.beginPath();
        g.moveTo(x + 2 + r() * 3, y0 + 2 + r() * 3);
        g.lineTo(x + w - 2 - r() * 3, y0 + 2 + r() * 3);
        g.lineTo(x + w - 2 - r() * 3, y0 + h - 2 - r() * 3);
        g.lineTo(x + 2 + r() * 3, y0 + h - 2 - r() * 3);
        g.closePath(); g.fill();
        g.fillStyle = gray(255, 0.12); g.fillRect(x + 4, y0 + 3, w - 10, 3);
        // 端がつながるよう左右に複写
        if (x + w > S) { g.fillStyle = gray(v); g.fillRect(x - S + 2, y0 + 3, w - 4, h - 6); }
        x += w;
      }
    }
  }) },
};

export function surfaceTexture(kind) {
  const s = SURFACE[kind];
  if (!s) return null;
  const t = s.tex();
  t.repeat.set(1 / s.size, 1 / s.size);
  return t;
}
