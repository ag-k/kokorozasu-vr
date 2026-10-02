// 各章の舞台づくりの共通処理
import * as THREE from 'three';
import { makeFigure, animateFigure, makeGull } from '../core/props.js';
import { Terrain, setPaths } from '../core/terrain.js';
import { yawTo } from '../core/util.js';

export class Stage {
  constructor(game) {
    this.g = game;
    this.root = new THREE.Group();
    game.world.add(this.root);
    this.animated = [];
    this.figs = [];
    this.terrain = null;
    this.platforms = [];
    game.addUpdater((dt) => this.update(dt));
  }

  add(obj, x = 0, y = 0, z = 0, ry = 0, parent = this.root) {
    obj.position.set(x, y, z);
    obj.rotation.y = ry;
    parent.add(obj);
    if (obj.userData.waterline) this.g.env.addHole(obj);
    obj.traverse((o) => {
      if (o.userData.update && !this.animated.includes(o)) this.animated.push(o);
      // 影（高画質のとき有効）
      if (o.isMesh && !o.userData.noShadow && !o.material?.transparent) { o.castShadow = true; o.receiveShadow = true; }
    });
    return obj;
  }

  // 地面の上に置く
  put(obj, x, z, ry = 0, dy = 0) {
    const y = this.groundAt(x, z) ?? 0;
    return this.add(obj, x, y + dy, z, ry);
  }

  fig(opts, x, y, z, ry = 0, parent = this.root) {
    const f = makeFigure(opts);
    this.add(f, x, y, z, ry, parent);
    this.figs.push(f);
    return f;
  }

  figOnGround(opts, x, z, ry = 0) {
    return this.fig(opts, x, this.groundAt(x, z) ?? 0, z, ry);
  }

  face(obj, x, z) {
    obj.rotation.y = yawTo(obj.position.x, obj.position.z, x, z);
  }

  makeTerrain(cfg) {
    this.terrain = new Terrain(cfg);
    this.root.add(this.terrain.mesh);
    // 道は地形のシェーダーで塗る
    setPaths(this.terrain.pathTexture());
    // 海の浅瀬の色と白波のため、岸からの距離を水面に渡す
    if (cfg.shore !== false) this.g.env.setShore(this.terrain.shoreTexture());
    return this.terrain;
  }

  // 標高データの遠景。boxes の内側は手前の地形に任せて沈める
  mapBackdrop(map, ...boxes) {
    const inside = (x, z) => boxes.some((b) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1);
    const t = new Terrain({ map, base: -25, grassNoise: 0.004, seed: 77, mask: boxes.length ? (x, z) => (inside(x, z) ? 0 : 1) : null });
    this.root.add(t.mesh);
    return t;
  }

  backdrop(cfg) {
    const t = new Terrain(Object.assign({ size: 6000, seg: 90, edgeFall: true, grassNoise: 0.004 }, cfg));
    this.root.add(t.mesh);
    return t;
  }

  addPlatform(x, z, hw, hd, y, ry = 0) {
    this.platforms.push({ x, z, hw, hd, y, ry, c: Math.cos(ry), s: Math.sin(ry) });
  }

  groundAt(x, z) {
    let h = this.terrain ? this.terrain.heightAt(x, z) : null;
    for (const p of this.platforms) {
      const dx = x - p.x, dz = z - p.z;
      const lx = dx * p.c - dz * p.s, lz = dx * p.s + dz * p.c;
      if (Math.abs(lx) <= p.hw && Math.abs(lz) <= p.hd) h = h === null ? p.y : Math.max(h, p.y);
    }
    return h;
  }

  // 自由移動できる範囲の設定
  freeNav({ region = null, minH = 0.4, maxSlope = 1.2, onMove = null } = {}) {
    const self = this;
    this.g.nav = {
      mode: 'free',
      groundAt: (x, z) => self.groundAt(x, z),
      canStand(x, z, y) {
        if (y < minH) return false;
        if (region && !region(x, z)) return false;
        if (self.terrain && self.terrain.slopeAt(x, z) > maxSlope && y - self.terrain.heightAt(x, z) < 0.05) return false;
        return true;
      },
      onMove,
    };
  }

  // カモメの群れ：center のまわりを輪を描いて飛ぶ
  gulls(cx, cz, n = 6, radius = 60, height = 25) {
    for (let i = 0; i < n; i++) {
      const gl = makeGull();
      this.root.add(gl);
      const r = radius * (0.6 + ((i * 37) % 10) / 20), h = height + ((i * 13) % 9) - 4, sp = (0.08 + ((i * 7) % 5) * 0.012) * (i % 2 ? 1 : -1);
      let a = i * 1.7;
      const ph = i * 2.3;
      this.g.addUpdater((dt) => {
        const t = this.g.time;
        a += sp * dt * (40 / r);
        gl.position.set(cx + Math.cos(a) * r, h + Math.sin(t * 0.4 + ph) * 3, cz + Math.sin(a) * r);
        gl.rotation.y = -a + (sp > 0 ? 0 : Math.PI);
        gl.rotation.z = Math.sin(t * 0.7 + ph) * 0.25 * Math.sign(sp);
        // 羽ばたきと滑空を繰り返す
        const flap = Math.sin(t * 0.5 + ph) > 0.2 ? Math.sin(t * 9 + ph) * 0.55 : 0.12;
        gl.userData.wings[0].rotation.z = flap;
        gl.userData.wings[1].rotation.z = -flap;
      });
    }
  }

  update(dt) {
    const t = this.g.time;
    const talking = this.g.director.talking;
    for (const f of this.figs) animateFigure(f, t, talking === f);
    for (const o of this.animated) o.userData.update(t, dt);
  }
}

// 移動（等速で経路をたどる）
export function followPath(game, obj, pts, speed, { yawOffset = 0, turn = true, onStep = null } = {}) {
  const segs = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    segs.push({ a, b, len });
    total += len;
  }
  let dist = 0;
  return game.waitUntil((dt) => {
    dist = Math.min(total, dist + speed * dt);
    let d = dist;
    for (const s of segs) {
      if (d <= s.len || s === segs[segs.length - 1]) {
        const k = s.len > 0 ? Math.min(1, d / s.len) : 1;
        obj.position.x = s.a.x + (s.b.x - s.a.x) * k;
        obj.position.z = s.a.z + (s.b.z - s.a.z) * k;
        if (s.a.y !== undefined) obj.position.y = s.a.y + (s.b.y - s.a.y) * k;
        if (turn) {
          const target = yawTo(s.a.x, s.a.z, s.b.x, s.b.z) + yawOffset;
          let diff = target - obj.rotation.y;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          obj.rotation.y += diff * Math.min(1, dt * 1.5);
        }
        break;
      }
      d -= s.len;
    }
    onStep?.(dist / total, dt);
    return dist >= total;
  });
}

export const P = (x, z, y) => ({ x, z, y });
