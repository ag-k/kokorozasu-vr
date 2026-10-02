// 頂点カラーでまとめて描画回数を減らすジオメトリビルダーと共有マテリアル
// 部品ごとに「質感」（木・黒木・茅・畳・漆喰・石）を指定でき、質感ごとに 1 メッシュへまとめる。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { surfaceTexture } from './textures.js';

export const sharedUniforms = {
  uSnow: { value: 0 },
  uTime: { value: 0 },
  uWind: { value: 1 },
};

// 上向きの面に雪を積もらせる・木や草を風で揺らす、のシェーダー注入
export function addSnow(mat, { wind = 0, faceUp = false } = {}) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSnow = sharedUniforms.uSnow;
    shader.uniforms.uTime = sharedUniforms.uTime;
    shader.uniforms.uWind = sharedUniforms.uWind;
    let vs = 'varying float vUpN;\nuniform float uTime;\nuniform float uWind;\n' + shader.vertexShader.replace(
      '#include <beginnormal_vertex>',
      `#include <beginnormal_vertex>
      {
        mat3 snowM = mat3(modelMatrix);
        #ifdef USE_INSTANCING
          snowM = snowM * mat3(instanceMatrix);
        #endif
        vUpN = normalize(snowM * objectNormal).y;
      }`
    );
    if (wind > 0) {
      vs = vs.replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        vec3 ip = vec3(0.0);
        #ifdef USE_INSTANCING
          ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #endif
        float sway = max(transformed.y - 0.15, 0.0) * uWind * ${wind.toFixed(3)};
        float ph = uTime * 1.3 + ip.x * 0.37 + ip.z * 0.23;
        transformed.x += (sin(ph) + 0.35 * sin(ph * 2.7)) * sway;
        transformed.z += cos(ph * 0.83 + 1.3) * sway * 0.7;
      }`);
    }
    shader.vertexShader = vs;
    let fs = shader.fragmentShader;
    // 草の葉は裏から見ても同じ明るさにする
    if (faceUp) fs = fs.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('gl_FrontFacing ? 1.0 : - 1.0', '1.0'));
    shader.fragmentShader = 'uniform float uSnow;\nvarying float vUpN;\n' + fs.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.80, 0.83, 0.88), uSnow * smoothstep(0.35, 0.8, vUpN));`
    );
  };
  mat.customProgramCacheKey = () => 'snow' + wind + faceUp;
  return mat;
}

export const MAT = {
  vc: addSnow(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })),
  vcSmooth: new THREE.MeshLambertMaterial({ vertexColors: true }),
  vcDouble: addSnow(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide })),
  figure: new THREE.MeshLambertMaterial({ vertexColors: true }),
  tree: addSnow(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), { wind: 0.012 }),
  grass: addSnow(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), { wind: 0.12, faceUp: true }),
};

// 質感つきマテリアル（頂点色 × 灰色の質感テクスチャ）
const texMats = new Map();
function surfaceMaterial(kind, side) {
  const key = kind + side;
  if (!texMats.has(key)) {
    const m = addSnow(new THREE.MeshLambertMaterial({ vertexColors: true, map: surfaceTexture(kind), side }));
    texMats.set(key, m);
  }
  return texMats.get(key);
}
export function isSharedMaterial(m) {
  return Object.values(MAT).includes(m) || [...texMats.values()].includes(m);
}

// 面の向きで投影する UV（1 = 1m）。質感の縮尺をどの面でもそろえる
function boxUV(geom) {
  const p = geom.attributes.position, n = p.count;
  const uv = new Float32Array(n * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e = new THREE.Vector3(), nn = new THREE.Vector3();
  for (let i = 0; i + 2 < n; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    nn.subVectors(b, a).cross(e.subVectors(c, a));
    const ax = Math.abs(nn.x), ay = Math.abs(nn.y), az = Math.abs(nn.z);
    for (let k = 0; k < 3; k++) {
      const v = k === 0 ? a : k === 1 ? b : c;
      let u, w;
      if (ay >= ax && ay >= az) { u = v.x; w = v.z; } else if (ax >= az) { u = v.z; w = v.y; } else { u = v.x; w = v.y; }
      uv[(i + k) * 2] = u; uv[(i + k) * 2 + 1] = w;
    }
  }
  geom.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _c = new THREE.Color();

export class Builder {
  constructor() { this.parts = []; this._kind = 'plain'; }

  // 以降の部品の質感：'plain' | 'wood' | 'bark' | 'thatch' | 'tatami' | 'plaster' | 'stone'
  kind(k) { this._kind = k; return this; }

  geo(g, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    let geom = g.index ? g.toNonIndexed() : g;
    if (geom === g) geom = g.clone();
    for (const k of Object.keys(geom.attributes)) {
      if (k !== 'position' && k !== 'normal') geom.deleteAttribute(k);
    }
    if (!geom.attributes.normal) geom.computeVertexNormals();
    _e.set(rx, ry, rz);
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    geom.applyMatrix4(_m);
    const n = geom.attributes.position.count;
    const arr = new Float32Array(n * 3);
    _c.set(color);
    // 質感テクスチャの分だけ暗くなるので少し明るくしておく
    const k = this._kind === 'plain' ? 1 : 1.2;
    for (let i = 0; i < n; i++) { arr[i * 3] = _c.r * k; arr[i * 3 + 1] = _c.g * k; arr[i * 3 + 2] = _c.b * k; }
    geom.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    if (this._kind !== 'plain') boxUV(geom);
    geom.userData.kind = this._kind;
    this.parts.push(geom);
    g !== geom && g.dispose();
    return this;
  }

  box(w, h, d, color, x, y, z, rx = 0, ry = 0, rz = 0) {
    return this.geo(new THREE.BoxGeometry(w, h, d), color, x, y, z, rx, ry, rz);
  }

  cyl(rt, rb, h, seg, color, x, y, z, rx = 0, ry = 0, rz = 0) {
    return this.geo(new THREE.CylinderGeometry(rt, rb, h, seg, 1), color, x, y, z, rx, ry, rz);
  }

  cone(r, h, seg, color, x, y, z, rx = 0, ry = 0, rz = 0) {
    return this.geo(new THREE.ConeGeometry(r, h, seg, 1), color, x, y, z, rx, ry, rz);
  }

  sphere(r, color, x, y, z, sx = 1, sy = 1, sz = 1, ws = 8, hs = 6) {
    return this.geo(new THREE.SphereGeometry(r, ws, hs), color, x, y, z, 0, 0, 0, sx, sy, sz);
  }

  // 切妻屋根（三角柱）。w: 桁行, d: 梁間, h: 屋根高さ
  gable(w, d, h, color, x, y, z, ry = 0) {
    const hw = w / 2, hd = d / 2;
    const v = [
      // 斜面（手前）
      -hw, 0, hd, hw, 0, hd, hw, h, 0,
      -hw, 0, hd, hw, h, 0, -hw, h, 0,
      // 斜面（奥）
      hw, 0, -hd, -hw, 0, -hd, -hw, h, 0,
      hw, 0, -hd, -hw, h, 0, hw, h, 0,
      // 妻（左右）
      -hw, 0, -hd, -hw, 0, hd, -hw, h, 0,
      hw, 0, hd, hw, 0, -hd, hw, h, 0,
      // 底
      -hw, 0, -hd, hw, 0, -hd, hw, 0, hd,
      -hw, 0, -hd, hw, 0, hd, -hw, 0, hd,
    ];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.computeVertexNormals();
    return this.geo(g, color, x, y, z, 0, ry, 0);
  }

  // 宝形造（四角錐）屋根
  pyramid(w, d, h, color, x, y, z, ry = 0) {
    const g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1);
    g.rotateY(Math.PI / 4);
    return this.geo(g, color, x, y + h / 2, z, 0, ry, 0, w, h, d);
  }

  // 質感を無視して 1 つのジオメトリにまとめる（木や岩などの形だけが要るとき）
  merged() {
    for (const p of this.parts) if (p.attributes.uv) p.deleteAttribute('uv');
    const g = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    g.computeBoundingSphere();
    return g;
  }

  // 質感ごとに 1 メッシュ。質感が 1 種類なら Mesh、複数なら Group を返す
  mesh(mat = MAT.vc) {
    const groups = new Map();
    for (const p of this.parts) {
      const k = p.userData.kind || 'plain';
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(p);
    }
    this.parts = [];
    const meshes = [];
    for (const [k, list] of groups) {
      const g = mergeGeometries(list, false);
      for (const p of list) p.dispose();
      g.computeBoundingSphere();
      meshes.push(new THREE.Mesh(g, k === 'plain' ? mat : surfaceMaterial(k, mat.side)));
    }
    if (meshes.length === 1) return meshes[0];
    const grp = new THREE.Group();
    meshes.forEach((m) => grp.add(m));
    return grp;
  }
}

// 船体ジオメトリ（上が開いた舟）。x 方向が船首。
// 船体の断面（t: 0=船尾, 1=船首）。x, 半幅 w, 深さ dd, 舷の高さ top
export function hullSection(length, beam, depth, { sheer = 0.25, bluntStern = 0.35 } = {}, t) {
  const bowT = Math.max(0, (t - 0.55) / 0.45);
  const sternT = Math.max(0, (0.25 - t) / 0.25);
  const w = beam / 2 * Math.sqrt(Math.max(0, 1 - bowT * bowT)) * (1 - sternT * (1 - bluntStern));
  const dd = depth * (1 - 0.35 * bowT * bowT - 0.2 * sternT);
  const top = sheer * (bowT * bowT * 1.4 + sternT * sternT * 0.6);
  return { x: (t - 0.5) * length, w, dd, top };
}

// 船体の内側の半幅（船体座標の高さ y で）
export function hullHalfWidth(length, beam, depth, opts, t, y) {
  const s = hullSection(length, beam, depth, opts, t);
  const d = (s.top - y) / s.dd;
  if (d <= 0) return s.w;
  if (d >= 1) return 0;
  return s.w * Math.cos(Math.asin(d));
}

// 水面を抜くための船の平面形（船べりの外形）。船首方向に 24 点の半幅。
// 波で水面が上がっても舟の中に海が見えないよう、水線ではなく船べりの幅で抜く
// （外形の内側なので、抜いた所から見えるのは船体の外板だけ）
export function hullWaterline(length, beam, depth, opts, margin = 0.015) {
  const w = [];
  for (let j = 0; j < 24; j++) w.push(Math.max(0, hullSection(length, beam, depth, opts, j / 23).w - margin));
  return { half: length / 2, w };
}

// 船体の形に沿った板（甲板・床板）。y は船体座標の上面の高さ。holes: [[x0, z0, x1, z1]]
export function deckGeometry(length, beam, depth, opts, y, thickness, inset = 0.04, holes = []) {
  const N = 28, right = [], left = [];
  for (let i = 0; i <= N; i++) {
    const t = 0.005 + 0.99 * (i / N);
    const w = Math.max(0, hullHalfWidth(length, beam, depth, opts, t, y - thickness) - inset);
    const x = (t - 0.5) * length;
    right.push([x, w]); left.push([x, -w]);
  }
  const shape = new THREE.Shape();
  shape.moveTo(right[0][0], right[0][1]);
  for (const p of right) shape.lineTo(p[0], p[1]);
  for (const p of left.reverse()) shape.lineTo(p[0], p[1]);
  shape.closePath();
  for (const [x0, z0, x1, z1] of holes) {
    const h = new THREE.Path();
    h.moveTo(x0, z0); h.lineTo(x0, z1); h.lineTo(x1, z1); h.lineTo(x1, z0); h.closePath();
    shape.holes.push(h);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 1 });
  g.rotateX(Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}

// 舷の上端に沿う縁木
export function hullRails(b, length, beam, depth, opts, offY, color, size = 0.07, segL = 12) {
  const up = new THREE.Vector3(1, 0, 0), dir = new THREE.Vector3(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let i = 0; i < segL; i++) {
    const a = hullSection(length, beam, depth, opts, i / segL), c = hullSection(length, beam, depth, opts, (i + 1) / segL);
    for (const s of [1, -1]) {
      const p0 = new THREE.Vector3(a.x, a.top + offY, s * a.w), p1 = new THREE.Vector3(c.x, c.top + offY, s * (i + 1 === segL ? 0 : c.w));
      dir.subVectors(p1, p0);
      const L = dir.length();
      q.setFromUnitVectors(up, dir.normalize());
      e.setFromQuaternion(q);
      b.geo(new THREE.BoxGeometry(L + size, size, size), color, (p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2, e.x, e.y, e.z);
    }
  }
}

export function hullGeometry(length, beam, depth, { sheer = 0.25, segL = 10, segD = 4, bluntStern = 0.35 } = {}) {
  const pos = [];
  const sec = [];
  for (let i = 0; i <= segL; i++) {
    const s = hullSection(length, beam, depth, { sheer, bluntStern }, i / segL);
    // 船首は左右の舷をぴったり合わせる（隙間ができないように）
    const w = i === segL ? 0 : Math.max(s.w, 0.02);
    const ring = [];
    for (let j = 0; j <= segD; j++) {
      const a = (j / segD) * Math.PI / 2;
      ring.push([s.x, s.top - s.dd * Math.sin(a), w * Math.cos(a)]);
    }
    sec.push(ring);
  }
  const quad = (a, b, c, d) => { pos.push(...a, ...b, ...c, ...a, ...c, ...d); };
  for (let i = 0; i < segL; i++) {
    for (let j = 0; j < segD; j++) {
      const a = sec[i][j], b = sec[i + 1][j], c = sec[i + 1][j + 1], d = sec[i][j + 1];
      // 右舷
      quad(a, d, c, b);
      // 左舷（z 反転）
      const f = (p) => [p[0], p[1], -p[2]];
      quad(f(a), f(b), f(c), f(d));
    }
  }
  // 船尾の板
  const s0 = sec[0];
  for (let j = 0; j < segD; j++) {
    const a = s0[j], b = s0[j + 1];
    pos.push(a[0], a[1], a[2], b[0], b[1], b[2], b[0], b[1], -b[2]);
    pos.push(a[0], a[1], a[2], b[0], b[1], -b[2], a[0], a[1], -a[2]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry && !o.userData.sharedGeometry) o.geometry.dispose();
    if (o.material && !o.userData.sharedMaterial) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (isSharedMaterial(m)) continue;
        if (m.map && !m.map.userData?.shared) m.map.dispose();
        m.dispose();
      }
    }
  });
}
