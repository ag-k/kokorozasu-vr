// 起動・ゲームループ・章の切り替え
import * as THREE from 'three';
import { Environment } from './core/env.js';
import { UI } from './core/ui.js';
import { Input } from './core/input.js';
import { Interact } from './core/interact.js';
import { GameAudio } from './core/audio.js';
import { sharedUniforms, disposeTree } from './core/builder.js';
import { easeInOut } from './core/util.js';
import { Director } from './story/director.js';
import { CHAPTERS } from './story/chapters.js';
import { VERSION_LABEL } from './version.js';
import { QUALITY, setPaths } from './core/terrain.js';

const params = new URLSearchParams(location.search);

class Game {
  constructor() {
    this.settings = { voice: false, vignette: true };
    this.timeScale = Number(params.get('speed')) || 1;
    this.debugFly = params.get('fly') === '1';
    this.debugAuto = params.get('auto') === '1';
    const renderer = this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight);
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType('local-floor');
    renderer.xr.setFoveation(1);
    // 色調：映画的なトーンマッピングで明暗の階調をなめらかに
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    document.getElementById('app').appendChild(renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 3200);
    this.camera.rotation.order = 'YXZ';
    this.rig = new THREE.Group();
    this.rig.add(this.camera);
    this.scene.add(this.rig);
    this.world = new THREE.Group();
    this.scene.add(this.world);

    this.time = 0;
    this.headPos = new THREE.Vector3(0, 1.55, 0);
    this.headDir = new THREE.Vector3(0, 0, -1);
    this.headYaw = 0;
    this.nav = { mode: 'none' };
    this.updaters = { global: new Set(), chapter: new Set() };
    this.started = false;

    this.env = new Environment(this);
    this.ui = new UI(this);
    this.interact = new Interact(this);
    this.input = new Input(this);
    this.audio = new GameAudio();
    this.director = new Director(this);

    this.clock = new THREE.Clock();
    renderer.setAnimationLoop(() => this.tick());
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); console.warn('WebGL context lost'); });
    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
    });
  }

  get isXR() { return this.renderer.xr.isPresenting; }

  // ---- 重さの見張り（VR のとき）----
  // フレームが間に合わない状態が続いたら、草 → 磯の岩・遠くの木 の順に省いて軽くする（戻しはしない）
  perfGuard(frameSec) {
    if (!this.isXR) { this.perfAcc = 0; this.perfN = 0; return; }
    this.perfAcc = (this.perfAcc || 0) + frameSec;
    this.perfN = (this.perfN || 0) + 1;
    if (this.perfAcc < 3) return;
    const avg = this.perfAcc / this.perfN;
    this.perfAcc = 0; this.perfN = 0;
    // 新しい場面で作られた草なども、いまの段階に合わせる
    if (this.perfLevel) this.applyPerfLevel();
    // 72Hz なら 1 フレーム 13.9ms。平均 16ms を超えたら取りこぼしが多い
    if (avg > 0.016 && this.fadeOk() && (this.perfLevel || 0) < 2) {
      this.perfLevel = (this.perfLevel || 0) + 1;
      console.info('[perf] 軽くします: level', this.perfLevel, (avg * 1000).toFixed(1) + 'ms');
      this.applyPerfLevel();
    }
  }

  // 暗転中・読み込み直後は測らない（場面の作成でフレームが遅れるため）
  fadeOk() { return this.ui.fadeLevel < 0.05 && this.time - (this.chapterStart || 0) > 4; }

  applyPerfLevel() {
    const lv = this.perfLevel || 0;
    if (!lv) return;
    this.world.traverse((o) => {
      const p = o.userData.perf;
      if (p === 'grass') o.visible = false;
      if (lv >= 2 && p === 'rocks') o.visible = false;
    });
    this.farTrees = lv >= 2;
  }

  // 遠くの木の区画を省く（level 2）
  updateFarTrees() {
    if (!this.farTrees) return;
    this._farT = (this._farT || 0) + 1;
    if (this._farT % 30) return;
    const hp = this.headPos;
    this.world.traverse((o) => {
      if (o.userData.perf !== 'trees') return;
      if (!o.boundingSphere) o.computeBoundingSphere();
      const c = o.boundingSphere.center, r = o.boundingSphere.radius;
      o.visible = Math.hypot(c.x - hp.x, c.z - hp.z) - r < 260;
    });
  }

  addUpdater(fn, scope = 'chapter') {
    this.updaters[scope].add(fn);
    return () => this.updaters[scope].delete(fn);
  }

  wait(sec, scope = 'chapter') {
    return new Promise((res) => {
      let t = 0;
      const f = (dt) => { t += dt; if (t >= sec) { this.updaters[scope].delete(f); res(); } };
      this.updaters[scope].add(f);
    });
  }

  waitUntil(pred, scope = 'chapter') {
    return new Promise((res) => {
      const f = (dt) => { if (pred(dt)) { this.updaters[scope].delete(f); res(); } };
      this.updaters[scope].add(f);
    });
  }

  tween(sec, fn, scope = 'chapter', ease = easeInOut) {
    return new Promise((res) => {
      let t = 0;
      fn(0);
      const f = (dt) => {
        t = Math.min(sec, t + dt);
        fn(ease(sec > 0 ? t / sec : 1));
        if (t >= sec) { this.updaters[scope].delete(f); res(); }
      };
      this.updaters[scope].add(f);
    });
  }

  updateHead() {
    this.camera.updateMatrixWorld(true);
    this.camera.getWorldPosition(this.headPos);
    this.camera.getWorldDirection(this.headDir);
    this.headYaw = Math.atan2(-this.headDir.x, -this.headDir.z);
  }

  // 開発用：描画ループを使わず時間を進める（非表示のプレビューでの確認用）
  async debugAdvance(seconds, fps = 20) {
    const n = Math.round(seconds * fps);
    const ch = new MessageChannel();
    const yieldNow = () => new Promise((r) => { ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
    for (let i = 0; i < n; i++) {
      this.tick(1 / fps, i < n - 1);
      await yieldNow();
    }
  }

  tick(fixedDt = null, skipRender = false) {
    const raw = fixedDt === null ? this.clock.getDelta() : 0;
    if (raw) this.perfGuard(raw);
    const dt = fixedDt ?? Math.min(0.05, raw) * this.timeScale;
    this.time += dt;
    this.dt = dt;
    sharedUniforms.uTime.value = this.time;
    this.input.update(dt);
    this.scene.updateMatrixWorld();
    this.updateHead();
    this.interact.update(dt);
    for (const scope of ['global', 'chapter']) {
      for (const f of [...this.updaters[scope]]) {
        try { f(dt); } catch (e) { console.error(e); this.updaters[scope].delete(f); }
      }
    }
    this.ui.update(dt);
    this.updateFarTrees();
    this.env.update(dt, this.headPos);
    this.audio.update();
    if (!skipRender) this.renderer.render(this.scene, this.camera);
  }

  // ---- 章 ----
  clearChapter() {
    this.chapterStart = this.time;
    this.interact.clear();
    this.updaters.chapter.clear();
    this.director.advanceWaiters = [];
    this.scene.add(this.rig);
    this.rig.position.set(0, 0, 0);
    this.rig.rotation.set(0, 0, 0);
    for (const c of [...this.world.children]) { this.world.remove(c); disposeTree(c); }
    this.env.resetForChapter();
    this.nav = { mode: 'none' };
    this.ui.setObjective('');
    this.ui.clearGazeGuides();
    setPaths(null);
    this.ui.hideSubtitle();
    this.ui.setVignette(0);
  }

  async run(start = 0) {
    for (let i = start; i < CHAPTERS.length; i++) {
      this.chapterIndex = i;
      await this.ui.fadeOut(0.6);
      this.clearChapter();
      try {
        const next = await CHAPTERS[i].run(this, this.director);
        if (next === 'title') {
          // 終章のあと：タイトルに戻る
          this.clearChapter();
          await this.onTitle?.();
          return;
        }
        if (typeof next === 'number') i = next - 1;
      } catch (e) {
        console.error('chapter error', e);
      }
    }
  }

  async start(chapter = 0) {
    if (this.started) return;
    this.started = true;
    this.audio.init();
    await Promise.race([this.fontsReady, new Promise((r) => setTimeout(r, 4000))]);
    await this.run(chapter);
  }
}

// 台本で使う文字のフォントを先に読み込んでおく（字幕表示の遅れを防ぐ）
async function preloadGlyphs() {
  try {
    const files = ['src/story/chapters.js', 'src/story/sources.js', 'src/core/ui.js'];
    const texts = await Promise.all(files.map((f) => fetch(f).then((r) => r.text())));
    const chars = [...new Set(texts.join('').replace(/[\x00-\x7f]/g, ''))].join('') + '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    await Promise.all([
      document.fonts.load(`400 32px "Shippori Mincho"`, chars),
      document.fonts.load(`700 32px "Shippori Mincho"`, chars),
    ]);
  } catch (e) { console.warn('font preload failed', e); }
}
const fontsReady = preloadGlyphs();

// オフラインでも遊べるよう、必要なファイルを端末に保存する（https・localhost など安全な接続のときだけ）
if ('serviceWorker' in navigator && window.isSecureContext) {
  // updateViaCache: 'none' … サービスワーカーと一覧（precache.js）の更新確認で HTTP キャッシュを使わない
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch((e) => console.warn('service worker', e));
}

// ---- 起動画面 ----
const game = new Game();
window.game = game;
game.fontsReady = fontsReady;

const $ = (id) => document.getElementById(id);
$('app-version').textContent = VERSION_LABEL;
const sel = $('sel-chapter');
CHAPTERS.forEach((c, i) => {
  const o = document.createElement('option');
  o.value = i; o.textContent = c.name;
  sel.appendChild(o);
});
if (params.get('ch')) sel.value = params.get('ch');
if (params.get('quality')) $('sel-quality').value = params.get('quality');

// Quest 2・初代 Quest（Quest のブラウザで、Quest 3 / Pro 以外）
function isLightDevice() {
  const ua = navigator.userAgent;
  if (/Quest 2/i.test(ua)) return true;
  return /OculusBrowser/i.test(ua) && !/Quest (3|Pro)/i.test(ua);
}

// 画質：標準（Quest 2）／高（Quest 3 以降・PC。影・木や草を増やす）
function applyQuality(choice) {
  const q = choice === 'auto' ? (isLightDevice() ? 'standard' : 'high') : choice;
  const high = q === 'high';
  QUALITY.trees = high ? 1.2 : 0.55;
  QUALITY.grass = high ? 1.6 : 0.5;
  QUALITY.shadows = high;
  game.renderer.shadowMap.enabled = high;
  game.renderer.xr.setFoveation(high ? 0.5 : 1);
  game.settings.quality = q;
}

function readSettings() {
  game.settings.voice = $('opt-voice').checked;
  game.settings.vignette = $('opt-vignette').checked;
  game.settings.smoothMove = $('opt-smoothmove').checked;
  if (!game.started) applyQuality($('sel-quality').value);
}

async function openVRSession() {
  const session = await navigator.xr.requestSession('immersive-vr', {
    optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'],
  });
  await game.renderer.xr.setSession(session);
  session.addEventListener('end', () => {
    $('xr-ended').classList.remove('hidden');
  });
  $('start').classList.add('hidden');
  $('xr-ended').classList.add('hidden');
  $('hud').classList.add('hidden');
  game.audio.init();
  return session;
}

async function enterVR() {
  readSettings();
  try {
    await openVRSession();
    game.start(Number(sel.value));
  } catch (e) {
    console.error(e);
    $('vr-status').textContent = 'VRを開始できませんでした：' + e.message;
  }
}

// ---- Quest にアプリとして入れたとき ----
// アプリのアイコンから開くと、ページを読み込んだらすぐ VR に入る（Meta の方式）。
// 2D の起動画面は VR の中では見えないので、題名と章選びを VR の中のメニューで出す。
function isInstalledApp() {
  if (params.get('app') === '1') return true; // 開発用
  if (document.referrer.startsWith('android-app://')) return true;
  return ['standalone', 'fullscreen', 'minimal-ui'].some((m) => matchMedia(`(display-mode: ${m})`).matches);
}

async function vrTitleMenu() {
  await game.wait(0.6, 'global'); // 頭の位置が決まってからメニューを置く
  game.env.set('dawnMist');
  // 起動直後は暗転しているので、明るくしてからメニューを出す
  game.ui.fadeIn(1.2);
  for (;;) {
    const choice = await game.ui.menu('志す方へ', [
      { key: 'start', label: 'はじめから' },
      { key: 'chapters', label: '章を選ぶ' },
    ], { footer: VERSION_LABEL });
    if (choice === 'start') return 0;
    const ch = await game.ui.menu('章を選ぶ', [
      ...CHAPTERS.map((c, i) => ({ key: i, label: c.name.replace(/（.*）/, '') })),
      { key: 'back', label: 'もどる' },
    ], { dist: 1.9, y: 0.1 });
    if (ch !== 'back') return ch;
  }
}

// タイトルに戻る：VR の中なら VR のタイトルメニュー、PC なら起動画面
game.onTitle = async () => {
  if (game.isXR) {
    const ch = await vrTitleMenu();
    game.run(ch);
    return;
  }
  game.started = false;
  game.ui.fade(0, 0);
  $('hud').classList.add('hidden');
  $('start').classList.remove('hidden');
};

async function autoEnterVR() {
  readSettings();
  try {
    await openVRSession();
  } catch (e) {
    console.warn('自動で VR に入れませんでした', e);
    return false;
  }
  const ch = await vrTitleMenu();
  game.start(ch);
  return true;
}

function enterPC() {
  readSettings();
  $('start').classList.add('hidden');
  $('xr-ended').classList.add('hidden');
  $('hud').classList.remove('hidden');
  game.audio.init();
  game.start(Number(sel.value));
}

$('btn-vr').addEventListener('click', enterVR);
$('btn-pc').addEventListener('click', enterPC);
$('btn-vr-resume').addEventListener('click', enterVR);
$('btn-pc-resume').addEventListener('click', enterPC);

(async () => {
  const st = $('vr-status');
  if (!window.isSecureContext) {
    st.textContent = 'VRには HTTPS（または localhost）での配信が必要です。PCモードは利用できます。';
    return;
  }
  if (!navigator.xr) { st.textContent = 'この端末のブラウザは WebXR に対応していません。PCモードで体験できます。'; return; }
  try {
    const ok = await navigator.xr.isSessionSupported('immersive-vr');
    $('btn-vr').disabled = !ok;
    st.textContent = ok ? 'Meta Quest のブラウザで「VRで体験する」を押してください。' : 'VR機器が見つかりません。PCモードで体験できます。';
    // アプリとして開いたときは、すぐ VR に入る（入れなければ起動画面のまま）
    if (ok && isInstalledApp() && !game.started) await autoEnterVR();
  } catch (e) {
    st.textContent = 'VR対応を確認できませんでした。';
  }
})();

window.applyQuality = applyQuality; // 開発用
window.vrTitleMenu = vrTitleMenu; // 開発用（PC で VR のタイトルメニューを確かめる）
if (params.get('autostart') === 'pc') enterPC();
