// Web Audio による環境音・効果音・箏風の生成音楽（音声ファイル不要）

const IN_SCALE = [146.83, 196.0, 220.0, 233.08, 293.66, 311.13, 392.0, 440.0, 466.16, 587.33, 622.25, 783.99];
const YO_SCALE = [146.83, 196.0, 220.0, 246.94, 293.66, 329.63, 392.0, 440.0, 493.88, 587.33, 659.25, 783.99];

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.mood = null;
    this.levels = { sea: 0, wind: 0, insects: 0, fire: 0, music: 0.5 };
  }

  init() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp); comp.connect(ctx.destination);
    this.amb = ctx.createGain(); this.amb.connect(this.master);
    this.music = ctx.createGain(); this.music.gain.value = 0.5; this.music.connect(this.master);
    this.fx = ctx.createGain(); this.fx.gain.value = 0.8; this.fx.connect(this.master);

    // 残響（簡易）
    this.verb = ctx.createConvolver();
    this.verb.buffer = this.makeImpulse(2.8, 2.5);
    const verbGain = ctx.createGain(); verbGain.gain.value = 0.35;
    this.verb.connect(verbGain); verbGain.connect(this.master);
    this.musicDry = ctx.createGain(); this.musicDry.connect(this.music); this.musicDry.connect(this.verb);

    const sr = ctx.sampleRate;
    this.white = ctx.createBuffer(1, sr * 3, sr);
    const w = this.white.getChannelData(0);
    for (let i = 0; i < w.length; i++) w[i] = Math.random() * 2 - 1;
    this.brown = ctx.createBuffer(1, sr * 4, sr);
    const b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < b.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }

    // 波音：低いうねり + 砕ける音
    this.seaGain = ctx.createGain(); this.seaGain.gain.value = 0; this.seaGain.connect(this.amb);
    const seaSrc = this.loop(this.brown);
    const seaLp = ctx.createBiquadFilter(); seaLp.type = 'lowpass'; seaLp.frequency.value = 420;
    const swell = ctx.createGain(); swell.gain.value = 0.7;
    seaSrc.connect(seaLp); seaLp.connect(swell); swell.connect(this.seaGain);
    this.lfo(0.11, 0.3, swell.gain);
    const surfSrc = this.loop(this.white);
    const surfBp = ctx.createBiquadFilter(); surfBp.type = 'bandpass'; surfBp.frequency.value = 900; surfBp.Q.value = 0.4;
    const surf = ctx.createGain(); surf.gain.value = 0.05;
    surfSrc.connect(surfBp); surfBp.connect(surf); surf.connect(this.seaGain);
    this.lfo(0.07, 0.045, surf.gain);

    // 風
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0; this.windGain.connect(this.amb);
    const windSrc = this.loop(this.white, 1.3);
    const windBp = ctx.createBiquadFilter(); windBp.type = 'bandpass'; windBp.frequency.value = 380; windBp.Q.value = 0.9;
    windSrc.connect(windBp); windBp.connect(this.windGain);
    this.lfo(0.05, 180, windBp.frequency);

    // 篝火のゆらぎ
    this.fireGain = ctx.createGain(); this.fireGain.gain.value = 0; this.fireGain.connect(this.amb);
    const fireSrc = this.loop(this.brown, 0.7);
    const fireLp = ctx.createBiquadFilter(); fireLp.type = 'lowpass'; fireLp.frequency.value = 250;
    fireSrc.connect(fireLp); fireLp.connect(this.fireGain);

    // 雅楽の笙を思わせる持続音
    this.pad = ctx.createGain(); this.pad.gain.value = 0; this.pad.connect(this.musicDry);
    const padSwell = ctx.createGain(); padSwell.gain.value = 1; padSwell.connect(this.pad);
    this.lfo(0.06, 0.35, padSwell.gain);
    const padLp = ctx.createBiquadFilter(); padLp.type = 'lowpass'; padLp.frequency.value = 1400; padLp.connect(padSwell);
    this.padOsc = [293.66, 440, 587.33, 659.25].map((f, i) => {
      const o = ctx.createOscillator(); o.type = i % 2 ? 'triangle' : 'sine'; o.frequency.value = f; o.detune.value = (i - 1.5) * 4;
      const gg = ctx.createGain(); gg.gain.value = 0.045;
      o.connect(gg); gg.connect(padLp); o.start();
      return o;
    });

    this.notes = new Map();
    this.nextNote = ctx.currentTime + 1;
    this.nextInsect = ctx.currentTime + 1;
    this.nextCrackle = ctx.currentTime + 1;
    this.nextDrum = ctx.currentTime + 1;
    this.noteIdx = 5;
  }

  makeImpulse(secs, decay) {
    const ctx = this.ctx, sr = ctx.sampleRate, n = Math.floor(sr * secs);
    const buf = ctx.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
    }
    return buf;
  }

  loop(buf, rate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf; s.loop = true; s.playbackRate.value = rate; s.start();
    return s;
  }

  lfo(freq, depth, param, offset = null) {
    const o = this.ctx.createOscillator(); o.frequency.value = freq;
    const g = this.ctx.createGain(); g.gain.value = depth;
    o.connect(g); g.connect(param); o.start();
    if (offset !== null) param.value = offset;
    return o;
  }

  // 箏の一音（カープラス＝ストロング法）
  note(freq) {
    if (this.notes.has(freq)) return this.notes.get(freq);
    const ctx = this.ctx, sr = ctx.sampleRate, dur = 3.2;
    const N = Math.floor(sr * dur);
    const buf = ctx.createBuffer(1, N, sr);
    const d = buf.getChannelData(0);
    const P = Math.max(2, Math.round(sr / freq));
    const ring = new Float32Array(P);
    let prev = 0;
    for (let i = 0; i < P; i++) { const r = Math.random() * 2 - 1; prev = prev * 0.5 + r * 0.5; ring[i] = prev; }
    let idx = 0;
    const damp = freq > 500 ? 0.993 : 0.996;
    let peak = 0;
    for (let i = 0; i < N; i++) {
      const cur = ring[idx], nxt = ring[(idx + 1) % P];
      ring[idx] = damp * 0.5 * (cur + nxt);
      d[i] = cur;
      peak = Math.max(peak, Math.abs(cur));
      idx = (idx + 1) % P;
    }
    for (let i = 0; i < N; i++) d[i] /= peak || 1;
    this.notes.set(freq, buf);
    return buf;
  }

  pluck(freq, when = 0, vol = 0.35, pan = 0, dest = null) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.note(freq);
    const g = ctx.createGain(); g.gain.value = vol;
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    s.connect(g);
    if (p) { p.pan.value = pan; g.connect(p); p.connect(dest || this.musicDry); } else g.connect(dest || this.musicDry);
    s.start(ctx.currentTime + when);
  }

  ramp(param, v, secs = 2) {
    const t = this.ctx.currentTime;
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
    param.linearRampToValueAtTime(v, t + secs);
  }

  setAmbience({ sea, wind, insects, fire, music, mood, pad } = {}, secs = 2.5) {
    if (!this.ctx) return;
    if (sea !== undefined) this.ramp(this.seaGain.gain, sea * 0.8, secs);
    if (wind !== undefined) this.ramp(this.windGain.gain, wind * 0.5, secs);
    if (fire !== undefined) { this.levels.fire = fire; this.ramp(this.fireGain.gain, fire * 0.25, secs); }
    if (insects !== undefined) this.levels.insects = insects;
    if (music !== undefined) this.ramp(this.music.gain, music, secs);
    if (pad !== undefined) this.ramp(this.pad.gain, pad * 0.9, secs * 1.5);
    if (mood !== undefined) this.setMood(mood);
  }

  setMood(mood) {
    this.mood = mood;
    if (!this.ctx) return;
    const scale = mood === 'hope' ? YO_SCALE : IN_SCALE;
    const chord = mood === 'hope' ? [293.66, 440, 587.33, 659.25] : mood === 'tension' ? [146.83, 220, 311.13, 293.66] : [293.66, 440, 587.33, 622.25];
    this.padOsc.forEach((o, i) => o.frequency.setTargetAtTime(chord[i], this.ctx.currentTime, 1.5));
    this.scale = scale;
  }

  update() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    // 音楽
    if (this.mood && now > this.nextNote - 0.1) {
      const sc = this.scale || IN_SCALE;
      const m = this.mood;
      let lo = 3, hi = sc.length - 1, gapA = 1.4, gapB = 3.6, vol = 0.3;
      if (m === 'tension') { lo = 0; hi = 7; gapA = 0.35; gapB = 0.9; vol = 0.26; }
      if (m === 'sorrow') { gapA = 2.0; gapB = 4.5; vol = 0.26; }
      if (m === 'hope') { lo = 4; gapA = 0.8; gapB = 2.2; vol = 0.3; }
      this.noteIdx += Math.round((Math.random() - 0.5) * 4);
      this.noteIdx = Math.max(lo, Math.min(hi, this.noteIdx));
      const f = sc[this.noteIdx];
      const when = this.nextNote - now;
      this.pluck(f, Math.max(0, when), vol, (Math.random() - 0.5) * 0.6);
      if (Math.random() < 0.25 && this.noteIdx + 2 < sc.length) this.pluck(sc[this.noteIdx + 2], Math.max(0, when) + 0.12, vol * 0.7, 0.2);
      if (Math.random() < 0.12 && m !== 'tension') {
        // 流し爪（上行のグリッサンド）
        for (let k = 0; k < 5; k++) this.pluck(sc[Math.min(sc.length - 1, lo + k * 2)], Math.max(0, when) + 0.5 + k * 0.07, vol * 0.5, -0.3 + k * 0.15);
      }
      this.nextNote = now + Math.max(0, when) + gapA + Math.random() * (gapB - gapA);
    }
    if (this.mood === 'tension' && now > this.nextDrum) {
      this.drum(0, 0.5);
      this.drum(0.45, 0.3);
      this.nextDrum = now + 2.4;
    }
    // 虫の声
    if (this.levels.insects > 0 && now > this.nextInsect) {
      const n = 3 + Math.floor(Math.random() * 5);
      const f = 3800 + Math.random() * 1200;
      const pan = (Math.random() - 0.5) * 1.6;
      for (let i = 0; i < n; i++) this.chirp(f, i * 0.055, 0.035 * this.levels.insects, pan);
      this.nextInsect = now + 0.3 + Math.random() * 1.4;
    }
    // 篝火のはぜる音
    if (this.levels.fire > 0 && now > this.nextCrackle) {
      this.noiseHit(0, 0.03, 2500 + Math.random() * 2000, 0.12 * this.levels.fire, 'bandpass');
      this.nextCrackle = now + 0.05 + Math.random() * 0.5;
    }
  }

  chirp(freq, when, vol, pan) {
    const ctx = this.ctx, t = ctx.currentTime + when;
    const o = ctx.createOscillator(); o.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.linearRampToValueAtTime(0, t + 0.035);
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    o.connect(g); g.connect(p); p.connect(this.amb);
    o.start(t); o.stop(t + 0.05);
  }

  noiseHit(when, dur, freq, vol, type = 'lowpass', q = 1, sweepTo = null) {
    const ctx = this.ctx, t = ctx.currentTime + when;
    const s = ctx.createBufferSource(); s.buffer = this.white;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + Math.min(0.02, dur * 0.2)); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f); f.connect(g); g.connect(this.fx);
    s.start(t, Math.random() * 2); s.stop(t + dur + 0.05);
  }

  tone(freq, when, dur, vol, type = 'sine', toFreq = null, dest = null) {
    const ctx = this.ctx, t = ctx.currentTime + when;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (toFreq) o.frequency.exponentialRampToValueAtTime(toFreq, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(dest || this.fx);
    o.start(t); o.stop(t + dur + 0.05);
  }

  drum(when = 0, vol = 0.6) {
    this.tone(95, when, 0.7, vol, 'sine', 45);
    this.noiseHit(when, 0.08, 600, vol * 0.3, 'lowpass');
  }

  bell() {
    const base = 740;
    [[1, 0.25, 5], [2.76, 0.12, 3], [5.4, 0.06, 1.6], [8.93, 0.03, 0.8]].forEach(([r, v, d]) => {
      this.tone(base * r, 0, d, v, 'sine', null, this.musicDry);
    });
  }

  sfx(name) {
    if (!this.ctx) return;
    switch (name) {
      case 'tick': this.tone(1500, 0, 0.04, 0.03); break;
      case 'select': this.pluck(587.33, 0, 0.3, 0, this.fx); this.pluck(880, 0.08, 0.2, 0, this.fx); break;
      case 'page': this.noiseHit(0, 0.12, 2200, 0.15, 'bandpass', 0.8); break;
      case 'step': this.noiseHit(0, 0.1, 280, 0.35); break;
      case 'splash':
        this.noiseHit(0, 0.7, 1800, 0.5, 'bandpass', 0.7, 350);
        this.tone(260, 0, 0.25, 0.25, 'sine', 90);
        break;
      case 'plop': this.tone(420, 0, 0.18, 0.2, 'sine', 140); this.noiseHit(0, 0.3, 1200, 0.15, 'bandpass', 1, 400); break;
      case 'bell': this.bell(); break;
      case 'drum': this.drum(0, 0.7); break;
      case 'whoosh': this.noiseHit(0, 2.6, 300, 0.5, 'bandpass', 0.8, 1400); break;
      case 'creak': this.tone(90, 0, 0.5, 0.12, 'sawtooth', 70); break;
      case 'thud': this.noiseHit(0, 0.25, 180, 0.6); this.tone(70, 0, 0.3, 0.3, 'sine', 45); break;
      case 'chime':
        [0, 0.12, 0.24].forEach((w, i) => this.pluck([587.33, 783.99, 880][i], w, 0.3, 0, this.fx));
        break;
      case 'brush': this.noiseHit(0, 0.5, 3000, 0.1, 'highpass', 0.5); break;
      case 'lurch': this.tone(70, 0, 0.6, 0.35, 'sine', 40); this.noiseHit(0, 0.9, 600, 0.4, 'lowpass'); this.tone(90, 0.05, 0.5, 0.15, 'sawtooth', 60); break;
      default: break;
    }
  }
}
