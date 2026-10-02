// ハイトフィールド地形（島・入り江・平場・道）と木々の配置
import * as THREE from 'three';
import { MAT, Builder, sharedUniforms } from './builder.js';
import { noiseTexture } from './textures.js';
import { clamp, lerp, smoothstep, makeNoise2D, mulberry32, distToPath, displaceShared } from './util.js';

const PALETTE = {
  seabed: '#56685e', sand: '#c9b58c', grass: '#6f8a47', grass2: '#56713a', forest: '#26421f',
  dirt: '#8f7a57', rock: '#7b736a', rockRed: '#8e4f3c', path: '#a38f6b', cliff: '#6d655d',
};

// tools/make_mapdata.py が書き出した標高格子を復元する
export function decodeMap(m) {
  if (m.heights) return m;
  const bin = atob(m.data);
  const N = m.n * m.n;
  const h = new Float32Array(N);
  if (m.bits === 16) {
    for (let i = 0; i < N; i++) h[i] = m.min + (bin.charCodeAt(i * 2) | (bin.charCodeAt(i * 2 + 1) << 8)) * m.scale;
  } else {
    for (let i = 0; i < N; i++) h[i] = m.min + bin.charCodeAt(i) * m.scale;
  }
  m.heights = h;
  m.cell = m.size / (m.n - 1);
  return m;
}

export function sampleMap(m, x, z) {
  const fx = (x - m.x0) / m.cell, fz = (z - m.z0) / m.cell;
  const i = Math.max(0, Math.min(m.n - 2, Math.floor(fx))), j = Math.max(0, Math.min(m.n - 2, Math.floor(fz)));
  const u = Math.max(0, Math.min(1, fx - i)), v = Math.max(0, Math.min(1, fz - j));
  const H = m.heights, n = m.n;
  const a = H[j * n + i], b = H[j * n + i + 1], c = H[(j + 1) * n + i], d = H[(j + 1) * n + i + 1];
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

export class Terrain {
  constructor(cfg) {
    if (cfg.map) {
      const m = decodeMap(cfg.map);
      cfg = Object.assign({ size: m.size, seg: m.n - 1, cx: m.x0 + m.size / 2, cz: m.z0 + m.size / 2, edgeFall: false }, cfg);
    }
    this.cfg = Object.assign({
      size: 800, seg: 160, cx: 0, cz: 0, seed: 7, base: -14,
      islands: [], bays: [], pads: [], paths: [], edgeFall: true,
      palette: {}, redRock: 0, mask: null, grassNoise: 0.012, map: null,
    }, cfg);
    const c = this.cfg;
    this.pal = Object.fromEntries(Object.entries({ ...PALETTE, ...c.palette }).map(([k, v]) => [k, new THREE.Color(v)]));
    this.noise = makeNoise2D(c.seed);
    this.n = c.seg + 1;
    this.cell = c.size / c.seg;
    this.x0 = c.cx - c.size / 2;
    this.z0 = c.cz - c.size / 2;
    // 高さ未指定の平場は元の地形の高さに合わせる
    for (const p of c.pads) if (p.h === undefined) p.h = this.rawHeight(p.x, p.z, true) + (p.dh || 0);
    this.heights = new Float32Array(this.n * this.n);
    for (let j = 0; j < this.n; j++) {
      for (let i = 0; i < this.n; i++) {
        this.heights[j * this.n + i] = this.rawHeight(this.x0 + i * this.cell, this.z0 + j * this.cell);
      }
    }
    this.mesh = this.buildMesh();
  }

  rawHeight(x, z, skipPads = false) {
    const c = this.cfg, N = this.noise;
    let h = c.map ? sampleMap(c.map, x, z) : c.base;
    for (const is of c.islands) {
      const dx = x - is.x, dz = z - is.z;
      const r = is.rot || 0, cs = Math.cos(r), sn = Math.sin(r);
      const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
      let d = Math.sqrt((lx / is.rx) ** 2 + (lz / is.rz) ** 2);
      d += N.fbm(x * 0.006 + (is.off || 0), z * 0.006 - (is.off || 0), 3) * (is.wobble ?? 0.35);
      const t = clamp(1 - d, 0, 1);
      const prof = Math.pow(smoothstep(0, 1, t), is.pow ?? 1);
      let ih = lerp(c.base, is.h, prof);
      ih += N.fbm(x * 0.018 + 11, z * 0.018 - 7, 4) * (is.rough ?? 8) * smoothstep(0.05, 0.45, t);
      if (ih > h) h = ih;
    }
    for (const b of c.bays) {
      const dx = (x - b.x) / b.rx, dz = (z - b.z) / b.rz;
      const d = Math.sqrt(dx * dx + dz * dz) + N.fbm(x * 0.01, z * 0.01, 2) * 0.2;
      if (d < 1) h = lerp(h, Math.min(h, -b.depth), Math.pow(smoothstep(0, 0.7, 1 - d), 0.8));
    }
    for (const p of skipPads ? [] : c.pads) {
      const d = Math.sqrt((x - p.x) ** 2 + (z - p.z) ** 2);
      const w = 1 - smoothstep(p.r, p.r + (p.blend ?? p.r * 0.8), d);
      if (w > 0) h = lerp(h, p.h, w);
    }
    for (const p of c.paths) {
      if (!p.flatten) continue;
      const d = distToPath(x, z, p.pts);
      const w = 1 - smoothstep(p.w * 0.5, p.w * 1.6, d);
      if (w > 0) {
        // 道は周囲をならす（局所平均）
        const hs = (h + N.fbm(x * 0.05, z * 0.05, 2) * 0.2);
        h = lerp(h, hs, w);
      }
    }
    if (c.mask) h = lerp(c.base, h, c.mask(x, z));
    if (c.edgeFall) {
      const e = Math.max(Math.abs(x - c.cx), Math.abs(z - c.cz)) / (c.size / 2);
      h = lerp(h, c.base, smoothstep(0.82, 0.98, e));
    }
    return h;
  }

  gridH(i, j) {
    i = clamp(i, 0, this.n - 1); j = clamp(j, 0, this.n - 1);
    return this.heights[j * this.n + i];
  }

  // メッシュの三角形と一致する補間高さ
  heightAt(x, z) {
    const fx = (x - this.x0) / this.cell, fz = (z - this.z0) / this.cell;
    const i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= this.n - 1 || j >= this.n - 1) return this.cfg.base;
    const u = fx - i, v = fz - j;
    const a = this.gridH(i, j), b = this.gridH(i + 1, j), c = this.gridH(i, j + 1), d = this.gridH(i + 1, j + 1);
    if (u + v <= 1) return a + (b - a) * u + (c - a) * v;
    return d + (c - d) * (1 - u) + (b - d) * (1 - v);
  }

  slopeAt(x, z) {
    const e = this.cell;
    const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return Math.sqrt(hx * hx + hz * hz) / (2 * e);
  }

  // なめらかな陰影の地形メッシュ。頂点色 r = 谷の暗さ（AO）
  buildMesh() {
    const n = this.n, H = this.heights;
    const pos = new Float32Array(n * n * 3);
    const col = new Float32Array(n * n * 3);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        const h = H[k];
        pos[k * 3] = this.x0 + i * this.cell; pos[k * 3 + 1] = h; pos[k * 3 + 2] = this.z0 + j * this.cell;
        // 周囲より低い所（谷）は暗く、尾根はわずかに明るく
        let sum = 0, cnt = 0;
        for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { sum += this.gridH(i + di, j + dj); cnt++; }
        const d = h - sum / cnt;
        const ao = h < 0 ? 1 : clamp(1 + d * (0.9 / Math.max(this.cell, 3)), 0.62, 1.08);
        col[k * 3] = ao; col[k * 3 + 1] = 0; col[k * 3 + 2] = 0;
      }
    }
    const idx = new Uint32Array((n - 1) * (n - 1) * 6);
    let t = 0;
    for (let j = 0; j < n - 1; j++) {
      for (let i = 0; i < n - 1; i++) {
        const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
        idx[t++] = a; idx[t++] = c; idx[t++] = b;
        idx[t++] = b; idx[t++] = c; idx[t++] = d;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, terrainMaterial(this.pal, this.cfg.redRock || 0, this.cfg.forest ?? 0.92));
    m.receiveShadow = true;
    m.userData.terrain = true;
    return m;
  }

  // 道（地面に沿って貼る帯）
  // 道の地図：道の上ほど 1 に近い値を持つテクスチャ。地形のシェーダーで土の道として塗る
  // （地面の上に板を重ねる方法と違い、坂でも地面に埋もれず、ちらつかない）
  pathTexture() {
    const paths = this.cfg.paths.filter((p) => p.color !== false);
    if (!paths.length) return null;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of paths) for (const [x, z] of p.pts) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
    const pad = 8;
    x0 -= pad; z0 -= pad;
    const size = Math.max(x1 + pad - x0, z1 + pad - z0);
    // 1 画素がおよそ 0.35m になるよう、2 のべき乗で最大 2048
    let R = 256;
    while (R < 2048 && size / R > 0.35) R *= 2;
    const px = size / R;
    const data = new Uint8Array(R * R * 4);
    const val = new Float32Array(R * R);
    for (const p of paths) {
      const hw = p.w * 0.5, feather = 0.45;
      for (let s = 0; s < p.pts.length - 1; s++) {
        const [ax, az] = p.pts[s], [bx, bz] = p.pts[s + 1];
        const reach = hw * 1.15 + feather;
        const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach - x0) / px)), i1 = Math.min(R - 1, Math.ceil((Math.max(ax, bx) + reach - x0) / px));
        const j0 = Math.max(0, Math.floor((Math.min(az, bz) - reach - z0) / px)), j1 = Math.min(R - 1, Math.ceil((Math.max(az, bz) + reach - z0) / px));
        const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
        for (let j = j0; j <= j1; j++) {
          const z = z0 + (j + 0.5) * px;
          for (let i = i0; i <= i1; i++) {
            const x = x0 + (i + 0.5) * px;
            const t = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1);
            const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
            // 道幅をゆるやかに揺らす
            const w = hw * (1 + this.noise.noise(x * 0.08, z * 0.08) * 0.15);
            const v = 1 - smoothstep(w - feather, w + feather, d);
            const k = j * R + i;
            if (v > val[k]) val[k] = v;
          }
        }
      }
    }
    for (let k = 0; k < R * R; k++) { const v = Math.round(val[k] * 255); data[k * 4] = v; data[k * 4 + 3] = 255; }
    const tex = new THREE.DataTexture(data, R, R, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;
    return { tex, x0, z0, size };
  }

  // 岸からの距離（m）を入れたテクスチャ。海の浅瀬の色と波打ち際の白波に使う
  shoreTexture(maxDist = 60) {
    const c = this.cfg;
    const R = Math.min(320, (this.n - 1) * 2 + 1);
    const step = c.size / (R - 1);
    const land = new Uint8Array(R * R);
    for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) {
      land[j * R + i] = this.heightAt(this.x0 + i * step, this.z0 + j * step) > 0.05 ? 1 : 0;
    }
    // 2 パスの距離変換（チェビシェフ近似を √2 補正）
    const INF = 1e9, D = new Float32Array(R * R);
    for (let k = 0; k < D.length; k++) D[k] = land[k] ? 0 : INF;
    const s2 = Math.SQRT2;
    for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) {
      const k = j * R + i; let v = D[k];
      if (i > 0) v = Math.min(v, D[k - 1] + 1);
      if (j > 0) { v = Math.min(v, D[k - R] + 1); if (i > 0) v = Math.min(v, D[k - R - 1] + s2); if (i < R - 1) v = Math.min(v, D[k - R + 1] + s2); }
      D[k] = v;
    }
    for (let j = R - 1; j >= 0; j--) for (let i = R - 1; i >= 0; i--) {
      const k = j * R + i; let v = D[k];
      if (i < R - 1) v = Math.min(v, D[k + 1] + 1);
      if (j < R - 1) { v = Math.min(v, D[k + R] + 1); if (i < R - 1) v = Math.min(v, D[k + R + 1] + s2); if (i > 0) v = Math.min(v, D[k + R - 1] + s2); }
      D[k] = v;
    }
    const data = new Uint8Array(R * R);
    for (let k = 0; k < D.length; k++) data[k] = Math.round(Math.min(1, (D[k] * step) / maxDist) * 255);
    const tex = new THREE.DataTexture(data, R, R, THREE.RedFormat, THREE.UnsignedByteType);
    tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return { tex, x0: this.x0, z0: this.z0, size: c.size, maxDist };
  }
}

// 章ごとの道の地図（すべての地形の材質で共有。範囲の外では塗らない）
export const pathUniforms = { uPathTex: { value: null }, uPathRect: { value: new THREE.Vector4(0, 0, 1, 0) } };
export function setPaths(info) {
  if (pathUniforms.uPathTex.value && pathUniforms.uPathTex.value !== info?.tex) pathUniforms.uPathTex.value.dispose();
  pathUniforms.uPathTex.value = info ? info.tex : null;
  if (info) pathUniforms.uPathRect.value.set(info.x0, info.z0, info.size, 1);
  else pathUniforms.uPathRect.value.w = 0;
}

// 地形のシェーダー：標高・傾き・ノイズで草地・林床・土・岩・道・砂浜・濡れた砂・海底を塗り分ける
const terrainMats = new Map();
function terrainMaterial(pal, redRock, forestAmt) {
  const key = Object.values(pal).map((c) => c.getHexString()).join('') + redRock + '/' + forestAmt;
  if (terrainMats.has(key)) return terrainMats.get(key);
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  const U = {
    uNoise: { value: noiseTexture() },
    uGrass: { value: pal.grass }, uGrass2: { value: pal.grass2 }, uForest: { value: pal.forest },
    uDirt: { value: pal.dirt }, uRock: { value: pal.rock }, uRockRed: { value: pal.rockRed },
    uSand: { value: pal.sand }, uSeabed: { value: pal.seabed }, uRedRock: { value: redRock }, uForestAmt: { value: forestAmt },
    uPath: { value: pal.path },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, pathUniforms, { uSnow: sharedUniforms.uSnow });
    sh.vertexShader = 'varying vec3 vWPos;\nvarying vec3 vWN;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
      vWN = mat3(modelMatrix) * objectNormal;`);
    sh.fragmentShader = `varying vec3 vWPos;
varying vec3 vWN;
uniform sampler2D uNoise, uPathTex;
uniform vec4 uPathRect;
uniform vec3 uGrass, uGrass2, uForest, uDirt, uRock, uRockRed, uSand, uSeabed, uPath;
uniform float uRedRock, uSnow, uForestAmt;
` + sh.fragmentShader.replace('#include <color_fragment>', `
      {
        vec3 wp = vWPos;
        float ny = normalize(vWN).y;
        vec4 n1 = texture2D(uNoise, wp.xz * 0.0045);
        vec4 n2 = texture2D(uNoise, wp.xz * 0.031);
        vec4 n3 = texture2D(uNoise, wp.xz * 0.23);
        // 草地のまだら（大・中・細）
        float patchy = n1.r * 0.55 + n2.g * 0.45;
        vec3 col = mix(uGrass, uGrass2, smoothstep(0.38, 0.66, patchy));
        col *= 0.86 + n3.b * 0.26;
        // 足もとの細かい地肌（近くだけ効く）
        vec4 n4 = texture2D(uNoise, wp.xz * 1.3);
        col *= 0.93 + n4.r * 0.14;
        col = mix(col, col * vec3(1.08, 1.05, 0.82), smoothstep(0.62, 0.8, n2.a) * 0.6); // 枯れ草
        // 森（樹冠）：標高が上がるほど、まだらに濃い森になる。凹凸の陰影もノイズで描く
        float forestT = smoothstep(6.0, 26.0, wp.y + (n1.g - 0.5) * 30.0) * smoothstep(0.2, 0.45, n1.a + n2.r * 0.35);
        float crown = n2.b * 0.55 + n3.g * 0.45;
        vec3 forest = uForest * (0.45 + crown * 1.05) * mix(vec3(0.95, 1.0, 0.9), vec3(1.12, 1.18, 0.85), n2.g);
        col = mix(col, forest, forestT * uForestAmt);
        // やや急な所は土、急斜面は岩
        float dirtT = smoothstep(0.93, 0.8, ny + (n2.r - 0.5) * 0.1);
        col = mix(col, uDirt * (0.85 + n3.g * 0.3), dirtT * 0.65);
        float rockT = smoothstep(0.8, 0.64, ny + (n2.b - 0.5) * 0.14);
        vec3 rock = mix(uRock, uRockRed, clamp(uRedRock * (0.5 + n1.b), 0.0, 1.0)) * (0.72 + n3.r * 0.45);
        col = mix(col, rock, rockT);
        // 道（踏み固めた土。縁は草に溶け込ませ、真ん中はやや明るく）
        if (uPathRect.w > 0.5) {
          vec2 puv = (wp.xz - uPathRect.xy) / uPathRect.z;
          if (puv.x > 0.0 && puv.y > 0.0 && puv.x < 1.0 && puv.y < 1.0) {
            float pv = texture2D(uPathTex, puv).r;
            float pt = smoothstep(0.2, 0.7, pv + (n3.g - 0.5) * 0.3 + (n4.b - 0.5) * 0.25);
            vec3 pc = uPath * (0.8 + n3.r * 0.22 + n4.g * 0.14) * mix(0.9, 1.08, smoothstep(0.7, 1.0, pv));
            col = mix(col, pc, pt * 0.95);
            // 道の縁に沿った、わずかな草の縁取り（暗く）
            col *= 1.0 - smoothstep(0.05, 0.3, pv) * (1.0 - smoothstep(0.3, 0.55, pv)) * 0.18;
          }
        }
        // 砂浜・濡れた砂・海底
        float sandT = smoothstep(1.7, 0.9, wp.y + (n2.g - 0.5) * 1.1);
        col = mix(col, uSand * (0.9 + n3.r * 0.18), sandT * (1.0 - rockT * 0.6));
        col = mix(col, uSand * 0.62, smoothstep(0.5, 0.12, wp.y) * (1.0 - rockT * 0.6));
        col = mix(col, uSeabed, smoothstep(-0.3, -1.6, wp.y));
        // 谷の暗さ
        col *= vColor.r;
        col = mix(col, vec3(0.80, 0.83, 0.88), uSnow * smoothstep(0.45, 0.85, ny));
        diffuseColor.rgb *= col;
      }`);
  };
  m.customProgramCacheKey = () => 'terrain';
  terrainMats.set(key, m);
  return m;
}

// ---- 木々・草・磯の岩 ----
// 木の下の方ほど暗く（葉の重なりの陰）、上ほど明るくする
function shadeByHeight(g, top, low = 0.62, high = 1.12) {
  const p = g.attributes.position, c = g.attributes.color;
  for (let i = 0; i < p.count; i++) {
    const k = low + (high - low) * clamp(p.getY(i) / top, 0, 1);
    c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k);
  }
  return g;
}

// 島の黒松：少し曲がった幹と、笠のように平たく広がる枝葉の段
function pineGeometry() {
  const b = new Builder();
  const ico = () => new THREE.IcosahedronGeometry(1, 0);
  b.cyl(0.17, 0.27, 3.0, 6, '#5a4632', 0.05, 1.5, 0, 0, 0, 0.06);
  b.cyl(0.12, 0.17, 2.6, 6, '#5e4a35', 0.28, 4.1, 0.05, 0, 0, -0.16);
  b.cyl(0.05, 0.08, 1.9, 4, '#5e4a35', 0.85, 3.7, 0.1, 0, 0, -1.05);
  b.cyl(0.05, 0.08, 1.6, 4, '#5e4a35', -0.5, 4.5, -0.2, 0.4, 0, 0.95);
  b.geo(ico(), '#2d4f2e', 1.55, 3.95, 0.2, 0, 0.3, 0, 1.35, 0.42, 1.1);
  b.geo(ico(), '#305531', -1.05, 4.8, -0.35, 0, 1.1, 0, 1.2, 0.4, 1.05);
  b.geo(ico(), '#33592f', 0.45, 5.35, 0.25, 0, 0.6, 0, 1.55, 0.45, 1.3);
  b.geo(ico(), '#3a6334', 0.5, 6.15, -0.1, 0, 2.0, 0, 1.05, 0.42, 0.95);
  b.geo(ico(), '#2f5230', -0.2, 4.35, 0.95, 0, 2.6, 0, 0.9, 0.35, 0.8);
  return shadeByHeight(b.merged(), 6.6, 0.55, 1.15);
}

// 照葉樹（シイ・タブ）：丸くこんもりした樹冠
function broadGeometry() {
  const b = new Builder();
  const ico = (r) => new THREE.IcosahedronGeometry(r, 0);
  b.cyl(0.14, 0.24, 2.6, 6, '#5b4a37', 0, 1.3, 0);
  b.cyl(0.06, 0.09, 1.4, 4, '#5b4a37', 0.45, 2.6, 0.1, 0, 0, -0.7);
  b.geo(ico(1.6), '#43663a', 0, 3.5, 0, 0, 0, 0, 1.05, 0.82, 1.0);
  b.geo(ico(1.2), '#4f743e', 0.95, 3.9, 0.45, 0.4, 0.3, 0);
  b.geo(ico(1.1), '#3c5f34', -0.85, 3.25, -0.5, 0.2, 0.8, 0);
  b.geo(ico(0.95), '#557b42', 0.1, 4.55, -0.3, 0.9, 0.2, 0.4);
  b.geo(ico(0.85), '#46693a', -0.3, 3.0, 0.95, 0.5, 1.4, 0);
  return shadeByHeight(b.merged(), 5.2, 0.6, 1.12);
}

// 草むら（細い葉を放射状に 5 枚）
function grassGeometry() {
  const pos = [], col = [];
  const base = new THREE.Color('#3e5a2a'), tip = new THREE.Color('#9fb15a');
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + k * 0.4, lean = 0.12 + (k % 2) * 0.1, h = 0.32 + (k % 3) * 0.1;
    const cx = Math.cos(a), cz = Math.sin(a), px = -cz * 0.035, pz = cx * 0.035;
    pos.push(px, 0, pz, -px, 0, -pz, cx * lean, h, cz * lean);
    col.push(base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  // 葉は上向きの法線にして、裏表で明るさが変わらないようにする
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}

function rockGeometry(seed) {
  const g = displaceShared(new THREE.IcosahedronGeometry(1, 1), seed, (x, y, z, rnd) => {
    const s = 0.75 + rnd() * 0.45;
    return [x * s, y * s * 0.7, z * s];
  });
  const b = new Builder();
  b.geo(g, '#7a746a');
  return shadeByHeight(b.merged(), 0.9, 0.7, 1.1);
}

let _pineGeo, _broadGeo, _grassGeo, _rockGeo;

// 低い灌木（眺めを遮らない高さ）を指定の場所に並べる
let _shrubGeo;
export function makeShrubs(terrain, pts, seed = 5) {
  if (!_shrubGeo) {
    const b = new Builder();
    b.geo(new THREE.IcosahedronGeometry(0.7, 0), '#4d6b38', 0, 0.35, 0, 0, 0, 0, 1.2, 0.7, 1.1);
    b.geo(new THREE.IcosahedronGeometry(0.5, 0), '#5c7a40', 0.5, 0.45, 0.2, 0, 0.7, 0, 1, 0.8, 1);
    b.geo(new THREE.IcosahedronGeometry(0.45, 0), '#44613a', -0.45, 0.3, -0.25, 0, 1.3, 0, 1, 0.7, 1);
    _shrubGeo = shadeByHeight(b.merged(), 0.9, 0.6, 1.15);
  }
  const rnd = mulberry32(seed);
  const im = new THREE.InstancedMesh(_shrubGeo, MAT.tree, pts.length);
  im.userData.sharedGeometry = true;
  im.castShadow = true;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  pts.forEach(([x, z, sc = 1], i) => {
    q.setFromAxisAngle(up, rnd() * 6.28);
    const k = sc * (0.7 + rnd() * 0.6);
    m4.compose(v.set(x, terrain.heightAt(x, z) - 0.1, z), q, s.set(k, k * (0.8 + rnd() * 0.4), k));
    im.setMatrixAt(i, m4);
  });
  im.instanceMatrix.needsUpdate = true;
  im.computeBoundingSphere();
  return im;
}

// 単体の木（景色の額縁などに）
export function makeTree(kind = 'pine', scale = 1) {
  _pineGeo ??= pineGeometry();
  _broadGeo ??= broadGeometry();
  const m = new THREE.Mesh(kind === 'pine' ? _pineGeo : _broadGeo, MAT.tree);
  m.userData.sharedGeometry = true;
  m.scale.setScalar(scale);
  m.castShadow = true;
  return m;
}

export function scatterTrees(terrain, opts) {
  const o = Object.assign({
    count: 600, seed: 3, minH: 1.8, maxH: 400, maxSlope: 0.9, pineRatio: 0.55,
    area: null, exclude: [], avoidPaths: 3, density: null, scale: [0.8, 1.35],
  }, opts);
  _pineGeo ??= pineGeometry();
  _broadGeo ??= broadGeometry();
  const rnd = mulberry32(o.seed);
  const N = terrain.noise;
  const c = terrain.cfg;
  const area = o.area || { x: c.cx, z: c.cz, w: c.size * 0.95, d: c.size * 0.95 };
  const count = Math.round(o.count * (QUALITY.trees || 1));
  const pines = [], broads = [];
  let tries = 0;
  while (pines.length + broads.length < count && tries < count * 30) {
    tries++;
    const x = area.x + (rnd() - 0.5) * area.w;
    const z = area.z + (rnd() - 0.5) * area.d;
    const h = terrain.heightAt(x, z);
    if (h < o.minH || h > o.maxH) continue;
    if (terrain.slopeAt(x, z) > o.maxSlope) continue;
    const dens = o.density ? o.density(x, z, h) : smoothstep(-0.1, 0.25, N.noise(x * 0.02 + 40, z * 0.02 - 40));
    if (rnd() > dens) continue;
    let bad = false;
    for (const e of o.exclude) if ((x - e.x) ** 2 + (z - e.z) ** 2 < e.r * e.r) { bad = true; break; }
    if (bad) continue;
    if (o.avoidPaths > 0) {
      for (const p of c.paths) if (distToPath(x, z, p.pts) < p.w * 0.5 + o.avoidPaths) { bad = true; break; }
      if (bad) continue;
    }
    const s = lerp(o.scale[0], o.scale[1], rnd());
    // 海風の吹く低い所の松ほど少し傾ける
    const item = { x, y: h - 0.2, z, s, r: rnd() * Math.PI * 2, tint: 0.82 + rnd() * 0.32, lean: h < 12 ? 0.1 : 0.04 };
    (rnd() < o.pineRatio ? pines : broads).push(item);
  }
  const group = new THREE.Group();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const col = new THREE.Color();
  // 区画（3×3）ごとに分け、画面の外の区画は描かない
  const G = 3, cw = area.w / G, cd = area.d / G;
  const cellOf = (t) => Math.min(G - 1, Math.max(0, Math.floor((t.x - (area.x - area.w / 2)) / cw))) + G * Math.min(G - 1, Math.max(0, Math.floor((t.z - (area.z - area.d / 2)) / cd)));
  for (const [all, geo] of [[pines, _pineGeo], [broads, _broadGeo]]) {
    for (let cell = 0; cell < G * G; cell++) {
      const list = all.filter((t) => cellOf(t) === cell);
      if (!list.length) continue;
      const im = new THREE.InstancedMesh(geo, MAT.tree, list.length);
      im.userData.sharedGeometry = true;
      im.userData.sharedMaterial = true;
      im.userData.perf = 'trees'; // 重いときは遠くの区画から省く
      im.castShadow = true;
      list.forEach((t, i) => {
        e.set((rnd() - 0.5) * t.lean * 2, t.r, (rnd() - 0.5) * t.lean * 2);
        q.setFromEuler(e);
        m4.compose(v.set(t.x, t.y, t.z), q, sc.set(t.s, t.s * (0.88 + rnd() * 0.3), t.s));
        im.setMatrixAt(i, m4);
        im.setColorAt(i, col.setRGB(t.tint, t.tint * (0.97 + rnd() * 0.06), t.tint * 0.92));
      });
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      group.add(im);
    }
  }
  return group;
}

// 草むら。areas: [{x, z, r}] の中に count 株（画質設定で増減）
export function scatterGrass(terrain, { count = 2500, seed = 7, areas = [], exclude = [], minH = 1.3, maxSlope = 0.75 } = {}) {
  _grassGeo ??= grassGeometry();
  const n = Math.round(count * (QUALITY.grass || 1));
  if (!n || !areas.length) return new THREE.Group();
  const rnd = mulberry32(seed);
  const N = terrain.noise;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const col = new THREE.Color();
  const items = [];
  let tries = 0;
  while (items.length < n && tries < n * 12) {
    tries++;
    const A = areas[Math.floor(rnd() * areas.length)];
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * A.r;
    const x = A.x + Math.cos(a) * r, z = A.z + Math.sin(a) * r;
    const h = terrain.heightAt(x, z);
    if (h < minH || terrain.slopeAt(x, z) > maxSlope) continue;
    // 群生させる
    if (N.noise(x * 0.12, z * 0.12) < -0.15 + rnd() * 0.2) continue;
    let bad = false;
    for (const e of exclude) if ((x - e.x) ** 2 + (z - e.z) ** 2 < e.r * e.r) { bad = true; break; }
    if (!bad) for (const p of terrain.cfg.paths) if (distToPath(x, z, p.pts) < p.w * 0.5 + 0.4) { bad = true; break; }
    if (bad) continue;
    items.push([x, h, z]);
  }
  const im = new THREE.InstancedMesh(_grassGeo, MAT.grass, Math.max(1, items.length));
  im.userData.sharedGeometry = true;
  im.userData.perf = 'grass'; // 重いときは最初に省く
  items.forEach(([x, y, z], i) => {
    q.setFromAxisAngle(up, rnd() * 6.28);
    const k = 0.55 + rnd() * 0.6;
    m4.compose(v.set(x, y - 0.03, z), q, s.set(k, k * (0.7 + rnd() * 0.5), k));
    im.setMatrixAt(i, m4);
    const t = 0.8 + rnd() * 0.35;
    im.setColorAt(i, col.setRGB(t * (0.95 + rnd() * 0.15), t, t * 0.85));
  });
  im.count = items.length;
  im.instanceMatrix.needsUpdate = true;
  im.computeBoundingSphere();
  return im;
}

// 波打ち際の岩（磯）
export function scatterShoreRocks(terrain, { count = 220, seed = 17, area = null, color = null } = {}) {
  _rockGeo ??= rockGeometry(5);
  const rnd = mulberry32(seed);
  const c = terrain.cfg;
  const ar = area || { x: c.cx, z: c.cz, w: c.size * 0.9, d: c.size * 0.9 };
  const items = [];
  let tries = 0;
  count = Math.round(count * (QUALITY.trees || 1));
  while (items.length < count && tries < count * 60) {
    tries++;
    const x = ar.x + (rnd() - 0.5) * ar.w, z = ar.z + (rnd() - 0.5) * ar.d;
    const h = terrain.heightAt(x, z);
    if (h < -0.8 || h > 1.6) continue;
    if (terrain.slopeAt(x, z) < 0.18 && rnd() < 0.8) continue;
    items.push([x, h, z]);
  }
  const im = new THREE.InstancedMesh(_rockGeo, MAT.vc, Math.max(1, items.length));
  im.userData.sharedGeometry = true;
  im.userData.perf = 'rocks';
  im.castShadow = true;
  im.receiveShadow = true;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
  const base = new THREE.Color(color || '#8a847a'), cc = new THREE.Color();
  items.forEach(([x, h, z], i) => {
    e.set(rnd() * 0.5, rnd() * 6.28, rnd() * 0.5);
    q.setFromEuler(e);
    const k = 0.4 + rnd() * rnd() * 1.8;
    m4.compose(v.set(x, h - k * 0.2, z), q, s.set(k * (0.8 + rnd() * 0.6), k, k * (0.8 + rnd() * 0.6)));
    im.setMatrixAt(i, m4);
    const t = 0.75 + rnd() * 0.35;
    im.setColorAt(i, cc.copy(base).multiplyScalar(t));
  });
  im.count = items.length;
  im.instanceMatrix.needsUpdate = true;
  im.computeBoundingSphere();
  return im;
}

// 画質設定（main.js が起動時に書き換える）
export const QUALITY = { trees: 1, grass: 1, shadows: false };
