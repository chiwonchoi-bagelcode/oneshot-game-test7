/* 공동 작업 소품: 판자, 돛대와 돛, 깃발, 노, 조타륜, 밧줄 */
(function (G) {
  'use strict';
  const TS = G.TS || (G.TS = {});
  const U = TS.U;
  const P = (TS.Props = {});

  const WOOD = '#b77a3f';
  const WOOD_D = '#7f4f25';
  const WOOD_L = '#d9a36a';

  P.proj = function (view, p) {
    return [view.cx + p[0] * view.S, view.cy + p[1] * view.S * view.K - p[2] * view.S];
  };

  /* 판자: a, b는 월드 3D 끝점 */
  P.drawPlank = function (ctx, view, a, b, opts) {
    opts = opts || {};
    const w = opts.width || 4.2;
    const th = opts.thick || 1.3;
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    dx /= l;
    dy /= l;
    const px = -dy * (w / 2);
    const py = dx * (w / 2);
    const c = [
      [a[0] + px, a[1] + py, a[2]],
      [b[0] + px, b[1] + py, b[2]],
      [b[0] - px, b[1] - py, b[2]],
      [a[0] - px, a[1] - py, a[2]],
    ];
    const s = c.map((p) => P.proj(view, p));
    // 앞면(화면 아래쪽 긴 변)
    const frontIsPlus = py > 0;
    const f0 = frontIsPlus ? s[0] : s[3];
    const f1 = frontIsPlus ? s[1] : s[2];
    const T = th * view.S;
    ctx.save();
    ctx.lineJoin = 'round';
    // 그림자 느낌 테두리
    ctx.fillStyle = WOOD_D;
    ctx.beginPath();
    ctx.moveTo(f0[0], f0[1]);
    ctx.lineTo(f1[0], f1[1]);
    ctx.lineTo(f1[0], f1[1] + T);
    ctx.lineTo(f0[0], f0[1] + T);
    ctx.closePath();
    ctx.fill();
    // 끝면
    const endB = [s[1], s[2]];
    ctx.fillStyle = '#9c6532';
    ctx.beginPath();
    const eb0 = endB[0][1] > endB[1][1] ? endB[0] : endB[1];
    ctx.moveTo(endB[0][0], endB[0][1]);
    ctx.lineTo(endB[1][0], endB[1][1]);
    ctx.lineTo(endB[1][0], endB[1][1] + T);
    ctx.lineTo(endB[0][0], endB[0][1] + T);
    ctx.closePath();
    ctx.fill();
    void eb0;
    // 윗면
    const gr = ctx.createLinearGradient(s[0][0], s[0][1], s[3][0], s[3][1]);
    gr.addColorStop(0, WOOD_L);
    gr.addColorStop(1, WOOD);
    ctx.fillStyle = gr;
    ctx.beginPath();
    s.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.closePath();
    ctx.fill();
    // 나뭇결
    ctx.strokeStyle = 'rgba(110,62,26,0.45)';
    ctx.lineWidth = Math.max(0.5, view.S * 0.22);
    for (let k = 1; k <= 2; k++) {
      const t = k / 3;
      const p0 = [U.lerp(s[0][0], s[3][0], t), U.lerp(s[0][1], s[3][1], t)];
      const p1 = [U.lerp(s[1][0], s[2][0], t), U.lerp(s[1][1], s[2][1], t)];
      ctx.beginPath();
      ctx.moveTo(p0[0], p0[1]);
      ctx.bezierCurveTo(
        U.lerp(p0[0], p1[0], 0.33),
        U.lerp(p0[1], p1[1], 0.33) + (k - 1.5) * 1.2,
        U.lerp(p0[0], p1[0], 0.66),
        U.lerp(p0[1], p1[1], 0.66) - (k - 1.5) * 1.2,
        p1[0],
        p1[1]
      );
      ctx.stroke();
    }
    // 못 머리
    ctx.fillStyle = 'rgba(60,40,30,0.7)';
    for (const t of [0.12, 0.88]) {
      const m = [U.lerp(U.lerp(s[0][0], s[3][0], 0.5), U.lerp(s[1][0], s[2][0], 0.5), t), U.lerp(U.lerp(s[0][1], s[3][1], 0.5), U.lerp(s[1][1], s[2][1], 0.5), t)];
      ctx.beginPath();
      ctx.arc(m[0], m[1], Math.max(0.6, view.S * 0.3), 0, Math.PI * 2);
      ctx.fill();
    }
    if (opts.glow) {
      ctx.globalAlpha = opts.glow;
      ctx.fillStyle = '#fff3c4';
      ctx.beginPath();
      s.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  };

  /* 기둥(돛대/노 자루) */
  P.drawPole = function (ctx, view, a, b, w, color) {
    const sa = P.proj(view, a);
    const sb = P.proj(view, b);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = U.shade(color || WOOD, -0.35);
    ctx.lineWidth = w * view.S + 1;
    ctx.beginPath();
    ctx.moveTo(sa[0], sa[1]);
    ctx.lineTo(sb[0], sb[1]);
    ctx.stroke();
    ctx.strokeStyle = color || WOOD;
    ctx.lineWidth = w * view.S;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,230,190,0.45)';
    ctx.lineWidth = Math.max(0.6, w * view.S * 0.3);
    ctx.beginPath();
    ctx.moveTo(sa[0] - w * view.S * 0.2, sa[1]);
    ctx.lineTo(sb[0] - w * view.S * 0.2, sb[1]);
    ctx.stroke();
    ctx.restore();
  };

  /* 연합 문장: 둥근 토르티야와 작은 배 */
  P.drawEmblem = function (ctx, x, y, r, alpha) {
    ctx.save();
    ctx.globalAlpha *= alpha === undefined ? 1 : alpha;
    ctx.fillStyle = '#e7b85c';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(140,80,25,0.55)';
    for (const o of [
      [-0.35, -0.2, 0.18],
      [0.3, 0.25, 0.14],
      [0.1, -0.45, 0.1],
      [-0.2, 0.42, 0.12],
    ]) {
      ctx.beginPath();
      ctx.arc(x + o[0] * r, y + o[1] * r, o[2] * r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(120,70,20,0.7)';
    ctx.lineWidth = Math.max(0.5, r * 0.12);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  };

  /* 돛: 돛대 꼭대기 top, 돛대 아래쪽 low, 펴는 사람 손 corner (화면 좌표) */
  P.drawSail = function (ctx, top, low, corner, billow, slack, unfurl) {
    unfurl = unfurl === undefined ? 1 : unfurl;
    const c = [U.lerp(low[0], corner[0], unfurl), U.lerp(low[1], corner[1], unfurl)];
    const mid = [(top[0] + c[0]) / 2, (top[1] + c[1]) / 2];
    // 바깥쪽으로 부푼 정도
    let nx = c[1] - top[1];
    let ny = -(c[0] - top[0]);
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl;
    ny /= nl;
    const bw = billow || 0;
    const slackDrop = slack || 0;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(top[0], top[1]);
    ctx.quadraticCurveTo(mid[0] + nx * bw, mid[1] + ny * bw + slackDrop * 0.6, c[0], c[1] + slackDrop);
    ctx.quadraticCurveTo((c[0] + low[0]) / 2, (c[1] + low[1]) / 2 + 2 + slackDrop * 0.8, low[0], low[1]);
    ctx.closePath();
    const gr = ctx.createLinearGradient(top[0], top[1], c[0], c[1]);
    gr.addColorStop(0, '#fbf6e9');
    gr.addColorStop(1, '#e6dcc4');
    ctx.fillStyle = gr;
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,100,70,0.55)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    // 바느질 선
    ctx.setLineDash([1.5, 1.5]);
    ctx.strokeStyle = 'rgba(150,120,80,0.45)';
    ctx.beginPath();
    for (let k = 1; k <= 2; k++) {
      const t = k / 3;
      ctx.moveTo(U.lerp(top[0], low[0], t), U.lerp(top[1], low[1], t));
      ctx.lineTo(U.lerp(top[0], c[0], t) + nx * bw * 0.3, U.lerp(top[1], c[1], t) + ny * bw * 0.3 + slackDrop * t);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    if (unfurl > 0.5 && slackDrop < 4) {
      const ex = (top[0] + low[0] + c[0]) / 3 + nx * bw * 0.25;
      const ey = (top[1] + low[1] + c[1]) / 3 + ny * bw * 0.25;
      P.drawEmblem(ctx, ex, ey, Math.max(2, Math.hypot(c[0] - low[0], c[1] - low[1]) * 0.14), (unfurl - 0.5) * 2);
    }
    ctx.restore();
  };

  /* 깃발: 윗변 tl→tr (화면), 높이 h(px), 물결 */
  P.drawFlag = function (ctx, tl, tr, h, t, wave, sag) {
    const N = 10;
    const top = [];
    const bot = [];
    for (let i = 0; i <= N; i++) {
      const k = i / N;
      const x = U.lerp(tl[0], tr[0], k);
      const y = U.lerp(tl[1], tr[1], k) + Math.sin(k * Math.PI) * (sag || 0);
      const wv = Math.sin(t * 5 + k * 6) * wave * Math.sin(k * Math.PI);
      top.push([x, y + wv * 0.5]);
      bot.push([x + wv * 0.4, y + h + wv + Math.sin(k * Math.PI) * (sag || 0) * 0.4]);
    }
    ctx.save();
    ctx.beginPath();
    top.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    for (let i = N; i >= 0; i--) ctx.lineTo(bot[i][0], bot[i][1]);
    ctx.closePath();
    ctx.fillStyle = '#284a8a';
    ctx.fill();
    ctx.save();
    ctx.clip();
    // 흰 물결 띠
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = h * 0.12;
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const p = [U.lerp(top[i][0], bot[i][0], 0.8), U.lerp(top[i][1], bot[i][1], 0.8)];
      i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]);
    }
    ctx.stroke();
    // 음영 주름
    for (let i = 1; i < N; i += 2) {
      ctx.fillStyle = `rgba(0,0,0,${0.08 + 0.06 * Math.sin(t * 5 + i)})`;
      ctx.beginPath();
      ctx.moveTo(top[i][0], top[i][1]);
      ctx.lineTo(top[i + 1][0], top[i + 1][1]);
      ctx.lineTo(bot[i + 1][0], bot[i + 1][1]);
      ctx.lineTo(bot[i][0], bot[i][1]);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    const mi = Math.floor(N / 2);
    const ex = U.lerp(top[mi][0], bot[mi][0], 0.42);
    const ey = U.lerp(top[mi][1], bot[mi][1], 0.42);
    P.drawEmblem(ctx, ex, ey, h * 0.24);
    ctx.strokeStyle = 'rgba(20,30,60,0.6)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    top.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.stroke();
    ctx.restore();
    return { bottomMid: bot[mi], topMid: top[mi] };
  };

  /* 노 */
  P.drawOar = function (ctx, view, a, b) {
    P.drawPole(ctx, view, a, b, 0.95, '#c08a52');
    const sa = P.proj(view, a);
    const sb = P.proj(view, b);
    const ang = Math.atan2(sb[1] - sa[1], sb[0] - sa[0]);
    ctx.save();
    ctx.translate(sb[0], sb[1]);
    ctx.rotate(ang);
    const S = view.S;
    ctx.fillStyle = '#b5773d';
    ctx.strokeStyle = '#6e4420';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(-1 * S, -0.5 * S);
    ctx.quadraticCurveTo(2 * S, -2.2 * S, 5.5 * S, -1.6 * S);
    ctx.quadraticCurveTo(6.6 * S, 0, 5.5 * S, 1.6 * S);
    ctx.quadraticCurveTo(2 * S, 2.2 * S, -1 * S, 0.5 * S);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  };

  /* 조타륜: 화면 중심 c, 반지름 r(px), 회전 rot */
  P.drawHelm = function (ctx, view, base, c, r, rot) {
    const sb = P.proj(view, base);
    ctx.save();
    // 받침 기둥
    ctx.strokeStyle = '#6e4420';
    ctx.lineWidth = r * 0.42;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sb[0], sb[1]);
    ctx.lineTo(c[0], c[1]);
    ctx.stroke();
    ctx.strokeStyle = '#a06a35';
    ctx.lineWidth = r * 0.28;
    ctx.stroke();
    // 손잡이와 살
    for (let i = 0; i < 8; i++) {
      const a = rot + (i * Math.PI) / 4;
      ctx.strokeStyle = '#7a4a22';
      ctx.lineWidth = r * 0.16;
      ctx.beginPath();
      ctx.moveTo(c[0], c[1]);
      ctx.lineTo(c[0] + Math.cos(a) * r * 1.32, c[1] + Math.sin(a) * r * 1.32);
      ctx.stroke();
      ctx.fillStyle = '#c48b4c';
      ctx.beginPath();
      ctx.arc(c[0] + Math.cos(a) * r * 1.32, c[1] + Math.sin(a) * r * 1.32, r * 0.13, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = '#6e4420';
    ctx.lineWidth = r * 0.3;
    ctx.beginPath();
    ctx.arc(c[0], c[1], r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#c99257';
    ctx.lineWidth = r * 0.16;
    ctx.stroke();
    ctx.fillStyle = '#d9a441';
    ctx.beginPath();
    ctx.arc(c[0], c[1], r * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  /* 밧줄: 화면 p→q, 처짐 sag(px) */
  P.drawRope = function (ctx, p, q, sag, width) {
    const mx = (p[0] + q[0]) / 2;
    const my = (p[1] + q[1]) / 2 + sag;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#7d5a32';
    ctx.lineWidth = (width || 1.4) + 0.8;
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    ctx.quadraticCurveTo(mx, my, q[0], q[1]);
    ctx.stroke();
    ctx.strokeStyle = '#d2ad74';
    ctx.lineWidth = width || 1.4;
    ctx.stroke();
    ctx.setLineDash([1.2, 1.6]);
    ctx.strokeStyle = 'rgba(120,85,45,0.8)';
    ctx.lineWidth = (width || 1.4) * 0.6;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  };


  /* 구명환: 화면 중심 c, 반지름 r(px) */
  P.drawRing = function (ctx, c, r, rot) {
    ctx.save();
    ctx.translate(c[0], c[1]);
    ctx.rotate(rot || 0);
    const w = r * 0.42;
    ctx.lineWidth = w + 1.6;
    ctx.strokeStyle = 'rgba(80,20,10,0.45)';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 8; i++) {
      ctx.strokeStyle = i % 2 ? '#f7f2ea' : '#e2462f';
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.arc(0, 0, r, (i * Math.PI) / 4, ((i + 1) * Math.PI) / 4 + 0.01);
      ctx.stroke();
    }
    // 빛
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = w * 0.25;
    ctx.beginPath();
    ctx.arc(0, 0, r + w * 0.15, Math.PI * 1.1, Math.PI * 1.6);
    ctx.stroke();
    // 둘레 밧줄
    ctx.strokeStyle = '#d2ad74';
    ctx.lineWidth = Math.max(0.8, w * 0.16);
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + Math.PI / 4;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r, Math.sin(a) * r, w * 0.55, a - 1.2, a + 1.2);
      ctx.stroke();
    }
    ctx.restore();
  };

  /* 쇠사슬: 화면 p→q, 처짐 */
  P.chainPoint = function (p, q, sag, k) {
    const mx = (p[0] + q[0]) / 2;
    const my = (p[1] + q[1]) / 2 + sag;
    const a = 1 - k;
    return [a * a * p[0] + 2 * a * k * mx + k * k * q[0], a * a * p[1] + 2 * a * k * my + k * k * q[1]];
  };
  P.drawChain = function (ctx, p, q, sag, link) {
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]) + Math.abs(sag);
    const n = Math.max(3, Math.round(len / (link * 1.5)));
    ctx.save();
    for (let i = 0; i <= n; i++) {
      const a = P.chainPoint(p, q, sag, i / n);
      const b = P.chainPoint(p, q, sag, Math.min(1, (i + 0.5) / n));
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      ctx.strokeStyle = '#3c3f45';
      ctx.lineWidth = link * 0.45;
      ctx.beginPath();
      ctx.ellipse(a[0], a[1], link * 0.85, link * (i % 2 ? 0.25 : 0.5), ang, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(200,205,215,0.6)';
      ctx.lineWidth = link * 0.15;
      ctx.stroke();
    }
    ctx.restore();
  };

  /* 닻: top은 고리 위치(화면), s는 크기(px), ang 기울기 */
  P.drawAnchor = function (ctx, top, s, ang) {
    ctx.save();
    ctx.translate(top[0], top[1]);
    ctx.rotate(ang || 0);
    ctx.lineCap = 'round';
    const iron = '#4a4f57';
    ctx.strokeStyle = iron;
    ctx.lineWidth = s * 0.16;
    ctx.beginPath();
    ctx.arc(0, s * 0.08, s * 0.1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, s * 0.18);
    ctx.lineTo(0, s * 0.95);
    ctx.moveTo(-s * 0.28, s * 0.32);
    ctx.lineTo(s * 0.28, s * 0.32);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, s * 0.62, s * 0.36, Math.PI * 0.12, Math.PI * 0.88);
    ctx.stroke();
    ctx.fillStyle = iron;
    for (const sx of [-1, 1]) {
      const fx = Math.cos(sx > 0 ? Math.PI * 0.12 : Math.PI * 0.88) * s * 0.36;
      const fy = s * 0.62 + Math.sin(Math.PI * 0.12) * s * 0.36;
      ctx.beginPath();
      ctx.moveTo(fx, fy - s * 0.1);
      ctx.lineTo(fx + sx * s * 0.12, fy - s * 0.2);
      ctx.lineTo(fx + sx * s * 0.04, fy + s * 0.04);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(220,225,235,0.45)';
    ctx.lineWidth = s * 0.05;
    ctx.beginPath();
    ctx.moveTo(-s * 0.03, s * 0.2);
    ctx.lineTo(-s * 0.03, s * 0.85);
    ctx.stroke();
    ctx.restore();
  };

  /* 만국기: 화면 p→q 줄과 작은 삼각 깃발 */
  P.drawBunting = function (ctx, p, q, sag, t, colors, flag) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#efe4cc';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    ctx.quadraticCurveTo((p[0] + q[0]) / 2, (p[1] + q[1]) / 2 + sag * 2, q[0], q[1]);
    ctx.stroke();
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const n = Math.max(3, Math.floor(len / 9));
    const sz = U.clamp(len / n * 0.75, 4, 9) * (flag || 1);
    for (let i = 1; i < n; i++) {
      const k = i / n;
      const pt = P.chainPoint(p, q, sag, k);
      const sw = Math.sin(t * 4 + i * 1.3) * 1.2;
      ctx.fillStyle = colors[i % colors.length];
      ctx.beginPath();
      ctx.moveTo(pt[0] - sz * 0.45, pt[1]);
      ctx.lineTo(pt[0] + sz * 0.45, pt[1]);
      ctx.lineTo(pt[0] + sw, pt[1] + sz * 1.05);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
    ctx.restore();
  };

  /* 등불: 화면 위치 c(고리), 크기 s(px), 빛 glow 0..1 */
  P.drawLantern = function (ctx, c, s, glow, sway) {
    ctx.save();
    if (glow > 0) {
      const gr = ctx.createRadialGradient(c[0], c[1] + s * 0.7, 0, c[0], c[1] + s * 0.7, s * (2.2 + glow * 2));
      gr.addColorStop(0, `rgba(255,214,120,${0.55 * glow})`);
      gr.addColorStop(1, 'rgba(255,214,120,0)');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(c[0], c[1] + s * 0.7, s * (2.2 + glow * 2), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.translate(c[0], c[1]);
    ctx.rotate(sway || 0);
    ctx.strokeStyle = '#6b4a1f';
    ctx.lineWidth = Math.max(0.8, s * 0.08);
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#b8892f';
    ctx.beginPath();
    ctx.moveTo(-s * 0.32, s * 0.25);
    ctx.lineTo(s * 0.32, s * 0.25);
    ctx.lineTo(s * 0.18, s * 0.12);
    ctx.lineTo(-s * 0.18, s * 0.12);
    ctx.closePath();
    ctx.fill();
    const gl = ctx.createLinearGradient(0, s * 0.25, 0, s * 1.05);
    gl.addColorStop(0, glow > 0 ? '#fff4c2' : '#e8e2cf');
    gl.addColorStop(1, glow > 0 ? '#ffc457' : '#c9c2ad');
    ctx.fillStyle = gl;
    ctx.fillRect(-s * 0.26, s * 0.25, s * 0.52, s * 0.8);
    ctx.strokeStyle = '#8a6424';
    ctx.lineWidth = Math.max(0.6, s * 0.06);
    ctx.strokeRect(-s * 0.26, s * 0.25, s * 0.52, s * 0.8);
    ctx.beginPath();
    ctx.moveTo(0, s * 0.25);
    ctx.lineTo(0, s * 1.05);
    ctx.stroke();
    ctx.fillStyle = '#b8892f';
    ctx.fillRect(-s * 0.32, s * 1.03, s * 0.64, s * 0.12);
    ctx.restore();
  };

  /* 부품 아이콘 (배·비행용): 중심 x,y, 크기 s */
  P.drawPartIcon = function (ctx, part, x, y, s, t) {
    ctx.save();
    ctx.translate(x, y);
    const k = s / 20;
    ctx.scale(k, k);
    switch (part) {
      case 'hull':
      case 'deck':
      case 'rail':
        ctx.fillStyle = WOOD;
        ctx.strokeStyle = WOOD_D;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.rect(-11, -2.5, 22, 5);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = 'rgba(110,62,26,0.5)';
        ctx.beginPath();
        ctx.moveTo(-10, 0);
        ctx.lineTo(10, 0);
        ctx.stroke();
        break;
      case 'mast':
        ctx.strokeStyle = WOOD_D;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-6, 10);
        ctx.lineTo(-6, -11);
        ctx.stroke();
        ctx.fillStyle = '#f6efdc';
        ctx.beginPath();
        ctx.moveTo(-5, -10);
        ctx.quadraticCurveTo(7, -2, 9, 7);
        ctx.lineTo(-5, 6);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(120,100,70,0.6)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
        break;
      case 'flag':
        ctx.fillStyle = '#284a8a';
        ctx.beginPath();
        ctx.moveTo(-10, -7);
        ctx.quadraticCurveTo(0, -9 + Math.sin((t || 0) * 6) * 1.5, 10, -7);
        ctx.lineTo(10, 6);
        ctx.quadraticCurveTo(0, 4, -10, 6);
        ctx.closePath();
        ctx.fill();
        P.drawEmblem(ctx, 0, -1, 3.6);
        break;
      case 'oars':
        ctx.rotate(-0.5);
        ctx.strokeStyle = '#c08a52';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(-10, 0);
        ctx.lineTo(5, 0);
        ctx.stroke();
        ctx.fillStyle = '#b5773d';
        ctx.beginPath();
        ctx.ellipse(8, 0, 4.5, 2.2, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'helm':
        ctx.strokeStyle = '#7a4a22';
        ctx.lineWidth = 1.4;
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4 + (t || 0);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(a) * 10, Math.sin(a) * 10);
          ctx.stroke();
        }
        ctx.lineWidth = 2.2;
        ctx.strokeStyle = '#c99257';
        ctx.beginPath();
        ctx.arc(0, 0, 7, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'cabin':
        ctx.fillStyle = '#b77a3f';
        ctx.fillRect(-9, -6, 18, 13);
        ctx.fillStyle = '#7f4f25';
        ctx.fillRect(-11, -9, 22, 4);
        ctx.fillStyle = '#9ad3e0';
        ctx.fillRect(-6, -2, 4, 4);
        ctx.fillRect(2, -2, 4, 4);
        break;
      case 'anchor':
        P.drawAnchor(ctx, [0, -10], 20, 0);
        break;
      case 'bunting':
        P.drawBunting(ctx, [-11, -5], [11, -5], 3, t || 0, ['#d23b35', '#2f6fd0', '#e8b326', '#2f9a58', '#7d4bc2'], 1.3);
        break;
      case 'lamp':
        P.drawLantern(ctx, [0, -9], 18, 0.8, 0);
        break;
      case 'ring':
        ctx.lineWidth = 4;
        for (let i = 0; i < 4; i++) {
          ctx.strokeStyle = i % 2 ? '#ffffff' : '#e2462f';
          ctx.beginPath();
          ctx.arc(0, 0, 7, (i * Math.PI) / 2, ((i + 1) * Math.PI) / 2);
          ctx.stroke();
        }
        break;
    }
    ctx.restore();
  };
})(typeof window !== 'undefined' ? window : globalThis);
