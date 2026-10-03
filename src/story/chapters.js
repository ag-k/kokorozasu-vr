// 章ごとの台本。西ノ島の伝承を軸に、知夫里島の伝承・『太平記』・『増鏡』を出典の札とともに語る。
import * as THREE from 'three';
import { SRC } from './sources.js';
import { buildExileSea, buildEscapeSea, buildHoki } from '../scenes/sea.js';
import { buildChiburi, CHIBURI } from '../scenes/chiburi.js';
import { buildBeppu, addBeppuNight, HOPS, PAL_ROUTE, PATROL, makePalanquin } from '../scenes/beppu.js';
import { buildKomukai, K } from '../scenes/komukai.js';
import { buildAkanoe, LEG_A, LEG_B, LEG_C, DROP_X } from '../scenes/akanoe.js';
import { followPath, P } from '../scenes/stage.js';
import { makeShaku, makeKakebotoke, makeShari, makeGlow } from '../core/props.js';
import { yawTo, clamp } from '../core/util.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const BOW = -Math.PI / 2; // 舟のローカル +X（船首）を向く yaw

function lock() {
  let p = Promise.resolve();
  return (fn) => { const r = p.then(fn); p = r.catch(() => {}); return r; };
}

function anchor(st, x, y, z, parent = st.root) {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}

const isXR = (g) => g.isXR;

// 物を海へ落とす（放物線 → 水しぶき → 沈む光）
function dropToSea(g, obj, { vx = 0, vy = 1, vz = 0, glow = 0xffe2a0 } = {}) {
  const v = V3(vx, vy, vz);
  let phase = 0, t = 0;
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xdfe9f0, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.26, 32), ringMat);
  ring.rotation.x = -Math.PI / 2;
  const halo = makeGlow(glow, 0.8, 0.9);
  obj.add(halo);
  return g.waitUntil((dt) => {
    t += dt;
    if (phase === 0) {
      v.y -= 9.8 * dt;
      obj.position.addScaledVector(v, dt);
      obj.rotation.x += dt * 3; obj.rotation.z += dt * 2;
      if (obj.position.y < 0.05) {
        phase = 1; t = 0;
        g.audio.sfx('splash');
        ring.position.set(obj.position.x, 0.08, obj.position.z);
        g.scene.add(ring);
      }
      return false;
    }
    obj.position.y -= dt * 0.35;
    obj.position.x += v.x * dt * 0.1; obj.position.z += v.z * dt * 0.1;
    ring.scale.setScalar(1 + t * 5);
    ringMat.opacity = Math.max(0, 0.6 - t * 0.25);
    halo.material.opacity = Math.max(0, 0.9 - t * 0.3);
    if (t > 3.5) {
      g.scene.remove(ring); ring.geometry.dispose(); ringMat.dispose();
      obj.parent?.remove(obj);
      return true;
    }
    return false;
  });
}

// ============================================================
// 序章　配流の海
// ============================================================
async function prologue(g, d) {
  const S = buildExileSea(g);
  g.input.place(S.ship, S.playerPos, BOW);
  g.audio.setAmbience({ sea: 0.9, wind: 0.5, insects: 0, fire: 0, music: 0.55, mood: 'sorrow', pad: 0.45 });
  await g.ui.showTitle('序章', '配流の海', '元弘二年（一三三二）春　隠岐へ');
  g.ui.fadeIn(2.5);
  await g.wait(1.5);
  await d.hint(isXR(g) ? '人差し指のトリガー（またはA・Xボタン）で字幕を送れます' : 'クリック・スペースキーで字幕を送れます', 6);
  await d.narrate('元弘元年（一三三一）、後醍醐天皇は鎌倉幕府を倒そうと兵を挙げた。しかし計画は敗れ、帝は捕らえられた。', SRC.tottori);
  await d.narrate('翌元弘二年三月七日。帝は武装した武士たちに前後左右を囲まれ、京を発った。', SRC.taiheiki);
  await d.narrate('付き従うのは、千種忠顕、一条行房、そして三位の局。沿道の人々はその姿を嘆き、警固の武士さえ涙したという。', SRC.taiheiki);
  await d.narrate('一行は山陰へ出て海を渡る。出航の湊は、『太平記』では出雲の見尾の湊、『増鏡』ではやすぎの津と、書物によって異なる。');

  // 操作の練習：忠顕に声をかける
  d.objective('そばに立つ忠顕に声をかける');
  d.hint(isXR(g) ? 'コントローラーを忠顕に向け、光る印が大きくなったらトリガーを引きます' : '忠顕をクリックします', 8);
  await g.interact.add({ object: S.tadaaki, label: '千種忠顕', offset: V3(0, 1.1, 0), radius: 0.5 }).promise;
  d.objective('');
  await d.say('忠顕', '……波が高うございます。どうか、お身体を冷やされませぬよう。', { fig: S.tadaaki });
  await d.say('帝', '行く手の島は、見えるか。');
  await d.say('忠顕', '霧の向こうに。あれが、隠岐にございます。', { fig: S.tadaaki });

  // 霧が晴れて島影が見える
  g.env.set('dawnClear', 12);
  d.objective('霧の向こうの島影を見る');
  await g.wait(3);
  await d.waitGaze(S.islandsPoint, { deg: 22, secs: 1.5 });
  d.objective('');
  g.audio.sfx('chime');
  await d.narrate('隠岐。かつて後鳥羽院も流され、この地で長い年月を過ごした島である。', SRC.masukagami);
  await d.narrate('『増鏡』は、隠岐に着いた帝が、わが身の境遇に、先にこの島で生きた後鳥羽院の運命を重ねたと語る。', SRC.masukagami);
  await d.say('帝', '院も、この波を見られたのであろうか。');
  await g.wait(2);
  await g.ui.fadeOut(2);
}

// ============================================================
// 第一章　仁夫里の浜（知夫里島）
// ============================================================
async function chiburi(g, d) {
  const S = buildChiburi(g);
  const fy = S.boat.userData.floorY;
  g.input.place(S.boat, V3(-0.5, fy, 0), BOW, 0.85);
  g.audio.setAmbience({ sea: 0.6, wind: 0.25, insects: 0, fire: 0, music: 0.5, mood: 'calm', pad: 0.4 });
  await g.ui.showTitle('第一章', '仁夫里の浜', '知夫里島　元弘二年（一三三二）');
  g.ui.fadeIn(2);
  g.ui.setVignette(0.5);
  g.addUpdater(() => { S.boat.userData.oar.rotation.y = Math.sin(g.time * 1.6) * 0.4; });
  S.boat.position.z = 38;
  const arrive = followPath(g, S.boat, [P(0, 38), P(0, S.shoreZ + 2.6)], 2.3, { turn: false });
  await d.narrate('隠岐の島前、知夫里島。帝の一行が上陸したと伝わるのが、この仁夫里浜である。', SRC.chibu);
  await arrive;
  g.ui.setVignette(0);
  await g.ui.fadeOut(0.8);

  // 浜に立つ
  const t = S.terrain;
  g.input.place(g.scene, V3(0, t.heightAt(0, S.landZ), S.landZ), 0);
  S.tadaaki.visible = false;
  const tada = S.st.figOnGround({ robe: '#3d4e66', robe2: '#e5dccb', hat: 'eboshi' }, 1.4, S.landZ + 0.5, 0);
  S.villagers.forEach((v) => S.st.face(v, 0, S.landZ));
  await g.ui.fadeIn(1);
  await d.narrate('浜の上、赤ハゲ山には仁夫里坊があり、帝は上陸ののち、ここに滞在したという。', SRC.chibu);

  // 山へ登る（自由移動の練習）
  g.nav.mode = 'free';
  d.objective('山の上の仁夫里坊へ登る', true);
  d.teachMove('光る道しるべをたどって、山の上へ登りましょう。');
  const guide = [];
  for (const [x, z] of [[3, -20], [10, -28], [18, -40], [24, -52]]) {
    const gl = makeGlow(0xffe0a0, 0.6, 0.7);
    gl.position.set(x, t.heightAt(x, z) + 0.6, z);
    S.st.root.add(gl);
    guide.push(gl);
  }
  const nibuPos = V3(CHIBURI.nibu.x, 0, CHIBURI.nibu.z);
  await d.waitNear(nibuPos, 10);
  guide.forEach((gl) => gl.parent?.remove(gl));
  d.objective('');
  tada.position.set(CHIBURI.nibu.x + 3, t.heightAt(CHIBURI.nibu.x + 3, CHIBURI.nibu.z + 3), CHIBURI.nibu.z + 3);
  S.st.face(tada, CHIBURI.nibu.x, CHIBURI.nibu.z - 20);
  S.st.face(S.monk, g.headPos.x, g.headPos.z);
  await d.say('僧', '遠い海をお越しになりました。粗末な坊ではございますが、どうぞお休みくださいませ。', { fig: S.monk });

  d.objective('山の上から、北の島々を眺める');
  await d.waitGaze(V3(-300, 80, -1100), { deg: 30, secs: 1.5 });
  d.objective('');
  await d.narrate('山の上からは、島前の島々と、それらに抱かれた内海が見渡せる。北に横たわるのが西ノ島である。');
  S.st.face(tada, g.headPos.x, g.headPos.z);
  await d.say('忠顕', 'あの島の別府という地に、御所を設けると聞いております。', { fig: tada });

  await d.narrate('赤ハゲ山には、もう一つ古海坊という寺があった。帝はここにも宿ったと伝わる。', SRC.chibu);
  d.objective('古海坊へ行き、扁額に寺の名を記す');
  const pl = g.interact.add({
    object: S.plaque.mesh, hit: S.plaque.mesh, label: '扁額に寺の名を記す', markerOffset: V3(0, 0.75, 0.05), maxDist: 14,
  });
  await pl.promise;
  d.objective('');
  g.audio.sfx('brush');
  await g.tween(3.5, (k) => { S.drawPlaque(k); if (Math.random() < 0.08) g.audio.sfx('brush'); });
  g.audio.sfx('bell');
  await d.narrate('帝はこの寺を「松尾山松養寺」と名付け、本尊の木造地蔵菩薩立像を寄進したと伝えられる。', SRC.chibu);
  await d.narrate('今の松養寺は、のちの火災で移った寺である。当時の山上の坊とは、場所を分けて考える必要がある。', SRC.chibu);
  await d.narrate('仁夫里坊から古海坊へ。そして古海から舟で、西ノ島の別府へ――そんな道筋が、資料館の展示に示されているという。', SRC.hekifu);
  await g.wait(1.5);
  await g.ui.fadeOut(1.6);
}

// ============================================================
// 第二章　黒木御所（西ノ島・別府）
// ============================================================
async function kurokiGosho(g, d) {
  const S = buildBeppu(g, { night: false });
  const st = S.st, gy = S.gy;
  // 縁側に立ち、南の湾を向く
  g.input.place(g.scene, S.verandaPos.clone().add(V3(0, 0, -0.2)), Math.PI);
  g.audio.setAmbience({ sea: 0.35, wind: 0.25, insects: 0, fire: 0, music: 0.5, mood: 'calm', pad: 0.5 });
  // 千福寺の堂内を灯明で照らす
  st.root.updateMatrixWorld(true);
  const altarLight = S.scroll.localToWorld(V3(0, -0.6, 1.2));
  g.env.setLamp(0, { color: 0xffc080, intensity: 2.5, distance: 7, position: altarLight });
  await g.ui.showTitle('第二章', '黒木御所', '西ノ島・別府　元弘二年（一三三二）');
  await g.ui.fadeIn(2);
  await d.narrate('西ノ島、別府。港の東、湾に突き出した丘の上に、帝の御所が設けられた。', SRC.nishiTown);
  await d.narrate('皮をはがない丸木で建てた仮の御所を、古くは「黒木の御所」と呼んだ。');
  await d.narrate('西ノ島では、帝がこの黒木御所に約一年住んだと伝えている。', SRC.nishiTown);

  g.nav.mode = 'free';
  const tasks = {
    tsubone: '三位の局を訪ねる',
    senpuku: '千福寺で祈る',
    veranda: '縁側に座り、海を眺める',
    mitsuke: '港のそばに浮かぶ小島を見る',
  };
  const done = new Set();
  const refresh = (quiet = false) => {
    d.objective(Object.entries(tasks).map(([k, text]) => ({ text, done: done.has(k) })), quiet);
  };
  refresh(true);
  d.teachMove('御所のまわりを歩いて、ゆかりの場所を訪ねましょう。光る印を選ぶと話が聞けます。');
  const talk = lock();
  const finish = (k) => { done.add(k); g.audio.sfx('chime'); refresh(); };

  // 三位の局
  const pTsubone = g.interact.add({ object: S.tsubone, label: '三位の局', offset: V3(0, 0.7, 0), radius: 0.55 }).promise.then(() => talk(async () => {
    const hp = g.headPos;
    S.tsubone.rotation.y = yawTo(S.tsubone.position.x, S.tsubone.position.z, hp.x, hp.z);
    await d.say('三位の局', 'お上。今日は、風が穏やかでございますね。', { fig: S.tsubone });
    await d.say('帝', 'そなたにまで、このような苦労をかける。');
    await d.say('三位の局', 'いいえ。お側にお仕えすることが、わたくしの務めにございます。', { fig: S.tsubone });
    await d.narrate('御所の近くには、三位の局の屋敷跡が伝わる。局は藤原廉子とされ、帝に付き従ってこの島に来た。', SRC.nishiMap);
    finish('tsubone');
  }));

  // 千福寺
  const pSenpuku = g.interact.add({ object: S.scroll, hit: S.scroll, label: '毘沙門天の絵像に祈る', markerOffset: V3(0, 0.8, 0.1), maxDist: 12 }).promise.then(() => talk(async () => {
    g.audio.sfx('bell');
    await g.wait(1.5);
    await d.narrate('千福寺御座所跡には、帝の行在所であり、帝の御守本尊・毘沙門天の絵像を安置した寺であったという伝承がある。', SRC.nishi);
    await d.narrate('黒木御所と千福寺。どちらからどちらへ移ったのか、その時期や順番までは分からない。暮らしの場と祈りの場が、別府には複数伝えられている。');
    finish('senpuku');
  }));

  // 縁側と歌
  const vAnchor = anchor(st, S.verandaPos.x + 2.2, S.verandaPos.y + 0.6, S.verandaPos.z + 0.2);
  const pVeranda = g.interact.add({ object: vAnchor, label: '縁側に座る', radius: 0.6 }).promise.then(() => talk(async () => {
    g.nav.mode = 'none';
    await g.ui.fadeOut(0.4);
    const seat = V3(S.verandaPos.x + 2.2, S.verandaPos.y, S.verandaPos.z + 0.35);
    // 釣舟：見つめる・指して選ぶ・しばらく待つ、のどれでも先へ進む
    const fb = S.fishing[0];
    g.input.place(g.scene, seat, yawTo(seat.x, seat.z, fb.x, fb.z) - 0.25, 0.85);
    await g.ui.fadeIn(0.6);
    d.objective('湾に浮かぶ釣舟を眺める');
    d.hint(isXR(g) ? '目の前の湾に浮かぶ釣舟（光る印）を見つめるか、指してトリガーを引きます' : '湾に浮かぶ釣舟（光る印）を見つめるか、クリックします', 8);
    const boatIt = g.interact.add({ object: fb.b, label: '釣舟を眺める', offset: V3(0, 1, 0), radius: 4, maxDist: 600, markerOffset: V3(0, 4, 0) });
    const boatGaze = d.waitGaze(() => fb.b.position.clone().setY(1.5), { deg: 16, secs: 1.2 });
    await Promise.race([boatGaze, boatIt.promise, g.wait(30)]);
    boatGaze.cancel();
    boatIt.remove();
    refresh(true);
    const hp = g.headPos.clone();
    const dir = fb.b.position.clone().sub(hp).setY(0).normalize();
    const side = V3(dir.z, 0, -dir.x);
    const pos = hp.clone().addScaledVector(dir, 1.9).addScaledVector(side, 0.95).setY(hp.y + 0.3);
    g.audio.sfx('chime');
    await g.ui.showPoem(['志す方を問はばや浪の上に', '浮きてただよふ海士の釣舟'], pos, hp);
    await d.narrate('志す方を問はばや　浪の上に　浮きてただよふ　海士の釣舟', SRC.masukagami, { min: 6 });
    await d.narrate('波の上に浮かび漂う漁師の舟よ、お前はどこを目指しているのか、尋ねてみたい――。', SRC.masukagami);
    await d.narrate('『増鏡』は、浦を眺め、遠くの釣舟に心を寄せる帝の姿にこの歌を置く。ただし同書は帝の居所を国分寺としており、この歌が黒木御所で詠まれたとまでは言えない。', SRC.masukagami);
    await d.narrate('自由に海を行き来する舟。それを見つめる帝は、島にとどめられている。');
    await g.ui.hidePoem();
    g.input.place(g.scene, S.verandaPos.clone(), g.headYaw);
    g.nav.mode = 'free';
    finish('veranda');
  }));

  // 見付島（見るだけで始まる）
  const pMitsuke = d.waitGaze(S.mitsukeLook, { deg: 9, secs: 1.4 }).then(() => talk(async () => {
    await d.narrate('湾の向こう、港のすぐそばに浮かぶ見付島。黒木御所を見渡せるこの島から、監視の者がたびたび帝を見張ったという。', SRC.nishiMap);
    await d.narrate('御所の西、湾を見下ろす台地には、隠岐判官・佐々木清高の館があったと伝わる。御所を守り、同時に見張る側の館である。', SRC.board);
    await d.narrate('目の前の海は、都へ続く道。けれども、その海へ出ようとする動きは、見張られている。');
    finish('mitsuke');
  }));

  await Promise.all([pTsubone, pSenpuku, pVeranda, pMitsuke]);
  d.objective('');
  g.nav.mode = 'none';
  await g.wait(1);

  // 季節が巡る
  await g.ui.fadeOut(1);
  g.input.place(g.scene, S.verandaPos.clone().add(V3(0, 0, 0.35)), Math.PI + 0.2, 0.85);
  await g.ui.fadeIn(1);
  g.audio.setAmbience({ mood: 'sorrow', wind: 0.4 });
  await d.narrate('季節は巡った。');
  await g.env.set('sunset', 5);
  S.fishing.forEach((f) => { f.b.visible = false; });
  g.env.set('winter', 7);
  g.env.setSnow(1, 1, 6);
  g.audio.setAmbience({ wind: 0.8, sea: 0.6 }, 4);
  await d.narrate('冬が来て、島での日々は静かに過ぎていった。');
  await g.wait(3);
  g.env.setSnow(0, 0, 5);
  g.env.set('spring', 7);
  g.audio.setAmbience({ wind: 0.3, sea: 0.35 }, 4);
  await d.narrate('そして元弘三年（一三三三）。島にも、春の兆しが訪れた。');
  await g.wait(2);

  // 夜、御所の中で
  await g.ui.fadeOut(1);
  g.env.set('night');
  g.audio.setAmbience({ insects: 0.7, mood: 'tension', pad: 0.2, music: 0.4, sea: 0.25, wind: 0.2 });
  const inside = S.goshoWorld(0.6, 0.7, -0.4);
  g.input.place(g.scene, inside, 0, 0.85);
  const lampPos = S.gosho.userData.lampFire.getWorldPosition(V3(0, 0, 0));
  g.env.setLamp(0, { color: 0xffb070, intensity: 3, distance: 10, position: lampPos.add(V3(0, 0.2, 0)) });
  const tp = S.goshoWorld(0.4, 0.7, 1.6), sp = S.goshoWorld(-1.4, 0.7, 0.8);
  const tadaaki = st.fig({ robe: '#3d4e66', robe2: '#e5dccb', hat: 'eboshi', seated: true }, tp.x, tp.y, tp.z, 0);
  const tsu2 = st.fig({ robe: '#8a3548', robe2: '#e9c9a8', layers: ['#d8a640', '#4f7d4f', '#efe3c8'], hat: 'long', seated: true, h: 1.55 }, sp.x, sp.y, sp.z, 0);
  st.face(tadaaki, inside.x, inside.z);
  st.face(tsu2, inside.x, inside.z);
  await g.ui.fadeIn(1.2);
  await d.say('忠顕', 'お上。警固の富士名義綱が、本土の味方の動きを伝え、お力になりたいと申し出ておりました。', { fig: tadaaki, source: SRC.taiheiki });
  await d.say('忠顕', 'ですが、支度のため出雲へ渡ったきり、義綱は戻りませぬ。', { fig: tadaaki, source: SRC.taiheiki });
  await d.say('帝', '……もう待つまい。われらで動こう。');
  await d.say('忠顕', '島の者たちが、小向の浜に舟を用意すると申しております。', { fig: tadaaki });
  await d.say('三位の局', 'お上。わたくしが出産のため御所を下がる――そういうことにいたしましょう。わたくしの輿を、お使いくださいませ。', { fig: tsu2 });
  await d.narrate('『太平記』は、三位の局の出産を名目にした輿で、帝が忠顕だけを伴って御所を出たと語る。', SRC.taiheiki);

  // 輿に乗る
  const pal = makePalanquin();
  const pp = S.goshoWorld(0, 0, 6);
  st.add(pal, pp.x, pp.y, pp.z, 0);
  // 担ぎ手は轅（ながえ）の外側に立つ（轅が体を貫かないように）
  [[-0.9, -1.9], [0.9, -1.9], [-0.9, 1.9], [0.9, 1.9]].forEach(([x, z]) => st.fig({ robe: '#5b5344', hat: 'topknot' }, x, 0, z, 0, pal));
  d.objective('庭に据えられた輿に乗る');
  await g.interact.add({ object: pal, label: '輿に乗る', offset: V3(0, 1.4, 0), radius: 0.8, maxDist: 20 }).promise;
  d.objective('');
  await g.ui.fadeOut(1.2);
}

// ============================================================
// 第三章　闇にまぎれて（別府 → 小向）
// ============================================================
async function escapeNight(g, d) {
  const S = buildBeppu(g, { night: true });
  const N = addBeppuNight(g, S);
  g.nav.mode = 'none'; // 輿・忍び足の間は自由に動かない
  const st = S.st, gy = S.gy, t = S.terrain;
  g.audio.setAmbience({ sea: 0.3, wind: 0.2, insects: 0.8, fire: 0.3, music: 0.4, mood: 'sorrow', pad: 0.25 });

  // 輿（御所の北の庭から門を出て、丘を下る）
  const pal = makePalanquin();
  st.add(pal, PAL_ROUTE[0][0], gy, PAL_ROUTE[0][1], 0);
  const bearers = [[-0.9, -1.9], [0.9, -1.9], [-0.9, 1.9], [0.9, 1.9]].map(([x, z]) => st.fig({ robe: '#4a4438', hat: 'topknot' }, x, 0, z, 0, pal));
  st.fig({ robe: '#2f3a4c', robe2: '#cfc6b5', hat: 'eboshi' }, 1.2, 0, -0.4, 0, pal);
  g.input.place(pal, pal.userData.seat, 0, 0.9);
  const bw = V3();
  const walker = g.addUpdater(() => {
    bearers.forEach((b, i) => {
      b.userData.body.position.y = Math.abs(Math.sin(g.time * 4 + i)) * 0.03;
      // 石段・坂では、担ぎ手ごとに足元の高さへ合わせる（段にめり込まない）
      b.getWorldPosition(bw);
      const gyB = st.groundAt(bw.x, bw.z);
      if (gyB !== null && gyB !== undefined) b.position.y = Math.max(-0.6, Math.min(0.6, gyB - pal.position.y));
    });
  });

  await g.ui.showTitle('第三章', '闇にまぎれて', '元弘三年（一三三三）閏二月');
  await g.ui.fadeIn(2);
  g.ui.setVignette(0.55);
  await d.narrate('元弘三年閏二月。夜の闇にまぎれ、局の輿が御所の門を出る。', SRC.taiheiki);
  let gateSaid = false;
  await followPath(g, pal, PAL_ROUTE.map(([x, z]) => P(x, z)), 1.1, {
    onStep: (k, dt) => {
      const gyNow = st.groundAt(pal.position.x, pal.position.z) ?? gy;
      pal.position.y += (gyNow - pal.position.y) * Math.min(1, dt * 4);
      if (!gateSaid && pal.position.z < -10) {
        gateSaid = true;
        d.say('警固の武士', '局様の御輿か。……夜分に、ご苦労でござる。通られよ。', { fig: N.gateGuards[0] });
      }
    },
  });
  walker();
  g.ui.setVignette(0);
  await g.wait(1.5);
  await g.ui.fadeOut(0.8);

  // 歩いて西へ。判官館の南、浜沿いを抜ける
  st.root.remove(pal);
  const hopY = (i) => t.heightAt(HOPS[i][0], HOPS[i][1]);
  const placeAtHop = (i) => {
    const [x, z] = HOPS[i];
    const nx = HOPS[Math.min(i + 1, HOPS.length - 1)];
    g.input.place(g.scene, V3(x, hopY(i), z), i + 1 < HOPS.length ? yawTo(x, z, nx[0], nx[1]) : yawTo(x, z, x - 50, z + 10));
  };
  placeAtHop(0);
  const tada = st.fig({ robe: '#2f3a4c', robe2: '#cfc6b5', hat: 'eboshi' }, 0, 0, 0);
  const guide = st.fig({ robe: '#4a4438', hat: 'kasa', prop: 'lantern' }, 0, 0, 0);
  const setNpc = (f, i, dx, dz) => {
    const [x, z] = HOPS[Math.min(i, HOPS.length - 1)];
    f.position.set(x + dx, t.heightAt(x + dx, z + dz), z + dz);
    const n = HOPS[Math.min(i + 1, HOPS.length - 1)];
    st.face(f, n[0] - 20, n[1] + 5);
  };
  setNpc(tada, 0, 1.2, 0.8);
  setNpc(guide, 1, 0.6, 0.6);
  const guideLamp = V3();
  g.addUpdater(() => {
    guide.userData.lantern.getWorldPosition(guideLamp);
    g.env.setLamp(1, { color: 0xffb060, intensity: 2.2, distance: 9, position: guideLamp });
  });
  await g.ui.fadeIn(1);
  await d.say('忠顕', 'ここからは、歩いてまいりましょう。', { fig: tada });
  await d.say('島の男', '足元にお気をつけを。この先の道は、わしが知っております。', { fig: guide });
  await d.narrate('夜の道を知る、名も知れぬ土地の男。『太平記』でも、道に迷った帝と忠顕を、名も知れぬ男が助けたと語られる。', SRC.taiheiki);

  // 判官館から出た巡回の武士
  const PA = V3(PATROL.a[0], 0, PATROL.a[1]), PB = V3(PATROL.b[0], 0, PATROL.b[1]);
  let pT = 0.15, pDir = 1, pause = 0, range = 13, halfAng = 0.62;
  const patrol = N.patrol;
  g.audio.setAmbience({ mood: 'tension', music: 0.45 });
  g.addUpdater((dt) => {
    const len = PA.distanceTo(PB);
    if (pause > 0) {
      pause -= dt;
      patrol.rotation.y += Math.sin(g.time * 1.5) * dt * 0.8;
    } else {
      pT += (pDir * 1.1 * dt) / len;
      if (pT >= 1 || pT <= 0) { pT = clamp(pT, 0, 1); pDir *= -1; pause = 2.5; }
      const x = PA.x + (PB.x - PA.x) * pT, z = PA.z + (PB.z - PA.z) * pT;
      patrol.position.set(x, t.heightAt(x, z), z);
      const tx = pDir > 0 ? PB : PA;
      const want = yawTo(x, z, tx.x, tx.z);
      let df = want - patrol.rotation.y;
      df = Math.atan2(Math.sin(df), Math.cos(df));
      patrol.rotation.y += df * Math.min(1, dt * 3);
    }
    N.fan.position.set(patrol.position.x, patrol.position.y + 0.25, patrol.position.z);
    N.fan.rotation.y = patrol.rotation.y;
    N.fan.scale.setScalar(range);
    const fp = V3(); patrol.userData.flame.getWorldPosition(fp);
    g.env.setLamp(0, { color: 0xff9a40, intensity: 4, distance: 16, position: fp });
  });
  const seen = (x, z) => {
    const px = patrol.position.x, pz = patrol.position.z;
    const dx = x - px, dz = z - pz;
    const dist = Math.hypot(dx, dz);
    if (dist > range) return false;
    const fwx = -Math.sin(patrol.rotation.y), fwz = -Math.cos(patrol.rotation.y);
    const cos = (dx * fwx + dz * fwz) / Math.max(dist, 0.001);
    return cos > Math.cos(halfAng) || dist < 2.5;
  };

  const hopGoal = HOPS.length - 1;
  const hopObjective = (quiet) => d.objective(`松明の光を避けながら、光る印をたどって西へ抜ける（物陰 ${i} / ${hopGoal}）`, quiet);
  let caught = 0;
  let i = 0;
  hopObjective(true);
  d.hint('見張りの松明が向こうを向いている間に、次の印を選ぶと進めます。', 8);
  while (i < hopGoal) {
    const [nx, nz] = HOPS[i + 1];
    const a = anchor(st, nx, hopY(i + 1) + 0.9, nz);
    await g.interact.add({ object: a, label: '次の物陰へ進む', radius: 0.7, maxDist: 40 }).promise;
    const [cx, cz] = HOPS[i];
    const danger = seen(nx, nz) || seen((cx + nx) / 2, (cz + nz) / 2);
    await g.ui.fade(1, 0.25);
    if (danger) {
      caught++;
      g.audio.sfx('drum');
      g.input.pulse(0.9, 250);
      placeAtHop(i);
      await g.ui.fade(0, 0.3);
      await d.say('警固の武士', '誰だ！　そこに誰かおるのか！', { fig: patrol });
      await d.say('島の男', '……伏せて。灯りが向こうを向くまで、お待ちを。', { fig: guide });
      if (caught >= 2) { range = 9; halfAng = 0.5; }
      continue;
    }
    g.audio.sfx('step');
    i++;
    hopObjective(true);
    placeAtHop(i);
    setNpc(tada, i, 1.1, 0.9);
    setNpc(guide, i + 1, 0.8, 0.3);
    await g.ui.fade(0, 0.35);
  }
  d.objective('');
  await d.say('島の男', 'ここまで来れば、灯りは届きませぬ。小向へは、山を越えて西へ参ります。', { fig: guide });
  await d.narrate('御所から小向までの道筋は伝わっていない。一行は闇の中、島の西側、美田の入り江に面した小向を目指した。');
  await g.ui.fadeOut(1.5);

  // ---- 小向（美田湾の東岸）----
  g.clearChapter();
  const Kb = buildKomukai(g);
  const kst = Kb.st, kt = Kb.terrain;
  g.audio.setAmbience({ sea: 0.35, wind: 0.2, insects: 0.8, fire: 0, music: 0.45, mood: 'sorrow', pad: 0.3 });
  g.input.place(g.scene, V3(K.arrive.x, kt.heightAt(K.arrive.x, K.arrive.z), K.arrive.z), yawTo(K.arrive.x, K.arrive.z, -120, 120));
  const tada2 = kst.figOnGround({ robe: '#2f3a4c', robe2: '#cfc6b5', hat: 'eboshi' }, K.arrive.x + 1.3, K.arrive.z - 1.0);
  const guide2 = kst.figOnGround({ robe: '#4a4438', hat: 'kasa', prop: 'lantern' }, K.stone.x + 2.5, K.stone.z + 2.5);
  kst.face(tada2, -120, 120);
  kst.face(guide2, K.arrive.x, K.arrive.z);
  const gl2 = V3();
  g.addUpdater(() => {
    guide2.userData.lantern.getWorldPosition(gl2);
    g.env.setLamp(1, { color: 0xffb060, intensity: 2.2, distance: 9, position: gl2 });
  });
  await g.ui.fadeIn(1.5);
  await d.narrate('美田の入り江に面した浜、小向。', SRC.nishiMap);
  await d.say('島の男', '舟は、まもなく参ります。どうか、ここでしばしお休みを。', { fig: guide2 });
  d.objective('石に腰を下ろして、舟を待つ');
  await g.interact.add({ object: Kb.stone, label: '石に腰を下ろす', offset: V3(0, 0.9, 0), radius: 0.6 }).promise;
  d.objective('');
  await g.ui.fade(1, 0.3);
  const seatYaw = yawTo(K.stone.x, K.stone.z, -120, 120);
  g.input.place(g.scene, V3(K.stone.x, Kb.stoneY + 0.45, K.stone.z), seatYaw, 0.75);
  tada2.position.set(K.stone.x + 1.3, kt.heightAt(K.stone.x + 1.3, K.stone.z - 1.2), K.stone.z - 1.2);
  kst.face(tada2, -120, 120);
  await g.ui.fade(0, 0.5);
  await d.narrate('小向には、帝が乗船までの短い間に腰掛けて休んだという「御腰掛けの石」が伝わっている。', SRC.nishiMap);
  await d.narrate('天皇であっても、御所を離れれば自分の足で進み、人に支えられ、舟が来るのを待たなければならない。');

  // 入り江の奥から迎えの舟が近づく
  const boatArrive = followPath(g, Kb.boat, [P(-75, 88), P(-50, 55), P(K.boatAt.x, K.boatAt.z)], 3.2, { yawOffset: Math.PI / 2 });
  const bl = V3();
  g.addUpdater(() => { Kb.boat.userData.oar.rotation.y = Math.sin(g.time * 1.6) * 0.4; Kb.boatLamp.getWorldPosition(bl); });

  // 木村家
  const master = kst.fig({ robe: '#6a5a44', hat: 'topknot' }, 0, 0, 0);
  const wife = kst.figOnGround({ robe: '#7a6a5a', robe2: '#e0d6c0', hat: 'long', h: 1.5 }, K.kimura.x - 3, K.kimura.z + 2.5);
  const fx = -Math.sin(seatYaw), fz = -Math.cos(seatYaw);
  const mPos = V3(K.stone.x + fx * 1.4 - fz * 0.6, 0, K.stone.z + fz * 1.4 + fx * 0.6);
  master.position.set(mPos.x, kt.heightAt(mPos.x, mPos.z), mPos.z);
  kst.face(master, K.stone.x, K.stone.z);
  kst.face(wife, K.stone.x, K.stone.z);
  await d.say('木村家の主', 'このような浜のあばら家で、何のおもてなしもできず……。', { fig: master });
  await d.say('忠顕', 'お上、こちらを。', { fig: tada2 });
  g.interact.hold('kakebotoke', makeKakebotoke(), {
    xrPos: V3(0, 0.03, -0.09), xrRot: new THREE.Euler(-0.5, 0, 0),
    pcPos: V3(0.16, -0.17, -0.42), pcRot: new THREE.Euler(0.1, -0.25, 0),
  });
  d.objective('木村家の主に懸仏を授ける');
  d.hint(isXR(g) ? '手にした懸仏を主に差し出し、トリガーを引くか、グリップを離します' : '主をクリックして懸仏を授けます', 7);
  const mChest = V3();
  await g.interact.add({
    object: master, label: '木村家の主', giveLabel: '懸仏を授ける', accepts: 'kakebotoke', offset: V3(0, 1.1, 0), radius: 0.5,
    zone: (p) => { master.getWorldPosition(mChest); mChest.y += 1.0; return p.distanceTo(mChest) < 0.9; },
    onGive: () => {
      const obj = g.interact.dropHeld();
      master.attach(obj);
      obj.position.set(0, 1.0, -0.28);
      obj.rotation.set(0, Math.PI, 0);
    },
  }).promise;
  d.objective('');
  g.audio.sfx('bell');
  master.userData.body.rotation.x = 0.25;
  await d.say('木村家の主', '……もったいのうございます。家の宝として、末代までお守りいたします。', { fig: master });
  master.userData.body.rotation.x = 0;
  await d.narrate('小向の木村家には、帝から賜ったと伝わる愛染明王の懸仏が伝えられている。', SRC.takuhi);
  await d.narrate('ただし、天皇から授けられたという由緒と、品物の年代や授与の事情が実証されているかどうかは、別の問題である。');
  await boatArrive;
  await d.say('島の男', '舟が参りました。さあ、お早く。', { fig: guide2 });
  // 石から立ち、男の案内で浜の近くまで下りる（舟まで遠すぎて選びにくいため）
  await g.ui.fade(1, 0.5);
  {
    const lx = K.boatAt.x, lz = K.boatAt.z;
    const dx = K.stone.x - lx, dz = K.stone.z - lz, len = Math.hypot(dx, dz);
    const px = lx + (dx / len) * 9, pz = lz + (dz / len) * 9;
    g.input.place(g.scene, V3(px, kt.heightAt(px, pz), pz), yawTo(px, pz, lx, lz));
    // 案内の男と忠顕は左右に控え、舟への視線をふさがない
    const sx = -dz / len, sz = dx / len;
    const put = (f, k, back) => {
      const x = px + sx * k + (dx / len) * back, z = pz + sz * k + (dz / len) * back;
      f.position.set(x, kt.heightAt(x, z), z);
      kst.face(f, lx, lz);
    };
    put(guide2, 2.4, -1.5);
    put(tada2, -1.8, 0.8);
  }
  await g.ui.fade(0, 0.6);
  g.nav.mode = 'free';
  d.objective('舟に乗る', true);
  d.hint(isXR(g) ? '浜に着いた小舟（光る印）を指してトリガーを引くか、しばらく見つめます' : '浜に着いた小舟（光る印）をクリックするか、しばらく見つめます', 8);
  const boatIt = g.interact.add({ object: Kb.boat, label: '小舟に乗る', offset: V3(0, 0.6, 0), radius: 2, maxDist: 120 });
  const boatGaze = d.waitGaze(() => Kb.boat.position.clone().setY(1), { deg: 12, secs: 2 });
  await Promise.race([boatIt.promise, boatGaze]);
  boatGaze.cancel();
  boatIt.remove();
  g.nav.mode = 'none';
  d.objective('');
  await g.ui.fadeOut(1.2);
}

// ============================================================
// 第四章　笏の江（小向 → 赤ノ江 → 赤崎）
// ============================================================
async function akanoe(g, d) {
  const S = buildAkanoe(g);
  g.input.place(S.boat, S.playerSeat, BOW, 0.85);
  g.audio.setAmbience({ sea: 0.5, wind: 0.3, insects: 0.25, fire: 0, music: 0.45, mood: 'sorrow', pad: 0.3 });
  const lp = V3();
  g.addUpdater(() => {
    S.lantern.getWorldPosition(lp);
    g.env.setLamp(1, { color: 0xffb060, intensity: 1.6, distance: 9, position: lp.add(V3(0, 0.2, 0)) });
    S.boat.userData.oar.rotation.y = Math.sin(g.time * 1.8) * 0.45;
  });
  // 区間の始めに舟を置き、進む向きへ向ける
  const startLeg = (leg) => {
    S.boat.position.set(leg[0].x, 0.05, leg[0].z);
    S.boat.rotation.y = yawTo(leg[0].x, leg[0].z, leg[1].x, leg[1].z) + Math.PI / 2;
  };
  await g.ui.showTitle('第四章', '笏の江', '小向から赤崎へ');
  g.interact.hold('shaku', makeShaku(), {
    xrPos: V3(0, 0.02, -0.05),
    pcPos: V3(0.3, -0.42, -0.6), pcRot: new THREE.Euler(0.35, -0.25, 0.15),
  });

  // 区間A：小向を出て、入り江を南へ
  startLeg(LEG_A);
  await g.ui.fadeIn(2);
  g.ui.setVignette(0.5);
  let leg = followPath(g, S.boat, LEG_A.map((p) => P(p.x, p.z)), 3.4, { yawOffset: Math.PI / 2 });
  await d.narrate('帝は小向から小舟に乗り、入り江を赤崎の岬へと急いだ。', SRC.nishiMap);
  d.objective('笏を手に、赤崎の岬を目指す');
  if (isXR(g)) d.hint('右手に笏を持っています', 5);
  await d.say('島の男', 'この入り江を南西へ下り、湾を渡って西の岸へ出ます。しっかり、おつかまりを。', { fig: S.rower });
  await leg;
  await g.ui.fadeOut(1.2);

  // 区間B：湾を南西へ渡りきり、西岸の赤ノ江へ
  startLeg(LEG_B);
  await g.wait(0.3);
  await g.ui.fadeIn(1.2);
  leg = followPath(g, S.boat, LEG_B.map((p) => P(p.x, p.z)), 3.2, { yawOffset: Math.PI / 2 });
  await d.narrate('湾を渡りきると、西の岸に小さな入り江が口を開けていた。');
  await g.waitUntil(() => S.boat.position.x < DROP_X);

  // 舟が揺れ、笏が落ちる
  g.audio.sfx('lurch');
  g.input.pulse(1.0, 250);
  const hull = S.boat.userData.hull;
  g.tween(1.6, (k) => { hull.rotation.x = Math.sin(k * Math.PI * 3) * 0.12 * (1 - k); });
  await g.wait(0.35);
  const shaku = g.interact.dropHeld();
  d.objective('');
  if (shaku) {
    const bp = S.boat.getWorldPosition(V3());
    const side = V3().subVectors(shaku.position, bp).setY(0).normalize();
    await Promise.race([dropToSea(g, shaku, { vx: side.x * 1.2 - 0.4, vy: 1.2, vz: side.z * 1.2 + 0.3 }), g.wait(0.9)]);
  }
  await d.say('忠顕', 'あっ――お上の笏が！', { fig: S.tadaaki });
  await d.say('島の男', 'なりませぬ。舟を止めれば見つかります。', { fig: S.rower });
  await d.say('帝', '……よい。このまま進め。');
  await d.narrate('帝はこのとき、手にしていた笏を誤って海へ落としたという。', SRC.nishiMap);
  await d.narrate('その場所はやがて「笏の江」と呼ばれ、のちに赤崎の「赤」を用いて「赤ノ江」と書かれるようになった――土地に伝わる地名の由来である。', SRC.nishiMap);
  await d.narrate('脱出は、はじめから本土行きの大きな船に乗って始まったのではない。まず小舟で島の入り江を渡る――揺れる舟の上では、身分の高低にかかわらず物を取り落とす。');
  await leg;
  await g.ui.fadeOut(1.2);

  // 区間C：岸沿いに南へ、赤崎の岬へ
  startLeg(LEG_C);
  await g.wait(0.3);
  await g.ui.fadeIn(1.2);
  leg = followPath(g, S.boat, LEG_C.map((p) => P(p.x, p.z)), 3.6, { yawOffset: Math.PI / 2 });
  d.objective('岬の先、赤崎を見る');
  await d.waitGaze(S.capeLook, { deg: 25, secs: 1.0 });
  d.objective('');
  await d.narrate('赤ノ江から珍崎へ向かう側に、赤崎の岬がある。西ノ島では、帝がここから島を脱出したと伝えている。', SRC.nishi);
  await leg;
  g.ui.setVignette(0);
  await d.say('島の男', 'あの船でございます。本土へ渡る船が、灯りを落として待っております。', { fig: S.rower });
  d.objective('沖の船に乗り移る');
  d.hint(isXR(g) ? 'すぐ横の船（光る印）を指してトリガーを引くか、しばらく見つめます' : 'すぐ横の船（光る印）をクリックするか、しばらく見つめます', 8);
  const shipIt = g.interact.add({ object: S.ship, label: '船に乗り移る', offset: V3(0, 2.2, 0), radius: 3, maxDist: 120 });
  const shipGaze = d.waitGaze(() => S.ship.position.clone().setY(2.5), { deg: 14, secs: 2 });
  await Promise.race([shipIt.promise, shipGaze]);
  shipGaze.cancel();
  shipIt.remove();
  d.objective('');
  await g.ui.fadeOut(1.2);
}

// ============================================================
// 第五章　風を待つ（海上）
// ============================================================
async function seaChase(g, d) {
  const S = buildEscapeSea(g);
  const ship = S.ship, deck = S.deck;
  g.input.place(ship, S.playerPos, BOW);
  g.audio.setAmbience({ sea: 0.9, wind: 0.6, insects: 0, fire: 0, music: 0.45, mood: 'sorrow', pad: 0.3 });
  let speed = 1.8;
  const heading = V3(Math.cos(S.heading), 0, -Math.sin(S.heading));
  g.addUpdater((dt) => {
    ship.position.addScaledVector(heading, speed * dt);
    ship.userData.hull.rotation.x = Math.sin(g.time * 0.8) * 0.012;
  });
  await g.ui.showTitle('第五章', '風を待つ', '隠岐の海　未明');
  await g.ui.fadeIn(2);
  await d.narrate('ここからは『太平記』が語る、海の上の物語である。『太平記』は乗船の地を「千波湊」とし、赤崎と同じ場所かどうかは定かでない。', SRC.taiheiki);
  await d.say('船頭', 'こんな夜更けに、よほどのお急ぎのご様子。……いったい、どちらのお方で。', { fig: S.sendo });
  d.objective('船頭に身分を明かす');
  await g.interact.add({ object: S.sendo, label: '船頭に身分を明かす', offset: V3(0, 1.1, 0), radius: 0.5 }).promise;
  d.objective('');
  S.st.face(S.sendo, 0, 0);
  S.sendo.rotation.y = -Math.PI / 2 - 0.4;
  await d.say('帝', '隠すまい。われは、この島に流された帝である。');
  await d.say('船頭', 'な、なんと……！　承知いたしました。この船、命に代えても本土へお運び申します。', { fig: S.sendo });
  await d.narrate('『太平記』は、帝が船の上で身分を明かしたと語る。名の知られた大将だけではない。海を渡る商人船の人々もまた、帝の帰還を支えた。', SRC.taiheiki);

  // 追手が迫る
  const back = heading.clone().negate();
  const sideV = V3(heading.z, 0, -heading.x);
  S.pursuers.forEach((p, i) => {
    p.boat.visible = true;
    p.boat.position.copy(ship.position).addScaledVector(back, 160 + i * 25).addScaledVector(sideV, (i - 1) * 30);
    p.boat.rotation.y = S.heading;
    p.offset = (i - 1) * 12;
  });
  let chase = true;
  g.addUpdater((dt) => {
    if (!chase) return;
    S.pursuers.forEach((p, i) => {
      const target = ship.position.clone().addScaledVector(back, 22 + i * 10).addScaledVector(sideV, p.offset + 6);
      const dv = target.sub(p.boat.position);
      const dist = dv.length();
      if (dist > 0.5) p.boat.position.addScaledVector(dv.normalize(), Math.min(dist, (speed + 3.2) * dt));
      p.boat.position.y = 0.05 + Math.sin(g.time + i) * 0.06;
      p.boat.userData.oar.rotation.y = Math.sin(g.time * 2 + i) * 0.5;
    });
  });
  g.audio.setAmbience({ mood: 'tension', music: 0.5 });
  await g.wait(2);
  await d.say('船頭', '後ろに灯りが……追手だ！　お上、船底へお隠れください！', { fig: S.sendo });
  d.objective('船底へ隠れる');
  const hatchA = anchor(S.st, ship.userData.hatch.x, deck + 0.3, 0, ship);
  await g.interact.add({ object: hatchA, label: '船底へ降りる', radius: 0.7 }).promise;
  d.objective('');
  await g.ui.fade(1, 0.4);
  const hold = ship.userData.hold;
  g.input.place(ship, V3(hold.x - 0.4, hold.y, hold.z), BOW, 0.85);
  S.tadaaki.visible = false;
  await g.ui.fade(0, 0.5);
  g.ui.setVignette(0.7);
  for (const b of S.bales) {
    b.visible = true;
    const y1 = b.position.y;
    b.position.y = y1 + 1.2;
    g.audio.sfx('thud');
    await g.tween(0.35, (k) => { b.position.y = y1 + 1.2 * (1 - k); });
    await g.wait(0.25);
  }
  await d.narrate('船頭は帝と忠顕を船底に隠し、その上に干した魚の俵を積み上げた。', SRC.taiheiki);

  // 追手が横付けし、船をあらためる
  const P0 = S.pursuers[0];
  chase = false;
  S.pursuers.forEach((p, i) => { if (i) p.boat.visible = false; });
  const searchT = { v: 0 };
  const sideOff = sideV.clone().multiplyScalar(4.2);
  const searchUpd = g.addUpdater((dt) => {
    const target = ship.position.clone().add(sideOff).addScaledVector(heading, 0.5);
    P0.boat.position.lerp(target, Math.min(1, dt * 1.5));
    P0.boat.rotation.y = S.heading;
    searchT.v += dt;
    const tp = V3(); P0.torch.userData.flame.getWorldPosition(tp);
    const hx = ship.localToWorld(V3(ship.userData.hatch.x + Math.sin(searchT.v * 1.3) * 0.8, deck + 1.4, Math.cos(searchT.v * 0.9) * 0.6));
    g.env.setLamp(0, { color: 0xff9040, intensity: 2.5 + Math.sin(searchT.v * 17) * 0.5, distance: 7, position: hx });
    void tp;
  });
  d.objective('息をひそめる（なるべく動かずに）');
  d.hint('見つからないよう、なるべく動かずに…', 5);
  // 動いているかの判定。船そのものが進んでいるので、頭の動きは船に対して測る
  const headLocal = () => ship.worldToLocal(g.headPos.clone());
  const dirLocal = () => g.headDir.clone().transformDirection(ship.matrixWorld.clone().invert());
  const prevPos = headLocal(), prevDir = dirLocal();
  let motion = 0;
  const moveUpd = g.addUpdater((dt) => {
    let m = 0;
    if (g.isXR) {
      const hp = headLocal(), hd = dirLocal();
      const sp = hp.distanceTo(prevPos) / Math.max(dt, 1e-3);
      const rot = Math.acos(clamp(hd.dot(prevDir), -1, 1)) / Math.max(dt, 1e-3);
      m = (sp > 0.35 ? 1 : 0) + (rot > 1.0 ? 1 : 0);
      prevPos.copy(hp); prevDir.copy(hd);
    } else {
      m = g.time - g.input.lastMove < 0.25 ? 1 : 0;
    }
    motion = Math.max(0, motion * Math.exp(-dt * 1.5) + m * dt * 2);
  });
  const lines = [
    ['追手', 'その船、止まれ！　怪しい者を乗せてはおらぬか。'],
    ['船頭', '干し魚を運ぶ商い船でございます。お疑いなら、どうぞお改めを。'],
    ['追手', '……俵ばかりか。ええい、魚臭い。'],
  ];
  let suspicion = 0;
  for (const [who, text] of lines) {
    motion = 0;
    await d.say(who, text, { fig: who === '船頭' ? S.sendo : P0.torch });
    if (motion > 0.5 && suspicion < 2) {
      suspicion++;
      g.audio.sfx('creak');
      await d.say('追手', '待て。今、下で何か動かなんだか。', { fig: P0.torch });
      await d.say('船頭', '鼠でございましょう。干し魚をかじりに出てまいります。', { fig: S.sendo });
      d.hint('動かずに……', 4);
      // 2.5 秒じっとしていれば先へ。うまく判定できなくても 12 秒で先へ進む
      let still = 0, waited = 0;
      await g.waitUntil((dt) => { waited += dt; still = motion < 0.3 ? still + dt : 0; return still > 2.5 || waited > 12; });
    }
  }
  await d.say('船頭', 'そういえば、それらしいお方を乗せた小舟が、先ほど向こうへ漕いでゆきましたぞ。', { fig: S.sendo });
  await d.say('追手', 'なに、まことか！　者ども、急げ！', { fig: P0.torch });
  searchUpd(); moveUpd();
  g.env.setLamp(0, { intensity: 0 });
  const away = sideV.clone().multiplyScalar(1).add(back.clone().multiplyScalar(0.6)).normalize();
  const leave = g.addUpdater((dt) => { P0.boat.position.addScaledVector(away, 4 * dt); });
  d.objective('');
  await d.narrate('船頭は、別の舟にそれらしい人物が乗っていたと告げ、追手をやり過ごした。', SRC.taiheiki);

  // 船底から出る → 風が止む
  await g.ui.fade(1, 0.5);
  leave();
  S.bales.forEach((b) => { b.visible = false; });
  S.tadaaki.visible = true;
  g.ui.setVignette(0);
  g.input.place(ship, V3(1.6, deck, 1.25), Math.PI);
  S.st.face(S.tadaaki, 0, 0);
  S.tadaaki.position.set(0.6, deck, 0.6);
  S.tadaaki.rotation.y = -Math.PI * 0.25;
  g.env.set('predawn', 0);
  await g.ui.fade(0, 0.6);
  ship.userData.setWind(0.05);
  g.audio.setAmbience({ wind: 0.08 }, 3);
  await g.tween(3, (k) => { speed = 1.8 * (1 - k) + 0.25 * k; });
  await d.say('船頭', 'いかん、風が止んだ……！　後ろから、追船が！', { fig: S.sendo });
  // 追船がふたたび迫る
  chase = true;
  S.pursuers.forEach((p, i) => {
    p.boat.visible = true;
    p.boat.position.copy(ship.position).addScaledVector(back, 90 + i * 20).addScaledVector(sideV, (i - 1) * 25 + 10);
  });
  await d.say('忠顕', 'お上――これを。', { fig: S.tadaaki });
  g.interact.hold('shari', makeShari(), {
    xrPos: V3(0, 0.04, -0.07), xrRot: new THREE.Euler(0, 0, 0),
    pcPos: V3(0.15, -0.17, -0.42), pcRot: new THREE.Euler(0, 0, 0),
  });
  d.objective('身に着けていた仏舎利を、船べりから海へ捧げる');
  d.hint(isXR(g) ? '仏舎利を持った手を船べりの外へ差し出し、トリガーを引くか、グリップを離します' : '船べりの外の海をクリックします', 8);
  // 船べりの外の海（渡し先）
  const seaHit = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.6), new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }));
  seaHit.position.set(0.5, deck + 0.2, 2.6);
  ship.add(seaHit);
  const lp = V3();
  await g.interact.add({
    object: seaHit, hit: seaHit, label: '海', giveLabel: '仏舎利を海に捧げる', accepts: 'shari', marker: false, maxDist: 20,
    zone: (p) => { lp.copy(p); ship.worldToLocal(lp); return Math.abs(lp.z) > 1.75 && lp.y < deck + 2.2; },
    onGive: () => {
      const obj = g.interact.dropHeld();
      if (obj) {
        const out = V3(0, 0, 1).applyQuaternion(ship.getWorldQuaternion(new THREE.Quaternion()));
        dropToSea(g, obj, { vx: out.x * 1.5, vy: 0.8, vz: out.z * 1.5, glow: 0xfff0c0 });
      }
    },
  }).promise;
  d.objective('');
  g.audio.sfx('bell');
  await g.wait(2.2);
  // 風が変わる
  g.audio.sfx('whoosh');
  g.input.pulse(0.6, 400);
  ship.userData.setWind(1);
  g.audio.setAmbience({ wind: 0.7, mood: 'hope', music: 0.55, pad: 0.5 }, 3);
  g.env.set('sunrise', 14);
  chase = false;
  const pushBack = g.addUpdater((dt) => {
    S.pursuers.forEach((p) => { p.boat.position.addScaledVector(back, 3.2 * dt); });
  });
  g.tween(5, (k) => { speed = 0.25 + (5 - 0.25) * k; });
  await d.narrate('帝が身に着けていた仏舎利を海に捧げると、風が変わった。帝の船は先へと進み、追船は反対へと押し戻されたという。', SRC.taiheiki);
  await d.narrate('航海の記録というより、帝の危機を仏の加護と結び付けて語る、『太平記』の劇的な場面である。');
  await g.wait(5);
  pushBack();
  await g.ui.fadeOut(2);
}

// ============================================================
// 終章　志す方へ（伯耆）
// ============================================================
async function epilogue(g, d) {
  const S = buildHoki(g);
  const ship = S.ship;
  g.input.place(ship, S.playerPos, BOW);
  g.audio.setAmbience({ sea: 0.7, wind: 0.3, insects: 0, fire: 0, music: 0.55, mood: 'hope', pad: 0.6 });
  const stopZ = S.beachZ - 28;
  let speed = 2.2;
  g.addUpdater((dt) => {
    if (ship.position.z < stopZ) ship.position.z += speed * dt * clamp((stopZ - ship.position.z) / 30, 0.15, 1);
    ship.userData.hull.rotation.x = Math.sin(g.time * 0.7) * 0.01;
  });
  await g.ui.showTitle('終章', '志す方へ', '伯耆の国　元弘三年（一三三三）閏二月');
  await g.ui.fadeIn(2);
  await d.narrate('海を越えた帝は、伯耆で名和長年の支援を得て、船上山を拠点に再び倒幕の兵を挙げた。隠岐を脱出したのは、元弘三年（一三三三）閏二月のことである。', SRC.tottori);
  d.objective('浜の向こうにそびえる船上山を見る');
  await d.waitGaze(S.sensyo, { deg: 18, secs: 1.2 });
  d.objective('');
  await d.narrate('最初に着いた地も、書物によって異なる。『太平記』は名和湊への到着を語り、『増鏡』は閏二月二十四日の明け方に隠岐を出て、その日のうちに出雲へ、翌日伯耆の稲津の浦へ移ったと記す。', SRC.masukagami);
  await d.narrate('元弘三年三月四日付の綸旨。巨勢宗国の功績に恩賞を約束したこの文書は、筆跡から帝自身が書いたものとされる。海を越えた帝が、ふたたび命令を発する立場に戻ったことを示す、確かな手がかりである。', SRC.tottori);
  await d.narrate('同年五月二十三日、帝は京へ戻るため船上山を発った。隠岐への配流から、およそ一年のことであった。', SRC.tottori);
  await g.wait(1.5);
  await d.narrate('暮らしを支えた人の屋敷。御所を見張る館と島。舟を待つ間に腰を下ろした石。小舟から落とした笏。出航の岬。家に受け継がれた仏の品。');
  await d.narrate('島の道を知る人、舟を出せる人、待つ場所を与える人、そばに付き従う人。その人々がいて、はじめて帝は海を渡ることができた。');
  await d.narrate('島へ連れて来られた帝は、人々の助けを受けて、島を離れる帝となった。', null, { min: 5 });
  await g.wait(1.5);

  await g.ui.menu('志す方へ　おわり', [{ key: 'title', label: 'タイトルに戻る' }]);
  await g.ui.fadeOut(1.5);
  return 'title';
}

export const CHAPTERS = [
  { name: '序章　配流の海', run: prologue },
  { name: '第一章　仁夫里の浜（知夫里島）', run: chiburi },
  { name: '第二章　黒木御所（西ノ島・別府）', run: kurokiGosho },
  { name: '第三章　闇にまぎれて（小向へ）', run: escapeNight },
  { name: '第四章　笏の江（赤ノ江・赤崎）', run: akanoe },
  { name: '第五章　風を待つ（海上）', run: seaChase },
  { name: '終章　志す方へ（伯耆）', run: epilogue },
];
