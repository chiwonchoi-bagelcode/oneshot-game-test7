/* 토르티야 판 렌더링: 구운 표면 텍스처, 두께(단면), 금, 파단 */
(function (G) {
  'use strict';
  const TS = G.TS || (G.TS = {});
  const U = TS.U;
  const T = (TS.Tortilla = {});

  const EXT = 112; // 텍스처가 덮는 판 좌표 반경
  const TEX = 1024;

  function rimRadiusFn(board) {
    const rim = board.rim;
    const n = rim.length;
    const rad = rim.map((p) => Math.hypot(p[0], p[1]));
    return function (th) {
      let a = th / (Math.PI * 2);
      a = a - Math.floor(a);
      const f = a * n;
      const i = Math.floor(f);
      const t = f - i;
      return rad[i % n] * (1 - t) + rad[(i + 1) % n] * t;
    };
  }

  T.makeTexture = function (board, seed) {
    const cv = document.createElement('canvas');
    cv.width = TEX;
    cv.height = TEX;
    const g = cv.getContext('2d');
    const rnd = U.rng(seed * 31 + 7);
    const nz = U.makeNoise(seed * 17 + 1);
    const nz2 = U.makeNoise(seed * 5 + 11);
    const rimR = rimRadiusFn(board);
    const px = TEX / (EXT * 2); // 픽셀/단위
    const toTex = (v) => (v + EXT) * px;

    // 1) 바탕색
    const img = g.createImageData(TEX, TEX);
    const d = img.data;
    const c1 = [241, 208, 140];
    const c2 = [226, 176, 96];
    const c3 = [172, 106, 42];
    for (let j = 0; j < TEX; j++) {
      const y = j / px - EXT;
      for (let i = 0; i < TEX; i++) {
        const x = i / px - EXT;
        const r = Math.hypot(x, y);
        const th = Math.atan2(y, x);
        const R = rimR(th < 0 ? th + Math.PI * 2 : th) + 3;
        const k = (j * TEX + i) * 4;
        if (r > R) {
          d[k + 3] = 0;
          continue;
        }
        const m = nz.fbm2(x * 0.028, y * 0.028, 4) * 0.5 + 0.5;
        const m2 = nz2.fbm2(x * 0.09 + 3, y * 0.09 - 7, 3) * 0.5 + 0.5;
        let t = U.clamp(0.15 + m * 0.75 + (m2 - 0.5) * 0.35, 0, 1);
        let cr = U.lerp(c1[0], c2[0], t);
        let cg = U.lerp(c1[1], c2[1], t);
        let cb = U.lerp(c1[2], c2[2], t);
        const rr = r / R;
        const edge = U.smooth(U.invLerp(0.8, 1.0, rr)) * (0.55 + 0.45 * m2);
        cr = U.lerp(cr, c3[0], edge * 0.55);
        cg = U.lerp(cg, c3[1], edge * 0.55);
        cb = U.lerp(cb, c3[2], edge * 0.55);
        const grain = (rnd() - 0.5) * 9;
        d[k] = U.clamp(cr + grain, 0, 255);
        d[k + 1] = U.clamp(cg + grain * 0.9, 0, 255);
        d[k + 2] = U.clamp(cb + grain * 0.7, 0, 255);
        d[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);

    const inside = (x, y, margin) => {
      const r = Math.hypot(x, y);
      const th = Math.atan2(y, x);
      return r < rimR(th < 0 ? th + Math.PI * 2 : th) - margin;
    };
    const randPt = (margin) => {
      for (let tries = 0; tries < 50; tries++) {
        const x = rnd.range(-100, 100);
        const y = rnd.range(-100, 100);
        if (inside(x, y, margin)) return [x, y];
      }
      return [0, 0];
    };

    // 2) 노릇한 얼룩 (곱하기)
    g.save();
    g.globalCompositeOperation = 'multiply';
    const clusters = [];
    for (let i = 0; i < 9; i++) clusters.push(randPt(14));
    for (let i = 0; i < 90; i++) {
      const c = rnd() < 0.7 ? rnd.pick(clusters) : randPt(8);
      const x = c[0] + rnd.range(-16, 16);
      const y = c[1] + rnd.range(-16, 16);
      if (!inside(x, y, 3)) continue;
      const r = rnd.range(3, 13);
      const a = rnd.range(0.12, 0.38);
      g.save();
      g.translate(toTex(x), toTex(y));
      g.rotate(rnd.range(0, Math.PI));
      g.scale(1, rnd.range(0.55, 1));
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, r * px);
      gr.addColorStop(0, `rgba(176,104,40,${a})`);
      gr.addColorStop(0.55, `rgba(196,128,58,${a * 0.6})`);
      gr.addColorStop(1, 'rgba(220,160,90,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(0, 0, r * px, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    g.restore();

    // 3) 부풀어 오른 기포 (빛/그늘)
    const blisters = [];
    for (let i = 0; i < 46; i++) {
      const p = randPt(8);
      const r = rnd.range(2.2, 6.5);
      blisters.push([p[0], p[1], r]);
      g.save();
      g.translate(toTex(p[0]), toTex(p[1]));
      g.rotate(rnd.range(-0.6, 0.6));
      g.scale(1, rnd.range(0.65, 0.95));
      const R = r * px;
      // 그늘 (오른쪽 아래)
      let gr = g.createRadialGradient(R * 0.25, R * 0.3, R * 0.2, 0, 0, R * 1.25);
      gr.addColorStop(0, 'rgba(120,70,24,0)');
      gr.addColorStop(0.75, 'rgba(120,70,24,0.28)');
      gr.addColorStop(1, 'rgba(120,70,24,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(0, 0, R * 1.25, 0, Math.PI * 2);
      g.fill();
      // 빛 (왼쪽 위)
      gr = g.createRadialGradient(-R * 0.3, -R * 0.35, 0, -R * 0.1, -R * 0.1, R);
      gr.addColorStop(0, 'rgba(255,244,210,0.6)');
      gr.addColorStop(0.6, 'rgba(250,226,170,0.22)');
      gr.addColorStop(1, 'rgba(250,226,170,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(0, 0, R, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }

    // 4) 탄 점
    for (let i = 0; i < 150; i++) {
      let x;
      let y;
      if (rnd() < 0.45) {
        const b = rnd.pick(blisters);
        x = b[0] + rnd.range(-0.5, 0.5) * b[2];
        y = b[1] + rnd.range(-0.6, 0.2) * b[2];
      } else {
        const p = randPt(5);
        x = p[0];
        y = p[1];
      }
      const r = rnd.range(0.5, 2.3);
      const n = rnd.int(2, 5);
      const dark = rnd.range(0.45, 0.85);
      for (let k = 0; k < n; k++) {
        const ox = rnd.range(-r, r) * 0.8;
        const oy = rnd.range(-r, r) * 0.8;
        const rr = r * rnd.range(0.35, 0.8);
        const gr = g.createRadialGradient(toTex(x + ox), toTex(y + oy), 0, toTex(x + ox), toTex(y + oy), rr * px);
        gr.addColorStop(0, `rgba(62,32,10,${dark})`);
        gr.addColorStop(0.6, `rgba(92,50,16,${dark * 0.6})`);
        gr.addColorStop(1, 'rgba(110,62,22,0)');
        g.fillStyle = gr;
        g.beginPath();
        g.arc(toTex(x + ox), toTex(y + oy), rr * px, 0, Math.PI * 2);
        g.fill();
      }
    }

    // 5) 밀가루 가루와 잔 알갱이
    for (let i = 0; i < 1400; i++) {
      const p = randPt(2);
      const r = rnd.range(0.12, 0.42) * px;
      g.fillStyle = rnd() < 0.7 ? `rgba(255,250,236,${rnd.range(0.2, 0.55)})` : `rgba(110,64,24,${rnd.range(0.15, 0.4)})`;
      g.beginPath();
      g.arc(toTex(p[0]), toTex(p[1]), r, 0, Math.PI * 2);
      g.fill();
    }

    // 6) 테두리 입술 (말라 밝은 가장자리)
    g.save();
    g.beginPath();
    board.rim.forEach((p, i) => (i ? g.lineTo(toTex(p[0]), toTex(p[1])) : g.moveTo(toTex(p[0]), toTex(p[1]))));
    g.closePath();
    g.strokeStyle = 'rgba(160,96,36,0.55)';
    g.lineWidth = 3.2 * px;
    g.stroke();
    g.strokeStyle = 'rgba(248,222,165,0.55)';
    g.lineWidth = 0.9 * px;
    g.stroke();
    g.restore();

    // 7) 둥근 표면 조명
    g.save();
    g.globalCompositeOperation = 'soft-light';
    const lg = g.createRadialGradient(toTex(-34), toTex(-40), 0, toTex(-10), toTex(-10), 130 * px);
    lg.addColorStop(0, 'rgba(255,250,235,0.65)');
    lg.addColorStop(0.5, 'rgba(255,240,210,0.15)');
    lg.addColorStop(1, 'rgba(80,40,10,0.45)');
    g.fillStyle = lg;
    g.fillRect(0, 0, TEX, TEX);
    g.restore();

    return cv;
  };

  /* 단면 무늬: 얇고 바삭한 속살과 기공 */
  T.makeSidePattern = function (ctx) {
    const cv = document.createElement('canvas');
    cv.width = 40;
    cv.height = 40;
    const g = cv.getContext('2d');
    const r = U.rng(77);
    g.fillStyle = '#e9c784';
    g.fillRect(0, 0, 40, 40);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(150,96,40,${r.range(0.3, 0.6)})`;
      g.beginPath();
      g.ellipse(r() * 40, r() * 40, r.range(0.5, 1.6), r.range(0.3, 0.9), 0, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 26; i++) {
      g.fillStyle = `rgba(255,243,212,${r.range(0.35, 0.7)})`;
      g.beginPath();
      g.arc(r() * 40, r() * 40, r.range(0.3, 0.9), 0, Math.PI * 2);
      g.fill();
    }
    return ctx.createPattern(cv, 'repeat');
  };

  /* 조각 경로(로컬 판 좌표) */
  T.piecePath = function (board, piece) {
    if (piece._path) return piece._path;
    const p = new Path2D();
    for (const fid of piece.faces) {
      const f = board.faces[fid];
      const pts = f.pts;
      p.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
      p.closePath();
    }
    piece._path = p;
    return p;
  };

  /* 로컬 → 월드 판 좌표 */
  T.localToWorld = function (tf, x, y) {
    const dx = x - tf.px;
    const dy = y - tf.py;
    const c = Math.cos(tf.rot);
    const s = Math.sin(tf.rot);
    return [tf.px + tf.ox + dx * c - dy * s, tf.py + tf.oy + dx * s + dy * c];
  };
  T.worldToLocal = function (tf, x, y) {
    const dx = x - tf.px - tf.ox;
    const dy = y - tf.py - tf.oy;
    const c = Math.cos(-tf.rot);
    const s = Math.sin(-tf.rot);
    return [tf.px + dx * c - dy * s, tf.py + dx * s + dy * c];
  };

  T.applyPieceTransform = function (ctx, view, tf, screenDy) {
    ctx.translate(view.cx, view.cy + (screenDy || 0) + (tf.lift || 0));
    ctx.scale(view.S, view.S * view.K);
    ctx.translate(tf.px + tf.ox, tf.py + tf.oy);
    ctx.rotate(tf.rot);
    ctx.translate(-tf.px, -tf.py);
  };

  T.toScreen = function (view, tf, x, y, z) {
    const w = tf ? T.localToWorld(tf, x, y) : [x, y];
    return [view.cx + w[0] * view.S, view.cy + w[1] * view.S * view.K - (z || 0) * view.S + (tf && tf.lift ? tf.lift : 0)];
  };

  function strokeScreenPolyline(ctx, view, tf, pts, z) {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const s = T.toScreen(view, tf, pts[i][0], pts[i][1], z);
      if (i) ctx.lineTo(s[0], s[1]);
      else ctx.moveTo(s[0], s[1]);
    }
    ctx.stroke();
  }
  T.strokeScreenPolyline = strokeScreenPolyline;

  /* 금 가장자리마다 잔금(수염) 미리 만들기 */
  T.prepareEdgeDetail = function (board) {
    const r = U.rng(board.seed * 41 + 9);
    for (const e of board.edges) {
      if (e.kind !== 'crack') continue;
      e.whiskers = [];
      const n = Math.floor(e.len / 7);
      for (let i = 0; i < n; i++) {
        const s = r.range(2, e.len - 2);
        const p = U.pointAlong(e.pts, s);
        const q = U.pointAlong(e.pts, Math.min(e.len, s + 1));
        const tx = q[0] - p[0];
        const ty = q[1] - p[1];
        const tl = Math.hypot(tx, ty) || 1;
        const side = r.sign();
        const ang = Math.atan2(ty, tx) + side * r.range(0.5, 1.2);
        const len = r.range(1.2, 3.6);
        const mx = p[0] + Math.cos(ang) * len * 0.5 + (r() - 0.5) * 0.6;
        const my = p[1] + Math.sin(ang) * len * 0.5 + (r() - 0.5) * 0.6;
        e.whiskers.push([
          [p[0], p[1]],
          [mx, my],
          [p[0] + Math.cos(ang + (r() - 0.5) * 0.5) * len, p[1] + Math.sin(ang + (r() - 0.5) * 0.5) * len],
        ]);
      }
      // 금 폭의 미세한 변화
      e.widthSeed = r() * 100;
    }
  };

  /* 조각 하나 그리기 */
  T.drawPiece = function (ctx, view, board, piece, tex, sidePat, opts) {
    const tf = piece.tf;
    const path = T.piecePath(board, piece);
    const TH = view.thick;
    // 그림자
    ctx.save();
    T.applyPieceTransform(ctx, view, tf, TH + 3);
    ctx.shadowColor = 'rgba(20,12,4,0.5)';
    ctx.shadowBlur = 14 * view.dpr;
    ctx.shadowOffsetY = 5 * view.dpr;
    ctx.fillStyle = 'rgba(60,30,8,0.6)';
    ctx.fill(path);
    ctx.restore();
    // 두께 (구운 옆면)
    const layers = 5;
    for (let i = layers; i >= 1; i--) {
      const t = i / layers;
      ctx.save();
      T.applyPieceTransform(ctx, view, tf, TH * t);
      ctx.fillStyle = U.mixHex('#c8893c', '#7d4a1d', t * 0.9);
      ctx.fill(path);
      ctx.restore();
    }
    // 깨진 단면 띠: 앞(화면 아래)을 향한 깨진 가장자리
    if (piece.brokenEdges && piece.brokenEdges.length) {
      ctx.save();
      for (const be of piece.brokenEdges) {
        const e = board.edges[be.id];
        const pts = e.pts;
        const top = pts.map((p) => T.toScreen(view, tf, p[0], p[1], 0));
        ctx.beginPath();
        for (let i = 0; i < top.length; i++) (i ? ctx.lineTo : ctx.moveTo).call(ctx, top[i][0], top[i][1]);
        for (let i = top.length - 1; i >= 0; i--) ctx.lineTo(top[i][0], top[i][1] + TH);
        ctx.closePath();
        ctx.fillStyle = sidePat;
        ctx.fill();
        // 아래쪽 어둡게
        const ys = top.map((p) => p[1]);
        const y0 = Math.min.apply(null, ys);
        const y1 = Math.max.apply(null, ys) + TH;
        const gr = ctx.createLinearGradient(0, y0, 0, y1);
        gr.addColorStop(0, 'rgba(255,240,200,0.25)');
        gr.addColorStop(1, 'rgba(110,60,20,0.25)');
        ctx.fillStyle = gr;
        ctx.fill();
      }
      ctx.restore();
    }
    // 윗면
    ctx.save();
    T.applyPieceTransform(ctx, view, tf, 0);
    ctx.clip(path);
    ctx.drawImage(tex, -EXT, -EXT, EXT * 2, EXT * 2);
    if (opts && opts.flash > 0) {
      ctx.fillStyle = `rgba(255,236,190,${opts.flash * 0.35})`;
      ctx.fill(path);
    }
    ctx.restore();
  };

  /* 조각 위의 선(금, 깨진 입술) */
  T.drawPieceLines = function (ctx, view, board, piece, broken, time, hoverRun) {
    const tf = piece.tf;
    const S = view.S;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // 깨진 경계의 밝은 입술
    if (piece.brokenEdges) {
      for (const be of piece.brokenEdges) {
        const e = board.edges[be.id];
        ctx.strokeStyle = 'rgba(255,238,196,0.75)';
        ctx.lineWidth = Math.max(1, S * 0.6);
        strokeScreenPolyline(ctx, view, tf, e.pts, 0);
        ctx.strokeStyle = 'rgba(130,78,30,0.35)';
        ctx.lineWidth = Math.max(0.6, S * 0.3);
        const inner = offsetInward(board, e, be.side, 1.1);
        strokeScreenPolyline(ctx, view, tf, inner, 0);
      }
    }
    // 조각 안의 금
    for (const eid of piece.innerEdges) {
      const e = board.edges[eid];
      const isBroken = broken.has(eid);
      if (isBroken) {
        // 조각을 나누지 못한 갈라진 틈
        ctx.strokeStyle = 'rgba(45,22,6,0.92)';
        ctx.lineWidth = Math.max(1.6, S * 1.25);
        strokeScreenPolyline(ctx, view, tf, e.pts, 0);
        ctx.strokeStyle = 'rgba(255,236,190,0.55)';
        ctx.lineWidth = Math.max(0.7, S * 0.35);
        strokeScreenPolyline(ctx, view, tf, e.pts.map((p) => [p[0], p[1] + 1.1]), 0);
        continue;
      }
      // 아직 깨지지 않은 금: 골, 짙은 선, 아래 밝은 선, 잔금
      ctx.strokeStyle = 'rgba(110,60,18,0.16)';
      ctx.lineWidth = Math.max(2.5, S * 1.9);
      strokeScreenPolyline(ctx, view, tf, e.pts, 0);
      ctx.strokeStyle = 'rgba(78,40,12,0.82)';
      ctx.lineWidth = Math.max(1, S * 0.62);
      strokeScreenPolyline(ctx, view, tf, e.pts, 0);
      ctx.strokeStyle = 'rgba(255,240,205,0.5)';
      ctx.lineWidth = Math.max(0.6, S * 0.32);
      ctx.beginPath();
      for (let i = 0; i < e.pts.length; i++) {
        const s = T.toScreen(view, tf, e.pts[i][0], e.pts[i][1], 0);
        if (i) ctx.lineTo(s[0], s[1] + Math.max(0.8, S * 0.45));
        else ctx.moveTo(s[0], s[1] + Math.max(0.8, S * 0.45));
      }
      ctx.stroke();
      if (e.whiskers) {
        ctx.strokeStyle = 'rgba(88,46,14,0.5)';
        ctx.lineWidth = Math.max(0.6, S * 0.3);
        for (const w of e.whiskers) strokeScreenPolyline(ctx, view, tf, w, 0);
      }
    }
    ctx.restore();
  };

  function offsetInward(board, e, side, d) {
    // side: +1 이면 왼쪽 법선 방향이 조각 안쪽
    const out = [];
    const P = e.pts;
    for (let i = 0; i < P.length; i++) {
      const a = P[Math.max(0, i - 1)];
      const b = P[Math.min(P.length - 1, i + 1)];
      let tx = b[0] - a[0];
      let ty = b[1] - a[1];
      const l = Math.hypot(tx, ty) || 1;
      tx /= l;
      ty /= l;
      out.push([P[i][0] - ty * d * side, P[i][1] + tx * d * side]);
    }
    return out;
  }

  /* 해당 조각에 대해 깨진 가장자리 중 이 조각 쪽 방향을 계산 */
  T.edgeSideForFace = function (board, e, faceId) {
    // 가장자리 중간에서 왼쪽 법선 방향으로 조금 간 점이 faceId에 있으면 +1
    const P = e.pts;
    const m = U.pointAlong(P, e.len / 2);
    const q = U.pointAlong(P, Math.min(e.len, e.len / 2 + 0.8));
    let tx = q[0] - m[0];
    let ty = q[1] - m[1];
    const l = Math.hypot(tx, ty) || 1;
    tx /= l;
    ty /= l;
    const lx = m[0] - ty * 1.2;
    const ly = m[1] + tx * 1.2;
    const f = board.faces[faceId];
    return U.pointInPoly(lx, ly, f.pts) ? 1 : -1;
  };

  T.EXT = EXT;
})(typeof window !== 'undefined' ? window : globalThis);
