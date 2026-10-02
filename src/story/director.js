// 物語の進行（台詞・語り・待機）を async で書くための道具
import * as THREE from 'three';

export class Director {
  constructor(game) {
    this.game = game;
    this.advanceWaiters = [];
    this.lastShow = 0;
    this.voice = null;
    this.talking = null;
    this.pickVoice();
    if (window.speechSynthesis) speechSynthesis.onvoiceschanged = () => this.pickVoice();
  }

  pickVoice() {
    const vs = window.speechSynthesis?.getVoices?.() || [];
    this.voice = vs.find((v) => v.lang === 'ja-JP' && /Nanami|Haruka|Kyoko|Google/.test(v.name)) || vs.find((v) => v.lang?.startsWith('ja')) || null;
  }

  get canSpeak() { return !!(window.speechSynthesis && this.voice); }

  advance() {
    const g = this.game;
    if (g.time - this.lastShow < 0.35) return;
    const w = this.advanceWaiters;
    this.advanceWaiters = [];
    w.forEach((f) => f());
  }

  waitAdvance() {
    return new Promise((res) => this.advanceWaiters.push(res));
  }

  speak(text, speaker) {
    if (!this.game.settings.voice || !this.canSpeak) return null;
    return new Promise((res) => {
      try {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text.replace(/[「」『』]/g, ''));
        u.voice = this.voice; u.lang = 'ja-JP';
        u.rate = 1.0;
        u.pitch = speaker === '三位の局' ? 1.25 : speaker === '語り' ? 1.0 : speaker === '帝' ? 0.85 : 0.95;
        u.onend = res; u.onerror = res;
        speechSynthesis.speak(u);
      } catch (e) { res(); }
    });
  }

  // 台詞。who: 話者名、fig: 話している人物（うなずかせる）
  async say(who, text, { source = null, fig = null, min = 0 } = {}) {
    const g = this.game;
    await g.ui.showSubtitle(who, text, source);
    this.lastShow = g.time;
    this.talking = fig;
    const readTime = g.debugAuto ? 0.3 : Math.max(2.8, text.length * 0.14 + 1.4, min);
    const sp = this.speak(text, who);
    const timers = [g.wait(readTime)];
    if (sp) timers.push(sp.then(() => g.wait(0.6)));
    await Promise.race([Promise.all(timers), this.waitAdvance()]);
    if (sp) try { speechSynthesis.cancel(); } catch (e) { /* noop */ }
    this.talking = null;
    g.ui.hideSubtitle();
    await g.wait(0.25);
  }

  narrate(text, source = null, opts = {}) {
    return this.say('語り', text, { source, ...opts });
  }

  objective(text, quiet = false) { return this.game.ui.setObjective(text, quiet); }

  hint(text, secs = 7) { return this.game.ui.showHint(text, secs); }

  // 移動のしかたを、実際に一度移動するまで繰り返し説明する（章が変わると止まる）
  teachMove(extra = '') {
    const g = this.game;
    g.input.hasMoved = false;
    const token = (this.teachToken = (this.teachToken || 0) + 1);
    const text = () => (g.isXR
      ? (g.settings.smoothMove
        ? '移動のしかた：左手のスティックを倒すと、その方向へ歩きます。右手のスティックを左右に倒すと向きを変えます。'
        : '移動のしかた：行きたい地面をコントローラーで指すと、青い輪が出ます。そのままトリガーを引くと、そこへ移動します。（スティックを前に倒して離しても移動できます。左右に倒すと向きを変えます）')
      : '移動のしかた：行きたい地面をクリックすると、そこへ移動します。W A S D キーでも歩けます。ドラッグで見回せます。') + (extra ? '\n' + extra : '');
    (async () => {
      // 同時に出る「目的」の表示に上書きされないよう、少し遅らせる
      await g.wait(0.8);
      let first = true;
      while (token === this.teachToken && !g.input.hasMoved) {
        if (g.nav.mode === 'free' && !g.ui.subVisible) {
          const secs = first ? 12 : 9;
          this.hint(text(), secs);
          first = false;
          let t = 0;
          await g.waitUntil((dt) => (t += dt) > 14 || g.input.hasMoved || token !== this.teachToken);
          // 移動できたら説明を消す
          if (g.input.hasMoved && t < secs) g.ui.hintTimer = Math.min(g.ui.hintTimer, 0.4);
        } else await g.wait(1);
      }
    })();
  }

  // 視線を向けたら進む。目標に輪を出し、視界の外なら矢印で方向を示す。
  // 返り値の cancel() で案内を消してやめられる（ほかの方法で先へ進んだとき）
  waitGaze(target, { deg = 14, secs = 1.2, onProgress = null, guide = true } = {}) {
    const g = this.game;
    const tv = new THREE.Vector3();
    const d = new THREE.Vector3();
    let acc = 0, cancelled = false;
    const gd = guide ? g.ui.addGazeGuide(target, { deg }) : null;
    const p = g.waitUntil((dt) => {
      if (cancelled) return true;
      if (g.debugAuto) { acc += dt; return acc > 0.6; }
      if (typeof target === 'function') tv.copy(target()); else if (target.isObject3D) target.getWorldPosition(tv); else tv.copy(target);
      d.subVectors(tv, g.headPos).normalize();
      const ang = Math.acos(Math.min(1, Math.max(-1, d.dot(g.headDir)))) * 180 / Math.PI;
      if (ang < deg) acc += dt; else acc = Math.max(0, acc - dt * 0.5);
      if (gd) gd.progress = Math.min(1, acc / secs);
      onProgress?.(acc / secs);
      return acc >= secs;
    }).then(() => gd?.remove());
    p.cancel = () => { cancelled = true; gd?.remove(); };
    return p;
  }

  // 近くに来たら進む
  waitNear(pos, r) {
    const g = this.game;
    return g.waitUntil(() => {
      if (g.debugAuto) g.input.place(g.scene, new THREE.Vector3(pos.x, g.nav.groundAt?.(pos.x, pos.z) ?? 0, pos.z), 0);
      const hp = g.headPos;
      return (hp.x - pos.x) ** 2 + (hp.z - pos.z) ** 2 < r * r;
    });
  }
}
