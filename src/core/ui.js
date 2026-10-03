// VR 空間内の文字表示（字幕・章題・歌・札・メニュー・本）と暗転
import * as THREE from 'three';
import { clamp, damp } from './util.js';

export const FONT = '"Shippori Mincho", "Yu Mincho", "YuMincho", "Hiragino Mincho ProN", "Noto Serif JP", serif';

const fontCache = new Map();
export function ensureFont(text) {
  const key = text;
  if (fontCache.has(key)) return fontCache.get(key);
  try {
    if (document.fonts.check(`400 32px "Shippori Mincho"`, text) && document.fonts.check(`700 32px "Shippori Mincho"`, text)) return Promise.resolve();
  } catch (e) { /* noop */ }
  const p = Promise.race([
    Promise.all([
      document.fonts.load(`400 32px "Shippori Mincho"`, text),
      document.fonts.load(`700 32px "Shippori Mincho"`, text),
    ]).catch(() => null),
    new Promise((r) => setTimeout(r, 1500)),
  ]);
  fontCache.set(key, p);
  return p;
}

const NO_START = '、。，．・：；？！゛゜ヽヾゝゞ々ー）］｝」』〕〉》】ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ…';
export function wrapJa(ctx, text, maxW) {
  const lines = [];
  let line = '';
  for (const ch of text) {
    if (ch === '\n') { lines.push(line); line = ''; continue; }
    const test = line + ch;
    if (ctx.measureText(test).width > maxW && line.length) {
      if (NO_START.includes(ch)) { line = test; continue; }
      lines.push(line); line = ch;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

const ROTATE = '「」『』（）ー―…〜－：-(){}[]';
const PUNCT = '、。，．';
// 縦書き。x は最初の列の中心、右から左へ列を進める。
export function drawVertical(ctx, text, x, y, size, maxH, colGap = 1.45) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let cx = x, cy = y + size / 2;
  for (const ch of text) {
    if (ch === '\n') { cx -= size * colGap; cy = y + size / 2; continue; }
    if (cy + size / 2 > y + maxH) { cx -= size * colGap; cy = y + size / 2; }
    if (ROTATE.includes(ch)) {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.PI / 2); ctx.fillText(ch, 0, 0); ctx.restore();
    } else if (PUNCT.includes(ch)) {
      ctx.fillText(ch, cx + size * 0.6, cy - size * 0.55);
    } else {
      ctx.fillText(ch, cx, cy);
    }
    cy += size * 1.04;
  }
  return cx;
}

export class Panel {
  constructor(w, h, { ppm = 600, overlay = true, order = 1000 } = {}) {
    this.w = w; this.h = h;
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(w * ppm);
    this.canvas.height = Math.round(h * ppm);
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.tex.generateMipmaps = true;
    this.tex.minFilter = THREE.LinearMipmapLinearFilter;
    this.mat = new THREE.MeshBasicMaterial({
      map: this.tex, transparent: true, depthTest: !overlay, depthWrite: false, fog: false, toneMapped: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.mat);
    this.mesh.renderOrder = order;
    this.mesh.frustumCulled = false;
    this.opacity = 1;
  }
  get W() { return this.canvas.width; }
  get H() { return this.canvas.height; }
  clear() { this.ctx.clearRect(0, 0, this.W, this.H); }
  commit() { this.tex.needsUpdate = true; }
  setOpacity(o) { this.opacity = o; this.mat.opacity = o; this.mesh.visible = o > 0.002; }
  dispose() { this.tex.dispose(); this.mat.dispose(); this.mesh.geometry.dispose(); }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function paperFill(ctx, W, H, base = '#efe6cf') {
  ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);
  // 和紙の繊維
  for (let i = 0; i < 90; i++) {
    ctx.strokeStyle = `rgba(120,100,70,${0.03 + Math.random() * 0.05})`;
    ctx.lineWidth = 1 + Math.random() * 1.5;
    ctx.beginPath();
    const x = Math.random() * W, y = Math.random() * H;
    ctx.moveTo(x, y); ctx.quadraticCurveTo(x + (Math.random() - 0.5) * 60, y + (Math.random() - 0.5) * 60, x + (Math.random() - 0.5) * 90, y + (Math.random() - 0.5) * 90);
    ctx.stroke();
  }
}

const SPEAKER_COLOR = {
  '語り': '#d9c08a', '帝': '#f1e3b6', '忠顕': '#a9c3d9', '三位の局': '#e3aab5', '島の男': '#b9d0a0',
  '僧': '#c9b8a0', '船頭': '#b9d0a0', '警固の武士': '#d99a8a', '追手': '#d99a8a', '木村家の主': '#b9d0a0',
  '木村家の妻': '#e3c3a5',
};

const _tv = new THREE.Vector3();

// 頭の前方に遅れてついてくる配置
class Follower {
  constructor(game, obj, { dist = 1.5, y = -0.3, threshold = 28, snap = false } = {}) {
    this.game = game; this.obj = obj; this.dist = dist; this.y = y; this.threshold = threshold;
    this.yaw = 0; this.pos = new THREE.Vector3(); this.inited = false; this.snap = snap;
  }
  recenter() { this.inited = false; }
  update(dt) {
    const g = this.game;
    const yaw = g.headYaw;
    let diff = yaw - this.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    if (!this.inited || Math.abs(diff) > this.threshold * Math.PI / 180) {
      this.targetYaw = yaw;
      if (!this.inited) this.yaw = yaw;
      this.inited = true;
    }
    if (this.targetYaw !== undefined) {
      let d2 = this.targetYaw - this.yaw;
      d2 = Math.atan2(Math.sin(d2), Math.cos(d2));
      this.yaw += d2 * Math.min(1, dt * 4);
    }
    const hp = g.headPos;
    // 舟の上でも遅れないよう、rig の親（舟など）の座標で追従させる
    const parent = g.rig.parent || g.scene;
    parent.updateMatrixWorld();
    const tgt = _tv.set(hp.x - Math.sin(this.yaw) * this.dist, hp.y + this.y, hp.z - Math.cos(this.yaw) * this.dist);
    parent.worldToLocal(tgt);
    if (this.snap || !this.posInit || this.parent !== parent) { this.pos.copy(tgt); this.posInit = true; this.parent = parent; }
    else {
      this.pos.x = damp(this.pos.x, tgt.x, 6, dt); this.pos.y = damp(this.pos.y, tgt.y, 4, dt); this.pos.z = damp(this.pos.z, tgt.z, 6, dt);
    }
    this.obj.position.copy(this.pos);
    parent.localToWorld(this.obj.position);
    this.obj.lookAt(hp.x, this.obj.position.y + (hp.y - this.obj.position.y) * 0.5, hp.z);
  }
}

// 画面の端の矢印（+X 向き）
let _arrowGeo;
function arrowGeometry() {
  if (_arrowGeo) return _arrowGeo;
  const s = new THREE.Shape();
  s.moveTo(0.06, 0); s.lineTo(-0.03, 0.05); s.lineTo(-0.01, 0); s.lineTo(-0.03, -0.05); s.lineTo(0.06, 0);
  _arrowGeo = new THREE.ShapeGeometry(s);
  return _arrowGeo;
}

// 見つめる目標の輪。progress: 0〜1（見つめている間に満ちる）
function drawGazeRing(c, progress) {
  const g = c.getContext('2d'), S = c.width, m = S / 2;
  g.clearRect(0, 0, S, S);
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 12;
  g.beginPath(); g.arc(m, m, m - 12, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = 'rgba(255,240,210,0.6)'; g.lineWidth = 4;
  g.beginPath(); g.arc(m, m, m - 12, 0, Math.PI * 2); g.stroke();
  if (progress > 0) {
    g.strokeStyle = 'rgba(255,196,64,1)'; g.lineWidth = 13;
    g.beginPath(); g.arc(m, m, m - 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress); g.stroke();
  }
  // 中心の目の印
  g.fillStyle = 'rgba(255,236,190,0.9)';
  g.beginPath(); g.ellipse(m, m, 16, 9, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(60,40,20,0.9)';
  g.beginPath(); g.arc(m, m, 5, 0, Math.PI * 2); g.fill();
}

export class UI {
  constructor(game) {
    this.game = game;
    const scene = game.scene;

    // 暗転用の球
    this.fadeMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 16, 8),
      new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide, transparent: true, opacity: 1, depthTest: false, depthWrite: false, fog: false })
    );
    this.fadeMesh.renderOrder = 2000;
    this.fadeMesh.frustumCulled = false;
    game.camera.add(this.fadeMesh);
    this.fadeLevel = 1;

    // 視野制限（ビネット）
    const vg = new THREE.PlaneGeometry(0.5, 0.5);
    this.vignette = new THREE.Mesh(vg, new THREE.ShaderMaterial({
      uniforms: { uAmount: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform float uAmount; varying vec2 vUv; void main(){ float d = length(vUv - 0.5) * 2.0; float a = smoothstep(0.55 - uAmount * 0.25, 0.95 - uAmount * 0.2, d) * uAmount; gl_FragColor = vec4(0.0,0.0,0.0,a); }',
      transparent: true, depthTest: false, depthWrite: false,
    }));
    this.vignette.position.z = -0.12;
    this.vignette.renderOrder = 1999;
    this.vignette.frustumCulled = false;
    game.camera.add(this.vignette);
    this.vignetteTarget = 0;
    this.vignetteMat = this.vignette.material;

    // 字幕
    this.sub = new Panel(1.5, 0.42, { ppm: 640, order: 2002 });
    this.subGroup = new THREE.Group();
    this.subGroup.add(this.sub.mesh);
    scene.add(this.subGroup);
    this.subFollow = new Follower(game, this.subGroup, { dist: 1.6, y: -0.38, threshold: 30 });
    this.sub.setOpacity(0);
    this.subVisible = false;
    this.subPulse = 0;

    // 案内（操作説明・目的の更新）
    this.hint = new Panel(1.1, 0.42, { ppm: 640, order: 2003 });
    this.hintGroup = new THREE.Group();
    this.hintGroup.add(this.hint.mesh);
    scene.add(this.hintGroup);
    this.hintFollow = new Follower(game, this.hintGroup, { dist: 1.7, y: 0.22, threshold: 30 });
    this.hint.setOpacity(0);
    this.hintTimer = 0;

    // 章題
    this.title = new Panel(1.2, 1.5, { ppm: 520, order: 2004 });
    this.titleGroup = new THREE.Group();
    this.titleGroup.add(this.title.mesh);
    scene.add(this.titleGroup);
    this.titleFollow = new Follower(game, this.titleGroup, { dist: 2.4, y: -0.05, threshold: 999, snap: true });
    this.title.setOpacity(0);

    // 歌（短冊）
    this.poem = new Panel(0.46, 1.5, { ppm: 700, overlay: false, order: 10 });
    this.poem.setOpacity(0);
    scene.add(this.poem.mesh);

    // ホバー時の札
    this.label = new Panel(0.9, 0.16, { ppm: 600, order: 1500 });
    this.label.mesh.visible = false;
    scene.add(this.label.mesh);
    this.labelText = '';

    // 手首の目的表示（VR）
    this.wrist = new Panel(0.2, 0.13, { ppm: 1400, overlay: false, order: 5 });
    this.gazeGuides = [];
    this.wrist.mesh.visible = false;
    this.objectiveText = '';

    this.hudObjective = document.getElementById('hud-objective');
    this.menuItems = [];
  }

  // ---- 暗転 ----
  fade(to, dur = 0.8) {
    const from = this.fadeLevel;
    if (dur <= 0) { this.fadeLevel = to; this.fadeMesh.material.opacity = to; return Promise.resolve(); }
    return this.game.tween(dur, (t) => {
      this.fadeLevel = from + (to - from) * t;
      this.fadeMesh.material.opacity = this.fadeLevel;
    }, 'global');
  }
  fadeOut(d = 0.8) { return this.fade(1, d); }
  fadeIn(d = 1.2) { return this.fade(0, d); }

  setVignette(v) { this.vignetteTarget = this.game.settings.vignette ? v : 0; }

  // ---- 字幕 ----
  async showSubtitle(speaker, text, source) {
    await ensureFont(speaker + text + (source || ''));
    const p = this.sub, ctx = p.ctx, W = p.W, H = p.H;
    p.clear();
    ctx.fillStyle = 'rgba(16,14,12,0.82)';
    roundRect(ctx, 4, 4, W - 8, H - 8, 18); ctx.fill();
    ctx.strokeStyle = 'rgba(201,162,74,0.55)'; ctx.lineWidth = 3; ctx.stroke();
    let y = 34;
    const x0 = 44;
    if (speaker && speaker !== '語り') {
      ctx.font = `700 34px ${FONT}`;
      ctx.fillStyle = SPEAKER_COLOR[speaker] || '#e8dcc0';
      ctx.textBaseline = 'top'; ctx.textAlign = 'left';
      ctx.fillText(speaker, x0, y);
      y += 50;
    } else {
      y += 6;
    }
    ctx.font = `400 38px ${FONT}`;
    ctx.fillStyle = speaker === '語り' ? '#f0e6cf' : '#ffffff';
    ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    const maxW = W - x0 * 2;
    let size = 38;
    let lines = wrapJa(ctx, text, maxW);
    const room = H - y - (source ? 62 : 30);
    while (lines.length * size * 1.5 > room && size > 26) {
      size -= 2; ctx.font = `400 ${size}px ${FONT}`; lines = wrapJa(ctx, text, maxW);
    }
    for (const l of lines) { ctx.fillText(l, x0, y); y += size * 1.5; }
    if (source) {
      ctx.font = `400 24px ${FONT}`;
      const tw = ctx.measureText(source).width;
      const bx = W - tw - 70, by = H - 56;
      ctx.fillStyle = 'rgba(140,47,35,0.9)';
      roundRect(ctx, bx, by, tw + 32, 38, 4); ctx.fill();
      ctx.fillStyle = '#f6ecd6'; ctx.textBaseline = 'middle';
      ctx.fillText(source, bx + 16, by + 20);
    }
    p.commit();
    this.subVisible = true;
    this.subFollow.update(0);
  }
  hideSubtitle() { this.subVisible = false; }

  // ---- 案内 ----
  // left: 左寄せ（目的の一覧など）。枠は文字の量に合わせる
  async showHint(text, secs = 6, { left = false } = {}) {
    await ensureFont(text + '✓○');
    const p = this.hint, ctx = p.ctx, W = p.W, H = p.H;
    p.clear();
    let size = 34;
    ctx.font = `700 ${size}px ${FONT}`;
    let lines = wrapJa(ctx, text, W - 60);
    while (lines.length * size * 1.4 > H - 30 && size > 20) { size -= 2; ctx.font = `700 ${size}px ${FONT}`; lines = wrapJa(ctx, text, W - 60); }
    const bh = Math.min(H - 8, lines.length * size * 1.4 + 34);
    const by = (H - bh) / 2;
    ctx.fillStyle = 'rgba(38,30,18,0.85)';
    roundRect(ctx, 4, by, W - 8, bh, 14); ctx.fill();
    ctx.strokeStyle = 'rgba(230,196,110,0.8)'; ctx.lineWidth = 3; ctx.stroke();
    ctx.textBaseline = 'middle';
    const y0 = H / 2 - ((lines.length - 1) * size * 1.4) / 2;
    lines.forEach((l, i) => {
      const done = l.startsWith('✓');
      ctx.fillStyle = done ? 'rgba(247,231,191,0.55)' : i === 0 && left ? '#e6c46e' : '#f7e7bf';
      ctx.textAlign = left ? 'left' : 'center';
      ctx.fillText(l, left ? 40 : W / 2, y0 + i * size * 1.4);
    });
    p.commit();
    this.hintTimer = secs;
    this.hintFollow.recenter();
  }

  // ---- 目的 ----
  // obj: 文字列（一つの目的）か、[{ text, done }] の一覧（いくつかの目的と進み具合）
  async setObjective(obj, quiet = false) {
    const list = Array.isArray(obj);
    const items = list ? obj : obj ? [{ text: obj, done: false }] : [];
    const nDone = items.filter((it) => it.done).length;
    this.objective = { items, list, nDone };
    this.objectiveText = items.length ? items.filter((it) => !it.done).map((it) => it.text).join('\n') || '完了' : '';
    const count = list ? `（${nDone}/${items.length}）` : '';
    // PC の画面左上
    const h = this.hudObjective;
    h.replaceChildren();
    if (items.length) {
      const head = document.createElement('div');
      head.className = 'obj-head';
      head.textContent = '目的' + count;
      h.append(head);
      for (const it of items) {
        const el = document.createElement('div');
        el.className = 'obj-item' + (it.done ? ' done' : '');
        el.textContent = (list ? (it.done ? '✓ ' : '○ ') : '') + it.text;
        h.append(el);
      }
    }
    // VR の左手首
    const p = this.wrist, ctx = p.ctx, W = p.W, H = p.H;
    p.clear();
    if (items.length) {
      await ensureFont('目的✓○（）/0123456789' + items.map((it) => it.text).join(''));
      ctx.fillStyle = 'rgba(243,236,220,0.95)';
      roundRect(ctx, 2, 2, W - 4, H - 4, 12); ctx.fill();
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#8c2f23'; ctx.font = `700 22px ${FONT}`; ctx.textAlign = 'left';
      ctx.fillText('目的', 16, 12);
      if (list) {
        ctx.textAlign = 'right';
        ctx.fillText(`${nDone} / ${items.length}`, W - 16, 12);
        // 進み具合の棒
        ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(80, 22, W - 170, 6);
        ctx.fillStyle = '#b8862e'; ctx.fillRect(80, 22, (W - 170) * nDone / items.length, 6);
      }
      ctx.textAlign = 'left';
      let size = 24, lines;
      const layout = () => {
        ctx.font = `400 ${size}px ${FONT}`;
        lines = [];
        for (const it of items) wrapJa(ctx, (list ? (it.done ? '✓ ' : '○ ') : '') + it.text, W - 32).forEach((l) => lines.push([l, it.done]));
      };
      layout();
      while (lines.length * size * 1.25 > H - 52 && size > 14) { size -= 2; layout(); }
      lines.forEach(([l, done], i) => { ctx.fillStyle = done ? 'rgba(28,26,23,0.4)' : '#1c1a17'; ctx.fillText(l, 16, 44 + i * size * 1.25); });
      this.wrist.mesh.visible = this.game.isXR;
      if (!quiet) this.showObjectiveHint(list ? 6 : 4.5);
    } else {
      this.wrist.mesh.visible = false;
    }
    p.commit();
  }

  // 目的を案内の札に出す（B/Y ボタン・O キーでも）
  showObjectiveHint(secs = 4.5) {
    const o = this.objective;
    if (!o || !o.items.length) return;
    if (!o.list) return this.showHint('目的：' + o.items[0].text, secs);
    const text = `目的（${o.nDone}/${o.items.length}）\n` + o.items.map((it) => (it.done ? '✓ ' : '○ ') + it.text).join('\n');
    return this.showHint(text, secs, { left: true });
  }

  // ---- 見つめる先の案内 ----
  // 目標に輪（見つめると満ちていく）を出し、視界の外なら画面の端に矢印でその方向を示す
  addGazeGuide(target, { deg = 10 } = {}) {
    const g = this.game;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const tex = new THREE.CanvasTexture(c);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false }));
    sprite.renderOrder = 905;
    g.scene.add(sprite);
    const arrow = new THREE.Mesh(arrowGeometry(), new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false, fog: false, side: THREE.DoubleSide }));
    arrow.renderOrder = 1998;
    arrow.scale.setScalar(1.4);
    arrow.frustumCulled = false;
    arrow.visible = false;
    g.camera.add(arrow);
    const guide = {
      target, deg, sprite, arrow, tex, canvas: c, progress: 0, drawn: -1, pos: new THREE.Vector3(),
      remove: () => {
        sprite.parent?.remove(sprite); arrow.parent?.remove(arrow);
        tex.dispose(); sprite.material.dispose(); arrow.material.dispose();
        this.gazeGuides = this.gazeGuides.filter((x) => x !== guide);
      },
    };
    this.gazeGuides.push(guide);
    return guide;
  }

  clearGazeGuides() { for (const gd of [...this.gazeGuides]) gd.remove(); }

  updateGazeGuides() {
    const g = this.game, cam = g.camera;
    if (!this.gazeGuides.length) return;
    cam.updateMatrixWorld();
    this.gazeGuides.forEach((gd, n) => {
      const t = gd.target;
      if (typeof t === 'function') gd.pos.copy(t()); else if (t.isObject3D) t.getWorldPosition(gd.pos); else gd.pos.copy(t);
      // 目標の輪（見つめる範囲の大きさ。遠くても見えるよう最小の大きさを持たせる）
      const d = gd.pos.distanceTo(g.headPos);
      const ang = Math.min(Math.max(gd.deg, 4), 9) * Math.PI / 180;
      gd.sprite.position.copy(gd.pos);
      gd.sprite.scale.setScalar(Math.max(0.6, d * Math.tan(ang) * 2.2) * (1 + Math.sin(g.time * 3) * 0.05));
      const q = Math.round(gd.progress * 40) / 40;
      if (q !== gd.drawn) { drawGazeRing(gd.canvas, q); gd.tex.needsUpdate = true; gd.drawn = q; }
      // 視界の外なら、画面の端に矢印
      const v = cam.worldToLocal(_tv.copy(gd.pos));
      // 画面の中に見えているか（VR は視野の中心から 30° 以内を「見えている」とする）
      let onScreen;
      const hy = Math.tan((cam.fov * Math.PI / 180) / 2), hx = hy * cam.aspect;
      if (g.isXR) onScreen = Math.acos(clamp(-v.z / Math.max(1e-4, v.length()), -1, 1)) < 30 * Math.PI / 180;
      else onScreen = v.z < 0 && Math.abs(v.x / -v.z) < hx * 0.9 && Math.abs(v.y / -v.z) < hy * 0.9;
      gd.arrow.visible = !onScreen && this.fadeLevel < 0.5;
      if (gd.arrow.visible) {
        let a = Math.atan2(v.y, v.x);
        if (Math.hypot(v.x, v.y) < 1e-3) a = 0;
        // 目標のある側の、視野の端寄りに置く
        const k = 0.78 + Math.sin(g.time * 5) * 0.03 - n * 0.08;
        const ex = g.isXR ? 0.42 : hx, ey = g.isXR ? 0.42 : hy;
        gd.arrow.position.set(Math.cos(a) * ex * k, Math.sin(a) * ey * k, -1);
        gd.arrow.rotation.set(0, 0, a);
      }
    });
  }

  // ---- 章題（縦書き） ----
  async showTitle(num, name, sub, secs = 4.5) {
    await ensureFont(num + name + sub);
    const p = this.title, ctx = p.ctx, W = p.W, H = p.H;
    p.clear();
    paperFill(ctx, W, H, '#efe5cc');
    ctx.strokeStyle = '#8c2f23'; ctx.lineWidth = 4;
    ctx.strokeRect(22, 22, W - 44, H - 44);
    ctx.fillStyle = '#8c2f23';
    ctx.font = `700 40px ${FONT}`;
    drawVertical(ctx, num, W - 110, 80, 40, H - 160);
    ctx.fillStyle = '#1c1a17';
    ctx.font = `700 92px ${FONT}`;
    drawVertical(ctx, name, W / 2 + 10, 110, 92, H - 200);
    ctx.fillStyle = '#4a4238';
    ctx.font = `400 32px ${FONT}`;
    drawVertical(ctx, sub, 120, 140, 32, H - 200);
    // 朱印
    ctx.fillStyle = 'rgba(160,40,30,0.85)';
    ctx.fillRect(W / 2 - 40, H - 150, 64, 64);
    ctx.fillStyle = '#efe5cc'; ctx.font = `700 40px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('隠', W / 2 - 8, H - 118);
    p.commit();
    this.titleFollow.recenter();
    this.titleFollow.update(0);
    await this.game.tween(1.0, (t) => p.setOpacity(t), 'global');
    await this.game.wait(secs, 'global');
    await this.game.tween(1.0, (t) => p.setOpacity(1 - t), 'global');
  }

  // ---- 歌（短冊） ----
  async showPoem(lines, position, lookAt) {
    await ensureFont(lines.join(''));
    const p = this.poem, ctx = p.ctx, W = p.W, H = p.H;
    p.clear();
    const gr = ctx.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#d9cfe8'); gr.addColorStop(0.35, '#f1ead8'); gr.addColorStop(1, '#efe4c6');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(200,170,90,0.25)';
    for (let i = 0; i < 40; i++) ctx.fillRect(Math.random() * W, Math.random() * H, 3 + Math.random() * 6, 2 + Math.random() * 4);
    ctx.strokeStyle = 'rgba(120,90,50,0.6)'; ctx.lineWidth = 3; ctx.strokeRect(6, 6, W - 12, H - 12);
    ctx.fillStyle = '#1c1a17';
    const size = 50;
    ctx.font = `400 ${size}px ${FONT}`;
    let x = W / 2 + size * 0.75;
    drawVertical(ctx, lines[0], x, 70, size, H - 120);
    drawVertical(ctx, lines[1], x - size * 1.5, 70 + size * 3.2, size, H - 120 - size * 3.2);
    p.commit();
    p.mesh.position.copy(position);
    p.mesh.lookAt(lookAt);
    await this.game.tween(1.5, (t) => p.setOpacity(t));
  }
  hidePoem() { return this.game.tween(1.2, (t) => this.poem.setOpacity(1 - t)); }

  // ---- ホバー札 ----
  async setLabel(text, pos) {
    if (!text) { this.label.mesh.visible = false; this.labelText = ''; return; }
    if (text !== this.labelText) {
      this.labelText = text;
      await ensureFont(text);
      if (this.labelText !== text) return;
      const p = this.label, ctx = p.ctx, W = p.W, H = p.H;
      p.clear();
      ctx.font = `700 40px ${FONT}`;
      const tw = Math.min(W - 20, ctx.measureText(text).width + 60);
      ctx.fillStyle = 'rgba(243,236,220,0.95)';
      roundRect(ctx, (W - tw) / 2, 8, tw, H - 16, 10); ctx.fill();
      ctx.strokeStyle = '#8c2f23'; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = '#1c1a17'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, W / 2, H / 2 + 2, W - 40);
      p.commit();
    }
    this.label.mesh.visible = true;
    const hp = this.game.headPos;
    const d = hp.distanceTo(pos);
    this.label.mesh.position.copy(pos);
    this.label.mesh.scale.setScalar(clamp(d / 2.2, 0.6, 4));
    this.label.mesh.lookAt(hp);
  }

  // 頭の正面に置く。舟に乗っていても一緒に動くよう、rig の親に付ける。
  placeInFront(group, dist, y) {
    const g = this.game;
    const yaw = g.headYaw, hp = g.headPos;
    group.position.set(hp.x - Math.sin(yaw) * dist, hp.y + y, hp.z - Math.cos(yaw) * dist);
    group.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const parent = g.rig.parent || g.scene;
    parent.updateMatrixWorld(true);
    parent.worldToLocal(group.position);
    const pq = parent.getWorldQuaternion(new THREE.Quaternion()).invert();
    group.quaternion.premultiply(pq);
    parent.add(group);
  }

  // ---- メニュー（指して選ぶボタン） ----
  menu(title, items, { dist = 1.6, y = 0, footer = '' } = {}) {
    const g = this.game;
    const group = new THREE.Group();
    this.placeInFront(group, dist, y);
    const handles = [];
    return new Promise(async (resolve) => {
      await ensureFont(title + footer + items.map((i) => i.label).join(''));
      if (footer) {
        const fp = new Panel(0.9, 0.07, { ppm: 500, overlay: false, order: 20 });
        const fctx = fp.ctx;
        fctx.font = `400 24px ${FONT}`; fctx.fillStyle = 'rgba(243,236,220,0.95)'; fctx.textAlign = 'center'; fctx.textBaseline = 'middle';
        fctx.shadowColor = 'rgba(0,0,0,0.8)'; fctx.shadowBlur = 6;
        fctx.fillText(footer, fp.W / 2, fp.H / 2);
        fp.commit();
        fp.mesh.position.y = (items.length - 1) * 0.075 - (items.length - 1) * 0.15 - 0.13;
        group.add(fp.mesh);
      }
      if (title) {
        const tp = new Panel(1.2, 0.16, { ppm: 500, overlay: false, order: 20 });
        const ctx = tp.ctx;
        ctx.font = `700 52px ${FONT}`; ctx.fillStyle = '#f3ecdc'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 8;
        ctx.fillText(title, tp.W / 2, tp.H / 2);
        tp.commit();
        tp.mesh.position.y = 0.2 + items.length * 0.07;
        group.add(tp.mesh);
      }
      items.forEach((it, i) => {
        const bp = new Panel(0.7, 0.12, { ppm: 500, overlay: false, order: 21 });
        const ctx = bp.ctx;
        ctx.fillStyle = 'rgba(243,236,220,0.95)'; roundRect(ctx, 3, 3, bp.W - 6, bp.H - 6, 10); ctx.fill();
        ctx.strokeStyle = '#8c2f23'; ctx.lineWidth = 3; ctx.stroke();
        ctx.fillStyle = '#1c1a17'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        // 長い項目は枠に収まるよう字を小さくする
        let fs = 34;
        ctx.font = `700 ${fs}px ${FONT}`;
        while (ctx.measureText(it.label).width > bp.W - 40 && fs > 20) { fs -= 2; ctx.font = `700 ${fs}px ${FONT}`; }
        ctx.fillText(it.label, bp.W / 2, bp.H / 2 + 2);
        bp.commit();
        bp.mesh.position.y = (items.length - 1) * 0.075 - i * 0.15;
        group.add(bp.mesh);
        const h = g.interact.add({
          object: bp.mesh, hit: bp.mesh, label: '', marker: false, sound: 'select',
          onHover: (on) => bp.mesh.scale.setScalar(on ? 1.06 : 1),
          onSelect: () => {
            handles.forEach((x) => x.remove());
            group.parent?.remove(group);
            group.traverse((o) => { if (o.material?.map) o.material.map.dispose(); o.material?.dispose?.(); o.geometry?.dispose?.(); });
            resolve(it.key);
          },
        });
        handles.push(h);
      });
    });
  }

  // ---- 本（伝承帖） ----
  async book(pages, { title = '伝承帖' } = {}) {
    const g = this.game;
    let idx = 0;
    const p = new Panel(1.1, 0.8, { ppm: 700, overlay: false, order: 20 });
    const group = new THREE.Group();
    group.add(p.mesh);
    this.placeInFront(group, 1.4, -0.05);
    await ensureFont(pages.map((x) => x.title + x.text + (x.source || '')).join('') + title + '前へ次へ閉じる');
    const draw = () => {
      const pg = pages[idx], ctx = p.ctx, W = p.W, H = p.H;
      p.clear();
      paperFill(ctx, W, H, '#f1e8d2');
      ctx.strokeStyle = '#6d5a3a'; ctx.lineWidth = 3; ctx.strokeRect(16, 16, W - 32, H - 32);
      ctx.fillStyle = '#8c2f23'; ctx.font = `700 30px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(`${title}　${idx + 1} / ${pages.length}`, 50, 40);
      ctx.fillStyle = '#1c1a17'; ctx.font = `700 46px ${FONT}`;
      ctx.fillText(pg.title, 50, 90);
      let size = 32;
      ctx.font = `400 ${size}px ${FONT}`;
      let lines = wrapJa(ctx, pg.text, W - 100);
      const room = H - 170 - (pg.source ? 90 : 40);
      while (lines.length * size * 1.55 > room && size > 20) { size -= 2; ctx.font = `400 ${size}px ${FONT}`; lines = wrapJa(ctx, pg.text, W - 100); }
      let y = 170;
      for (const l of lines) { ctx.fillText(l, 50, y); y += size * 1.55; }
      if (pg.source) {
        ctx.font = `400 24px ${FONT}`; ctx.fillStyle = '#6d5a3a';
        const sl = wrapJa(ctx, '出典・伝承：' + pg.source, W - 100);
        sl.slice(0, 2).forEach((l, i) => ctx.fillText(l, 50, H - 100 + i * 34));
      }
      p.commit();
    };
    draw();
    const mkBtn = (label, x) => {
      const bp = new Panel(0.26, 0.1, { ppm: 500, overlay: false, order: 21 });
      const ctx = bp.ctx;
      ctx.fillStyle = 'rgba(40,32,24,0.92)'; roundRect(ctx, 3, 3, bp.W - 6, bp.H - 6, 10); ctx.fill();
      ctx.fillStyle = '#f3ecdc'; ctx.font = `700 30px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, bp.W / 2, bp.H / 2 + 2);
      bp.commit();
      bp.mesh.position.set(x, -0.48, 0.01);
      group.add(bp.mesh);
      return bp;
    };
    return new Promise((resolve) => {
      const handles = [];
      const close = () => {
        handles.forEach((h) => h.remove());
        group.parent?.remove(group);
        group.traverse((o) => { if (o.material?.map) o.material.map.dispose(); o.material?.dispose?.(); o.geometry?.dispose?.(); });
        resolve();
      };
      const prev = mkBtn('前へ', -0.35), next = mkBtn('次へ', 0.35), cl = mkBtn('閉じる', 0);
      handles.push(g.interact.add({ object: prev.mesh, hit: prev.mesh, marker: false, sound: 'page', repeat: true, onSelect: () => { idx = (idx + pages.length - 1) % pages.length; draw(); } }));
      handles.push(g.interact.add({ object: next.mesh, hit: next.mesh, marker: false, sound: 'page', repeat: true, onSelect: () => { idx = (idx + 1) % pages.length; draw(); } }));
      handles.push(g.interact.add({ object: cl.mesh, hit: cl.mesh, marker: false, sound: 'select', onSelect: close }));
    });
  }

  attachWrist(grip) {
    grip.add(this.wrist.mesh);
    this.wrist.mesh.position.set(0, 0.05, 0.12);
    this.wrist.mesh.rotation.set(-Math.PI / 2 + 0.5, 0, 0);
  }

  update(dt) {
    // 字幕のフェード
    const so = this.sub.opacity;
    const st = this.subVisible ? 1 : 0;
    if (so !== st) this.sub.setOpacity(clamp(so + Math.sign(st - so) * dt * 5, 0, 1));
    if (this.sub.opacity > 0) this.subFollow.update(dt);
    // 案内
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      this.hint.setOpacity(clamp(Math.min(this.hintTimer, 0.4) / 0.4, 0, 1) * clamp(this.hint.opacity + dt * 4, 0, 1));
      this.hintFollow.update(dt);
    } else if (this.hint.opacity > 0) this.hint.setOpacity(0);
    if (this.title.opacity > 0) this.titleFollow.update(dt);
    this.updateGazeGuides();
    this.wrist.mesh.visible = this.game.isXR && !!this.objectiveText;
    // ビネット
    const u = this.vignetteMat.uniforms.uAmount;
    u.value = damp(u.value, this.vignetteTarget, 3, dt);
    this.vignette.visible = u.value > 0.01;
  }
}
