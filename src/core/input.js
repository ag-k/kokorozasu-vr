// 入力：VR コントローラー（光線・テレポート・スナップターン・触覚）と PC（マウス・キーボード）
import * as THREE from 'three';
import { makeHandModel } from './props.js';
import { clamp } from './util.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();

export class Input {
  constructor(game) {
    this.game = game;
    this.pointers = [];
    this.controllers = [];
    this.keys = new Set();
    this.pcYaw = 0; this.pcPitch = 0;
    this.eye = 1.55;
    this.teleport = { aiming: false, valid: false, target: new THREE.Vector3(), ctrl: null };
    this.turnReady = [true, true];
    this.lastMove = 0;

    this.setupXR();
    this.setupPC();
    this.setupTeleportVisual();
  }

  // ---- VR ----
  setupXR() {
    const g = this.game, r = g.renderer;
    for (let i = 0; i < 2; i++) {
      const ctrl = r.xr.getController(i);
      const grip = r.xr.getControllerGrip(i);
      g.rig.add(ctrl); g.rig.add(grip);
      const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
      const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xf3e3b5, transparent: true, opacity: 0.55, depthWrite: false }));
      line.scale.z = 3;
      line.renderOrder = 950;
      ctrl.add(line);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe7a0, depthTest: false, transparent: true }));
      dot.renderOrder = 951;
      dot.visible = false;
      g.scene.add(dot);
      const c = {
        index: i, ctrl, grip, line, dot, source: null, handedness: 'none', handModel: null,
        pointer: { id: 'xr' + i, active: false, origin: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, -1), xr: true, hoverItem: null },
        buttons: [],
      };
      c.pointer.ctrl = c;
      this.controllers.push(c);
      this.pointers.push(c.pointer);
      ctrl.addEventListener('connected', (e) => {
        c.source = e.data;
        c.handedness = e.data.handedness;
        c.pointer.active = true;
        c.isHand = !!e.data.hand;
        if (c.handModel) grip.remove(c.handModel);
        c.handModel = makeHandModel(c.handedness);
        grip.add(c.handModel);
        if (c.handedness === 'left') g.ui.attachWrist(grip);
      });
      ctrl.addEventListener('disconnected', () => {
        c.source = null; c.pointer.active = false;
        if (c.handModel) { grip.remove(c.handModel); c.handModel = null; }
      });
      ctrl.addEventListener('selectstart', () => this.onSelect(c.pointer));
      ctrl.addEventListener('squeezeend', () => g.interact.squeezeRelease());
    }
  }

  holdGrip() {
    const right = this.controllers.find((c) => c.source && c.handedness === 'right');
    const any = this.controllers.find((c) => c.source);
    return (right || any)?.grip || null;
  }

  pulse(intensity = 0.5, ms = 60, which = 'both') {
    if (!this.game.isXR) return;
    for (const c of this.controllers) {
      if (which !== 'both' && c.handedness !== which) continue;
      const act = c.source?.gamepad?.hapticActuators?.[0];
      try { act?.pulse?.(intensity, ms); } catch (e) { /* 触覚非対応 */ }
    }
  }

  onSelect(pointer) {
    const g = this.game;
    if (g.interact.select(pointer)) return;
    // 地面を指していれば、そこへ移動（字幕が出ている間は字幕送りを優先）
    if (g.nav.mode === 'free' && pointer?.moveTarget && !g.ui.subVisible) {
      this.doTeleport(pointer.moveTarget);
      return;
    }
    g.director?.advance();
  }

  // ---- PC ----
  setupPC() {
    const g = this.game;
    const el = g.renderer.domElement;
    this.mouse = { id: 'mouse', active: false, origin: new THREE.Vector3(), dir: new THREE.Vector3(), xr: false, ndc: new THREE.Vector2(), hoverItem: null };
    this.pointers.push(this.mouse);
    this.raycaster = new THREE.Raycaster();
    let down = null;
    el.addEventListener('pointerdown', (e) => {
      if (g.isXR) return;
      down = { x: e.clientX, y: e.clientY, yaw: this.pcYaw, pitch: this.pcPitch, drag: false };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (g.isXR) return;
      this.mouse.ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      this.mouse.active = true;
      this.lastMove = g.time;
      if (down) {
        const dx = e.clientX - down.x, dy = e.clientY - down.y;
        if (!down.drag && Math.hypot(dx, dy) > 5) down.drag = true;
        if (down.drag && g.nav.look !== false) {
          this.pcYaw = down.yaw + dx * 0.004;
          this.pcPitch = clamp(down.pitch + dy * 0.004, -1.2, 1.2);
        }
      }
    });
    el.addEventListener('pointerup', (e) => {
      if (g.isXR) return;
      const wasDrag = down?.drag;
      down = null;
      if (!wasDrag) this.onSelect(this.mouse);
    });
    el.addEventListener('pointerleave', () => { this.mouse.active = false; });
    addEventListener('keydown', (e) => {
      if (g.isXR || !g.started) return;
      this.keys.add(e.code);
      this.lastMove = g.time;
      if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); g.director?.advance(); }
      if (e.code === 'KeyO') g.ui.showObjectiveHint(5);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  // 帝の視点をある場所に置く。eye を渡すと目の高さを固定（座る・かがむ）
  place(parent, pos, yaw, eye = null) {
    const g = this.game, rig = g.rig, cam = g.camera;
    if (rig.parent !== parent) parent.add(rig);
    if (g.isXR) {
      const e = new THREE.Euler().setFromQuaternion(cam.quaternion, 'YXZ');
      const ry = yaw - e.y;
      rig.rotation.set(0, ry, 0);
      _v.copy(cam.position).setY(0).applyAxisAngle(_v2.set(0, 1, 0), ry);
      rig.position.set(pos.x - _v.x, pos.y, pos.z - _v.z);
      if (eye !== null) rig.position.y = pos.y + eye - cam.position.y;
    } else {
      rig.position.copy(pos);
      rig.rotation.set(0, 0, 0);
      this.pcYaw = yaw; this.pcPitch = 0;
      this.eye = eye ?? 1.55;
    }
    this.seatedEye = eye;
    this.teleport.aiming = false;
  }

  // 頭の位置を保ったまま回す
  turn(angle) {
    const g = this.game, rig = g.rig, cam = g.camera;
    const before = _v.copy(cam.position).setY(0).applyAxisAngle(_v2.set(0, 1, 0), rig.rotation.y);
    const bx = before.x, bz = before.z;
    rig.rotation.y += angle;
    const after = _v.copy(cam.position).setY(0).applyAxisAngle(_v2.set(0, 1, 0), rig.rotation.y);
    rig.position.x += bx - after.x;
    rig.position.z += bz - after.z;
  }

  // ---- テレポート ----
  setupTeleportVisual() {
    const N = 40;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    this.arc = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.8, depthWrite: false }));
    this.arc.frustumCulled = false;
    this.arc.visible = false;
    this.arcN = N;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.3, 24), new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    this.ring = ring;
    ring.visible = false;
    this.game.scene.add(this.arc, ring);
    // 地面を指したときの移動先の印（コントローラー 2 本とマウス）
    this.pointRings = [0, 1, 2].map(() => {
      const grp = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color: 0x8fd6ff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, depthTest: false });
      const r1 = new THREE.Mesh(new THREE.RingGeometry(0.24, 0.33, 32), mat);
      const r2 = new THREE.Mesh(new THREE.CircleGeometry(0.06, 16), mat);
      r1.rotation.x = r2.rotation.x = -Math.PI / 2;
      r1.renderOrder = r2.renderOrder = 940;
      grp.add(r1, r2);
      grp.visible = false;
      this.game.scene.add(grp);
      return grp;
    });
  }

  // 光線が最初に当たる地面（立てる所なら valid）
  groundHit(origin, dir, maxDist = 24) {
    const nav = this.game.nav;
    if (!nav.groundAt || dir.y > -0.03) return null;
    const below = (s) => {
      const gy = nav.groundAt(origin.x + dir.x * s, origin.z + dir.z * s);
      return gy !== null && gy !== undefined && origin.y + dir.y * s <= gy;
    };
    const step = 0.35;
    for (let s = 0.4; s <= maxDist; s += step) {
      if (!below(s)) continue;
      let a = s - step, b = s;
      for (let k = 0; k < 6; k++) { const m = (a + b) / 2; if (below(m)) b = m; else a = m; }
      const hx = origin.x + dir.x * b, hz = origin.z + dir.z * b, hy = nav.groundAt(hx, hz);
      const valid = hy !== null && hy !== undefined && (!nav.canStand || nav.canStand(hx, hz, hy));
      return { point: new THREE.Vector3(hx, hy ?? 0, hz), dist: b, valid };
    }
    return null;
  }

  // 指している地面に移動先の印を出す（何か調べられる物を指しているときは出さない）
  updatePointMove(p, idx) {
    const g = this.game, ring = this.pointRings[idx];
    p.moveTarget = null;
    ring.visible = false;
    if (g.nav.mode !== 'free' || p.hoverItem || !p.active) return null;
    const hit = this.groundHit(p.origin, p.dir);
    if (!hit || !hit.valid) return null;
    p.moveTarget = hit.point;
    ring.visible = true;
    ring.position.copy(hit.point);
    ring.position.y += 0.05;
    ring.scale.setScalar((1 + Math.sin(g.time * 5) * 0.08) * Math.max(1, hit.dist / 7));
    return hit;
  }

  updateArc(c) {
    const g = this.game, nav = g.nav;
    const p0 = c.pointer.origin, d = c.pointer.dir;
    const v = _v2.copy(d).multiplyScalar(7.5);
    const pos = this.arc.geometry.attributes.position.array;
    let hit = false, valid = false, n = 0;
    let px = p0.x, py = p0.y, pz = p0.z;
    const dt = 0.05;
    for (let i = 0; i < this.arcN; i++) {
      const t = i * dt;
      const x = p0.x + v.x * t, y = p0.y + v.y * t - 4.9 * t * t, z = p0.z + v.z * t;
      const gy = nav.groundAt ? nav.groundAt(x, z) : null;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; n = i + 1;
      if (gy !== null && gy !== undefined && y <= gy + 0.02) {
        // 前の点との間で着地点を近似
        const k = (py - gy) / Math.max(1e-4, py - y);
        const hx = px + (x - px) * k, hz = pz + (z - pz) * k;
        const gy2 = nav.groundAt(hx, hz);
        pos[i * 3] = hx; pos[i * 3 + 1] = gy2 ?? gy; pos[i * 3 + 2] = hz;
        hit = true;
        valid = gy2 !== null && gy2 !== undefined && (!nav.canStand || nav.canStand(hx, hz, gy2));
        this.teleport.target.set(hx, gy2 ?? gy, hz);
        break;
      }
      if (y < -20) break;
      px = x; py = y; pz = z;
    }
    for (let i = n; i < this.arcN; i++) { pos[i * 3] = pos[(n - 1) * 3]; pos[i * 3 + 1] = pos[(n - 1) * 3 + 1]; pos[i * 3 + 2] = pos[(n - 1) * 3 + 2]; }
    this.arc.geometry.attributes.position.needsUpdate = true;
    this.arc.material.color.set(valid ? 0x9fd8ff : 0xd07060);
    this.arc.visible = true;
    this.ring.visible = hit;
    if (hit) { this.ring.position.copy(this.teleport.target); this.ring.position.y += 0.03; this.ring.material.color.set(valid ? 0x9fd8ff : 0xd07060); }
    this.teleport.valid = valid;
  }

  async doTeleport(target = null) {
    const g = this.game, rig = g.rig, cam = g.camera;
    const t = (target || this.teleport.target).clone();
    this.hasMoved = true;
    g.audio?.sfx('step');
    await g.ui.fade(0.85, 0.08);
    // 頭の水平位置が着地点に来るよう rig を動かす
    cam.getWorldPosition(_v);
    rig.position.x += t.x - _v.x;
    rig.position.z += t.z - _v.z;
    rig.position.y = t.y;
    g.ui.fade(0, 0.18);
    g.nav.onMove?.(t);
  }

  update(dt) {
    const g = this.game;
    // VR コントローラー
    if (g.isXR) {
      this.mouse.active = false;
      let aimingCtrl = null;
      for (const c of this.controllers) {
        const p = c.pointer;
        if (!c.source) { c.line.visible = false; c.dot.visible = false; continue; }
        c.ctrl.updateWorldMatrix(true, false);
        c.ctrl.getWorldPosition(p.origin);
        c.ctrl.getWorldQuaternion(_q);
        p.dir.set(0, 0, -1).applyQuaternion(_q);
        const hovering = !!p.hoverItem;
        const aimingThis = this.teleport.aiming && this.teleport.ctrl === c;
        const ground = aimingThis ? (this.pointRings[c.index].visible = false, p.moveTarget = null) : this.updatePointMove(p, c.index);
        c.line.visible = !c.isHand || hovering || !!ground;
        c.line.scale.z = hovering ? p.hitDist : ground ? ground.dist : 2.5;
        c.line.material.opacity = hovering || ground ? 0.95 : 0.35;
        c.line.material.color.set(hovering ? 0xffd27a : ground ? 0x8fd6ff : 0xf3e3b5);
        c.dot.visible = hovering;
        if (hovering) c.dot.position.copy(p.hitPoint);

        const gp = c.source.gamepad;
        if (!gp) continue;
        const ax = gp.axes.length >= 4 ? gp.axes[2] : gp.axes[0] || 0;
        const ay = gp.axes.length >= 4 ? gp.axes[3] : gp.axes[1] || 0;
        // A/X：字幕送り、B/Y：目的
        const b4 = gp.buttons[4]?.pressed, b5 = gp.buttons[5]?.pressed;
        if (b4 && !c.buttons[4]) g.director?.advance();
        if (b5 && !c.buttons[5]) g.ui.showObjectiveHint(5);
        c.buttons[4] = b4; c.buttons[5] = b5;
        // スティックで歩く（設定で選んだとき。左手のスティック、片手だけならそのスティック）
        const walkStick = g.settings.smoothMove && g.nav.mode === 'free'
          && (c.handedness === 'left' || !this.controllers.some((o) => o !== c && o.source));
        if (walkStick) { this.smoothWalk(ax, ay, dt); continue; }
        // スナップターン
        if (g.nav.turn !== false) {
          if (Math.abs(ax) > 0.7 && Math.abs(ay) < 0.6 && this.turnReady[c.index]) {
            this.turn(ax > 0 ? -Math.PI / 6 : Math.PI / 6);
            this.turnReady[c.index] = false;
          } else if (Math.abs(ax) < 0.3) this.turnReady[c.index] = true;
        }
        // テレポート
        if (g.nav.mode === 'free' && !g.settings.smoothMove) {
          if (ay < -0.6 && (!this.teleport.aiming || this.teleport.ctrl === c)) {
            this.teleport.aiming = true; this.teleport.ctrl = c; aimingCtrl = c;
          } else if (this.teleport.aiming && this.teleport.ctrl === c && ay > -0.3) {
            this.teleport.aiming = false;
            if (this.teleport.valid) this.doTeleport();
          } else if (this.teleport.aiming && this.teleport.ctrl === c) aimingCtrl = c;
        }
      }
      if (g.nav.mode !== 'free') this.teleport.aiming = false;
      if (aimingCtrl && this.teleport.aiming) this.updateArc(aimingCtrl);
      else { this.arc.visible = false; this.ring.visible = false; }
      this.pointRings[2].visible = false;
      if (this.walking && g.time - this.walking > 0.2) { this.walking = 0; g.ui.setVignette(0); }
      return;
    }

    // PC
    for (const c of this.controllers) { c.line.visible = false; c.dot.visible = false; this.pointRings[c.index].visible = false; }
    this.arc.visible = false; this.ring.visible = false;
    const cam = g.camera, rig = g.rig;
    rig.rotation.y = this.pcYaw;
    cam.rotation.set(this.pcPitch, 0, 0, 'YXZ');
    cam.position.set(0, this.eye, 0);
    if (this.mouse.active) {
      this.raycaster.setFromCamera(this.mouse.ndc, cam);
      this.mouse.origin.copy(this.raycaster.ray.origin);
      this.mouse.dir.copy(this.raycaster.ray.direction);
    }
    this.updatePointMove(this.mouse, 2);
    const el = g.renderer.domElement;
    el.style.cursor = this.mouse.hoverItem || this.mouse.moveTarget ? 'pointer' : 'grab';
    // 開発用の自由飛行（?fly=1）
    if (g.debugFly) {
      const sp = (this.keys.has('ShiftLeft') ? 80 : 15) * dt;
      const f = new THREE.Vector3(); cam.getWorldDirection(f);
      const r = new THREE.Vector3(-f.z, 0, f.x).normalize();
      const p = rig.parent === g.scene ? rig.position : null;
      if (p) {
        if (this.keys.has('KeyW')) p.addScaledVector(f, sp);
        if (this.keys.has('KeyS')) p.addScaledVector(f, -sp);
        if (this.keys.has('KeyD')) p.addScaledVector(r, sp);
        if (this.keys.has('KeyA')) p.addScaledVector(r, -sp);
        if (this.keys.has('KeyE')) p.y += sp;
        if (this.keys.has('KeyQ')) p.y -= sp;
      }
      return;
    }
    // 歩く
    if (g.nav.mode === 'free') {
      let fx = 0, fz = 0;
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) fz -= 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) fz += 1;
      if (this.keys.has('KeyA')) fx -= 1;
      if (this.keys.has('KeyD')) fx += 1;
      if (this.keys.has('ArrowLeft')) this.pcYaw += dt * 1.6;
      if (this.keys.has('ArrowRight')) this.pcYaw -= dt * 1.6;
      if (fx || fz) {
        const sp = (this.keys.has('ShiftLeft') ? 6 : 3.2) * dt;
        const len = Math.hypot(fx, fz);
        const s = Math.sin(this.pcYaw), c = Math.cos(this.pcYaw);
        const dx = (fx * c + fz * s) / len * sp, dz = (-fx * s + fz * c) / len * sp;
        const nx = rig.position.x + dx, nz = rig.position.z + dz;
        const gy = g.nav.groundAt?.(nx, nz);
        if (gy !== null && gy !== undefined && (!g.nav.canStand || g.nav.canStand(nx, nz, gy)) && Math.abs(gy - rig.position.y) < 1.2) {
          rig.position.set(nx, gy, nz);
          this.hasMoved = true;
          g.nav.onMove?.(rig.position);
        }
      }
    }
  }

  // スティックで歩く（顔の向きが前）。歩いている間は視野の周りを暗くして酔いを抑える
  smoothWalk(ax, ay, dt) {
    const g = this.game, rig = g.rig;
    const mag = Math.hypot(ax, ay);
    if (mag < 0.2 || rig.parent !== g.scene) return;
    const sp = 1.8 * dt * Math.min(1, (mag - 0.2) / 0.6);
    const fx = -Math.sin(g.headYaw), fz = -Math.cos(g.headYaw);
    const f = -ay / mag, r = ax / mag;
    const nx = rig.position.x + (fx * f - fz * r) * sp, nz = rig.position.z + (fz * f + fx * r) * sp;
    const gy = g.nav.groundAt?.(nx, nz);
    if (gy === null || gy === undefined || (g.nav.canStand && !g.nav.canStand(nx, nz, gy)) || Math.abs(gy - rig.position.y) > 1.2) return;
    rig.position.set(nx, gy, nz);
    this.hasMoved = true;
    if (!this.walking) g.ui.setVignette(0.6);
    this.walking = g.time;
    g.nav.onMove?.(rig.position);
  }
}
