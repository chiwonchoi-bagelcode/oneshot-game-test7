/* 소리: 모두 WebAudio로 합성한다. 바삭함은 짧은 잡음 알갱이를 여러 대역에 흩뿌려 만든다. */
(function (G) {
  'use strict';
  const TS = G.TS || (G.TS = {});
  const A = (TS.Audio = {});
  let ac = null;
  let master;
  let sfx;
  let musicBus;
  let noiseBuf;
  let muted = false;
  try {
    muted = localStorage.getItem('ts_muted') === '1';
  } catch (e) {
    /* 저장소 없음 */
  }
  A.muted = () => muted;

  A.init = function () {
    if (ac) {
      if (ac.state === 'suspended') ac.resume();
      return;
    }
    const AC = G.AudioContext || G.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 10;
    comp.ratio.value = 4;
    comp.attack.value = 0.002;
    comp.release.value = 0.15;
    master = ac.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(comp);
    comp.connect(ac.destination);
    sfx = ac.createGain();
    sfx.gain.value = 1;
    sfx.connect(master);
    musicBus = ac.createGain();
    musicBus.gain.value = 0.0;
    const mlp = ac.createBiquadFilter();
    mlp.type = 'lowpass';
    mlp.frequency.value = 3200;
    musicBus.connect(mlp);
    mlp.connect(master);
    const len = ac.sampleRate * 2;
    noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  };

  A.setMuted = function (m) {
    muted = m;
    try {
      localStorage.setItem('ts_muted', m ? '1' : '0');
    } catch (e) {
      /* 무시 */
    }
    if (master) master.gain.setTargetAtTime(m ? 0 : 0.9, ac.currentTime, 0.05);
  };

  const now = () => ac.currentTime;
  const ok = () => ac && !muted;

  function noise(t, dur, rate) {
    const s = ac.createBufferSource();
    s.buffer = noiseBuf;
    s.playbackRate.value = rate || 1;
    const off = Math.random() * 1.5;
    s.start(t, off, dur + 0.05);
    return s;
  }
  function env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  function filt(type, f, q) {
    const b = ac.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    if (q !== undefined) b.Q.value = q;
    return b;
  }

  /* 바삭한 알갱이 하나 */
  A.grain = function (amp, t0, bright) {
    if (!ok()) return;
    const t = t0 || now();
    amp = amp === undefined ? 0.3 : amp;
    bright = bright === undefined ? 1 : bright;
    const s = noise(t, 0.08, 0.8 + Math.random() * 0.6);
    const bp = filt('bandpass', (1600 + Math.random() * 4200) * bright, 0.9 + Math.random() * 2.4);
    const g = ac.createGain();
    env(g, t, 0.0008, amp, 0.008 + Math.random() * 0.035);
    s.connect(bp);
    bp.connect(g);
    g.connect(sfx);
    if (Math.random() < 0.35) {
      const s2 = noise(t, 0.02, 1.5);
      const hp = filt('highpass', 6500, 0.7);
      const g2 = ac.createGain();
      env(g2, t, 0.0005, amp * 0.6, 0.004);
      s2.connect(hp);
      hp.connect(g2);
      g2.connect(sfx);
    }
    if (Math.random() < 0.3) {
      const s3 = noise(t, 0.1, 0.5);
      const lp = filt('lowpass', 500 + Math.random() * 500, 0.8);
      const g3 = ac.createGain();
      env(g3, t, 0.002, amp * 0.5, 0.04 + Math.random() * 0.04);
      s3.connect(lp);
      lp.connect(g3);
      g3.connect(sfx);
    }
  };

  /* 금이 달리는 소리: 거리 단위로 호출 */
  A.crackRun = function (amp) {
    if (!ok()) return;
    const t = now();
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) A.grain((amp || 0.35) * (0.5 + Math.random() * 0.6), t + Math.random() * 0.018, 0.9 + Math.random() * 0.4);
  };

  /* 조각이 완전히 떨어지는 소리 */
  A.snap = function (size) {
    if (!ok()) return;
    const t = now();
    size = size || 1;
    // 날카로운 첫 소리
    const s = noise(t, 0.05, 1.2);
    const hp = filt('highpass', 2200, 0.8);
    const g = ac.createGain();
    env(g, t, 0.0006, 0.6 * size, 0.018);
    s.connect(hp);
    hp.connect(g);
    g.connect(sfx);
    // 몸통 울림
    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(170, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.14);
    const og = ac.createGain();
    env(og, t, 0.003, 0.35 * size, 0.16);
    o.connect(og);
    og.connect(sfx);
    o.start(t);
    o.stop(t + 0.25);
    const s2 = noise(t, 0.2, 0.6);
    const lp = filt('lowpass', 700, 0.7);
    const g2 = ac.createGain();
    env(g2, t, 0.002, 0.3 * size, 0.1);
    s2.connect(lp);
    lp.connect(g2);
    g2.connect(sfx);
    for (let i = 0; i < 9; i++) A.grain(0.25 * size * Math.random() + 0.08, t + 0.005 + Math.random() * 0.09);
    // 떨어지는 부스러기
    for (let i = 0; i < 10; i++) A.grain(0.05 + Math.random() * 0.06, t + 0.14 + Math.random() * 0.5, 1.5);
  };

  /* 누르고 있을 때 미세한 긴장음 */
  A.stress = function (k) {
    if (!ok()) return;
    A.grain(0.03 + 0.06 * (k || 0), now(), 1.4);
  };

  A.tapBoard = function () {
    if (!ok()) return;
    const t = now();
    const s = noise(t, 0.05, 0.7);
    const bp = filt('bandpass', 1100, 1.5);
    const g = ac.createGain();
    env(g, t, 0.001, 0.12, 0.03);
    s.connect(bp);
    bp.connect(g);
    g.connect(sfx);
    A.grain(0.05, t + 0.01, 1.4);
  };

  /* 구두 소리: 바삭한 판 위 작은 발걸음 */
  A.step = function (amp) {
    if (!ok()) return;
    const t = now();
    const s = noise(t, 0.03, 1);
    const bp = filt('bandpass', 2800 + Math.random() * 1600, 3.5);
    const g = ac.createGain();
    env(g, t, 0.0006, amp || 0.06, 0.012);
    s.connect(bp);
    bp.connect(g);
    g.connect(sfx);
    const o = ac.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(900 + Math.random() * 300, t);
    o.frequency.exponentialRampToValueAtTime(500, t + 0.02);
    const og = ac.createGain();
    env(og, t, 0.0005, (amp || 0.06) * 0.4, 0.02);
    o.connect(og);
    og.connect(sfx);
    o.start(t);
    o.stop(t + 0.05);
  };

  /* 밧줄/판자가 당겨지며 삐걱 */
  A.tug = function () {
    if (!ok()) return;
    const t = now();
    const o = ac.createOscillator();
    o.type = 'sawtooth';
    const f = 180 + Math.random() * 80;
    o.frequency.setValueAtTime(f, t);
    o.frequency.linearRampToValueAtTime(f * 1.35, t + 0.18);
    const bp = filt('bandpass', 1100, 7);
    const g = ac.createGain();
    env(g, t, 0.03, 0.035, 0.2);
    o.connect(bp);
    bp.connect(g);
    g.connect(sfx);
    o.start(t);
    o.stop(t + 0.3);
  };

  /* 손에서 빠져나가는 소리 */
  A.release = function () {
    if (!ok()) return;
    const t = now();
    const s = noise(t, 0.3, 1);
    const bp = filt('bandpass', 700, 2);
    bp.frequency.setValueAtTime(700, t);
    bp.frequency.exponentialRampToValueAtTime(4200, t + 0.16);
    const g = ac.createGain();
    env(g, t, 0.01, 0.16, 0.18);
    s.connect(bp);
    bp.connect(g);
    g.connect(sfx);
  };

  /* 안도의 한숨 */
  A.relief = function () {
    if (!ok()) return;
    const t = now() + 0.05;
    const s = noise(t, 0.8, 0.6);
    const lp = filt('lowpass', 1500, 0.6);
    lp.frequency.setValueAtTime(1500, t);
    lp.frequency.exponentialRampToValueAtTime(350, t + 0.6);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    s.connect(lp);
    lp.connect(g);
    g.connect(sfx);
    pluck(72, t + 0.1, 0.05, 0.6);
    pluck(76, t + 0.2, 0.05, 0.6);
  };

  /* 나무 소품이 떨어지는 소리 */
  A.clatter = function () {
    if (!ok()) return;
    const t = now();
    [0, 0.085, 0.14, 0.19].forEach((dt, i) => {
      const o = ac.createOscillator();
      o.type = 'sine';
      const f = 520 - i * 60 + Math.random() * 40;
      o.frequency.setValueAtTime(f, t + dt);
      o.frequency.exponentialRampToValueAtTime(f * 0.55, t + dt + 0.06);
      const g = ac.createGain();
      env(g, t + dt, 0.001, 0.16 / (i + 1), 0.07);
      o.connect(g);
      g.connect(sfx);
      o.start(t + dt);
      o.stop(t + dt + 0.12);
      const s = noise(t + dt, 0.03, 1);
      const bp = filt('bandpass', 1800, 1.2);
      const g2 = ac.createGain();
      env(g2, t + dt, 0.0006, 0.08 / (i + 1), 0.02);
      s.connect(bp);
      bp.connect(g2);
      g2.connect(sfx);
    });
  };

  /* 끊긴 협력: 낮게 내려가는 두 음 */
  A.lost = function () {
    if (!ok()) return;
    const t = now() + 0.15;
    pluck(64, t, 0.12, 0.9, 'triangle');
    pluck(60, t + 0.32, 0.12, 1.2, 'triangle');
    pluck(48, t + 0.32, 0.08, 1.4, 'triangle');
  };

  /* 작업 완료 종소리 */
  A.chime = function (k) {
    if (!ok()) return;
    const t = now();
    const base = [880, 988, 1175][k || 0] || 880;
    [base, base * 1.5].forEach((f, i) => bell(f, t + i * 0.09, 0.09));
  };
  function bell(f, t, amp) {
    [1, 2.76, 5.4].forEach((m, i) => {
      const o = ac.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * m;
      const g = ac.createGain();
      env(g, t, 0.002, amp / (i + 1), 1.1 / (i + 1));
      o.connect(g);
      g.connect(sfx);
      o.start(t);
      o.stop(t + 1.3);
    });
  }

  A.whoosh = function () {
    if (!ok()) return;
    const t = now();
    const s = noise(t, 0.6, 0.8);
    const bp = filt('bandpass', 300, 1.4);
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(2400, t + 0.45);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    s.connect(bp);
    bp.connect(g);
    g.connect(sfx);
  };

  A.splash = function () {
    if (!ok()) return;
    const t = now();
    const s = noise(t, 0.5, 0.7);
    const lp = filt('lowpass', 2400, 0.7);
    lp.frequency.setValueAtTime(2400, t);
    lp.frequency.exponentialRampToValueAtTime(400, t + 0.4);
    const g = ac.createGain();
    env(g, t, 0.005, 0.12, 0.4);
    s.connect(lp);
    lp.connect(g);
    g.connect(sfx);
  };

  A.cloth = function () {
    if (!ok()) return;
    const t = now();
    const s = noise(t, 0.25, 0.9);
    const bp = filt('bandpass', 1300, 0.9);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.02, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.11);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    s.connect(bp);
    bp.connect(g);
    g.connect(sfx);
  };

  A.knock = function (amp) {
    if (!ok()) return;
    const t = now();
    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(760, t);
    o.frequency.exponentialRampToValueAtTime(380, t + 0.04);
    const g = ac.createGain();
    env(g, t, 0.0008, amp || 0.07, 0.05);
    o.connect(g);
    g.connect(sfx);
    o.start(t);
    o.stop(t + 0.08);
  };

  A.click = function () {
    if (!ok()) return;
    const t = now();
    const s = noise(t, 0.02, 1);
    const bp = filt('bandpass', 2600, 2);
    const g = ac.createGain();
    env(g, t, 0.0005, 0.08, 0.012);
    s.connect(bp);
    bp.connect(g);
    g.connect(sfx);
  };

  A.ahem = function () {
    if (!ok()) return;
    const t = now();
    [0, 0.16].forEach((dt) => {
      const s = noise(t + dt, 0.12, 0.5);
      const bp = filt('bandpass', 420, 3);
      const g = ac.createGain();
      env(g, t + dt, 0.01, 0.05, 0.08);
      s.connect(bp);
      bp.connect(g);
      g.connect(sfx);
    });
  };

  /* 합의 완료 팡파르 */
  A.fanfare = function () {
    if (!ok()) return;
    const t = now() + 0.05;
    const notes = [
      [65, 0, 0.18],
      [69, 0.16, 0.18],
      [72, 0.32, 0.18],
      [77, 0.5, 0.9],
    ];
    notes.forEach((n) => brass(n[0], t + n[1], n[2]));
    brass(60, t + 0.5, 0.9, 0.05);
    brass(53, t + 0.5, 0.9, 0.05);
  };
  function brass(m, t, dur, amp) {
    const f = 440 * Math.pow(2, (m - 69) / 12);
    const o = ac.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    const o2 = ac.createOscillator();
    o2.type = 'sawtooth';
    o2.frequency.value = f * 1.004;
    const lp = filt('lowpass', 600, 1);
    lp.frequency.setValueAtTime(500, t);
    lp.frequency.linearRampToValueAtTime(2400, t + 0.06);
    lp.frequency.linearRampToValueAtTime(1400, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amp || 0.07, t + 0.03);
    g.gain.setValueAtTime(amp || 0.07, t + dur * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.15);
    o.connect(lp);
    o2.connect(lp);
    lp.connect(g);
    g.connect(sfx);
    o.start(t);
    o2.start(t);
    o.stop(t + dur + 0.2);
    o2.stop(t + dur + 0.2);
  }

  A.horn = function () {
    if (!ok()) return;
    const t = now();
    [110, 111.3, 165].forEach((f, i) => {
      const o = ac.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const lp = filt('lowpass', 500, 1.5);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(i === 2 ? 0.03 : 0.07, t + 0.08);
      g.gain.setValueAtTime(i === 2 ? 0.03 : 0.07, t + 0.9);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
      o.connect(lp);
      lp.connect(g);
      g.connect(sfx);
      o.start(t);
      o.stop(t + 1.4);
    });
  };

  function pluck(m, t, amp, dur, type, bus) {
    const f = 440 * Math.pow(2, (m - 69) / 12);
    const o = ac.createOscillator();
    o.type = type || 'triangle';
    o.frequency.value = f;
    const o2 = ac.createOscillator();
    o2.type = 'square';
    o2.frequency.value = f * 2.002;
    const g2 = ac.createGain();
    g2.gain.value = 0.12;
    const lp = filt('lowpass', 3000, 0.8);
    lp.frequency.setValueAtTime(Math.min(8000, f * 8), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(300, f * 1.5), t + dur * 0.6);
    const g = ac.createGain();
    env(g, t, 0.004, amp, dur);
    o.connect(lp);
    o2.connect(g2);
    g2.connect(lp);
    lp.connect(g);
    g.connect(bus || sfx);
    o.start(t);
    o2.start(t);
    o.stop(t + dur + 0.1);
    o2.stop(t + dur + 0.1);
  }

  /* ── 배경 음악: 조용한 실내악풍 미뉴에트 (3/4) */
  const MEL = [
    [69, 72, 77, 72, 69, 72],
    [74, 0, 70, 74, 77, 74],
    [76, 72, 67, 72, 76, 79],
    [77, 0, 72, 0, 69, 0],
    [74, 69, 65, 69, 74, 77],
    [70, 74, 79, 74, 70, 67],
    [72, 76, 79, 76, 72, 70],
    [69, 0, 65, 0, 0, 0],
  ];
  const BASS = [41, 34, 36, 41, 38, 31, 36, 41];
  const CH = [
    [57, 60],
    [58, 62],
    [55, 60],
    [57, 60],
    [57, 62],
    [58, 62],
    [55, 58],
    [57, 60],
  ];
  let mus = null;
  A.music = function (on) {
    if (!ac) return;
    if (on) {
      if (mus) return;
      musicBus.gain.cancelScheduledValues(now());
      musicBus.gain.setTargetAtTime(0.5, now(), 1.2);
      const beat = 60 / 92;
      mus = { next: now() + 0.2, step: 0, loop: 0 };
      mus.timer = setInterval(() => {
        if (!mus) return;
        while (mus.next < now() + 0.25) {
          const bar = Math.floor(mus.step / 6) % 8;
          const e = mus.step % 6;
          const t = mus.next;
          const variant = mus.loop % 4;
          if (e === 0) pluck(BASS[bar], t, 0.1, 0.9, 'triangle', musicBus);
          if (e === 2 || e === 4) CH[bar].forEach((m) => pluck(m, t, 0.03, 0.35, 'triangle', musicBus));
          const n = MEL[bar][e];
          if (n && variant !== 3 && !(variant === 1 && e % 2)) pluck(n + (variant === 2 ? 12 : 0), t, variant === 2 ? 0.035 : 0.05, 0.45, 'triangle', musicBus);
          mus.step++;
          if (mus.step % 48 === 0) mus.loop++;
          mus.next += beat / 2;
        }
      }, 60);
    } else if (mus) {
      clearInterval(mus.timer);
      mus = null;
      musicBus.gain.setTargetAtTime(0, now(), 0.3);
    }
  };
  A.duckMusic = function (amount, dur) {
    if (!ac || !mus) return;
    const t = now();
    musicBus.gain.cancelScheduledValues(t);
    musicBus.gain.setTargetAtTime(0.5 * (1 - amount), t, 0.08);
    musicBus.gain.setTargetAtTime(0.5, t + (dur || 1.5), 0.6);
  };
})(typeof window !== 'undefined' ? window : globalThis);
