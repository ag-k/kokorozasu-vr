// 指して選ぶ対象・手に持つ物の管理
import * as THREE from 'three';

const _hitMat = new THREE.MeshBasicMaterial({ visible: false });
const _to = new THREE.Vector3();
let _markerTex;
function markerTexture() {
  if (_markerTex) return _markerTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,230,160,0.9)');
  gr.addColorStop(0.35, 'rgba(255,200,90,0.35)');
  gr.addColorStop(1, 'rgba(255,200,90,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(255,245,215,1)';
  g.beginPath(); g.moveTo(32, 16); g.lineTo(44, 32); g.lineTo(32, 48); g.lineTo(20, 32); g.closePath(); g.fill();
  _markerTex = new THREE.CanvasTexture(c);
  _markerTex.userData.shared = true;
  return _markerTex;
}

export class Interact {
  constructor(game) {
    this.game = game;
    this.items = [];
    this.raycaster = new THREE.Raycaster();
    this.held = null;
    this.hitMap = new Map();
    this.hoverSet = new Set();
    this._v = new THREE.Vector3();
  }

  add(o) {
    const it = Object.assign({
      object: null, hit: null, label: '', giveLabel: '', marker: true, radius: 0.5, offset: new THREE.Vector3(),
      markerOffset: null, accepts: null, onSelect: null, onGive: null, onHover: null, zone: null,
      repeat: false, enabled: true, sound: 'select', maxDist: 40,
    }, o);
    if (!it.hit) {
      // 当たり球は見た目より一回り大きく
      const proxy = new THREE.Mesh(new THREE.SphereGeometry(it.radius * 1.25 + 0.1, 8, 6), _hitMat);
      proxy.position.copy(it.offset);
      it.object.add(proxy);
      it.hit = proxy;
      it.proxy = proxy;
    }
    this.hitMap.set(it.hit, it);
    if (it.marker) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: markerTexture(), transparent: true, depthWrite: false, depthTest: false, fog: false }));
      s.renderOrder = 900;
      const mo = it.markerOffset || new THREE.Vector3(it.offset.x, it.offset.y + it.radius + 0.25, it.offset.z);
      s.position.copy(mo);
      s.scale.setScalar(0.22);
      it.object.add(s);
      it.markerSprite = s;
      it.markerBase = mo.clone();
    }
    it.promise = new Promise((res) => { it.resolve = res; });
    it.remove = () => this.remove(it);
    this.items.push(it);
    return it;
  }

  remove(it) {
    const i = this.items.indexOf(it);
    if (i >= 0) this.items.splice(i, 1);
    this.hitMap.delete(it.hit);
    if (it.proxy) { it.proxy.parent?.remove(it.proxy); it.proxy.geometry.dispose(); }
    if (it.markerSprite) { it.markerSprite.parent?.remove(it.markerSprite); it.markerSprite.material.dispose(); }
    if (this.hoverSet.has(it)) { this.hoverSet.delete(it); it.onHover?.(false); }
    it.removed = true;
  }

  clear() {
    for (const it of [...this.items]) this.remove(it);
    this.dropHeld(true);
  }

  isTarget(it) {
    if (!it.enabled) return false;
    if (it.accepts) {
      if (this.held && this.held.id === it.accepts) return true;
      return !!it.onSelect;
    }
    return true;
  }

  update(dt) {
    const g = this.game;
    const t = g.time;
    const targets = [];
    for (const it of this.items) if (this.isTarget(it)) targets.push(it.hit);
    const newHover = new Set();
    let labelItem = null, labelPoint = null;
    // 遠くの物（沖の船など）にも届くよう、光線の長さは対象の maxDist に合わせる
    let far = 40;
    for (const it of this.items) if (this.isTarget(it)) far = Math.max(far, it.maxDist);
    // 光る印と当たり球の位置（光線ごとの判定で使う）
    const cands = [];
    for (const it of this.items) {
      if (!this.isTarget(it)) continue;
      const c = { it, marker: null, center: null };
      if (it.markerSprite) c.marker = it.markerSprite.getWorldPosition(new THREE.Vector3());
      if (it.proxy) {
        c.center = it.proxy.getWorldPosition(new THREE.Vector3());
        const s = it.proxy.getWorldScale(this._v);
        c.radius = it.radius * Math.max(s.x, s.y, s.z);
      }
      cands.push(c);
    }
    for (const p of g.input.pointers) {
      p.hoverItem = null; p.hitDist = null;
      if (!p.active || !targets.length) continue;
      this.raycaster.set(p.origin, p.dir);
      this.raycaster.far = far;
      let best = null;
      // 1) 物そのもの（当たり用の形）に光線が当たる
      const hits = this.raycaster.intersectObjects(targets, false);
      if (hits.length) {
        const it = this.hitMap.get(hits[0].object);
        if (it && hits[0].distance <= it.maxDist) best = { it, dist: hits[0].distance, point: hits[0].point, score: -1 };
      }
      // 2) 光る印・当たり球の近くを指している（不慣れな人向けに大きめに判定）
      if (!best) {
        for (const c of cands) {
          for (const [pos, r] of [[c.marker, 0.45], [c.center, c.radius ? c.radius * 1.5 + 0.15 : 0]]) {
            if (!pos || !r) continue;
            _to.subVectors(pos, p.origin);
            const along = _to.dot(p.dir);
            if (along <= 0.05 || along > c.it.maxDist) continue;
            const off = Math.sqrt(Math.max(0, _to.lengthSq() - along * along));
            // 半径 r か、視角 4° のどちらか大きい方まで（遠くの印も狙いやすく）
            const tol = Math.max(r, along * Math.tan(4 * Math.PI / 180));
            if (off > tol) continue;
            const score = off / tol;
            if (!best || score < best.score) best = { it: c.it, dist: along, point: pos.clone(), score };
          }
        }
      }
      if (best) {
        p.hoverItem = best.it; p.hitDist = best.dist; p.hitPoint = best.point;
        newHover.add(best.it);
        if (!labelItem) { labelItem = best.it; labelPoint = best.point; }
      }
    }
    // 手を近づけて渡す（VR）
    if (this.held && this.held.hand && g.isXR) {
      this.held.obj.getWorldPosition(this._v);
      for (const it of this.items) {
        it.zoneActive = false;
        if (it.enabled && it.accepts === this.held.id && it.zone && it.zone(this._v)) {
          it.zoneActive = true;
          newHover.add(it);
          if (!labelItem) { labelItem = it; labelPoint = this._v.clone().add(new THREE.Vector3(0, 0.25, 0)); }
        }
      }
    }
    // 開発用の自動進行（?auto=1）
    if (g.debugAuto) {
      this.autoT = (this.autoT || 0) + dt;
      const cand = this.items.filter((x) => this.isTarget(x) && (!x.accepts || (this.held && this.held.id === x.accepts)));
      const pick = cand.find((x) => this.held && x.accepts === this.held.id) || cand.find((x) => !/前へ|次へ/.test(x.label || ''));
      if (pick && this.autoT > 1) { this.autoT = 0; console.log('[auto] select', pick.label || pick.giveLabel); this.activate(pick, null); }
    }
    for (const it of this.hoverSet) if (!newHover.has(it)) it.onHover?.(false);
    for (const it of newHover) if (!this.hoverSet.has(it)) {
      it.onHover?.(true);
      g.audio?.sfx('tick');
      g.input.pulse(0.15, 20);
    }
    this.hoverSet = newHover;

    if (labelItem) {
      const giving = this.held && labelItem.accepts === this.held.id;
      const text = giving ? (labelItem.giveLabel || labelItem.label) : labelItem.label;
      if (text) {
        const pos = labelItem.markerSprite ? labelItem.markerSprite.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.22, 0)) : labelPoint;
        g.ui.setLabel(text, pos);
      } else g.ui.setLabel(null);
    } else g.ui.setLabel(null);

    for (const it of this.items) {
      const s = it.markerSprite;
      if (!s) continue;
      s.visible = this.isTarget(it);
      const hov = this.hoverSet.has(it);
      s.position.y = it.markerBase.y + Math.sin(t * 2 + it.markerBase.x) * 0.05;
      const sc = (hov ? 0.3 : 0.2) * (1 + Math.sin(t * 3) * 0.08);
      // 遠くの印も見えるよう距離で少し大きく
      s.getWorldPosition(this._v);
      const d = this._v.distanceTo(g.headPos);
      s.scale.setScalar(sc * Math.max(1, d / 5));
    }
  }

  // トリガー・クリック時。対象があれば true
  select(pointer) {
    let it = pointer?.hoverItem;
    if (!it && this.held) it = this.items.find((x) => x.zoneActive);
    if (!it) return false;
    this.activate(it, pointer);
    return true;
  }

  // グリップを離した時：手元の渡し先があれば渡す
  squeezeRelease() {
    if (!this.held) return false;
    const it = this.items.find((x) => x.zoneActive);
    if (!it) return false;
    this.activate(it, null);
    return true;
  }

  activate(it, pointer) {
    if (it.removed) return;
    const g = this.game;
    if (this.held && it.accepts === this.held.id && it.onGive) {
      g.audio?.sfx(it.sound || 'select');
      g.input.pulse(0.5, 60);
      const held = this.held;
      it.onGive(held.id, held, pointer);
      if (!it.repeat) this.remove(it);
      it.resolve(held.id);
      return;
    }
    if (!it.accepts || it.onSelect) {
      g.audio?.sfx(it.sound || 'select');
      g.input.pulse(0.4, 50);
      if (!it.repeat) this.remove(it);
      it.onSelect?.(pointer);
      it.resolve(true);
    }
  }

  // 手に持たせる
  hold(id, obj, { xrPos, xrRot, pcPos, pcRot } = {}) {
    this.dropHeld(true);
    const g = this.game;
    const grip = g.input.holdGrip();
    if (g.isXR && grip) {
      grip.add(obj);
      obj.position.copy(xrPos || new THREE.Vector3(0, 0.0, -0.04));
      obj.rotation.copy(xrRot || new THREE.Euler(-Math.PI / 2 + 0.7, 0, 0));
    } else {
      g.camera.add(obj);
      obj.position.copy(pcPos || new THREE.Vector3(0.2, -0.2, -0.45));
      obj.rotation.copy(pcRot || new THREE.Euler(0.1, -0.3, 0.1));
    }
    this.held = { id, obj, hand: g.isXR ? grip : null };
    return this.held;
  }

  // 持ち物をワールドへ離す（位置は保つ）。dispose=true なら消す
  dropHeld(dispose = false) {
    if (!this.held) return null;
    const { obj } = this.held;
    this.held = null;
    if (dispose) { obj.parent?.remove(obj); return null; }
    this.game.scene.attach(obj);
    return obj;
  }
}
