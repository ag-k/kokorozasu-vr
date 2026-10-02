// 空・海・光・霧・雪など環境表現。時間帯プリセット間を補間する。
import * as THREE from 'three';
import { sharedUniforms } from './builder.js';
import { noiseTexture, waterNormalTexture, cloudTexture } from './textures.js';
import { QUALITY } from './terrain.js';
import { clamp, lerp } from './util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
const _hp = new THREE.Vector3();
const _hd = new THREE.Vector3();

// 時間帯プリセット
export const PRESETS = {
  dawnMist: {
    top: '#6f8198', horizon: '#c9c1bd', bottom: '#5d6f7c',
    sunDir: V(0.3, 0.06, -1), sunColor: '#ffd7b0', sunGlow: 0.5, sunDisk: 0.0,
    moonDir: V(-0.6, 0.4, 0.5), moon: 0.0, stars: 0.0,
    hemiSky: '#b9c3cf', hemiGround: '#4e5b60', hemi: 2.2,
    light: '#ffe2c4', lightDir: V(0.3, 0.5, -1), lightI: 1.2,
    fog: '#c6bfbb', fogNear: 30, fogFar: 520,
    waterDeep: '#324c5a', waterShallow: '#5c7a86', waterSpec: 0.4,
  },
  dawnClear: {
    top: '#6d86a6', horizon: '#e2cdbd', bottom: '#5d6f7c',
    sunDir: V(0.3, 0.08, -1), sunColor: '#ffd0a0', sunGlow: 0.8, sunDisk: 1.0,
    moonDir: V(-0.6, 0.4, 0.5), moon: 0.0, stars: 0.0,
    hemiSky: '#c7cfd8', hemiGround: '#4e5b60', hemi: 2.2,
    light: '#ffdcb8', lightDir: V(0.3, 0.5, -1), lightI: 1.6,
    fog: '#d3c6bf', fogNear: 150, fogFar: 2800,
    waterDeep: '#2f4b5c', waterShallow: '#5c7a86', waterSpec: 0.9,
  },
  day: {
    top: '#3b74b8', horizon: '#c7d8e2', bottom: '#5d7a88',
    sunDir: V(0.4, 0.75, -0.5), sunColor: '#fff4dc', sunGlow: 0.35, sunDisk: 1.0,
    moonDir: V(-0.6, 0.4, 0.5), moon: 0.0, stars: 0.0,
    hemiSky: '#cfe0f0', hemiGround: '#6b6a55', hemi: 2.0,
    light: '#fff1d8', lightDir: V(0.4, 0.75, -0.5), lightI: 2.6,
    fog: '#bfd0da', fogNear: 180, fogFar: 2200,
    waterDeep: '#1f4b66', waterShallow: '#3e7a8e', waterSpec: 1.0,
  },
  afternoon: {
    top: '#4174b0', horizon: '#e2d6c0', bottom: '#5d7280',
    sunDir: V(0.7, 0.35, -0.6), sunColor: '#ffe3b8', sunGlow: 0.5, sunDisk: 1.0,
    moonDir: V(-0.6, 0.4, 0.5), moon: 0.0, stars: 0.0,
    hemiSky: '#d9dfe6', hemiGround: '#6f6650', hemi: 1.9,
    light: '#ffe6c0', lightDir: V(0.7, 0.45, -0.6), lightI: 2.5,
    fog: '#d3d0c6', fogNear: 180, fogFar: 2100,
    waterDeep: '#244a60', waterShallow: '#4b7d88', waterSpec: 1.0,
  },
  sunset: {
    top: '#3f4f7a', horizon: '#f0a36a', bottom: '#3d4450',
    sunDir: V(0.8, 0.06, -0.6), sunColor: '#ffb070', sunGlow: 1.0, sunDisk: 1.0,
    moonDir: V(-0.6, 0.4, 0.5), moon: 0.0, stars: 0.05,
    hemiSky: '#c9a894', hemiGround: '#4a3f3c', hemi: 1.6,
    light: '#ffa860', lightDir: V(0.8, 0.2, -0.6), lightI: 2.0,
    fog: '#c99a7c', fogNear: 80, fogFar: 1200,
    waterDeep: '#2b3346', waterShallow: '#5d5a66', waterSpec: 1.2,
  },
  winter: {
    top: '#8c97a3', horizon: '#c8cbcd', bottom: '#6e7880',
    sunDir: V(0.4, 0.4, -0.6), sunColor: '#e8ecf0', sunGlow: 0.15, sunDisk: 0.0,
    moonDir: V(-0.6, 0.4, 0.5), moon: 0.0, stars: 0.0,
    hemiSky: '#d6dde4', hemiGround: '#7d8288', hemi: 2.3,
    light: '#e6ecf2', lightDir: V(0.4, 0.6, -0.6), lightI: 1.1,
    fog: '#bfc4c8', fogNear: 20, fogFar: 380,
    waterDeep: '#34454f', waterShallow: '#56676f', waterSpec: 0.2,
  },
  spring: {
    top: '#4d80bd', horizon: '#e7e2d6', bottom: '#63808c',
    sunDir: V(-0.3, 0.6, -0.7), sunColor: '#fff4de', sunGlow: 0.35, sunDisk: 1.0,
    moonDir: V(-0.6, 0.4, 0.5), moon: 0.0, stars: 0.0,
    hemiSky: '#dbe6ee', hemiGround: '#6b6c55', hemi: 2.0,
    light: '#fff1dc', lightDir: V(-0.3, 0.7, -0.7), lightI: 2.4,
    fog: '#d9dcd6', fogNear: 120, fogFar: 1400,
    waterDeep: '#22506a', waterShallow: '#437f8d', waterSpec: 0.9,
  },
  night: {
    top: '#050a18', horizon: '#1a2638', bottom: '#060a12',
    sunDir: V(0, -1, 0), sunColor: '#000000', sunGlow: 0.0, sunDisk: 0.0,
    moonDir: V(0.75, 0.12, -0.65), moon: 1.0, stars: 1.0,
    hemiSky: '#4a6490', hemiGround: '#1a1f2a', hemi: 1.1,
    light: '#8ea6d6', lightDir: V(0.75, 0.5, -0.65), lightI: 0.45,
    fog: '#0d1624', fogNear: 25, fogFar: 520,
    waterDeep: '#060d18', waterShallow: '#10202e', waterSpec: 0.5,
  },
  predawn: {
    top: '#101a33', horizon: '#6a5a6c', bottom: '#0b111c',
    sunDir: V(0.9, -0.05, -0.4), sunColor: '#e08a6a', sunGlow: 0.6, sunDisk: 0.0,
    moonDir: V(0.6, 0.35, -0.7), moon: 0.8, stars: 0.5,
    hemiSky: '#5f6f96', hemiGround: '#1f2230', hemi: 1.2,
    light: '#b7a6c8', lightDir: V(0.8, 0.4, -0.4), lightI: 0.5,
    fog: '#2b2e40', fogNear: 30, fogFar: 700,
    waterDeep: '#0b1422', waterShallow: '#20283a', waterSpec: 0.6,
  },
  sunrise: {
    top: '#4b6c9e', horizon: '#f6b980', bottom: '#475566',
    sunDir: V(0.9, 0.05, -0.4), sunColor: '#ffc07a', sunGlow: 1.0, sunDisk: 1.0,
    moonDir: V(0.6, 0.35, -0.7), moon: 0.15, stars: 0.0,
    hemiSky: '#d8c0ac', hemiGround: '#4b4640', hemi: 1.8,
    light: '#ffc58a', lightDir: V(0.9, 0.25, -0.4), lightI: 2.2,
    fog: '#e0b99a', fogNear: 60, fogFar: 1400,
    waterDeep: '#2a3c52', waterShallow: '#6b6a70', waterSpec: 1.3,
  },
  morning: {
    top: '#437fc2', horizon: '#e6e2d4', bottom: '#5e7d8c',
    sunDir: V(0.6, 0.35, -0.6), sunColor: '#fff0d6', sunGlow: 0.5, sunDisk: 1.0,
    moonDir: V(0.6, 0.35, -0.7), moon: 0.0, stars: 0.0,
    hemiSky: '#d8e4ee', hemiGround: '#6c6852', hemi: 2.0,
    light: '#fff0d8', lightDir: V(0.6, 0.5, -0.6), lightI: 2.5,
    fog: '#d4dcdc', fogNear: 150, fogFar: 2200,
    waterDeep: '#1f4d68', waterShallow: '#3f7c8c', waterSpec: 1.0,
  },
};

// 雲の量と色（時間帯ごと）
const CLOUDS = {
  dawnMist: [0.35, '#bdb8b8'], dawnClear: [0.55, '#f1d6c6'], day: [0.7, '#ffffff'], afternoon: [0.65, '#fff4e6'],
  sunset: [0.8, '#f7a878'], winter: [0.95, '#a9afb6'], spring: [0.55, '#ffffff'], night: [0.3, '#2c3548'],
  predawn: [0.45, '#6d607a'], sunrise: [0.75, '#ffc79a'], morning: [0.55, '#ffffff'],
};
for (const [k, [a, c]] of Object.entries(CLOUDS)) Object.assign(PRESETS[k], { clouds: a, cloud: c });

const COLOR_KEYS = ['top', 'horizon', 'bottom', 'sunColor', 'hemiSky', 'hemiGround', 'light', 'fog', 'waterDeep', 'waterShallow', 'cloud'];
const VEC_KEYS = ['sunDir', 'moonDir', 'lightDir'];
const NUM_KEYS = ['sunGlow', 'sunDisk', 'moon', 'stars', 'hemi', 'lightI', 'fogNear', 'fogFar', 'waterSpec', 'clouds'];

function toState(p) {
  const s = {};
  for (const k of COLOR_KEYS) s[k] = new THREE.Color(p[k]);
  for (const k of VEC_KEYS) s[k] = p[k].clone();
  for (const k of NUM_KEYS) s[k] = p[k];
  return s;
}

const skyVert = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const skyFrag = /* glsl */`
uniform vec3 uTop, uHorizon, uBottom, uSunDir, uSunColor, uMoonDir;
uniform float uSunGlow, uSunDisk, uMoon, uStars, uTime;
varying vec3 vDir;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = h > 0.0 ? mix(uHorizon, uTop, pow(smoothstep(0.0, 1.0, h), 0.55)) : mix(uHorizon, uBottom, smoothstep(0.0, 0.15, -h));
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(sd, 6.0) * 0.22 + pow(sd, 180.0) * 0.45) * uSunGlow;
  col += uSunColor * smoothstep(0.99984, 0.99990, sd) * 1.6 * uSunDisk;
  // 月（細い有明の月）
  float md = dot(d, uMoonDir);
  vec3 side = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)));
  float lit = smoothstep(0.99955, 0.99975, md);
  float cut = smoothstep(0.99955, 0.99975, dot(d, normalize(uMoonDir + side * 0.012 + vec3(0.0, 0.004, 0.0))));
  col += vec3(1.0, 0.95, 0.82) * clamp(lit - cut * 0.92, 0.0, 1.0) * 1.6 * uMoon;
  col += vec3(0.5, 0.55, 0.7) * pow(max(md, 0.0), 180.0) * 0.12 * uMoon;
  // 星
  if (uStars > 0.0 && h > 0.0) {
    vec3 p = d * 140.0;
    vec3 c = floor(p);
    float r = hash(c);
    if (r > 0.965) {
      vec3 ctr = c + 0.5 + (vec3(hash(c + 1.7), hash(c + 3.1), hash(c + 5.3)) - 0.5) * 0.5;
      float dist = length(p - ctr);
      float tw = 0.65 + 0.35 * sin(uTime * (1.5 + r * 3.0) + r * 60.0);
      float b = smoothstep(0.26, 0.0, dist) * tw * (r - 0.965) / 0.035;
      col += vec3(0.85, 0.9, 1.0) * b * uStars * smoothstep(0.0, 0.25, h) * 1.6;
    }
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const waterVert = /* glsl */`
uniform float uTime, uAmp;
varying vec3 vWorld;
float waveH(vec2 p, float t) {
  float h = 0.0;
  h += sin(dot(p, vec2(0.13, 0.05)) + t * 0.9) * 0.55;
  h += sin(dot(p, vec2(-0.07, 0.17)) + t * 1.1) * 0.35;
  h += sin(dot(p, vec2(0.27, -0.21)) + t * 1.7) * 0.18;
  return h * uAmp;
}
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  w.y += waveH(w.xz, uTime);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const waterFrag = /* glsl */`
uniform float uTime, uAmp, uSpec, uFogNear, uFogFar, uMoon, uLight, uHasShore;
uniform vec3 uDeep, uShallow, uSkyTop, uHorizon, uSunDir, uSunColor, uFogColor, uMoonDir;
// 舟の中に海面が見えないよう、船体の水線の形で水面を抜く（最大 8 艘）
#define NH 8
#define NS 24
uniform vec4 uHoleA[NH];   // x, z, cos(向き), sin(向き)（CPU で計算しておく）
uniform int uHoleN;        // 使っている数
uniform float uHoleL[NH];  // 船の半長
uniform vec4 uHoleW[NH * NS / 4]; // 船首方向に等間隔に並べた水線の半幅
uniform sampler2D uNormalMap, uNoise, uShore;
uniform vec4 uShoreRect;
varying vec3 vWorld;
float holeW(int k) { return uHoleW[k / 4][k % 4]; }
bool inHole(int i) {
  vec4 h = uHoleA[i];
  vec2 d = vWorld.xz - h.xy;
  if (dot(d, d) > uHoleL[i] * uHoleL[i]) return false; // 船から遠い所はすぐ抜ける
  vec2 l = vec2(d.x * h.z - d.y * h.w, d.x * h.w + d.y * h.z);
  float t = (l.x / uHoleL[i] * 0.5 + 0.5) * float(NS - 1);
  if (t < 0.0 || t > float(NS - 1)) return false;
  int j = int(floor(t));
  int j2 = min(j + 1, NS - 1);
  float w = mix(holeW(i * NS + j), holeW(i * NS + j2), t - float(j));
  return abs(l.y) < w;
}
vec2 waveD(vec2 p, float t) {
  vec2 g = vec2(0.0);
  g += vec2(0.13, 0.05) * cos(dot(p, vec2(0.13, 0.05)) + t * 0.9) * 0.55;
  g += vec2(-0.07, 0.17) * cos(dot(p, vec2(-0.07, 0.17)) + t * 1.1) * 0.35;
  g += vec2(0.27, -0.21) * cos(dot(p, vec2(0.27, -0.21)) + t * 1.7) * 0.18;
  return g * uAmp;
}
void main() {
  for (int i = 0; i < NH; i++) { if (i >= uHoleN) break; if (inHole(i)) discard; }
  vec3 v = cameraPosition - vWorld;
  float dist = length(v);
  v /= dist;
  // うねり（頂点と同じ波）＋ さざ波（法線テクスチャを 2 方向に流す）
  vec2 g = waveD(vWorld.xz, uTime);
  vec3 d1 = texture2D(uNormalMap, vWorld.xz * 0.055 + vec2(uTime * 0.011, uTime * 0.007)).xyz * 2.0 - 1.0;
  vec3 d2 = texture2D(uNormalMap, vWorld.xz * 0.16 + vec2(-uTime * 0.019, uTime * 0.013)).xyz * 2.0 - 1.0;
  float detail = 0.32 * (1.0 - smoothstep(60.0, 400.0, dist)) + 0.1;
  vec3 n = normalize(vec3(-g.x + (d1.x + d2.x * 0.7) * detail, 1.0, -g.y + (d1.y + d2.y * 0.7) * detail));

  // 岸からの距離（地形から作ったテクスチャ）
  float shoreD = 1.0e4;
  if (uHasShore > 0.5) {
    vec2 suv = (vWorld.xz - uShoreRect.xy) / uShoreRect.z;
    if (suv.x > 0.0 && suv.y > 0.0 && suv.x < 1.0 && suv.y < 1.0) shoreD = texture2D(uShore, suv).r * uShoreRect.w;
  }
  float shallow = 1.0 - smoothstep(1.0, 40.0, shoreD);

  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  vec3 r = reflect(-v, n);
  vec3 sky = mix(uHorizon, uSkyTop, pow(clamp(r.y, 0.0, 1.0), 0.55));
  vec3 base = mix(uDeep, uShallow, 0.18 + (1.0 - n.y) * 1.5);
  // 浅瀬は明るい青緑に
  base = mix(base, uShallow * vec3(0.95, 1.25, 1.2) + vec3(0.0, 0.025, 0.02) * uLight, shallow * 0.8);
  vec3 col = mix(base, sky * 0.92, clamp(fres * 0.8, 0.0, 1.0));
  float s = pow(max(dot(r, uSunDir), 0.0), 220.0);
  col += uSunColor * s * uSpec * 2.2;
  col += uSunColor * pow(max(dot(r, uSunDir), 0.0), 18.0) * uSpec * 0.06;
  float ms = pow(max(dot(r, uMoonDir), 0.0), 140.0);
  col += vec3(0.7, 0.75, 0.85) * ms * uMoon * 1.0;

  // 波打ち際の白波（寄せては返す帯）
  float fn = texture2D(uNoise, vWorld.xz * 0.09 + vec2(uTime * 0.02, 0.0)).g;
  float fn2 = texture2D(uNoise, vWorld.xz * 0.35 - vec2(0.0, uTime * 0.03)).b;
  float edge = smoothstep(2.6, 0.2, shoreD + (fn - 0.5) * 3.0);
  float band = smoothstep(0.55, 0.95, sin(shoreD * 0.8 - uTime * 1.3 + fn * 4.0) * 0.5 + 0.5) * smoothstep(10.0, 1.5, shoreD);
  float foam = clamp(edge * 0.9 + band * 0.45, 0.0, 1.0) * smoothstep(0.35, 0.6, fn2 + edge * 0.3);
  col = mix(col, vec3(0.9, 0.94, 0.95) * uLight, foam * 0.85);

  float f = smoothstep(uFogNear, uFogFar, dist);
  col = mix(col, uFogColor, f);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const snowVert = /* glsl */`
uniform float uTime, uSize;
uniform vec3 uCenter;
attribute float aSeed;
varying float vA;
void main() {
  vec3 p = position;
  float fall = mod(p.y - uTime * (0.8 + aSeed * 0.6), 24.0);
  vec3 w = vec3(p.x + sin(uTime * 0.7 + aSeed * 30.0) * 0.6, fall - 6.0, p.z + cos(uTime * 0.5 + aSeed * 20.0) * 0.6);
  // カメラ周辺のボックスで繰り返す
  w.xz = uCenter.xz + mod(w.xz - uCenter.xz + 20.0, 40.0) - 20.0;
  w.y += uCenter.y;
  vec4 mv = viewMatrix * vec4(w, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * (0.6 + aSeed * 0.8) / max(-mv.z, 0.5);
  vA = clamp(1.0 - (-mv.z) / 22.0, 0.0, 1.0);
}`;

const snowFrag = /* glsl */`
uniform float uOpacity;
varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  gl_FragColor = vec4(vec3(0.95), (1.0 - d * 2.0) * uOpacity * vA);
}`;

export class Environment {
  constructor(game) {
    this.game = game;
    const scene = game.scene;
    this.state = toState(PRESETS.day);
    this.from = null; this.to = null; this.t = 1; this.dur = 0;

    this.skyUniforms = {
      uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uBottom: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3() }, uSunColor: { value: new THREE.Color() },
      uMoonDir: { value: new THREE.Vector3() },
      uSunGlow: { value: 0 }, uSunDisk: { value: 0 }, uMoon: { value: 0 }, uStars: { value: 0 },
      uTime: sharedUniforms.uTime,
    };
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(1500, 32, 16),
      new THREE.ShaderMaterial({ uniforms: this.skyUniforms, vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false, fog: false })
    );
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    scene.add(this.sky);

    // 雲（空の内側に貼るドーム）
    this.cloudMat = new THREE.MeshBasicMaterial({ map: cloudTexture(), transparent: true, depthWrite: false, fog: false, side: THREE.BackSide });
    this.clouds = new THREE.Mesh(new THREE.SphereGeometry(1400, 48, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), this.cloudMat);
    this.clouds.frustumCulled = false;
    this.clouds.renderOrder = -9;
    scene.add(this.clouds);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    // 影（高画質のときだけ）：プレイヤーのまわり ±30m を追いかける
    const sc = this.sun.shadow.camera;
    sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 400;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.hemi, this.sun, this.sun.target);

    // 灯り用の点光源（常に 2 つ確保してシェーダー再コンパイルを避ける）
    this.lamps = [0, 1].map(() => {
      const l = new THREE.PointLight(0xffaa55, 0, 14, 1.6);
      scene.add(l);
      return l;
    });

    scene.fog = new THREE.Fog(0xffffff, 100, 1000);

    this.waterUniforms = {
      uTime: sharedUniforms.uTime, uAmp: { value: 0.18 }, uSpec: { value: 1 },
      uFogNear: { value: 100 }, uFogFar: { value: 1000 }, uMoon: { value: 0 },
      uDeep: { value: new THREE.Color() }, uShallow: { value: new THREE.Color() },
      uSkyTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3() }, uSunColor: { value: new THREE.Color() },
      uFogColor: { value: new THREE.Color() }, uMoonDir: { value: new THREE.Vector3() },
      uHoleA: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) },
      uHoleL: { value: new Array(8).fill(1) },
      uHoleN: { value: 0 },
      uHoleW: { value: Array.from({ length: 8 * 24 / 4 }, () => new THREE.Vector4()) },
      uLight: { value: 1 }, uHasShore: { value: 0 },
      uNormalMap: { value: waterNormalTexture() }, uNoise: { value: noiseTexture() },
      uShore: { value: null }, uShoreRect: { value: new THREE.Vector4(0, 0, 1, 60) },
    };
    this.holes = [];
    const wmat = new THREE.ShaderMaterial({ uniforms: this.waterUniforms, vertexShader: waterVert, fragmentShader: waterFrag, fog: false });
    const wgeo = new THREE.PlaneGeometry(600, 600, 120, 120);
    wgeo.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(wgeo, wmat);
    this.water.frustumCulled = false;
    this.waterCell = 5;
    const fgeo = new THREE.RingGeometry(290, 3000, 48, 1);
    fgeo.rotateX(-Math.PI / 2);
    this.waterFar = new THREE.Mesh(fgeo, wmat);
    this.waterFar.frustumCulled = false;
    this.waterFar.position.y = -0.4;
    scene.add(this.water, this.waterFar);

    // 雪
    const N = 1600;
    const sp = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      sp[i * 3] = (Math.random() - 0.5) * 40; sp[i * 3 + 1] = Math.random() * 24; sp[i * 3 + 2] = (Math.random() - 0.5) * 40;
      seed[i] = Math.random();
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    sg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.snowUniforms = { uTime: sharedUniforms.uTime, uSize: { value: 70 }, uCenter: { value: new THREE.Vector3() }, uOpacity: { value: 0 } };
    this.snow = new THREE.Points(sg, new THREE.ShaderMaterial({
      uniforms: this.snowUniforms, vertexShader: snowVert, fragmentShader: snowFrag, transparent: true, depthWrite: false,
    }));
    this.snow.frustumCulled = false;
    this.snow.visible = false;
    scene.add(this.snow);
    this.snowTarget = 0;
    this.groundSnowTarget = 0;

    this.apply();
  }

  set(name, duration = 0) {
    const p = PRESETS[name];
    if (!p) throw new Error('unknown preset ' + name);
    const target = toState(p);
    if (duration <= 0) { this.state = target; this.to = null; this.apply(); return Promise.resolve(); }
    this.from = this.cloneState(this.state);
    this.to = target; this.t = 0; this.dur = duration;
    return this.game.wait(duration);
  }

  cloneState(s) {
    const o = {};
    for (const k of COLOR_KEYS) o[k] = s[k].clone();
    for (const k of VEC_KEYS) o[k] = s[k].clone();
    for (const k of NUM_KEYS) o[k] = s[k];
    return o;
  }

  setSnow(falling, ground, dur = 3) {
    this.snowTarget = falling; this.groundSnowTarget = ground; this.snowRate = 1 / Math.max(dur, 0.01);
  }

  setWaves(amp) { this.waterUniforms.uAmp.value = amp; }

  apply() {
    const s = this.state, u = this.skyUniforms;
    u.uTop.value.copy(s.top); u.uHorizon.value.copy(s.horizon); u.uBottom.value.copy(s.bottom);
    u.uSunDir.value.copy(s.sunDir).normalize(); u.uSunColor.value.copy(s.sunColor);
    u.uMoonDir.value.copy(s.moonDir).normalize();
    u.uSunGlow.value = s.sunGlow; u.uSunDisk.value = s.sunDisk; u.uMoon.value = s.moon; u.uStars.value = s.stars;
    this.hemi.color.copy(s.hemiSky); this.hemi.groundColor.copy(s.hemiGround); this.hemi.intensity = s.hemi;
    this.sun.color.copy(s.light); this.sun.intensity = s.lightI;
    this.sun.position.copy(s.lightDir).multiplyScalar(100);
    this.game.scene.fog.color.copy(s.fog); this.game.scene.fog.near = s.fogNear; this.game.scene.fog.far = s.fogFar;
    const w = this.waterUniforms;
    w.uDeep.value.copy(s.waterDeep); w.uShallow.value.copy(s.waterShallow); w.uSpec.value = s.waterSpec;
    w.uSkyTop.value.copy(s.top); w.uHorizon.value.copy(s.horizon);
    w.uSunDir.value.copy(s.sunDir).normalize(); w.uSunColor.value.copy(s.sunColor).multiplyScalar(s.sunDisk * 0.8 + s.sunGlow * 0.2);
    w.uMoonDir.value.copy(s.moonDir).normalize(); w.uMoon.value = s.moon;
    w.uFogColor.value.copy(s.fog); w.uFogNear.value = s.fogNear; w.uFogFar.value = s.fogFar;
    w.uLight.value = Math.min(1, Math.max(0.12, (s.hemi * 0.5 + s.lightI) / 3.6));
    this.cloudMat.color.copy(s.cloud);
    this.cloudMat.opacity = s.clouds;
  }

  update(dt, camPos) {
    if (this.to) {
      this.t = Math.min(1, this.t + dt / this.dur);
      const k = this.t * this.t * (3 - 2 * this.t);
      const s = this.state, a = this.from, b = this.to;
      for (const key of COLOR_KEYS) s[key].copy(a[key]).lerp(b[key], k);
      for (const key of VEC_KEYS) s[key].copy(a[key]).lerp(b[key], k).normalize();
      for (const key of NUM_KEYS) s[key] = lerp(a[key], b[key], k);
      this.apply();
      if (this.t >= 1) this.to = null;
    }
    this.sky.position.copy(camPos);
    this.clouds.position.copy(camPos);
    this.clouds.rotation.y += dt * 0.0015;
    // 影はプレイヤーのまわりだけ（テクセル単位にそろえてちらつきを抑える）
    const shadows = !!QUALITY.shadows && this.state.lightI > 0.3;
    if (this.sun.castShadow !== shadows) this.sun.castShadow = shadows;
    {
      const snap = 60 / 1024;
      _hp.set(Math.round(camPos.x / snap) * snap, Math.round(camPos.y / snap) * snap, Math.round(camPos.z / snap) * snap);
      this.sun.target.position.copy(_hp);
      this.sun.position.copy(_hp).addScaledVector(this.state.lightDir, 150);
    }
    // 舟の中に海面が見えないよう、船体の水線の形で水面を抜く（カメラに近い 8 艘まで）
    {
      const wu = this.waterUniforms;
      const live = this.holes.filter((o) => {
        for (let p = o; p; p = p.parent) { if (!p.visible) return false; if (p.isScene) return true; }
        return false;
      });
      if (live.length > 8) {
        for (const o of live) o.userData._camD = o.getWorldPosition(_hp).distanceToSquared(camPos);
        live.sort((a, b) => a.userData._camD - b.userData._camD);
      }
      wu.uHoleN.value = Math.min(8, live.length);
      for (let i = 0; i < 8; i++) {
        const o = live[i], A = wu.uHoleA.value[i];
        if (!o) continue;
        o.getWorldPosition(_hp);
        o.getWorldDirection(_hd); // ローカル +Z の向き
        const yaw = Math.atan2(_hd.x, _hd.z);
        A.set(_hp.x, _hp.z, Math.cos(yaw), Math.sin(yaw));
        const wl = o.userData.waterline;
        wu.uHoleL.value[i] = wl.half;
        for (let j = 0; j < 24; j++) {
          const k = i * 24 + j;
          wu.uHoleW.value[k >> 2].setComponent(k & 3, wl.w[j]);
        }
      }
    }
    const c = this.waterCell;
    this.water.position.set(Math.round(camPos.x / c) * c, 0, Math.round(camPos.z / c) * c);
    this.waterFar.position.x = this.water.position.x;
    this.waterFar.position.z = this.water.position.z;

    // 雪
    const rate = (this.snowRate || 0.3) * dt;
    const su = this.snowUniforms;
    su.uOpacity.value += clamp(this.snowTarget - su.uOpacity.value, -rate, rate);
    this.snow.visible = su.uOpacity.value > 0.01;
    su.uCenter.value.copy(camPos);
    const gs = sharedUniforms.uSnow;
    gs.value += clamp(this.groundSnowTarget - gs.value, -rate * 0.5, rate * 0.5);
  }

  setLamp(i, { color = 0xffa050, intensity = 0, distance = 14, position } = {}) {
    const l = this.lamps[i];
    l.color.set(color); l.intensity = intensity; l.distance = distance;
    if (position) l.position.copy(position);
    return l;
  }

  // 船（userData.waterline を持つ）の下の水面を抜く。Stage.add で自動的に登録される
  addHole(obj) {
    if (obj?.userData.waterline && !this.holes.includes(obj)) this.holes.push(obj);
  }

  // 旧来の呼び出し用（形は船自身の水線を使う）
  setWaterHole(i, obj) { this.addHole(obj); }

  // 海の浅瀬・白波に使う、岸からの距離テクスチャ（Terrain.shoreTexture）
  setShore(info) {
    const w = this.waterUniforms;
    if (w.uShore.value && (!info || w.uShore.value !== info.tex)) w.uShore.value.dispose();
    if (!info) { w.uHasShore.value = 0; w.uShore.value = null; return; }
    w.uShore.value = info.tex;
    w.uShoreRect.value.set(info.x0, info.z0, info.size, info.maxDist);
    w.uHasShore.value = 1;
  }

  resetForChapter() {
    this.holes = [];
    this.setShore(null);
    for (const l of this.lamps) { l.intensity = 0; l.userData.follow = null; }
    this.setSnow(0, 0, 0.01);
    sharedUniforms.uSnow.value = 0;
    this.snowUniforms.uOpacity.value = 0;
    this.water.visible = this.waterFar.visible = true;
    this.setWaves(0.18);
  }
}
