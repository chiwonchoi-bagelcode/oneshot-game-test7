/* 토르티야 정상회담 — 본편 */
(function (G) {
  'use strict';
  const TS = G.TS;
  const U = TS.U;
  const Geom = TS.Geom;
  const Sim = TS.Sim;
  const A = TS.Audio;
  const Tor = TS.Tortilla;
  const Dip = TS.Diplomat;
  const Props = TS.Props;
  const Ship = TS.Ship;
  const FX = TS.FX;
  const UI = TS.UI;
  const LEVELS = TS.LEVELS;

  const K = 0.78;
  const TASK_DUR = 3.4;
  const GAP = 4.6;

  const game = {
    time: 0,
    li: 0,
    phase: 'title',
    tfByKey: new Map(),
    dips: {},
    props: {},
    fx: FX.create(),
    timers: [],
    gen: 0,
    shake: 0,
    shipBuilt: new Set(),
    shipPlan: new Set(),
    shipGlow: {},
    ripples: [],
    lossCount: {},
    progress: UI.loadProgress(),
    flags: {},
  };
  G.TS.game = game;

  /* ───────────────────────── 준비 */
  function init() {
    game.cv = document.getElementById('game');
    game.ctx = game.cv.getContext('2d');
    game.frame = document.getElementById('frame');
    window.addEventListener('resize', resize);
    resize();
    bindInput();
    bindUI();
    UI.setMuted(A.muted());
    // 타이틀 뒤에 보이는 판
    loadLevel(0, { title: true });
    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      try {
        update(dt);
        render();
      } catch (e) {
        console.error(e);
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  function resize() {
    const iw = window.innerWidth;
    const ih = window.innerHeight;
    let fw;
    let fh;
    if (iw < 560) {
      fw = iw;
      fh = ih;
    } else {
      fh = Math.min(ih - 24, 920);
      fw = Math.round(Math.min(iw - 24, fh * 0.48));
    }
    document.documentElement.style.setProperty('--frame-w', fw + 'px');
    document.documentElement.style.setProperty('--frame-h', fh + 'px');
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    game.dpr = dpr;
    game.W = fw;
    game.H = fh;
    game.cv.width = Math.round(fw * dpr);
    game.cv.height = Math.round(fh * dpr);
    // 배치
    const top = 54;
    const memoH = 100;
    const S = (fw * 0.455) / 100;
    const boardH = 200 * S * K + 52; // 뒤쪽 인물 머리 높이 포함
    const free = fh - top - memoH - 12 - boardH - 34;
    const bowlH = U.clamp(free * 0.62, 96, 210);
    game.bowl = { x: fw / 2, y: top + bowlH * 0.6, rx: Math.min(fw * 0.34, 150) };
    const chipsY = top + bowlH + 2;
    UI.placeChips(chipsY);
    const areaTop = chipsY + 32;
    const areaBot = fh - memoH - 12;
    let S2 = S;
    if (areaBot - areaTop < boardH) S2 = Math.max(1.1, (areaBot - areaTop - 52) / (200 * K));
    const cy = areaTop + 46 + 100 * S2 * K + Math.max(0, (areaBot - areaTop - (200 * S2 * K + 52)) * 0.45);
    game.view = { cx: fw / 2, cy, S: S2, K, thick: Math.max(4, S2 * 2.9), dpr };
    game.tableCanvas = null;
  }

  function later(sec, fn) {
    const gen = game.gen;
    game.timers.push({ t: game.time + sec, fn, gen });
  }

  /* ───────────────────────── 레벨 */
  function loadLevel(idx, opts) {
    opts = opts || {};
    game.gen++;
    game.timers = [];
    game.li = idx;
    const lv = LEVELS[idx];
    game.level = lv;
    if (!game.board || game.board._lid !== lv.id) {
      game.board = Geom.build(lv);
      game.board._lid = lv.id;
      Tor.prepareEdgeDetail(game.board);
      game.tex = Tor.makeTexture(game.board, lv.seed);
      game.sidePat = Tor.makeSidePattern(game.ctx);
    }
    game.sim = Sim.create(lv, game.board);
    game.tfByKey = new Map();
    preparePieces();
    for (const p of game.sim.pieces.list) game.tfByKey.set(p.key, newTf(p));
    if (game.sim.pieces.list.length > 1) separateInitial();
    game.fx = FX.create();
    game.dips = {};
    lv.diplomats.forEach((d, i) => (game.dips[d.id] = makeDip(d, i)));
    game.props = {};
    for (const t of lv.tasks) game.props[t.id] = makeProp(t);
    game.anim = null;
    game.press = null;
    game.hover = null;
    game.hintRun = null;
    game.outcome = null;
    game.flags = {};
    game.dropIn = opts.noDrop ? 1 : 0;
    // 배: 이전 회의에서 만든 부품
    game.shipBuilt = new Set();
    for (let i = 0; i < idx; i++) for (const p of LEVELS[i].parts) game.shipBuilt.add(p);
    game.shipPlan = new Set();
    for (const L of LEVELS) for (const p of L.parts) game.shipPlan.add(p);
    game.shipGlow = {};
    game.currentParts = new Set(lv.parts);
    if (opts.title) {
      game.phase = 'title';
      UI.hideHud();
      return;
    }
    UI.setHud(lv);
    updateChips();
    game.phase = 'intro';
    if (!opts.noIntro) showIntro();
    else startPlay();
  }

  function newTf(p) {
    return { px: p.cx, py: p.cy, ox: 0, oy: 0, rot: 0, tox: 0, toy: 0, trot: 0, vox: 0, voy: 0, vrot: 0, lift: 0, vlift: 0, flash: 0 };
  }

  /* 처음부터 갈라진 판: 조각들을 미리 벌려 둔다 */
  function separateInitial() {
    const list = game.sim.pieces.list;
    const total = list.reduce((a, k) => a + k.area, 0);
    list.forEach((k, i) => {
      let ox = 0;
      let oy = 0;
      list.forEach((k2, j) => {
        if (j === i) return;
        ox += k2.cx;
        oy += k2.cy;
      });
      ox /= list.length - 1;
      oy /= list.length - 1;
      const [dx, dy] = norm2(k.cx - ox, k.cy - oy);
      const amt = GAP * U.clamp((1 - k.area / total) * 2, 0.3, 1.85);
      const tf = game.tfByKey.get(k.key);
      tf.ox = tf.tox = dx * amt;
      tf.oy = tf.toy = dy * amt;
      tf.rot = tf.trot = (i % 2 ? 1 : -1) * 0.012;
    });
  }

  function preparePieces() {
    const st = game.sim;
    const pof = st.pieces.pieceOfFace;
    for (const p of st.pieces.list) {
      p.innerEdges = [];
      p.brokenEdges = [];
      const fset = new Set(p.faces);
      for (const eid of game.board.crackEdges) {
        const e = game.board.edges[eid];
        const in0 = fset.has(e.faces[0]);
        const in1 = fset.has(e.faces[1]);
        if (in0 && in1) p.innerEdges.push(eid);
        else if ((in0 || in1) && st.broken.has(eid)) {
          const fid = in0 ? e.faces[0] : e.faces[1];
          p.brokenEdges.push({ id: eid, side: Tor.edgeSideForFace(game.board, e, fid) });
        }
      }
      void pof;
    }
  }

  function tfOfFace(fid) {
    const pi = game.sim.pieces.pieceOfFace[fid];
    if (pi === undefined || pi < 0) return null;
    return game.tfByKey.get(game.sim.pieces.list[pi].key);
  }
  function pieceOfFace(fid) {
    return game.sim.pieces.list[game.sim.pieces.pieceOfFace[fid]];
  }

  /* 회전 중심을 바꿔도 화면상 위치는 그대로 */
  function rebasePivot(tf, nx, ny) {
    const c = Math.cos(tf.rot);
    const s = Math.sin(tf.rot);
    const dx = nx - tf.px;
    const dy = ny - tf.py;
    const rx = dx * c - dy * s;
    const ry = dx * s + dy * c;
    const shiftX = rx - dx;
    const shiftY = ry - dy;
    tf.ox += shiftX;
    tf.oy += shiftY;
    tf.tox += shiftX;
    tf.toy += shiftY;
    tf.px = nx;
    tf.py = ny;
  }

  /* 깨진 뒤: 새 조각마다 부모 변환을 물려받고 서로 밀어낸다 */
  function syncPieces(oldList, oldPof) {
    const st = game.sim;
    preparePieces();
    const groups = new Map();
    for (const p of st.pieces.list) {
      const parent = oldList[oldPof[p.faces[0]]];
      if (!groups.has(parent.key)) groups.set(parent.key, { parent, kids: [] });
      groups.get(parent.key).kids.push(p);
    }
    const newMap = new Map();
    const splits = [];
    for (const [pkey, grp] of groups) {
      const ptf = game.tfByKey.get(pkey);
      if (grp.kids.length === 1) {
        newMap.set(grp.kids[0].key, ptf);
        continue;
      }
      const total = grp.kids.reduce((a, k) => a + k.area, 0);
      const kidsW = grp.kids.map((k) => Tor.localToWorld(ptf, k.cx, k.cy));
      grp.kids.forEach((k, i) => {
        const tf = Object.assign({}, ptf);
        rebasePivot(tf, k.cx, k.cy);
        // 다른 조각들의 중심에서 멀어지는 방향
        let ox = 0;
        let oy = 0;
        let n = 0;
        grp.kids.forEach((k2, j) => {
          if (j === i) return;
          ox += kidsW[j][0];
          oy += kidsW[j][1];
          n++;
        });
        ox /= n;
        oy /= n;
        let dx = kidsW[i][0] - ox;
        let dy = kidsW[i][1] - oy;
        const dl = Math.hypot(dx, dy) || 1;
        dx /= dl;
        dy /= dl;
        const frac = k.area / total;
        const amt = GAP * U.clamp((1 - frac) * 2, 0.3, 1.85);
        tf.tox += dx * amt;
        tf.toy += dy * amt;
        tf.trot += (Math.random() < 0.5 ? -1 : 1) * (1 - frac) * 0.05;
        tf.vox += dx * amt * 9;
        tf.voy += dy * amt * 9;
        tf.lift = 2.6;
        tf.flash = 1;
        newMap.set(k.key, tf);
      });
      splits.push(grp);
    }
    game.tfByKey = newMap;
    // 조각이 화면 밖으로 밀려나지 않게
    const halfW = (game.W / 2 - 6) / game.view.S;
    for (const p of st.pieces.list) {
      const tf = newMap.get(p.key);
      let minx = 1e9;
      let maxx = -1e9;
      for (const fid of p.faces) {
        const b = game.board.faces[fid].bbox;
        minx = Math.min(minx, b[0]);
        maxx = Math.max(maxx, b[2]);
      }
      if (maxx + tf.tox > halfW) tf.tox -= maxx + tf.tox - halfW;
      if (minx + tf.tox < -halfW) tf.tox += -halfW - (minx + tf.tox);
    }
    return splits;
  }

  /* ───────────────────────── 인물 */
  function makeDip(def, i) {
    const look = Dip.resolveLook(def, i + game.level.seed * 3);
    const r = U.rng(i * 31 + 7);
    return {
      id: def.id,
      def,
      look,
      nation: def.nation,
      lx: def.x,
      ly: def.y,
      face: Geom.faceAt(game.board, def.x, def.y),
      facing: def.x < 0 ? 1 : -1,
      shoulder: 0,
      lean: 0,
      expr: look.face,
      blink: 0,
      nextBlink: r.range(1, 4),
      bob: r.range(0, 6.28),
      walk: null,
      step: null,
      stepAcc: 0,
      t: { release: -1, relief: -1, sad: -1, joy: -1, startle: -1, bow: -1, shake: -1, arrive: -1 },
      hop: 0,
      vhop: 0,
      sx: 0,
      sy: 0,
      gaze: [0, 0],
      lastHands: null,
    };
  }

  function dipWorld(dv) {
    const tf = tfOfFace(dv.face);
    return tf ? Tor.localToWorld(tf, dv.lx, dv.ly) : [dv.lx, dv.ly];
  }

  function nationName(id) {
    return TS.NATIONS[game.dips[id].nation].name + ' 대표';
  }

  /* ───────────────────────── 소품 */
  function makeProp(t) {
    return { def: t, tug: 0, tugPh: Math.random() * 6, lostK: 0, lostT: -1, doneT: -1, flown: false, resume: 0, rot: 0, ropeDrop: 0, droppedRope: null, prog: 0, shown: 1, kick: 0 };
  }

  const v3 = (x, y, z) => [x, y, z];
  const norm2 = (x, y) => {
    const l = Math.hypot(x, y) || 1;
    return [x / l, y / l];
  };
  function proj(p) {
    const V = game.view;
    return [V.cx + p[0] * V.S, V.cy + p[1] * V.S * V.K - p[2] * V.S + (game.dropLift || 0)];
  }

  /* 방해꾼의 손: 가까우면 직접, 멀면 밧줄 */
  function obstructGrip(ow, gp) {
    const dx = gp[0] - ow[0];
    const dy = gp[1] - ow[1];
    const d = Math.hypot(dx, dy);
    const [ux, uy] = norm2(dx, dy);
    if (d < 10.5 && gp[2] < 24) {
      return { hands: [v3(gp[0] - uy * 0.9 - ux * 0.6, gp[1] + ux * 0.9 - uy * 0.6, gp[2]), v3(gp[0] + uy * 0.9 - ux * 1.4, gp[1] - ux * 0.9 - uy * 1.4, gp[2] - 0.3)], rope: null };
    }
    const hp = v3(ow[0] + ux * 5.6, ow[1] + uy * 5.6, 12);
    return { hands: [v3(hp[0] - uy * 0.5, hp[1] + ux * 0.5, hp[2] + 0.4), v3(hp[0] - ux * 1.8, hp[1] - uy * 1.8, hp[2] - 0.6)], rope: [hp, gp] };
  }

  /* 매 프레임 작업별 소품 배치와 손 요청 */
  function layoutTasks() {
    const reqs = {};
    const add = (id, r) => (reqs[id] = reqs[id] || []).push(r);
    const draws = [];
    const t = game.time;
    for (const tdef of game.level.tasks) {
      const pv = game.props[tdef.id];
      const status = Sim.status(game.sim, tdef.id);
      pv.status = status;
      if (pv.flown) continue;
      const anchorId = tdef.anchor || tdef.team[0];
      const otherId = tdef.team.find((m) => m !== anchorId);
      const aw = game.dips[anchorId].w;
      const bw = game.dips[otherId].w;
      const [dx, dy] = norm2(bw[0] - aw[0], bw[1] - aw[1]);
      const lost = status === 'lost';
      const lk = U.easeOutCubic(pv.lostK);
      // 활성 방해꾼
      const obs = [];
      if (status === 'blocked') {
        for (const oid of Sim.obstructorsOf(game.sim, tdef.id)) {
          const od = game.dips[oid];
          if (od.walk) continue;
          obs.push(od);
        }
      }
      const tugWave = 0.6 + 0.4 * Math.sin(t * 7.3 + pv.tugPh) + 0.15 * Math.sin(t * 17.1);
      const tugAmt = pv.tug * tugWave;
      let pull = [0, 0];
      if (obs.length) {
        const ow = obs[0].w;
        const mx = (aw[0] + bw[0]) / 2;
        const my = (aw[1] + bw[1]) / 2;
        pull = norm2(ow[0] - mx, ow[1] - my);
      }
      const prog = game.sim.tasks[tdef.id].progress;
      const syncBob = status === 'working' ? Math.sin(t * 5.2) * 0.55 : 0;
      const dragX = pull[0] * tugAmt * 2.0 + pv.kick * -pull[0];
      const dragY = pull[1] * tugAmt * 2.0 + pv.kick * -pull[1];
      const info = { tdef, pv, status, anchorId, otherId, pull, tugAmt, obs };
      const reachHands = (id, toward) => {
        const w = game.dips[id].w;
        const [rx, ry] = norm2(toward[0] - w[0], toward[1] - w[1]);
        const z = 14;
        return [v3(w[0] + rx * 9.5 - ry * 1.2, w[1] + ry * 9.5 + rx * 1.2, z + 1.5), v3(w[0] + rx * 8.2 + ry * 1.4, w[1] + ry * 8.2 - rx * 1.4, z - 0.5)];
      };
      let depth = (aw[1] + bw[1]) / 2 + 2;
      let label = null;
      switch (tdef.type) {
        case 'plank': {
          const z = 12.5 + prog * 3.2 + syncBob - tugAmt * 0.8;
          const ga = v3(aw[0] + dx * 5.0 + dragX, aw[1] + dy * 5.0 + dragY, z);
          let gb = v3(bw[0] - dx * 5.0 + dragX, bw[1] - dy * 5.0 + dragY, z);
          const L = Math.hypot(gb[0] - ga[0], gb[1] - ga[1]);
          let ea = v3(ga[0] - dx * 2.6, ga[1] - dy * 2.6, z);
          let eb = v3(gb[0] + dx * 2.6, gb[1] + dy * 2.6, z);
          if (lost) {
            const len = Math.min(L, 26) * 0.9;
            eb = v3(ga[0] + dx * len, ga[1] + dy * len, U.lerp(z, 1.0, lk));
            ea = v3(ga[0] - dx * 2.6, ga[1] - dy * 2.6, z + lk * 1.5);
            add(anchorId, { hands: [v3(ga[0] - dx * 1.1, ga[1] - dy * 1.1, ea[2]), v3(ga[0] + dx * 0.7, ga[1] + dy * 0.7, ea[2] - 0.2)], look: bw, kind: 'grip' });
            add(otherId, { hands: reachHands(otherId, aw), look: aw, kind: 'reach', open: true });
            pv.lostLine = [reachHands(otherId, aw)[0], eb];
          } else {
            add(anchorId, { hands: [v3(ga[0] - dx * 1.1, ga[1] - dy * 1.1, z), v3(ga[0] + dx * 0.7, ga[1] + dy * 0.7, z - 0.2)], look: bw, kind: 'grip' });
            add(otherId, { hands: [v3(gb[0] + dx * 1.1, gb[1] + dy * 1.1, z), v3(gb[0] - dx * 0.7, gb[1] - dy * 0.7, z - 0.2)], look: aw, kind: 'grip' });
          }
          for (const od of obs) {
            // 판자의 가장 가까운 점
            const r = U.distToSeg(od.w[0], od.w[1], ea[0], ea[1], eb[0], eb[1]);
            const gp = v3(r.x, r.y, z);
            const g = obstructGrip(od.w, gp);
            add(od.id, { hands: g.hands, look: gp, kind: 'pull', rope: g.rope });
          }
          draws.push({ depth, fn: () => Props.drawPlank(game.ctx, game.view, ea, eb, { glow: pv.glow || 0 }) });
          label = v3((ea[0] + eb[0]) / 2, (ea[1] + eb[1]) / 2, z + 18);
          break;
        }
        case 'mast': {
          const base = v3(aw[0] + dx * 4.6, aw[1] + dy * 4.6, 0);
          let lean = [0, 0];
          if (obs.length) lean = [pull[0] * tugAmt * 5.5, pull[1] * tugAmt * 5.5];
          lean[0] += pv.kick * -pull[0] * 3;
          lean[1] += pv.kick * -pull[1] * 3;
          const H = 40 + prog * 3;
          const top = v3(base[0] + lean[0], base[1] + lean[1], H);
          const at = (h) => v3(U.lerp(base[0], top[0], h / H), U.lerp(base[1], top[1], h / H), h);
          const h1 = at(10.5);
          const h2 = at(15.5);
          add(anchorId, { hands: [v3(h1[0] - dx * 0.7, h1[1] - dy * 0.7, h1[2]), v3(h2[0] - dx * 0.7, h2[1] - dy * 0.7, h2[2])], look: bw, kind: 'grip' });
          let corner = v3(bw[0] - dx * 4.4, bw[1] - dy * 4.4, 17 + syncBob);
          if (lost) {
            const hang = at(7);
            corner = v3(U.lerp(corner[0], hang[0] + dx * 2.5, lk), U.lerp(corner[1], hang[1] + dy * 2.5, lk), U.lerp(corner[2], 6, lk));
            add(otherId, { hands: reachHands(otherId, aw), look: aw, kind: 'reach', open: true });
            pv.lostLine = [reachHands(otherId, aw)[0], corner];
          } else {
            add(otherId, { hands: [v3(corner[0] + dx * 0.4, corner[1] + dy * 0.4, corner[2] + 0.6), v3(corner[0] + dx * 1.2, corner[1] + dy * 1.2, corner[2] - 1.2)], look: top, kind: 'grip' });
          }
          let ropeTop = at(H - 1.5);
          for (const od of obs) {
            const g = obstructGrip(od.w, ropeTop);
            add(od.id, { hands: g.hands, look: ropeTop, kind: 'pull', rope: g.rope });
          }
          const billow = lost ? 0 : status === 'working' ? 6 + Math.sin(t * 2.2) * 1.6 : 2.5 + Math.sin(t * 9) * 1.2;
          const prBase = pv;
          draws.push({
            depth: base[1] + 0.5,
            fn: () => {
              const ctx = game.ctx;
              Props.drawPole(ctx, game.view, base, top, 1.35, '#a8743f');
              const sTop = proj(at(H - 3));
              const sLow = proj(at(13));
              const sCor = proj(corner);
              Props.drawSail(ctx, sTop, sLow, sCor, billow * game.view.S * 0.6, lost ? lk * 6 : 0, 1);
              // 꼭대기 장식
              const st = proj(top);
              ctx.fillStyle = '#d9a441';
              ctx.beginPath();
              ctx.arc(st[0], st[1], game.view.S * 0.9, 0, Math.PI * 2);
              ctx.fill();
              if (prBase.glow) {
                ctx.save();
                ctx.globalAlpha = prBase.glow;
                ctx.fillStyle = '#fff3c4';
                ctx.beginPath();
                ctx.moveTo(sTop[0], sTop[1]);
                ctx.lineTo(sCor[0], sCor[1]);
                ctx.lineTo(sLow[0], sLow[1]);
                ctx.fill();
                ctx.restore();
              }
            },
          });
          pv.ropeAnchor = ropeTop;
          label = v3(top[0], top[1], H + 6);
          depth = base[1];
          break;
        }
        case 'flag': {
          const z = 22 + syncBob * 0.6;
          const ga = v3(aw[0] + dx * 4.2, aw[1] + dy * 4.2, z);
          const gb = v3(bw[0] - dx * 4.2, bw[1] - dy * 4.2, z);
          const hgt = 11;
          let tl = ga;
          let tr = gb;
          let sag = tugAmt * 3.2;
          if (lost) {
            const len = U.lerp(Math.hypot(gb[0] - ga[0], gb[1] - ga[1]), 3, lk);
            tr = v3(ga[0] + dx * len, ga[1] + dy * len, U.lerp(z, z - 9, lk));
            sag = 0;
            add(anchorId, { hands: [v3(ga[0] - dx * 0.6, ga[1] - dy * 0.6, z + 0.5), v3(ga[0] + dx * 0.5, ga[1] + dy * 0.5, z - 1)], look: bw, kind: 'grip' });
            add(otherId, { hands: reachHands(otherId, aw), look: aw, kind: 'reach', open: true });
            pv.lostLine = [reachHands(otherId, aw)[0], tr];
          } else {
            add(anchorId, { hands: [v3(ga[0] - dx * 0.6, ga[1] - dy * 0.6, z + 0.6), v3(ga[0] - dx * 0.2, ga[1] - dy * 0.2, z - 2.5)], look: bw, kind: 'grip' });
            add(otherId, { hands: [v3(gb[0] + dx * 0.6, gb[1] + dy * 0.6, z + 0.6), v3(gb[0] + dx * 0.2, gb[1] + dy * 0.2, z - 2.5)], look: aw, kind: 'grip' });
          }
          const bm = v3((tl[0] + tr[0]) / 2 + pull[0] * tugAmt * 2.5, (tl[1] + tr[1]) / 2 + pull[1] * tugAmt * 2.5, z - hgt - sag * 0.5);
          for (const od of obs) {
            const g = obstructGrip(od.w, bm);
            add(od.id, { hands: g.hands, look: bm, kind: 'pull', rope: g.rope });
          }
          const unf = 1;
          draws.push({
            depth: (aw[1] + bw[1]) / 2 + 1.5,
            fn: () => {
              const s1 = proj(tl);
              let s2 = proj(tr);
              if (!lost) s2 = [U.lerp(s1[0], s2[0], unf), U.lerp(s1[1], s2[1], unf)];
              const h = hgt * game.view.S * (lost ? 1.15 : 1);
              Props.drawFlag(game.ctx, s1, s2, h, t, status === 'working' ? 1.6 : 0.6 + tugAmt, sag * game.view.S * 0.5);
            },
          });
          label = v3((ga[0] + gb[0]) / 2, (ga[1] + gb[1]) / 2, z + 9);
          break;
        }
        case 'oar': {
          const z = 12.5 + syncBob * 0.5;
          const slide = status === 'working' ? Math.sin(t * 2.6) * 1.6 : 0;
          let ga = v3(aw[0] + dx * (4.6 + slide) + dragX, aw[1] + dy * (4.6 + slide) + dragY, z);
          let gb = v3(bw[0] - dx * (4.6 - slide) + dragX, bw[1] - dy * (4.6 - slide) + dragY, z);
          let ea = v3(ga[0] - dx * 3, ga[1] - dy * 3, z);
          let eb = v3(gb[0] + dx * 1.5, gb[1] + dy * 1.5, z);
          if (lost) {
            const len = 18;
            eb = v3(ga[0] + dx * len, ga[1] + dy * len, U.lerp(z, 1, lk));
            add(anchorId, { hands: [v3(ga[0] - dx * 1, ga[1] - dy * 1, z), v3(ga[0] + dx * 0.8, ga[1] + dy * 0.8, z)], look: bw, kind: 'grip' });
            add(otherId, { hands: reachHands(otherId, aw), look: aw, kind: 'reach', open: true });
            pv.lostLine = [reachHands(otherId, aw)[0], eb];
          } else {
            add(anchorId, { hands: [v3(ga[0] - dx * 1, ga[1] - dy * 1, z), v3(ga[0] + dx * 0.8, ga[1] + dy * 0.8, z)], look: bw, kind: 'grip' });
            add(otherId, { hands: [v3(gb[0] - dx * 1, gb[1] - dy * 1, z), v3(gb[0] + dx * 0.6, gb[1] + dy * 0.6, z + 0.3)], look: aw, kind: 'grip' });
          }
          for (const od of obs) {
            const g = obstructGrip(od.w, v3(eb[0], eb[1], z));
            add(od.id, { hands: g.hands, look: eb, kind: 'pull', rope: g.rope });
          }
          const pile = Math.floor(prog * 4.99);
          draws.push({
            depth: (aw[1] + bw[1]) / 2 + 2,
            fn: () => {
              Props.drawOar(game.ctx, game.view, ea, eb);
              for (let i = 0; i < pile; i++) {
                const px = bw[0] + dx * 2 - dy * (6 + i * 1.6);
                const py = bw[1] + dy * 2 + dx * (6 + i * 1.6);
                Props.drawOar(game.ctx, game.view, v3(px - dx * 8, py - dy * 8, 0.6 + i * 0.1), v3(px + dx * 2, py + dy * 2, 0.6));
              }
            },
          });
          label = v3((ga[0] + gb[0]) / 2, (ga[1] + gb[1]) / 2, z + 16);
          break;
        }
        case 'helm': {
          let c = v3((aw[0] + bw[0]) / 2, (aw[1] + bw[1]) / 2 + 1.5, 14.5);
          if (lost) c = v3(U.lerp(c[0], aw[0] + dx * 6.5, lk), U.lerp(c[1], aw[1] + dy * 6.5 + 1.5, lk), 14.5 - lk * 2);
          const r = 4.6;
          if (status === 'working') pv.rot += 0.016 * 1.6;
          const jit = obs.length ? Math.sin(t * 9) * 0.25 * pv.tug : 0;
          const rot = pv.rot + jit;
          const sideA = Math.sign(aw[0] - c[0]) || -1;
          const sideB = Math.sign(bw[0] - c[0]) || 1;
          add(anchorId, { hands: [v3(c[0] + sideA * r * 0.95, c[1], c[2] + 1.8), v3(c[0] + sideA * r * 0.95, c[1], c[2] - 1.8)], look: bw, kind: 'grip' });
          if (lost) {
            add(otherId, { hands: reachHands(otherId, aw), look: aw, kind: 'reach', open: true });
            pv.lostLine = [reachHands(otherId, aw)[0], v3(c[0] - sideA * r, c[1], c[2])];
          } else add(otherId, { hands: [v3(c[0] + sideB * r * 0.95, c[1], c[2] + 1.8), v3(c[0] + sideB * r * 0.95, c[1], c[2] - 1.8)], look: aw, kind: 'grip' });
          for (const od of obs) {
            const gp = v3(c[0] + pull[0] * 1.2, c[1], c[2] + r * 1.25);
            const g = obstructGrip(od.w, gp);
            add(od.id, { hands: g.hands, look: gp, kind: 'pull', rope: g.rope });
          }
          draws.push({
            depth: c[1],
            fn: () => {
              const sc = proj(c);
              Props.drawHelm(game.ctx, game.view, v3(c[0], c[1], 0), sc, r * game.view.S, rot);
            },
          });
          label = v3(c[0], c[1], c[2] + 14);
          depth = c[1];
          break;
        }
        case 'ring': {
          let c = v3((aw[0] + bw[0]) / 2 + pull[0] * tugAmt * 1.6, (aw[1] + bw[1]) / 2 + 1.5 + pull[1] * tugAmt * 1.6, 14 + syncBob * 0.5);
          if (lost) c = v3(U.lerp(c[0], aw[0] + dx * 6.5, lk), U.lerp(c[1], aw[1] + dy * 6.5 + 1.5, lk), 14 - lk * 3);
          const r = 4.3;
          const rot = status === 'working' ? Math.sin(t * 2.4) * 0.12 : Math.sin(t * 9) * 0.08 * pv.tug;
          const sideA = Math.sign(aw[0] - c[0]) || -1;
          const sideB = Math.sign(bw[0] - c[0]) || 1;
          add(anchorId, { hands: [v3(c[0] + sideA * r * 1.05, c[1], c[2] + 1.5), v3(c[0] + sideA * r * 1.05, c[1], c[2] - 1.5)], look: bw, kind: 'grip' });
          if (lost) {
            add(otherId, { hands: reachHands(otherId, aw), look: aw, kind: 'reach', open: true });
            pv.lostLine = [reachHands(otherId, aw)[0], v3(c[0] - sideA * r, c[1], c[2])];
          } else add(otherId, { hands: [v3(c[0] + sideB * r * 1.05, c[1], c[2] + 1.5), v3(c[0] + sideB * r * 1.05, c[1], c[2] - 1.5)], look: aw, kind: 'grip' });
          for (const od of obs) {
            const gp = v3(c[0], c[1], c[2] + r);
            const g = obstructGrip(od.w, gp);
            add(od.id, { hands: g.hands, look: gp, kind: 'pull', rope: g.rope });
          }
          draws.push({ depth: c[1], fn: () => Props.drawRing(game.ctx, proj(c), r * game.view.S, rot) });
          label = v3(c[0], c[1], c[2] + 13);
          break;
        }
        case 'anchor': {
          const z = 14 + prog * 3 + syncBob;
          const ga = v3(aw[0] + dx * 4.4, aw[1] + dy * 4.4, z);
          const gb = v3(bw[0] - dx * 4.4, bw[1] - dy * 4.4, z);
          const midW = v3((ga[0] + gb[0]) / 2 + pull[0] * tugAmt * 3, (ga[1] + gb[1]) / 2 + pull[1] * tugAmt * 3, z);
          const sag = 6.5 - prog * 2;
          add(anchorId, { hands: [v3(ga[0] - dx * 0.8, ga[1] - dy * 0.8, z), v3(ga[0] + dx * 0.6, ga[1] + dy * 0.6, z - 0.4)], look: bw, kind: 'grip' });
          let anchorTop;
          let chainEnd = gb;
          if (lost) {
            anchorTop = v3(U.lerp(midW[0], ga[0] + dx * 9, lk), U.lerp(midW[1], ga[1] + dy * 9, lk), U.lerp(z - sag, 9, lk));
            chainEnd = anchorTop;
            add(otherId, { hands: reachHands(otherId, aw), look: aw, kind: 'reach', open: true });
            pv.lostLine = [reachHands(otherId, aw)[0], anchorTop];
          } else {
            anchorTop = v3(midW[0], midW[1], z - sag);
            add(otherId, { hands: [v3(gb[0] + dx * 0.8, gb[1] + dy * 0.8, z), v3(gb[0] - dx * 0.6, gb[1] - dy * 0.6, z - 0.4)], look: aw, kind: 'grip' });
          }
          const anchorBot = v3(anchorTop[0] + pull[0] * tugAmt * 2, anchorTop[1] + pull[1] * tugAmt * 2, anchorTop[2] - 8);
          for (const od of obs) {
            const g = obstructGrip(od.w, anchorBot);
            add(od.id, { hands: g.hands, look: anchorBot, kind: 'pull', rope: g.rope });
          }
          draws.push({
            depth: (aw[1] + bw[1]) / 2 + 2,
            fn: () => {
              const ctx = game.ctx;
              const S = game.view.S;
              const pa = proj(ga);
              const pt = proj(anchorTop);
              const pb = proj(chainEnd);
              Props.drawChain(ctx, pa, pt, lost ? 4 : 2, S * 0.7);
              if (!lost) Props.drawChain(ctx, pt, pb, 2, S * 0.7);
              const ab = proj(anchorBot);
              const ang = Math.atan2(ab[0] - pt[0], -(ab[1] - pt[1]) + 1e-6) * -0.6 + (lost ? 1.2 * lk : 0);
              Props.drawAnchor(ctx, pt, 9 * S, ang);
            },
          });
          label = v3((ga[0] + gb[0]) / 2, (ga[1] + gb[1]) / 2, z + 12);
          break;
        }
        case 'bunting': {
          const z = 21 + syncBob * 0.6;
          const ga = v3(aw[0] + dx * 3.6, aw[1] + dy * 3.6, z);
          const gb = v3(bw[0] - dx * 3.6, bw[1] - dy * 3.6, z);
          const sag = 3 + tugAmt * 4.5 + (status === 'blocked' ? 1 : 0) - prog * 1.5;
          add(anchorId, { hands: [v3(ga[0] - dx * 0.5, ga[1] - dy * 0.5, z + 0.5), v3(ga[0] + dx * 0.3, ga[1] + dy * 0.3, z - 1.4)], look: bw, kind: 'grip' });
          let end = gb;
          if (lost) {
            end = v3(U.lerp(gb[0], ga[0] + dx * 8, lk), U.lerp(gb[1], ga[1] + dy * 8, lk), U.lerp(z, 0.5, lk));
            add(otherId, { hands: reachHands(otherId, aw), look: aw, kind: 'reach', open: true });
            pv.lostLine = [reachHands(otherId, aw)[0], end];
          } else add(otherId, { hands: [v3(gb[0] + dx * 0.5, gb[1] + dy * 0.5, z + 0.5), v3(gb[0] - dx * 0.3, gb[1] - dy * 0.3, z - 1.4)], look: aw, kind: 'grip' });
          const mid = v3((ga[0] + gb[0]) / 2 + pull[0] * tugAmt * 2, (ga[1] + gb[1]) / 2 + pull[1] * tugAmt * 2, z - sag - 1);
          for (const od of obs) {
            const g = obstructGrip(od.w, mid);
            add(od.id, { hands: g.hands, look: mid, kind: 'pull', rope: g.rope });
          }
          const colors = game.level.diplomats.map((d) => TS.NATIONS[d.nation].color);
          draws.push({
            depth: (aw[1] + bw[1]) / 2 + 1.5,
            fn: () => {
              const p1 = proj(ga);
              const p2 = proj(end);
              const pm = proj(mid);
              const sagPx = Math.max(2, pm[1] - (p1[1] + p2[1]) / 2) * (lost ? 0.2 : 0.5);
              Props.drawBunting(game.ctx, p1, p2, sagPx, t, colors, 1);
            },
          });
          label = v3((ga[0] + gb[0]) / 2, (ga[1] + gb[1]) / 2, z + 8);
          break;
        }
        case 'lamp': {
          const z = 13 + syncBob * 0.5;
          const ga = v3(aw[0] + dx * 4.6 + dragX * 0.3, aw[1] + dy * 4.6 + dragY * 0.3, z);
          let gb = v3(bw[0] - dx * 4.6 + dragX * 0.3, bw[1] - dy * 4.6 + dragY * 0.3, z);
          let ea = v3(ga[0] - dx * 2, ga[1] - dy * 2, z);
          let eb = v3(gb[0] + dx * 2, gb[1] + dy * 2, z);
          add(anchorId, { hands: [v3(ga[0] - dx * 1, ga[1] - dy * 1, z), v3(ga[0] + dx * 0.8, ga[1] + dy * 0.8, z)], look: bw, kind: 'grip' });
          if (lost) {
            eb = v3(ga[0] + dx * 16, ga[1] + dy * 16, U.lerp(z, 1, lk));
            add(otherId, { hands: reachHands(otherId, aw), look: aw, kind: 'reach', open: true });
            pv.lostLine = [reachHands(otherId, aw)[0], eb];
          } else add(otherId, { hands: [v3(gb[0] - dx * 1, gb[1] - dy * 1, z), v3(gb[0] + dx * 0.8, gb[1] + dy * 0.8, z)], look: aw, kind: 'grip' });
          const hook = lost ? v3(U.lerp((ea[0] + eb[0]) / 2, eb[0], 0.5), U.lerp((ea[1] + eb[1]) / 2, eb[1], 0.5), U.lerp(z, 1, lk)) : v3((ea[0] + eb[0]) / 2, (ea[1] + eb[1]) / 2, z);
          const lanternBot = v3(hook[0] + pull[0] * tugAmt * 2.5, hook[1] + pull[1] * tugAmt * 2.5, hook[2] - 6.5);
          for (const od of obs) {
            const g = obstructGrip(od.w, lanternBot);
            add(od.id, { hands: g.hands, look: lanternBot, kind: 'pull', rope: g.rope });
          }
          const glow = status === 'working' ? 0.35 + prog * 0.65 : status === 'done' ? 1 : status === 'blocked' ? 0.12 + 0.1 * Math.sin(t * 13) : 0;
          draws.push({
            depth: (aw[1] + bw[1]) / 2 + 2,
            fn: () => {
              Props.drawPole(game.ctx, game.view, ea, eb, 0.85, '#8a5a2c');
              const hs = proj(hook);
              const lb = proj(lanternBot);
              const sway = Math.atan2(lb[0] - hs[0], lb[1] - hs[1]) * -1 + (status === 'working' ? Math.sin(t * 2.5) * 0.1 : 0) + (lost ? 1.3 * lk : 0);
              Props.drawLantern(game.ctx, hs, 6.5 * game.view.S, glow, sway);
            },
          });
          label = v3((ga[0] + gb[0]) / 2, (ga[1] + gb[1]) / 2, z + 16);
          break;
        }
      }
      info.label = label;
      pv.info = info;
      void depth;
    }
    return { reqs, draws };
  }

  /* ───────────────────────── 갱신 */
  function update(dt) {
    game.time += dt;
    // 타이머
    const due = game.timers.filter((tm) => tm.t <= game.time && tm.gen === game.gen);
    game.timers = game.timers.filter((tm) => tm.t > game.time && tm.gen === game.gen);
    for (const tm of due) tm.fn();
    // 판 등장
    if (game.dropIn < 1) {
      game.dropIn = Math.min(1, game.dropIn + dt * 1.6);
      if (game.dropIn >= 1 && game.phase !== 'title') {
        A.snap(0.25);
      }
    }
    const dk = game.dropIn;
    game.dropLift = -(1 - U.easeOutBack(dk, 1.2)) * 60;
    // 조각 스프링
    for (const tf of game.tfByKey.values()) {
      const k = 140;
      const d = 15;
      tf.vox += ((tf.tox - tf.ox) * k - tf.vox * d) * dt;
      tf.voy += ((tf.toy - tf.oy) * k - tf.voy * d) * dt;
      tf.vrot += ((tf.trot - tf.rot) * k - tf.vrot * d) * dt;
      tf.ox += tf.vox * dt;
      tf.oy += tf.voy * dt;
      tf.rot += tf.vrot * dt;
      tf.vlift += (-tf.lift * 260 - tf.vlift * 16) * dt;
      tf.lift += tf.vlift * dt;
      tf.flash = Math.max(0, tf.flash - dt * 3);
    }
    if (game.press && game.press.run) {
      // 누르는 동안 판이 살짝 휜다
      game.press.hold += dt;
      const tf = tfOfFace(game.board.edges[game.press.run.edges[0]].faces[0]);
      if (tf) tf.lift = Math.min(1.4, game.press.hold * 3) + Math.sin(game.time * 40) * 0.08;
      game.press.stressAcc += dt;
      if (game.press.stressAcc > 0.22 - Math.min(0.12, game.press.hold * 0.1)) {
        game.press.stressAcc = 0;
        A.stress(Math.min(1, game.press.hold));
      }
    }
    game.shake = Math.max(0, game.shake - dt * 18);
    updateCrack(dt);
    updateTasks(dt);
    updateDips(dt);
    FX.update(game.fx, dt, (x, y) => {
      // 월드 좌표의 부스러기가 어느 조각 위에 떨어졌는지
      for (const p of game.sim.pieces.list) {
        const tf = game.tfByKey.get(p.key);
        const l = Tor.worldToLocal(tf, x, y);
        const f = Geom.faceAt(game.board, l[0], l[1]);
        if (f >= 0 && game.sim.pieces.pieceOfFace[f] === game.sim.pieces.list.indexOf(p) && U.pointInPoly(l[0], l[1], game.board.faces[f].pts)) return { face: f, lx: l[0], ly: l[1] };
      }
      return null;
    });
    for (const r of game.ripples) r.t += dt;
    game.ripples = game.ripples.filter((r) => r.t < r.life);
    for (const k in game.shipGlow) game.shipGlow[k] = Math.max(0, game.shipGlow[k] - dt * 0.8);
  }

  function updateTasks(dt) {
    if (game.phase !== 'play' && game.phase !== 'lostview') return;
    const st = game.sim;
    for (const tdef of game.level.tasks) {
      const pv = game.props[tdef.id];
      const ts = st.tasks[tdef.id];
      const status = Sim.status(st, tdef.id);
      // 당김 정도
      const walking = Sim.obstructorsOf(st, tdef.id).some((id) => game.dips[id].walk);
      const wantTug = status === 'blocked' && !walking ? 1 : 0;
      pv.tug = U.lerp(pv.tug, wantTug, Math.min(1, dt * (wantTug ? 6 : 12)));
      pv.kick = Math.max(0, pv.kick - dt * 3);
      if (wantTug && Math.random() < dt * 0.9) A.tug();
      if (status === 'lost') pv.lostK = Math.min(1, pv.lostK + dt * 2.2);
      if (status === 'working' && !ts.done) {
        if (pv.resume > 0) pv.resume -= dt;
        else {
          ts.progress = Math.min(1, ts.progress + dt / (tdef.dur || TASK_DUR));
          pv.workAcc = (pv.workAcc || 0) + dt;
          if (pv.workAcc > 0.62) {
            pv.workAcc = 0;
            if (tdef.type === 'flag' || tdef.type === 'mast') A.cloth();
            else A.knock(0.05);
          }
          if (ts.progress >= 1) completeTask(tdef);
        }
      }
    }
    updateChips();
  }

  function completeTask(tdef) {
    const st = game.sim;
    st.tasks[tdef.id].done = true;
    const pv = game.props[tdef.id];
    pv.doneT = game.time;
    A.chime(Object.keys(game.props).indexOf(tdef.id) % 3);
    for (const m of tdef.team) {
      const dv = game.dips[m];
      dv.t.joy = game.time;
    }
    FX.say(game.fx, tdef.team[1], '완료입니다.', 1.4);
    // 맞잡은 손 (악수)
    later(0.25, () => {
      pv.glow = 1;
    });
    later(0.55, () => {
      const info = pv.info;
      const from = info && info.label ? proj(info.label) : [game.view.cx, game.view.cy];
      pv.flown = true;
      const m0 = game.dips[tdef.team[0]];
      const m1 = game.dips[tdef.team[1]];
      const close = m0.w && m1.w && Math.hypot(m0.w[0] - m1.w[0], m0.w[1] - m1.w[1]) < 26;
      for (const m of tdef.team) {
        if (close) game.dips[m].t.shake = game.time;
        else {
          game.dips[m].t.bow = game.time + 0.15;
          game.dips[m].bowTo = tdef.team.find((x) => x !== m);
        }
      }
      A.whoosh();
      const target = shipPoint();
      FX.fly(game.fx, tdef.part, from, target, () => {
        game.shipBuilt.add(tdef.part);
        game.shipGlow[tdef.part] = 1;
        game.ripples.push({ x: target[0], y: target[1] + 10, t: 0, life: 1.2 });
        A.splash();
        A.knock(0.12);
        checkWin();
      });
    });
    const ev = Sim.resolve(st);
    handleSimEvents(ev);
    scheduleStuckCheck(0.8);
  }

  function shipPoint() {
    const b = game.bowl;
    return [b.x, b.y + 2];
  }

  function checkWin() {
    if (game.outcome) return;
    if (!Sim.allDone(game.sim)) return;
    if (game.fx.flyers.some((f) => !f.done)) return;
    game.outcome = 'won';
    game.phase = 'won';
    A.fanfare();
    A.duckMusic(0.7, 2.5);
    for (const k in game.dips) {
      game.dips[k].t.bow = game.time + Math.random() * 0.3;
    }
    for (const p of game.level.parts) game.shipGlow[p] = 1;
    const lv = game.level;
    const pr = game.progress;
    if (pr.cleared.indexOf(lv.id) < 0) pr.cleared.push(lv.id);
    const used = game.sim.cracksUsed;
    if (!pr.best[lv.id] || used < pr.best[lv.id]) pr.best[lv.id] = used;
    UI.saveProgress(pr);
    UI.memo('합의가 이루어졌다. 구조선에 <b>' + lv.parts.map((p) => TS.PARTS[p].name).join(', ') + '</b>이(가) 더해졌다.');
    later(1.6, () => {
      if (game.li === LEVELS.length - 1) A.horn();
      showWin();
    });
  }

  /* ───────────────────────── 인물 갱신 */
  function updateDips(dt) {
    const t = game.time;
    for (const k in game.dips) {
      const dv = game.dips[k];
      // 걷기
      if (dv.walk) {
        const w = dv.walk;
        const tgt = w.path[w.i];
        const dx = tgt[0] - dv.lx;
        const dy = tgt[1] - dv.ly;
        const d = Math.hypot(dx, dy);
        const sp = 24;
        if (d < sp * dt) {
          dv.lx = tgt[0];
          dv.ly = tgt[1];
          w.i++;
          if (w.i >= w.path.length) {
            dv.walk = null;
            dv.step = null;
            const sd = game.sim.dip[dv.id];
            sd.x = dv.lx;
            sd.y = dv.ly;
            sd.face = Geom.faceAt(game.board, sd.x, sd.y);
            sd.piece = game.sim.pieces.pieceOfFace[sd.face];
            dv.face = sd.face;
            dv.t.arrive = t;
            if (w.onArrive) w.onArrive();
          }
        } else {
          dv.lx += (dx / d) * sp * dt;
          dv.ly += (dy / d) * sp * dt;
          dv.step = (dv.step || 0) + dt * 13;
          dv.stepAcc += dt * 13;
          if (dv.stepAcc > Math.PI) {
            dv.stepAcc -= Math.PI;
            A.step(0.05);
          }
          if (Math.abs(dx) > 0.5) dv.facing = dx > 0 ? 1 : -1;
          dv.face = Geom.faceAt(game.board, dv.lx, dv.ly);
          const sd = game.sim.dip[dv.id];
          sd.x = dv.lx;
          sd.y = dv.ly;
          sd.face = dv.face;
          sd.piece = game.sim.pieces.pieceOfFace[dv.face];
        }
      }
      // 눈 깜빡임
      dv.nextBlink -= dt;
      if (dv.nextBlink < 0) {
        dv.blink = 1;
        dv.nextBlink = 2 + Math.random() * 3.5;
      }
      dv.blink = Math.max(0, dv.blink - dt * 7);
      // 깡충
      dv.vhop -= 160 * dt;
      dv.hop += dv.vhop * dt;
      if (dv.hop < 0) {
        dv.hop = 0;
        dv.vhop = 0;
      }
    }
  }

  /* 인물 자세 결정 (그리기 직전) */
  function poseDips(reqs) {
    const t = game.time;
    const st = game.sim;
    const V = game.view;
    for (const k in game.dips) {
      const dv = game.dips[k];
      const w = dv.w;
      const s = proj(v3(w[0], w[1], 0));
      dv.sx = s[0];
      dv.sy = s[1];
      const list = reqs[k] || [];
      let shoulderT = 0.05;
      let leanT = 0;
      let expr = dv.look.face === 'smile' ? 'calm' : dv.look.face;
      if (dv.look.face === 'smile') expr = 'smile';
      let handL = null;
      let handR = null;
      let openL = false;
      let openR = false;
      let lookAt = null;
      dv.ropes = [];
      let sweat = 0;
      const myTasks = game.level.tasks.filter((tt) => tt.team.indexOf(k) >= 0);
      const myStatus = myTasks.map((tt) => Sim.status(st, tt.id));
      // 요청 → 손
      if (list.length) {
        const hs = [];
        for (const r of list) {
          if (list.length === 1) hs.push(...r.hands.map((h) => ({ h, r })));
          else hs.push({ h: r.hands[0], r });
          if (r.rope) dv.ropes.push(r.rope);
        }
        const sp = hs.map((x) => ({ s: proj(x.h), r: x.r }));
        sp.sort((a, b) => a.s[0] - b.s[0]);
        handL = sp[0].s;
        openL = !!sp[0].r.open;
        const last = sp[sp.length - 1];
        handR = last.s;
        openR = !!last.r.open;
        lookAt = list[0].look;
        if (list.length > 1) lookAt = [(list[0].look[0] + list[1].look[0]) / 2, (list[0].look[1] + list[1].look[1]) / 2];
        const tx = (handL[0] + handR[0]) / 2;
        if (Math.abs(tx - dv.sx) > 2) dv.facing = tx > dv.sx ? 1 : -1;
        dv.lastHands = { l: [handL[0] - dv.sx, handL[1] - dv.sy], r: [handR[0] - dv.sx, handR[1] - dv.sy] };
        const pulling = list.find((r) => r.kind === 'pull');
        if (pulling) {
          const gp = proj(pulling.look);
          leanT = -Math.sign(gp[0] - dv.sx) * 0.24 * (0.6 + 0.4 * Math.sin(t * 7.3));
          shoulderT = 0.55;
          if (dv.look.face !== 'smile' && dv.look.face !== 'grumpy') expr = 'smug';
        }
        const reach = list.find((r) => r.kind === 'reach');
        if (reach) {
          openL = openR = true;
          expr = 'sad';
          shoulderT = -0.4;
          leanT = Math.sign(proj(reach.look)[0] - dv.sx) * 0.1;
        }
      } else if (dv.t.release >= 0 && t - dv.t.release < 0.55 && dv.lastHands) {
        // 손에서 빠져나간 직후: 빈손으로 허공을 쥔다
        handL = [dv.sx + dv.lastHands.l[0], dv.sy + dv.lastHands.l[1]];
        handR = [dv.sx + dv.lastHands.r[0], dv.sy + dv.lastHands.r[1]];
        openL = openR = true;
      }
      // 작업 상태별 표정·어깨
      const blocked = myStatus.indexOf('blocked') >= 0;
      if (blocked && !list.some((r) => r.kind === 'reach')) {
        shoulderT = 1;
        expr = dv.look.face === 'grumpy' ? 'grumpy' : 'strain';
        sweat = t * 0.9;
        const ti = myTasks[myStatus.indexOf('blocked')];
        const pv = game.props[ti.id];
        if (pv.info && pv.info.pull) {
          leanT = -Math.sign(pv.info.pull[0] || 0.0001) * 0.16 * pv.tug * (0.7 + 0.3 * Math.sin(t * 7.3 + pv.tugPh));
        }
      } else if (myStatus.indexOf('working') >= 0) {
        shoulderT = 0;
        if (dv.look.face === 'smile') expr = 'smile';
        else if (dv.look.face === 'grumpy') expr = 'grumpy';
        else expr = 'calm';
      }
      // 순간 반응
      const since = (n) => (dv.t[n] >= 0 ? t - dv.t[n] : 99);
      if (since('relief') < 1.6) {
        expr = 'relieved';
        shoulderT = -0.6;
      }
      if (since('release') < 0.7) {
        expr = 'surprised';
        leanT = (dv.releaseDir || 1) * -0.32 * (1 - since('release') / 0.7);
        shoulderT = 0.3;
      } else if (since('release') < 3) {
        if (!list.length) {
          expr = dv.look.face === 'grumpy' ? 'grumpy' : 'stern';
          shoulderT = -0.35;
        }
      }
      if (since('joy') < 1.8) expr = 'joy';
      if (since('startle') < 0.45) expr = 'surprised';
      if (myStatus.indexOf('lost') >= 0) {
        expr = 'sad';
        if (!list.length) shoulderT = -0.5;
      }
      // 악수 (완료 후 같은 조각에 있는 동료와)
      const shakeT = since('shake');
      if (shakeT < 1.6 && !list.length) {
        const tdef = myTasks.find((tt) => st.tasks[tt.id].done);
        if (tdef) {
          const pid = tdef.team.find((m) => m !== k);
          const pdv = game.dips[pid];
          if (pdv && st.dip[pid].piece === st.dip[k].piece) {
            const mid = proj(v3((w[0] + pdv.w[0]) / 2, (w[1] + pdv.w[1]) / 2, 12 + Math.sin(shakeT * 18) * 0.8 * (shakeT < 1.1 ? 1 : 0)));
            if (mid[0] > dv.sx) handR = mid;
            else handL = mid;
            dv.facing = pdv.w[0] > w[0] ? 1 : -1;
            expr = 'joy';
          }
        }
      }
      // 두리번거림 (참견꾼)
      if (dv.lookAround && t - dv.lookAround < 0.9) {
        const k = (t - dv.lookAround) / 0.9;
        dv.facing = Math.sin(k * Math.PI * 2) > 0 ? 1 : -1;
        lookAt = null;
        dv.gaze = [Math.sin(k * Math.PI * 2), -0.3];
        expr = 'stern';
      }
      // 걷는 중
      if (dv.walk) {
        expr = dv.look.face === 'smile' ? 'smile' : 'stern';
        shoulderT = 0.1;
      }
      // 시선
      if (lookAt) {
        const ls = proj(v3(lookAt[0], lookAt[1], lookAt[2] || 15));
        const gx = (ls[0] - dv.sx) / 40;
        const gy = (ls[1] - (dv.sy - 40)) / 60;
        dv.gaze = [U.lerp(dv.gaze[0], U.clamp(gx * dv.facing, -1, 1) * dv.facing, 0.2), U.lerp(dv.gaze[1], U.clamp(gy, -1, 1), 0.2)];
      } else {
        const idleGaze = Math.sin(t * 0.4 + dv.bob) * 0.6;
        dv.gaze = [U.lerp(dv.gaze[0], idleGaze, 0.05), U.lerp(dv.gaze[1], 0.1, 0.05)];
      }
      // 끝: 인사
      let bow = 0;
      if (dv.t.bow >= 0 && t > dv.t.bow) {
        const bt = t - dv.t.bow;
        if (dv.bowTo && bt < 1.5 && game.dips[dv.bowTo]) dv.facing = game.dips[dv.bowTo].w[0] > w[0] ? 1 : -1;
        bow = bt < 1.4 ? Math.sin(Math.min(1, bt / 1.2) * Math.PI) : 0;
        if (bt < 1.6) {
          expr = 'joy';
          handL = handR = null;
        }
      }
      dv.shoulder = U.lerp(dv.shoulder, shoulderT, 0.14);
      dv.lean = U.lerp(dv.lean, leanT, 0.2);
      dv.pose = {
        sx: dv.sx,
        sy: dv.sy,
        u: V.S,
        facing: dv.facing,
        look: dv.look,
        nation: dv.nation,
        shoulder: dv.shoulder,
        lean: dv.lean,
        bob: Math.sin(t * 2 + dv.bob) * 0.25 + (myStatus.indexOf('working') >= 0 ? Math.sin(t * 5.2) * 0.35 : 0),
        handL,
        handR,
        openL,
        openR,
        expr,
        gaze: dv.gaze,
        blink: dv.blink,
        step: dv.step,
        bow,
        sweat: sweat ? sweat : 0,
        hop: dv.hop,
        armsCrossed: dv.def.idle === 'arms' && !handL && !handR && !dv.walk,
        bowHands: !handL && !handR && !dv.walk && dv.def.idle !== 'arms',
      };
      dv.hasGrip = !!list.find((r) => r.kind === 'grip' || r.kind === 'pull');
    }
  }

  /* ───────────────────────── 금: 맞추기와 깨기 */
  function edgeScreenPts(eid) {
    const e = game.board.edges[eid];
    const tf = tfOfFace(e.faces[0]);
    return e.pts.map((p) => Tor.toScreen(game.view, tf, p[0], p[1], 0)).map((p) => [p[0], p[1] + (game.dropLift || 0)]);
  }

  function hitCrack(px, py, thr) {
    if (!game.sim) return null;
    let best = null;
    let bd = thr;
    for (const eid of game.board.crackEdges) {
      if (game.sim.broken.has(eid)) continue;
      const sp = edgeScreenPts(eid);
      for (let i = 1; i < sp.length; i++) {
        const r = U.distToSeg(px, py, sp[i - 1][0], sp[i - 1][1], sp[i][0], sp[i][1]);
        if (r.d < bd) {
          bd = r.d;
          best = { eid, d: r.d, seg: i - 1, t: r.t };
        }
      }
    }
    if (!best) return null;
    const run = Geom.crackRun(game.board, best.eid, game.sim.broken);
    const pts = Geom.runPolyline(game.board, run);
    // 누른 점의 호 길이 (로컬)
    const e = game.board.edges[best.eid];
    const p0 = e.pts[best.seg];
    const p1 = e.pts[best.seg + 1];
    const lp = [U.lerp(p0[0], p1[0], best.t), U.lerp(p0[1], p1[1], best.t)];
    let s0 = 0;
    let acc = 0;
    let bdd = 1e9;
    for (let i = 1; i < pts.length; i++) {
      const r = U.distToSeg(lp[0], lp[1], pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
      const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (r.d < bdd) {
        bdd = r.d;
        s0 = acc + r.t * l;
      }
      acc += l;
    }
    return { run, pts, s0, L: acc, d: best.d, key: run.edges.join(',') };
  }

  function hitDip(px, py) {
    let best = null;
    let bd = 1e9;
    for (const k in game.dips) {
      const dv = game.dips[k];
      const u = game.view.S;
      if (px > dv.sx - 7 * u && px < dv.sx + 7 * u && py > dv.sy - 30 * u && py < dv.sy + 2 * u) {
        const d = Math.abs(py - (dv.sy - 14 * u)) + Math.abs(px - dv.sx);
        if (d < bd) {
          bd = d;
          best = dv;
        }
      }
    }
    return best;
  }

  function startCrack(h) {
    const tf = tfOfFace(game.board.edges[h.run.edges[0]].faces[0]);
    game.anim = { run: h.run, pts: h.pts, L: h.L, s0: h.s0, d: 0, tf, accA: 0, accB: 0, lastA: h.s0, lastB: h.s0, done: false };
    game.hover = null;
    game.hintRun = null;
    UI.showHint(false);
    A.grain(0.5);
    A.grain(0.35, undefined, 1.3);
    const p = U.pointAlong(h.pts, h.s0);
    const w = Tor.localToWorld(tf, p[0], p[1]);
    FX.burst(game.fx, w[0], w[1], 6, 0.6);
    FX.spark(game.fx, w[0], w[1]);
  }

  function updateCrack(dt) {
    const an = game.anim;
    if (!an) return;
    const speed = 210 + an.d * 0.8;
    an.d += speed * dt;
    const sA = Math.max(0, an.s0 - an.d);
    const sB = Math.min(an.L, an.s0 + an.d);
    const step = 3.2;
    const emit = (s) => {
      const p = U.pointAlong(an.pts, s);
      const w = Tor.localToWorld(an.tf, p[0], p[1]);
      FX.burst(game.fx, w[0], w[1], 2, 0.55);
      if (Math.random() < 0.5) FX.spark(game.fx, w[0], w[1]);
      A.crackRun(0.3);
    };
    while (an.lastA - sA > step) {
      an.lastA -= step;
      emit(an.lastA);
    }
    while (sB - an.lastB > step) {
      an.lastB += step;
      emit(an.lastB);
    }
    an.sA = sA;
    an.sB = sB;
    if (sA <= 0 && sB >= an.L && !an.done) {
      an.done = true;
      finishCrack(an);
    }
  }

  function finishCrack(an) {
    const st = game.sim;
    const oldList = st.pieces.list;
    const oldPof = st.pieces.pieceOfFace;
    // 걷는 중인 참견꾼은 현재 위치 기준
    for (const k in game.dips) {
      const dv = game.dips[k];
      if (dv.walk) {
        st.dip[k].x = dv.lx;
        st.dip[k].y = dv.ly;
      }
    }
    const res = Sim.applyRun(st, an.run);
    const splits = syncPieces(oldList, oldPof);
    game.anim = null;
    if (res.separated) {
      let area = 0;
      for (const grp of splits) area += Math.min.apply(null, grp.kids.map((k) => k.area));
      A.snap(U.clamp(0.55 + area / 9000, 0.6, 1.2));
      game.shake = 3.5;
      // 파단선 전체에서 부스러기
      for (let s = 0; s < an.L; s += 5) {
        const p = U.pointAlong(an.pts, s);
        const w = Tor.localToWorld(an.tf, p[0], p[1]);
        FX.burst(game.fx, w[0], w[1], 2, 0.9);
      }
      // 근처 인물 깜짝
      for (const k in game.dips) {
        const dv = game.dips[k];
        const w = dv.w || [dv.lx, dv.ly];
        let md = 1e9;
        for (let s = 0; s < an.L; s += 4) {
          const p = U.pointAlong(an.pts, s);
          const pw = Tor.localToWorld(an.tf, p[0], p[1]);
          md = Math.min(md, Math.hypot(pw[0] - w[0], pw[1] - w[1]));
        }
        if (md < 26) {
          dv.t.startle = game.time;
          dv.vhop = 26 + Math.random() * 10;
        }
      }
    } else {
      A.grain(0.3);
      A.grain(0.2);
      memo('금이 갔지만 판은 아직 한 덩어리다. 틈이 닫힌 고리를 이루어야 조각이 떨어진다.');
    }
    handleSimEvents(res.events);
    for (const tid of res.lostNow) onTaskLost(tid);
    // 방해가 풀린 작업: 안도
    if (!res.lostNow.length) {
      afterBreakMemo(res);
      scheduleStuckCheck(1.4);
    }
    updateChips();
  }

  function handleSimEvents(events) {
    for (const ev of events) {
      if (ev.type === 'release') onRelease(ev.who, ev.from);
      else if (ev.type === 'retarget') onRetarget(ev);
    }
  }

  function onRelease(who, tid, quiet) {
    const dv = game.dips[who];
    if (game.sim.tasks[tid] && game.sim.tasks[tid].lost) {
      dv.t.release = game.time - 0.4;
      return;
    }
    dv.t.release = game.time;
    const pv = game.props[tid];
    if (pv && pv.info) {
      dv.releaseDir = Math.sign((pv.info.label ? pv.info.label[0] : 0) - dv.w[0]) || 1;
      pv.kick = 1;
    }
    A.release();
    if (!quiet)
      later(0.65, () => {
        FX.say(game.fx, who, U.rng((game.time * 1000) | 0).pick(['흠흠.', '…실례.', '어흠.', '이런.']), 1.6, 'think');
        A.ahem();
      });
    const tdef = game.level.tasks.find((t) => t.id === tid);
    if (!tdef) return;
    const status = Sim.status(game.sim, tid);
    if (status === 'working') {
      pv.resume = 1.0;
      later(0.45, () => {
        for (const m of tdef.team) game.dips[m].t.relief = game.time;
        FX.say(game.fx, tdef.team[0], '휴…', 1.3);
        A.relief();
      });
    }
  }

  function onRetarget(ev) {
    const dv = game.dips[ev.who];
    const sd = game.sim.dip[ev.who];
    if (ev.from) onRelease(ev.who, ev.from, true);
    // 시뮬레이션은 이미 도착 위치로 옮겼다 → 화면에서는 걸어간다
    const dest = [sd.x, sd.y];
    sd.x = dv.lx;
    sd.y = dv.ly;
    sd.face = Geom.faceAt(game.board, sd.x, sd.y);
    sd.piece = game.sim.pieces.pieceOfFace[sd.face];
    const path = findPath([dv.lx, dv.ly], dest);
    later(0.9, () => {
      FX.say(game.fx, ev.who, '어디 보자…', 1.3, 'think');
      dv.lookAround = game.time;
    });
    later(1.6, () => {
      dv.walk = {
        path,
        i: 0,
        onArrive: () => {
          FX.say(game.fx, ev.who, ev.who && dv.def.busyLine ? dv.def.busyLine : '제가 좀 거들죠.', 1.6);
          A.ahem();
          scheduleStuckCheck(0.8);
        },
      };
      const tdef = game.level.tasks.find((t) => t.id === ev.to);
      if (tdef) FX.say(game.fx, tdef.team[0], '잠깐, 잠깐만요!', 1.4);
    });
    memo(`${nationName(ev.who)}가 다른 작업 쪽으로 걸어간다. <b>같은 조각에 남은 작업</b>을 찾아가는 모양이다.`);
  }

  /* 같은 조각 안에서의 길: 직선이 막히면 면 사이 가장자리 중점을 거쳐 간다 */
  function findPath(from, to) {
    const st = game.sim;
    const f0 = Geom.faceAt(game.board, from[0], from[1]);
    const f1 = Geom.faceAt(game.board, to[0], to[1]);
    const pid = st.pieces.pieceOfFace[f0];
    const clear = (a, b) => {
      const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2);
      for (let i = 1; i < n; i++) {
        const x = U.lerp(a[0], b[0], i / n);
        const y = U.lerp(a[1], b[1], i / n);
        if (st.pieces.pieceOfFace[Geom.faceAt(game.board, x, y)] !== pid) return false;
      }
      // 조각 안의 벌어진 틈도 피한다
      for (const eid of st.broken) {
        const e = game.board.edges[eid];
        for (let i = 1; i < e.pts.length; i++) if (U.segIntersect(a[0], a[1], b[0], b[1], e.pts[i - 1][0], e.pts[i - 1][1], e.pts[i][0], e.pts[i][1])) return false;
      }
      return true;
    };
    if (clear(from, to)) return [to];
    // 면 그래프 BFS
    const prev = new Map([[f0, null]]);
    const q = [f0];
    while (q.length) {
      const f = q.shift();
      if (f === f1) break;
      for (const eid of game.board.crackEdges) {
        if (st.broken.has(eid)) continue;
        const e = game.board.edges[eid];
        let nf = -1;
        if (e.faces[0] === f) nf = e.faces[1];
        else if (e.faces[1] === f) nf = e.faces[0];
        if (nf < 0 || prev.has(nf)) continue;
        prev.set(nf, { f, eid });
        q.push(nf);
      }
    }
    const pts = [to];
    let cur = f1;
    while (prev.get(cur)) {
      const p = prev.get(cur);
      pts.unshift(game.board.edges[p.eid].mid);
      cur = p.f;
    }
    return pts;
  }

  function onTaskLost(tid) {
    const tdef = game.level.tasks.find((t) => t.id === tid);
    const pv = game.props[tid];
    pv.lostT = game.time;
    const anchorId = tdef.anchor || tdef.team[0];
    const otherId = tdef.team.find((m) => m !== anchorId);
    later(0.25, () => A.clatter());
    later(0.6, () => {
      A.lost();
      A.duckMusic(0.6, 2);
      FX.say(game.fx, otherId, '…', 2.4, 'sad');
    });
    later(1.1, () => FX.say(game.fx, anchorId, '손이 닿지 않아요.', 2.0, 'sad'));
    if (!game.outcome) {
      game.outcome = 'lost';
      game.phase = 'lostview';
      game.lossCount[game.level.id] = (game.lossCount[game.level.id] || 0) + 1;
      const typeText = {
        plank: '판자를 함께 들 수 없게 되었다',
        mast: '돛대를 받친 채 돛을 펼 수 없게 되었다',
        flag: '깃발을 함께 펼 수 없게 되었다',
        oar: '노를 건넬 수 없게 되었다',
        helm: '조타륜을 함께 잡을 수 없게 되었다',
      }[tdef.type];
      const cause = `<b>${nationName(anchorId)}</b>와 <b>${nationName(otherId)}</b>가 서로 다른 조각에 남아 ${typeText}.`;
      memo(cause, { retryPulse: true, retryPrimary: true });
      later(2.4, () => showLoss('협력이 끊겼습니다', cause, TS.PARTS[tdef.part].name + ' 작업은 판이 갈라지기 전에 끝나야 했다.'));
    }
  }

  function afterBreakMemo(res) {
    if (res.events.some((e) => e.type === 'retarget')) return;
    const rel = res.events.filter((e) => e.type === 'release');
    if (rel.length) {
      const names = rel.map((e) => nationName(e.who)).join(', ');
      memo(`${names}의 손이 떨어졌다. 방해가 멈췄다.`);
      return;
    }
    if (res.separated && !game.flags.harmlessShown) {
      game.flags.harmlessShown = true;
      memo('조각이 떨어졌지만 아무도 손을 놓지 않았다. 갈라진 틈에서는 다른 금도 멈춘다.');
    }
  }

  let stuckTimer = null;
  function scheduleStuckCheck(delay) {
    const gen = game.gen;
    clearTimeout(stuckTimer);
    stuckTimer = setTimeout(() => {
      if (gen !== game.gen) return;
      if (game.outcome || game.anim) return;
      for (const k in game.dips) if (game.dips[k].walk) return scheduleStuckCheck(0.6);
      const res = Sim.solve(game.sim, { maxDepth: 8 });
      if (res.win) return;
      // 막힌 작업과 방해꾼
      let cause = '남은 금으로는 이 회의를 마칠 수 없다.';
      for (const t of game.level.tasks) {
        if (Sim.status(game.sim, t.id) === 'blocked') {
          const ob = Sim.obstructorsOf(game.sim, t.id);
          cause = `남은 금으로는 <b>${ob.map(nationName).join(', ')}</b>를 ${TS.PARTS[t.part].name} 작업에서 떼어 놓을 수 없다. 떼려 하면 함께 일하는 대표들까지 갈라진다.`;
          break;
        }
      }
      game.outcome = 'stuck';
      game.phase = 'lostview';
      game.lossCount[game.level.id] = (game.lossCount[game.level.id] || 0) + 1;
      memo(cause, { retryPulse: true, retryPrimary: true });
      A.lost();
      later(0.8, () => showLoss('합의가 막혔습니다', cause, '판은 다시 붙지 않는다. 금을 고르는 순서와 위치를 바꿔 보자.'));
    }, delay * 1000);
  }

  /* ───────────────────────── 입력 */
  function bindInput() {
    const cv = game.cv;
    const pos = (e) => {
      const r = cv.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    let activeId = null;
    cv.addEventListener('pointerdown', (e) => {
      A.init();
      if (activeId !== null) return;
      if (game.phase !== 'play' && game.phase !== 'lostview') return;
      if (UI.cardOpen()) return;
      activeId = e.pointerId;
      try {
        cv.setPointerCapture(e.pointerId);
      } catch (err) {
        /* 무시 */
      }
      const [x, y] = pos(e);
      const thr = e.pointerType === 'mouse' ? 13 : 22;
      const h = game.anim ? null : hitCrack(x, y, thr);
      const dv = hitDip(x, y);
      if (h && (!dv || h.d < 7)) {
        game.press = { run: h.run, h, hold: 0, stressAcc: 0, type: e.pointerType, x, y };
        game.hover = h;
        A.grain(0.08, undefined, 1.5);
        if (game.li === 0 && !game.flags.pressTip) {
          game.flags.pressTip = true;
          memo('빛나는 길이 <b>갈라질 경로</b>다. 손을 떼면 쪼개지고, 금에서 멀리 끌어 떼면 취소된다.');
        }
      } else if (dv) {
        game.press = { run: null, dip: dv, hold: 0, stressAcc: 0, type: e.pointerType, x, y };
        sayRole(dv);
        dv.vhop = 14;
        A.step(0.08);
      } else {
        game.press = { run: null, hold: 0, stressAcc: 0, type: e.pointerType, x, y };
        if (y > game.view.cy - 100 * game.view.S * K && y < game.view.cy + 100 * game.view.S * K) A.tapBoard();
        else if (Math.hypot((x - game.bowl.x) / game.bowl.rx, (y - game.bowl.y) / (game.bowl.rx * 0.4)) < 1) {
          game.ripples.push({ x, y, t: 0, life: 1 });
          A.splash();
        }
      }
    });
    cv.addEventListener('pointermove', (e) => {
      const [x, y] = pos(e);
      if (activeId === null) {
        // 마우스 호버 미리보기
        if (e.pointerType === 'mouse' && (game.phase === 'play' || game.phase === 'lostview') && !game.anim && !UI.cardOpen()) {
          const h = hitCrack(x, y, 13);
          game.hover = h ? Object.assign(h, { soft: true }) : null;
          cv.classList.toggle('can-crack', !!h);
        }
        return;
      }
      if (e.pointerId !== activeId || !game.press) return;
      if (game.press.run || game.press.h) {
        const thr = game.press.type === 'mouse' ? 18 : 30;
        const h = hitCrack(x, y, thr);
        if (h) {
          if (!game.press.h || h.key !== game.press.h.key) {
            const tfOld = game.press.run ? tfOfFace(game.board.edges[game.press.run.edges[0]].faces[0]) : null;
            if (tfOld) tfOld.lift = 0;
            game.press.run = h.run;
            game.press.h = h;
            game.press.hold = 0;
            A.grain(0.06, undefined, 1.5);
          } else {
            game.press.h = Object.assign(game.press.h, { s0: h.s0, run: h.run, pts: h.pts, L: h.L });
            game.press.run = h.run;
          }
          game.hover = game.press.h;
        } else {
          if (game.press.run) {
            const tf = tfOfFace(game.board.edges[game.press.run.edges[0]].faces[0]);
            if (tf) tf.lift = 0;
          }
          game.press.run = null;
          game.hover = null;
        }
      }
    });
    const end = (e, cancel) => {
      if (e.pointerId !== activeId) return;
      activeId = null;
      const p = game.press;
      game.press = null;
      if (!p) return;
      if (p.run && p.h && !cancel && !game.anim && (game.phase === 'play' || game.phase === 'lostview')) {
        const tf = tfOfFace(game.board.edges[p.run.edges[0]].faces[0]);
        if (tf) tf.lift = 0;
        startCrack(p.h);
      } else game.hover = null;
    };
    cv.addEventListener('pointerup', (e) => end(e, false));
    cv.addEventListener('pointercancel', (e) => end(e, true));
    cv.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse' && activeId === null) {
        game.hover = null;
        cv.classList.remove('can-crack');
      }
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'r' || e.key === 'R') retry();
    });
  }

  function sayRole(dv) {
    const st = game.sim;
    const id = dv.id;
    if (dv.def.say && !st.dip[id].target && !game.level.tasks.some((t) => t.team.indexOf(id) >= 0)) {
      FX.say(game.fx, id, dv.def.say, 2.4);
      return;
    }
    const lines = [];
    const sd = st.dip[id];
    if (sd.target && Sim.obstructorsOf(st, sd.target).indexOf(id) >= 0) {
      lines.push(dv.def.pullLine || (sd.busy ? '제가 좀 거들죠.' : '아, 이건 저희 쪽으로…'));
    }
    for (const t of game.level.tasks) {
      if (t.team.indexOf(id) < 0) continue;
      const s = Sim.status(st, t.id);
      if (s === 'blocked') lines.push(dv.look.face === 'grumpy' ? '…누가 자꾸 당깁니다.' : '누가 반대로 당겨요!');
      else if (s === 'lost') lines.push('손이 닿지 않습니다…');
      else if (s === 'done') lines.push('제 몫은 끝났습니다.');
      else {
        const anchor = (t.anchor || t.team[0]) === id;
        lines.push(
          {
            plank: '판자, 함께 들고 있습니다.',
            mast: anchor ? '돛대는 제가 받칩니다.' : '돛을 펴는 중입니다.',
            flag: '깃발을 함께 폅니다.',
            oar: anchor ? '노를 건네는 중입니다.' : '노를 받는 중입니다.',
            helm: '조타륜을 함께 잡았습니다.',
          }[t.type]
        );
      }
    }
    if (!lines.length) {
      if (dv.t.release >= 0) lines.push('흠흠. 저는 구경만…');
      else lines.push(dv.def.say || (dv.look.face === 'grumpy' ? '…회의가 길군요.' : '저는 지켜보는 중입니다.'));
    }
    FX.say(game.fx, id, lines.join(' '), 2.6);
  }

  /* ───────────────────────── 화면 흐름 */
  function memo(html, opts) {
    UI.memo(html, opts);
  }

  function bindUI() {
    const $ = (id) => document.getElementById(id);
    $('btn-start').addEventListener('click', () => {
      A.init();
      A.click();
      A.music(true);
      UI.titleScreen(false);
      const next = LEVELS.findIndex((l) => game.progress.cleared.indexOf(l.id) < 0);
      loadLevel(next < 0 ? 0 : next);
    });
    $('btn-levels').addEventListener('click', () => {
      A.init();
      A.click();
      A.music(true);
      showLevels();
    });
    $('btn-menu').addEventListener('click', () => {
      A.click();
      showLevels();
    });
    $('btn-sound').addEventListener('click', () => {
      A.init();
      const m = !A.muted();
      A.setMuted(m);
      UI.setMuted(m);
      if (!m) A.music(true);
    });
    $('btn-retry').addEventListener('click', () => {
      A.click();
      retry();
    });
    $('btn-hint').addEventListener('click', () => {
      A.click();
      hint();
    });
  }

  function retry() {
    if (game.phase === 'title') return;
    UI.closeCard();
    game.board = game.board; // 같은 판 모양, 새 토르티야
    loadLevel(game.li, { noIntro: true });
    A.whoosh();
  }

  function hint() {
    if (game.anim) return;
    const working = game.level.tasks.filter((t) => Sim.status(game.sim, t.id) === 'working' && !game.sim.tasks[t.id].done);
    if (working.length) {
      memo('의장의 귀띔: 지금 진행 중인 작업이 있다. <b>끝날 때까지 지켜보자.</b> 끝난 작업의 팀은 갈라져도 괜찮다.');
      return;
    }
    const res = Sim.solve(game.sim, { maxDepth: 8 });
    if (!res.win) {
      memo('의장의 귀띔: 이 판으로는 어렵겠다. <b>새 토르티야</b>를 받아 보자.', { retryPulse: true });
      return;
    }
    game.hintRun = res.path[0];
    memo('의장의 귀띔: <b>반짝이는 금</b>을 살펴보자. 누르는 위치에 따라 갈라지는 길이 달라질 수 있다.');
  }

  function startPlay() {
    UI.closeCard();
    game.phase = 'play';
    memo(game.level.tip || game.level.memo, { retryPulse: false, retryPrimary: false });
    UI.showHint((game.lossCount[game.level.id] || 0) >= 2);
    updateChips();
    scheduleStuckCheck(0.5);
  }

  function showIntro() {
    const lv = game.level;
    UI.memo(lv.memo);
    UI.showHint(false);
    UI.card(
      `<div class="kicker">제${lv.no}차 회의</div><h2>${lv.title}</h2><p><b style="color:var(--accent);font-weight:normal">안건</b> · ${lv.goal}</p><p>${lv.memo}</p><div class="row"><button class="big-btn" id="c-go">개회</button></div>`
    );
    document.getElementById('c-go').addEventListener('click', () => {
      A.init();
      A.click();
      startPlay();
    });
  }

  function showWin() {
    const lv = game.level;
    const used = game.sim.cracksUsed;
    const sol = Sim.solve(Sim.create(lv, game.board), { maxDepth: 8 });
    const min = sol.win ? sol.depth : used;
    const last = game.li === LEVELS.length - 1;
    const tidy = used <= min ? '가장 깔끔한 합의였다.' : `더 적은 금(${min}개)으로도 합의할 수 있다.`;
    if (last) {
      UI.card(
        `<div class="stamp">진수<br>승인</div><div class="kicker">소인국 연합 정상회담 · 폐회</div><h2>구조선 완성</h2><p>찌푸린 얼굴도, 웃는 얼굴도 결국 같은 배를 만들었다. 바삭한 회의판은 부스러기만 남겼다.</p><p class="stats">금 ${used}개 사용 · ${tidy}</p><div class="row"><button class="ghost-btn" id="c-list">회의 목록</button><button class="big-btn" id="c-again">다시 보기</button></div>`,
        { center: false }
      );
      document.getElementById('c-list').addEventListener('click', () => {
        A.click();
        showLevels();
      });
      document.getElementById('c-again').addEventListener('click', () => {
        A.click();
        UI.closeCard();
        A.horn();
        for (const k in game.dips) game.dips[k].t.bow = game.time + Math.random() * 0.4;
        later(2.2, showWin);
      });
      return;
    }
    UI.card(
      `<div class="stamp">합의</div><div class="kicker">제${lv.no}차 회의 · 결과</div><h2>${lv.parts.map((p) => TS.PARTS[p].name).join(' · ')} 완성</h2><p>방해는 떼어 놓고, 필요한 손은 같은 조각에 남겼다.</p><p class="stats">금 ${used}개 사용 · ${tidy}</p><div class="row"><button class="ghost-btn" id="c-again">다시 하기</button><button class="big-btn" id="c-next">다음 회의</button></div>`
    );
    document.getElementById('c-again').addEventListener('click', () => {
      A.click();
      retry();
    });
    document.getElementById('c-next').addEventListener('click', () => {
      A.click();
      UI.closeCard();
      loadLevel(game.li + 1);
    });
  }

  function showLoss(title, cause, sub) {
    if (game.outcome === 'won') return;
    UI.card(
      `<div class="kicker">제${game.level.no}차 회의 · 정회</div><h2>${title}</h2><p class="cause">${cause}</p><p>${sub}</p><div class="row"><button class="ghost-btn" id="c-look">판 둘러보기</button><button class="big-btn" id="c-retry">새 토르티야</button></div>`
    );
    document.getElementById('c-retry').addEventListener('click', () => {
      A.click();
      retry();
    });
    document.getElementById('c-look').addEventListener('click', () => {
      A.click();
      UI.closeCard();
    });
    UI.showHint((game.lossCount[game.level.id] || 0) >= 2);
  }

  function showLevels() {
    const pr = game.progress;
    const items = LEVELS.map((l, i) => {
      const cleared = pr.cleared.indexOf(l.id) >= 0;
      const unlocked = i === 0 || pr.cleared.indexOf(LEVELS[i - 1].id) >= 0 || cleared;
      return `<button class="level-btn ${cleared ? 'cleared' : ''} ${unlocked ? '' : 'locked'}" data-i="${i}" ${unlocked ? '' : 'disabled'}><span class="n">${l.no}</span><span>${l.title}<small>${l.goal}</small></span></button>`;
    }).join('');
    UI.card(`<div class="kicker">소인국 연합 정상회담</div><h2>회의 목록</h2><div class="level-grid">${items}</div><div class="row"><button class="ghost-btn" id="c-close">닫기</button></div>`, { center: true });
    document.querySelectorAll('.level-btn').forEach((b) =>
      b.addEventListener('click', () => {
        if (b.disabled) return;
        A.click();
        UI.titleScreen(false);
        UI.closeCard();
        loadLevel(+b.dataset.i);
      })
    );
    document.getElementById('c-close').addEventListener('click', () => {
      A.click();
      UI.closeCard();
    });
  }

  function updateChips() {
    if (game.phase === 'title') return;
    const items = game.level.tasks.map((t) => ({ id: t.id, part: t.part, name: TS.PARTS[t.part].name, status: Sim.status(game.sim, t.id) }));
    UI.setChips(items);
  }

  /* ───────────────────────── 그리기 */
  function buildTable() {
    const W = game.W;
    const H = game.H;
    const dpr = game.dpr;
    const cv = document.createElement('canvas');
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    const g = cv.getContext('2d');
    g.scale(dpr, dpr);
    // 펠트
    const bg = g.createRadialGradient(W / 2, H * 0.52, 20, W / 2, H * 0.5, Math.max(W, H) * 0.75);
    bg.addColorStop(0, '#2f5547');
    bg.addColorStop(0.6, '#1f3c32');
    bg.addColorStop(1, '#10211b');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    const r = U.rng(99);
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = r() < 0.5 ? `rgba(255,255,255,${r.range(0.015, 0.05)})` : `rgba(0,0,0,${r.range(0.03, 0.08)})`;
      g.fillRect(r() * W, r() * H, r.range(0.6, 1.6), r.range(0.6, 1.6));
    }
    // 식탁보 결
    g.strokeStyle = 'rgba(255,255,255,0.025)';
    for (let y = 0; y < H; y += 3) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(W, y);
      g.stroke();
    }
    // 회의용 매트 (토르티야 아래)
    const V = game.view;
    const mx = V.cx;
    const my = V.cy + 4;
    const mrx = 100 * V.S * 1.12;
    const mry = 100 * V.S * K * 1.14;
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.beginPath();
    g.ellipse(mx, my + 6, mrx * 1.01, mry * 1.02, 0, 0, Math.PI * 2);
    g.fill();
    const mg = g.createRadialGradient(mx - mrx * 0.2, my - mry * 0.3, 10, mx, my, mrx);
    mg.addColorStop(0, '#efe6d2');
    mg.addColorStop(1, '#d8cbb0');
    g.fillStyle = mg;
    g.beginPath();
    g.ellipse(mx, my, mrx, mry, 0, 0, Math.PI * 2);
    g.fill();
    // 레이스 가장자리
    g.strokeStyle = 'rgba(160,130,90,0.55)';
    g.setLineDash([2, 3]);
    g.lineWidth = 1;
    g.beginPath();
    g.ellipse(mx, my, mrx - 6, mry - 5, 0, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.beginPath();
      g.arc(mx + Math.cos(a) * (mrx - 1.5), my + Math.sin(a) * (mry - 1.2), 2.2, 0, Math.PI * 2);
      g.fill();
    }
    // 가장자리 어둡게
    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.45)');
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);
    // 위쪽 조명
    const lg = g.createRadialGradient(W * 0.4, H * 0.2, 10, W * 0.4, H * 0.25, H * 0.6);
    lg.addColorStop(0, 'rgba(255,230,180,0.12)');
    lg.addColorStop(1, 'rgba(255,230,180,0)');
    g.fillStyle = lg;
    g.fillRect(0, 0, W, H);
    game.tableCanvas = cv;
  }

  function render() {
    const ctx = game.ctx;
    const V = game.view;
    const dpr = game.dpr;
    if (!game.tableCanvas) buildTable();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(game.tableCanvas, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!game.sim) return;
    const sh = game.shake;
    if (sh > 0) ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
    const t = game.time;

    // 물그릇과 배
    const b = game.bowl;
    Ship.drawBowl(ctx, b.x, b.y, b.rx, t, game.ripples);
    const plan = game.phase === 'title' ? new Set() : new Set(game.level.parts);
    Ship.drawShip(ctx, b.x, b.y + 4, Math.min((b.rx * 0.72) / 60, (b.y - 60) / 78), t, game.shipBuilt, plan, game.shipGlow);

    // 판 등장 높이
    const dl = game.dropLift || 0;
    const Vd = Object.assign({}, V, { cy: V.cy + dl });
    game.viewD = Vd;

    // 식탁 위 부스러기
    FX.drawTableCrumbs(game.fx, ctx, Vd);

    // 인물 월드 위치
    for (const k in game.dips) game.dips[k].w = dipWorld(game.dips[k]);

    // 조각 (뒤에서 앞으로)
    const pieces = game.sim.pieces.list.slice();
    pieces.sort((a, c) => {
      const ta = game.tfByKey.get(a.key);
      const tc = game.tfByKey.get(c.key);
      return a.cy + ta.oy - (c.cy + tc.oy);
    });
    for (const p of pieces) {
      p.tf = game.tfByKey.get(p.key);
      Tor.drawPiece(ctx, Vd, game.board, p, game.tex, game.sidePat, { flash: p.tf.flash });
      Tor.drawPieceLines(ctx, Vd, game.board, p, game.sim.broken, t);
    }
    FX.drawLanded(game.fx, ctx, Vd, (f) => tfOfFace(f));
    drawGlint(ctx, Vd);

    // 진행 중인 금
    if (game.anim && game.anim.sA !== undefined) {
      const an = game.anim;
      const seg = U.subPolyline(an.pts, an.sA, an.sB);
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(40,18,4,0.95)';
      ctx.lineWidth = Math.max(1.8, V.S * 1.2);
      Tor.strokeScreenPolyline(ctx, Vd, an.tf, seg, 0);
      ctx.strokeStyle = 'rgba(255,240,200,0.8)';
      ctx.lineWidth = Math.max(0.8, V.S * 0.4);
      Tor.strokeScreenPolyline(
        ctx,
        Vd,
        an.tf,
        seg.map((p) => [p[0], p[1] + 1.2]),
        0
      );
      for (const s of [an.sA, an.sB]) {
        const p = U.pointAlong(an.pts, s);
        const sp = Tor.toScreen(Vd, an.tf, p[0], p[1], 0);
        const gr = ctx.createRadialGradient(sp[0], sp[1], 0, sp[0], sp[1], 9);
        gr.addColorStop(0, 'rgba(255,250,225,0.95)');
        gr.addColorStop(1, 'rgba(255,230,160,0)');
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(sp[0], sp[1], 9, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 소품과 인물
    game.dropLiftSave = dl;
    const { reqs, draws } = layoutTasks();
    poseDips(reqs);
    for (const k in game.dips) Dip.drawShadow(ctx, game.dips[k].pose);
    const items = draws.map((d) => ({ depth: d.depth, fn: d.fn, prop: true }));
    for (const k in game.dips) {
      const dv = game.dips[k];
      items.push({ depth: dv.w[1], dip: dv });
    }
    items.sort((a, c) => a.depth - c.depth);
    const gripHands = [];
    for (const it of items) {
      if (it.prop) it.fn();
      else {
        const dv = it.dip;
        const out = Dip.draw(ctx, dv.pose);
        dv.head = [out.headX, out.headY];
        if (dv.hasGrip) gripHands.push({ dv, hands: out.hands });
        // 밧줄
        for (const rope of dv.ropes || []) {
          const p1 = proj(rope[0]);
          const p2 = proj(rope[1]);
          Props.drawRope(ctx, p1, p2, 1.5, Math.max(1, V.S * 0.55));
        }
      }
    }
    // 쥔 손은 소품 위에
    for (const g of gripHands) for (const h of g.hands) if (!h.open) Dip.drawHandScreen(ctx, g.dv.look, h, V.S);
    // 떨어진 밧줄 (방해가 끝난 돛대)
    drawTaskOverlays(ctx);

    FX.drawAir(game.fx, ctx, Vd);

    // 미리보기
    const hv = game.hover;
    if (hv && !game.anim && (game.phase === 'play' || game.phase === 'lostview')) drawPreview(ctx, hv, !!(game.press && game.press.run));
    if (game.hintRun && !game.anim) drawHint(ctx, game.hintRun);

    // 말풍선
    FX.drawBubbles(game.fx, ctx, (who) => (game.dips[who] ? game.dips[who].head : null), game.W);

    if (game.debugOverlay) {
      ctx.save();
      ctx.font = 'bold 12px sans-serif';
      for (const c of game.board.cracks) {
        const e = game.board.edges[c.edges[Math.floor(c.edges.length / 2)]];
        const tf = tfOfFace(e.faces[0]);
        const sp = Tor.toScreen(Vd, tf, e.mid[0], e.mid[1], 0);
        ctx.fillStyle = '#ff0';
        ctx.fillText(c.id, sp[0] + 3, sp[1] - 3);
      }
      for (const k in game.dips) {
        ctx.fillStyle = '#0ff';
        ctx.fillText(k, game.dips[k].sx + 6, game.dips[k].sy + 10);
      }
      ctx.restore();
    }
    // 날아가는 부품
    for (const f of game.fx.flyers) {
      const k = U.easeInOut(f.t / f.dur);
      const x = U.lerp(f.from[0], f.to[0], k);
      const y = U.lerp(f.from[1], f.to[1], k) - Math.sin(k * Math.PI) * 60;
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#fff3c4';
      ctx.beginPath();
      ctx.arc(x, y, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      Props.drawPartIcon(ctx, f.part, x, y, 26 * (1 - 0.3 * k), t);
    }
  }

  function drawTaskOverlays(ctx) {
    const V = game.view;
    const t = game.time;
    for (const tdef of game.level.tasks) {
      const pv = game.props[tdef.id];
      const info = pv.info;
      if (!info || pv.flown) continue;
      // 당김 표시: 소품 근처 긴장선
      if (info.status === 'blocked' && pv.tug > 0.3 && info.obs.length) {
        const od = info.obs[0];
        const hs = od.pose && od.pose.handL ? od.pose.handL : null;
        if (hs) {
          ctx.save();
          ctx.strokeStyle = `rgba(255,120,80,${0.55 * pv.tug})`;
          ctx.lineWidth = 1.4;
          ctx.lineCap = 'round';
          for (let i = -1; i <= 1; i++) {
            const a = Math.atan2(info.pull[1] * K, info.pull[0]) + i * 0.5;
            const r0 = 7 + ((t * 30) % 4);
            ctx.beginPath();
            ctx.moveTo(hs[0] + Math.cos(a) * r0, hs[1] + Math.sin(a) * r0);
            ctx.lineTo(hs[0] + Math.cos(a) * (r0 + 4), hs[1] + Math.sin(a) * (r0 + 4));
            ctx.stroke();
          }
          ctx.restore();
        }
      }
      // 진행 고리
      if (info.label && (info.status === 'working' || (info.status === 'done' && !pv.flown))) {
        const p = proj(info.label);
        const prog = game.sim.tasks[tdef.id].progress;
        const r = 9;
        ctx.save();
        ctx.fillStyle = 'rgba(255,250,238,0.92)';
        ctx.beginPath();
        ctx.arc(p[0], p[1], r + 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(60,40,20,0.15)';
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.arc(p[0], p[1], r - 1, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = '#3f8f5a';
        ctx.beginPath();
        ctx.arc(p[0], p[1], r - 1, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog);
        ctx.stroke();
        Props.drawPartIcon(ctx, tdef.part, p[0], p[1], 10, t);
        ctx.restore();
      }
      // 끊긴 협력 표식
      if (info.status === 'lost' && pv.lostLine && pv.lostK > 0.5) {
        const a = proj(pv.lostLine[0]);
        const bb = proj(pv.lostLine[1]);
        const al = U.clamp((pv.lostK - 0.5) * 2, 0, 1);
        ctx.save();
        ctx.globalAlpha = al;
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = 'rgba(255,240,230,0.85)';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(bb[0], bb[1]);
        ctx.stroke();
        ctx.setLineDash([]);
        const mx = (a[0] + bb[0]) / 2;
        const my = (a[1] + bb[1]) / 2 - 10;
        ctx.fillStyle = '#7b3b2c';
        ctx.beginPath();
        ctx.arc(mx, my, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fde9dc';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(mx - 3.5, my, 3, -Math.PI / 2, Math.PI / 2);
        ctx.moveTo(mx + 3.5, my - 3);
        ctx.arc(mx + 3.5, my, 3, -Math.PI / 2, Math.PI / 2, true);
        ctx.stroke();
        ctx.restore();
      }
    }
    void V;
  }

  /* 금을 따라 가끔 지나가는 빛: 만져 볼 수 있다는 신호 */
  function drawGlint(ctx, V) {
    if (game.phase !== 'play' || game.anim || game.press) return;
    const t = game.time;
    if (!game.glint || t > game.glint.t0 + 1.1) {
      if (!game.glint || t > game.glint.t0 + 2.6) {
        const live = game.board.crackEdges.filter((e) => !game.sim.broken.has(e));
        if (!live.length) return;
        const r = U.rng((t * 977) | 0);
        game.glint = { eid: r.pick(live), t0: t, dir: r() < 0.5 };
      } else return;
    }
    const g = game.glint;
    const e = game.board.edges[g.eid];
    if (game.sim.broken.has(g.eid)) return;
    const k = (t - g.t0) / 1.1;
    if (k > 1) return;
    const tf = tfOfFace(e.faces[0]);
    const p = U.pointAlong(e.pts, (g.dir ? k : 1 - k) * e.len);
    const sp = Tor.toScreen(V, tf, p[0], p[1], 0);
    const a = Math.sin(k * Math.PI) * 0.55;
    const gr = ctx.createRadialGradient(sp[0], sp[1], 0, sp[0], sp[1], 7);
    gr.addColorStop(0, `rgba(255,248,220,${a})`);
    gr.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(sp[0], sp[1], 7, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPreview(ctx, h, pressed) {
    const tf = tfOfFace(game.board.edges[h.run.edges[0]].faces[0]);
    const V = game.viewD;
    const t = game.time;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = pressed ? 'rgba(255,214,120,0.38)' : 'rgba(255,214,120,0.24)';
    ctx.lineWidth = pressed ? 9 : 6;
    Tor.strokeScreenPolyline(ctx, V, tf, h.pts, 0);
    ctx.strokeStyle = pressed ? 'rgba(255,248,215,0.95)' : 'rgba(255,248,215,0.7)';
    ctx.lineWidth = pressed ? 2.2 : 1.6;
    ctx.setLineDash([6, 5]);
    ctx.lineDashOffset = -t * 30;
    // 누른 점에서 양쪽으로 흐르는 점선
    const left = U.subPolyline(h.pts, 0, h.s0).reverse();
    const right = U.subPolyline(h.pts, h.s0, h.L);
    Tor.strokeScreenPolyline(ctx, V, tf, left, 0);
    Tor.strokeScreenPolyline(ctx, V, tf, right, 0);
    ctx.setLineDash([]);
    // 멈추는 끝점 표시
    const ends = [
      [h.pts[0], h.run.loStop],
      [h.pts[h.pts.length - 1], h.run.hiStop],
    ];
    for (const [p, why] of ends) {
      const s = Tor.toScreen(V, tf, p[0], p[1], 0);
      ctx.fillStyle = why === 'gap' ? '#ffcf6b' : 'rgba(255,248,215,0.9)';
      ctx.strokeStyle = 'rgba(80,40,10,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(s[0], s[1], why === 'gap' ? 4 : 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    // 누른 지점
    const p0 = U.pointAlong(h.pts, h.s0);
    const s0 = Tor.toScreen(V, tf, p0[0], p0[1], 0);
    ctx.fillStyle = 'rgba(255,255,240,0.95)';
    ctx.beginPath();
    ctx.arc(s0[0], s0[1], pressed ? 4.5 : 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawHint(ctx, run) {
    const tf = tfOfFace(game.board.edges[run.edges[0]].faces[0]);
    if (!tf) return;
    const V = game.viewD;
    const a = 0.45 + 0.35 * Math.sin(game.time * 5);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(255,220,120,${a})`;
    ctx.lineWidth = 7;
    for (const eid of run.edges) {
      if (game.sim.broken.has(eid)) continue;
      Tor.strokeScreenPolyline(ctx, V, tf, game.board.edges[eid].pts, 0);
    }
    ctx.restore();
  }

  // 디버그/테스트용 접근
  TS.debug = {
    game,
    loadLevel,
    breakCrack(crackId, which) {
      // which: 해당 금의 몇 번째 가장자리를 누를지 (기본 0)
      const c = game.board.cracks.find((cc) => cc.id === crackId);
      const eid = c.edges[which || 0];
      const run = Geom.crackRun(game.board, eid, game.sim.broken);
      if (!run) return false;
      const pts = Geom.runPolyline(game.board, run);
      const L = U.polylineLength(pts);
      startCrack({ run, pts, s0: L / 2, L });
      return true;
    },
    start() {
      UI.titleScreen(false);
      A.init();
      loadLevel(game.li);
      startPlay();
    },
    startPlay,
    crackPoint(id, ei, tt) {
      const c = game.board.cracks.find((cc) => cc.id === id);
      const eid = c.edges[ei || 0];
      const sp = edgeScreenPts(eid);
      const k = Math.floor((sp.length - 1) * (tt === undefined ? 0.5 : tt));
      return sp[k];
    },
    autoStep() {
      // 해법을 따라 한 수 둔다 (진행 중인 작업·걷는 인물·연출이 끝난 뒤)
      if (game.outcome || game.anim) return 'busy';
      for (const k in game.dips) if (game.dips[k].walk) return 'busy';
      if (game.fx.flyers.length) return 'busy';
      if (game.level.tasks.some((t) => Sim.status(game.sim, t.id) === 'working' && !game.sim.tasks[t.id].done)) return 'busy';
      const res = Sim.solve(game.sim, { maxDepth: 8 });
      if (!res.win) return 'nosol';
      if (!res.path.length) return 'done';
      const run = res.path[0];
      const pts = Geom.runPolyline(game.board, run);
      const L = U.polylineLength(pts);
      startCrack({ run, pts, s0: L / 2, L });
      return 'move';
    },
    overlay(v) {
      game.debugOverlay = v;
    },
    play(i) {
      UI.titleScreen(false);
      A.init();
      game.progress.cleared = LEVELS.map((l) => l.id);
      loadLevel(i, { noIntro: true });
    },
    status() {
      return game.level.tasks.map((t) => t.id + ':' + Sim.status(game.sim, t.id) + ':' + game.sim.tasks[t.id].progress.toFixed(2));
    },
  };

  if (document.fonts && document.fonts.load) {
    Promise.all([document.fonts.load('600 13px "Gowun Dodum"'), document.fonts.load('700 20px "Gowun Batang"')])
      .catch(() => {})
      .then(init);
  } else init();
})(window);
