/* 작은 외교관 그리기 — 구두, 손, 어깨, 시선으로 관계를 읽힌다 */
(function (G) {
  'use strict';
  const TS = G.TS || (G.TS = {});
  const U = TS.U;
  const D = (TS.Diplomat = {});

  // 몸 치수 (판 단위, z 위쪽)
  const DIM = {
    footX: 2.4,
    hip: 7.2,
    shoulder: 16.4,
    shoulderX: 5.1,
    headZ: 23.2,
    headR: 6.2,
    upper: 5.0,
    fore: 5.0,
  };
  D.DIM = DIM;

  const SKINS = ['#f2c9a0', '#e6b087', '#c98d62', '#a86d45', '#7d4c2f', '#f5d6b8'];
  const SUITS = ['#2c3040', '#27324e', '#3e3330', '#4a4f5c', '#3a4134', '#4a2f38', '#33373f'];
  const HAIRS = ['#2a1e17', '#4a3426', '#7b5a3a', '#b8b2a6', '#d9c08a', '#1b1b1f', '#8a3a1c'];

  /* 외형 기본값 채우기 */
  D.resolveLook = function (def, idx) {
    const r = U.rng(idx * 97 + 13);
    const look = Object.assign({}, def.look || {});
    if (!look.skin) look.skin = SKINS[(idx * 3 + 1) % SKINS.length];
    if (!look.suit) look.suit = SUITS[(idx * 5 + 2) % SUITS.length];
    if (!look.hairColor) look.hairColor = HAIRS[(idx * 2 + 3) % HAIRS.length];
    if (!look.face) look.face = 'stern';
    if (!look.hair) look.hair = 'side';
    look.height = look.height || r.range(0.96, 1.04);
    look.girth = look.girth || r.range(0.95, 1.08);
    return look;
  };

  function circle(ctx, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /* 2관절 팔: 어깨 → 손. 팔꿈치는 아래 바깥쪽으로 굽는다. */
  function armIK(sx, sy, hx, hy, L1, L2, outward) {
    let dx = hx - sx;
    let dy = hy - sy;
    let d = Math.hypot(dx, dy);
    const maxR = (L1 + L2) * 1.12;
    if (d > maxR) {
      hx = sx + (dx / d) * maxR;
      hy = sy + (dy / d) * maxR;
      dx = hx - sx;
      dy = hy - sy;
      d = maxR;
    }
    const reach = Math.min(d, L1 + L2 - 0.01);
    const a = (L1 * L1 - L2 * L2 + reach * reach) / (2 * reach || 1);
    const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const ux = dx / (d || 1);
    const uy = dy / (d || 1);
    const mx = sx + ux * a;
    const my = sy + uy * a;
    // 두 후보 중 아래(+y)·바깥쪽인 것
    const p1 = [mx - uy * h, my + ux * h];
    const p2 = [mx + uy * h, my - ux * h];
    const score = (p) => p[1] * 1.0 + (p[0] - sx) * outward * 0.6;
    const el = score(p1) > score(p2) ? p1 : p2;
    return { ex: el[0], ey: el[1], hx, hy };
  }

  /* 그림자는 따로 먼저 그린다 */
  D.drawShadow = function (ctx, v) {
    const u = v.u;
    ctx.save();
    ctx.fillStyle = `rgba(40,20,4,${0.28 * (v.alpha === undefined ? 1 : v.alpha)})`;
    ctx.beginPath();
    ctx.ellipse(v.sx, v.sy + 0.4 * u, 6.2 * u * (v.look.girth || 1), 2.4 * u, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  /*
   * v: { sx, sy, u, facing, look, nation, shoulder, lean, bob, handL, handR, gripL, gripR,
   *      expr, gaze:[x,y], blink, step, bow, alpha, sweat, flagColor }
   * handL/handR: 화면 좌표 목표 또는 null
   */
  D.draw = function (ctx, v) {
    const u = v.u;
    const L = v.look;
    const nat = TS.NATIONS[v.nation];
    const f = v.facing || 1;
    const H = L.height || 1;
    const gx = L.girth || 1;
    const shoulderRaise = v.shoulder || 0;
    const bow = v.bow || 0;
    const lean = (v.lean || 0) + bow * 0.5 * f;
    const alpha = v.alpha === undefined ? 1 : v.alpha;
    const bob = v.bob || 0;
    const step = v.step;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(v.sx, v.sy + (v.hop ? -v.hop * u : 0));
    ctx.scale(u, u);
    // 로컬: x 오른쪽(화면), y 아래. facing은 얼굴 방향에만 반영하고 몸은 대칭.
    const hipY = -DIM.hip * H + bob * 0.3;
    const shY = -DIM.shoulder * H - shoulderRaise * 1.7 + bob;
    const headY = -DIM.headZ * H - shoulderRaise * 0.6 + bob + bow * 2.2;

    // 상체 기울기: 엉덩이를 중심으로 회전한 점
    const rot = (x, y) => {
      const c = Math.cos(lean);
      const s = Math.sin(lean);
      const dx = x;
      const dy = y - hipY;
      return [dx * c - dy * s, hipY + dx * s + dy * c];
    };
    // 화면 목표 → 로컬
    const toLocal = (p) => (p ? [(p[0] - v.sx) / u, (p[1] - v.sy) / u] : null);

    // ── 다리와 구두
    const stepA = step === undefined || step === null ? 0 : Math.sin(step);
    const stepB = step === undefined || step === null ? 0 : Math.sin(step + Math.PI);
    const legW = 2.25;
    for (let side = -1; side <= 1; side += 2) {
      const sw = side < 0 ? stepA : stepB;
      const fx = side * DIM.footX + sw * 1.4 * f;
      const lift = Math.max(0, sw) * 1.2;
      // 바지
      ctx.fillStyle = U.shade(L.suit, -0.25);
      ctx.beginPath();
      ctx.moveTo(side * 1.0 - legW / 2 + side * 0.4, hipY + 0.5);
      ctx.lineTo(side * 1.0 + legW / 2 + side * 0.4, hipY + 0.5);
      ctx.lineTo(fx + legW / 2, -1.4 - lift);
      ctx.lineTo(fx - legW / 2, -1.4 - lift);
      ctx.closePath();
      ctx.fill();
      // 구두
      ctx.fillStyle = L.shoe || '#1b1512';
      ctx.beginPath();
      ctx.ellipse(fx + f * 0.7, -0.8 - lift, 2.0, 1.15, 0, 0, Math.PI * 2);
      ctx.fill();
      // 구두 광
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.ellipse(fx + f * 1.3, -1.35 - lift, 0.7, 0.28, -0.3 * f, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── 몸통 (재킷)
    const hipW = 4.6 * gx;
    const shW = 5.4 * gx - shoulderRaise * 0.5;
    const pHL = rot(-hipW, hipY + 0.8);
    const pHR = rot(hipW, hipY + 0.8);
    const pSL = rot(-shW, shY + 1.2);
    const pSR = rot(shW, shY + 1.2);
    const pNeck = rot(0, shY - 0.2);
    ctx.fillStyle = L.suit;
    ctx.beginPath();
    ctx.moveTo(pHL[0], pHL[1]);
    ctx.lineTo(pHR[0], pHR[1]);
    ctx.quadraticCurveTo(...rot(hipW + 0.6, (hipY + shY) / 2), pSR[0], pSR[1]);
    ctx.quadraticCurveTo(...rot(shW * 0.6, shY - 0.6), pNeck[0], pNeck[1]);
    ctx.quadraticCurveTo(...rot(-shW * 0.6, shY - 0.6), pSL[0], pSL[1]);
    ctx.quadraticCurveTo(...rot(-hipW - 0.6, (hipY + shY) / 2), pHL[0], pHL[1]);
    ctx.closePath();
    ctx.fill();
    // 재킷 음영
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.moveTo(...rot(hipW * 0.2 * -f, hipY + 0.8));
    ctx.lineTo(...rot(hipW * -f, hipY + 0.8));
    ctx.quadraticCurveTo(...rot((hipW + 0.6) * -f, (hipY + shY) / 2), ...rot(shW * -f, shY + 1.2));
    ctx.lineTo(...rot(shW * 0.3 * -f, shY + 2));
    ctx.closePath();
    ctx.fill();
    // 셔츠 V와 넥타이
    const vTop = shY + 0.2;
    const vBot = shY + 5.2;
    ctx.fillStyle = '#f6f2ea';
    ctx.beginPath();
    ctx.moveTo(...rot(-1.9 + f * 0.6, vTop));
    ctx.lineTo(...rot(1.9 + f * 0.6, vTop));
    ctx.lineTo(...rot(f * 0.6, vBot));
    ctx.closePath();
    ctx.fill();
    if (L.acc === 'bowtie') {
      ctx.fillStyle = nat.color;
      const c = rot(f * 0.6, vTop + 0.9);
      ctx.beginPath();
      ctx.moveTo(c[0], c[1]);
      ctx.lineTo(c[0] - 1.6, c[1] - 0.9);
      ctx.lineTo(c[0] - 1.6, c[1] + 0.9);
      ctx.closePath();
      ctx.moveTo(c[0], c[1]);
      ctx.lineTo(c[0] + 1.6, c[1] - 0.9);
      ctx.lineTo(c[0] + 1.6, c[1] + 0.9);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = nat.color;
      ctx.beginPath();
      ctx.moveTo(...rot(f * 0.6 - 0.6, vTop + 0.3));
      ctx.lineTo(...rot(f * 0.6 + 0.6, vTop + 0.3));
      ctx.lineTo(...rot(f * 0.6 + 0.85, vBot + 1.4));
      ctx.lineTo(...rot(f * 0.6, vBot + 2.4));
      ctx.lineTo(...rot(f * 0.6 - 0.85, vBot + 1.4));
      ctx.closePath();
      ctx.fill();
    }
    // 옷깃 선
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 0.35;
    ctx.beginPath();
    ctx.moveTo(...rot(-1.9 + f * 0.6, vTop));
    ctx.lineTo(...rot(f * 0.6 - 0.2, vBot + 2.6));
    ctx.moveTo(...rot(1.9 + f * 0.6, vTop));
    ctx.lineTo(...rot(f * 0.6 + 0.2, vBot + 2.6));
    ctx.stroke();
    // 국기 배지
    const pin = rot(-f * 2.9, shY + 3.6);
    drawFlag(ctx, nat, pin[0] - 0.95, pin[1] - 0.65, 1.9, 1.3);
    // 단추
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    circle(ctx, ...rot(f * 0.6, vBot + 3.6), 0.32);
    ctx.fill();

    // ── 머리
    const hc = rot(0, headY);
    const hx = hc[0];
    const hy = hc[1];
    const R = DIM.headR;
    const fo = f * 1.25; // 3/4 시점 얼굴 쏠림
    // 목
    ctx.fillStyle = U.shade(L.skin, -0.12);
    ctx.fillRect(hx - 1.4, hy + R - 1.6, 2.8, 2.4);
    // 뒷머리 (긴머리/쪽머리)
    ctx.fillStyle = L.hairColor;
    if (L.hair === 'long') {
      roundRect(ctx, hx - R * 0.95 - f * 0.6, hy - R * 0.4, R * 1.9, R * 1.65, 2.2);
      ctx.fill();
    } else if (L.hair === 'bun') {
      circle(ctx, hx - f * R * 0.85, hy - R * 0.55, R * 0.42);
      ctx.fill();
    }
    // 얼굴
    ctx.fillStyle = L.skin;
    circle(ctx, hx, hy, R);
    ctx.fill();
    // 귀
    circle(ctx, hx - f * (R - 0.6), hy + 0.6, 1.15);
    ctx.fill();
    // 볼 음영
    ctx.fillStyle = 'rgba(120,50,20,0.10)';
    circle(ctx, hx - f * 2, hy + 1.5, R * 0.75);
    ctx.fill();
    // 머리카락
    drawHair(ctx, L, hx, hy, R, f);

    // 얼굴 표정
    drawFace(ctx, v, hx + fo, hy + 0.6, R, f);

    // 소품 장신구
    if (L.acc === 'glasses') {
      ctx.strokeStyle = '#2a2420';
      ctx.lineWidth = 0.38;
      const ex = hx + fo;
      const ey = hy + 0.2;
      circle(ctx, ex - 1.9, ey, 1.25);
      ctx.stroke();
      circle(ctx, ex + 1.9, ey, 1.25);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ex - 0.65, ey);
      ctx.lineTo(ex + 0.65, ey);
      ctx.stroke();
    } else if (L.acc === 'monocle') {
      ctx.strokeStyle = '#c9a23c';
      ctx.lineWidth = 0.4;
      const ex = hx + fo + 1.9 * f;
      const ey = hy + 0.2;
      circle(ctx, ex, ey, 1.35);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ex + 0.4 * f, ey + 1.3);
      ctx.quadraticCurveTo(ex + 1.5 * f, ey + 4, ex - 0.5 * f, ey + 6.5);
      ctx.stroke();
    }

    // ── 팔 (몸통 위)
    const shL = rot(-shW + 0.6, shY + 1.4);
    const shR = rot(shW - 0.6, shY + 1.4);
    const idleL = rot(-shW - 0.8, hipY - 0.2);
    const idleR = rot(shW + 0.8, hipY - 0.2);
    let tL = toLocal(v.handL) || [idleL[0] + (v.armsCrossed ? 6 : 0), idleL[1] - (v.armsCrossed ? 4.5 : 0)];
    let tR = toLocal(v.handR) || [idleR[0] - (v.armsCrossed ? 6 : 0), idleR[1] - (v.armsCrossed ? 5 : 0)];
    if (v.bowHands && !v.handL && !v.handR) {
      tL = rot(-1.2, hipY - 1.5);
      tR = rot(1.2, hipY - 1.6);
    }
    const arms = [
      { s: shL, t: tL, side: -1, open: v.openL },
      { s: shR, t: tR, side: 1, open: v.openR },
    ];
    // 뒤쪽 팔 먼저 (목표가 위쪽인 팔)
    arms.sort((a, b) => a.t[1] - b.t[1]);
    const handsOut = [];
    for (const a of arms) {
      const ik = armIK(a.s[0], a.s[1], a.t[0], a.t[1], DIM.upper, DIM.fore, a.side);
      ctx.strokeStyle = U.shade(L.suit, 0.04);
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(a.s[0], a.s[1]);
      ctx.lineTo(ik.ex, ik.ey);
      ctx.lineTo(ik.hx, ik.hy);
      ctx.stroke();
      // 소매 끝 셔츠
      const cx = U.lerp(ik.ex, ik.hx, 0.82);
      const cy = U.lerp(ik.ey, ik.hy, 0.82);
      ctx.strokeStyle = '#f3efe6';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(U.lerp(ik.ex, ik.hx, 0.9), U.lerp(ik.ey, ik.hy, 0.9));
      ctx.stroke();
      const hang = Math.atan2(ik.hy - ik.ey, ik.hx - ik.ex);
      drawHand(ctx, L, ik.hx, ik.hy, hang, a.open);
      handsOut.push({ x: v.sx + ik.hx * u, y: v.sy + ik.hy * u, ang: hang, open: a.open, side: a.side });
    }

    // 땀방울
    if (v.sweat) {
      const t = v.sweat;
      ctx.fillStyle = 'rgba(160,215,255,0.95)';
      const sx = hx - f * (R + 0.4);
      const sy = hy - R * 0.4 + (t % 1) * 3;
      ctx.beginPath();
      ctx.moveTo(sx, sy - 1.3);
      ctx.quadraticCurveTo(sx + 0.9, sy, sx, sy + 0.8);
      ctx.quadraticCurveTo(sx - 0.9, sy, sx, sy - 1.3);
      ctx.fill();
    }
    ctx.restore();

    // 머리 위치 (말풍선용) 화면 좌표 반환
    return { headX: v.sx + hx * u, headY: v.sy + (hy - R) * u, chestY: v.sy + shY * u, hands: handsOut };
  };

  /* 소품 위에 손을 다시 그린다 (쥔 손이 보이도록) */
  D.drawHandScreen = function (ctx, look, h, u, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    ctx.translate(h.x, h.y);
    ctx.scale(u, u);
    drawHand(ctx, look, 0, 0, h.ang, h.open);
    ctx.restore();
  };

  function drawHand(ctx, L, x, y, ang, open) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.fillStyle = L.skin;
    ctx.strokeStyle = U.shade(L.skin, -0.3);
    ctx.lineWidth = 0.25;
    if (open) {
      // 펼친 손: 손바닥과 손가락
      ctx.beginPath();
      ctx.ellipse(0.5, 0, 1.6, 1.25, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.ellipse(2.0, i * 0.75, 0.85, 0.36, i * 0.25, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.ellipse(0.9, -1.25, 0.7, 0.35, -0.9, 0, Math.PI * 2);
      ctx.fill();
    } else {
      circle(ctx, 0.4, 0, 1.45);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.moveTo(0.9, -0.8);
      ctx.lineTo(0.9, 0.8);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawHair(ctx, L, hx, hy, R, f) {
    ctx.fillStyle = L.hairColor;
    const hl = U.shade(L.hairColor, 0.25);
    switch (L.hair) {
      case 'bald': {
        ctx.beginPath();
        ctx.ellipse(hx - f * R * 0.78, hy - 0.2, 1.5, 2.4, 0.2 * f, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(hx + f * R * 0.9, hy - 0.4, 0.8, 1.8, -0.2 * f, 0, Math.PI * 2);
        ctx.fill();
        // 정수리 광
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath();
        ctx.ellipse(hx - 1, hy - R * 0.7, 1.8, 0.8, -0.3, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'curly': {
        for (let i = 0; i < 9; i++) {
          const a = Math.PI + (i / 8) * Math.PI;
          circle(ctx, hx + Math.cos(a) * R * 0.92, hy + Math.sin(a) * R * 0.85 + 0.6, 1.9);
          ctx.fill();
        }
        circle(ctx, hx - f * R * 0.9, hy + 0.8, 1.6);
        ctx.fill();
        break;
      }
      case 'slick': {
        ctx.beginPath();
        ctx.arc(hx, hy, R + 0.3, Math.PI * 1.02, Math.PI * 1.98);
        ctx.quadraticCurveTo(hx + f * 2, hy - R * 0.5, hx - f * R, hy - 0.4);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = hl;
        ctx.lineWidth = 0.35;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.arc(hx - f * 1.5, hy + 1.5, R - 0.8 - i * 1.1, Math.PI * 1.25, Math.PI * 1.75);
          ctx.stroke();
        }
        break;
      }
      case 'bob':
      case 'long': {
        ctx.beginPath();
        ctx.arc(hx, hy, R + 0.4, Math.PI * 0.95, Math.PI * 2.05);
        ctx.quadraticCurveTo(hx + f * 2.5, hy - R * 0.55, hx + f * 0.4, hy - R * 0.62);
        ctx.quadraticCurveTo(hx - f * 2.2, hy - R * 0.45, hx - f * (R + 0.4), hy + R * (L.hair === 'long' ? 0.9 : 0.4));
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'bun':
      case 'side':
      default: {
        ctx.beginPath();
        ctx.arc(hx, hy, R + 0.3, Math.PI * 0.95, Math.PI * 2.05);
        ctx.quadraticCurveTo(hx + f * 2.5, hy - R * 0.55, hx + f * 0.8, hy - R * 0.62);
        ctx.quadraticCurveTo(hx - f * 1.5, hy - R * 0.4, hx - f * (R + 0.3), hy + 0.3);
        ctx.closePath();
        ctx.fill();
        // 가르마
        ctx.strokeStyle = hl;
        ctx.lineWidth = 0.4;
        ctx.beginPath();
        ctx.moveTo(hx - f * 1.6, hy - R - 0.1);
        ctx.quadraticCurveTo(hx - f * 1.2, hy - R * 0.7, hx - f * 0.4, hy - R * 0.55);
        ctx.stroke();
        break;
      }
    }
  }

  /* 표정: 눈썹 각도와 입 모양이 핵심 */
  function drawFace(ctx, v, cx, cy, R, f) {
    const L = v.look;
    const expr = v.expr || L.face;
    const gz = v.gaze || [f, 0];
    const gxo = U.clamp(gz[0], -1, 1) * 0.55;
    const gyo = U.clamp(gz[1], -1, 1) * 0.4;
    const ink = '#2a1d15';
    const eyeY = cy - 0.5;
    const ex = 1.9;
    const blink = v.blink || 0;
    ctx.fillStyle = ink;
    ctx.strokeStyle = ink;
    ctx.lineCap = 'round';

    // 눈
    const happyEyes = expr === 'relieved' || expr === 'joy';
    for (let s = -1; s <= 1; s += 2) {
      const x = cx + s * ex;
      if (happyEyes || blink > 0.6) {
        ctx.lineWidth = 0.42;
        ctx.beginPath();
        if (happyEyes) ctx.arc(x, eyeY + 0.35, 0.75, Math.PI * 1.15, Math.PI * 1.85);
        else {
          ctx.moveTo(x - 0.7, eyeY);
          ctx.lineTo(x + 0.7, eyeY);
        }
        ctx.stroke();
      } else {
        const er = expr === 'surprised' ? 0.8 : expr === 'smile' ? 0.55 : 0.62;
        ctx.beginPath();
        ctx.ellipse(x + gxo, eyeY + gyo, er, er * (expr === 'strain' ? 0.55 : 1.05), 0, 0, Math.PI * 2);
        ctx.fill();
        // 눈빛
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        circle(ctx, x + gxo + 0.2, eyeY + gyo - 0.25, 0.17);
        ctx.fill();
        ctx.fillStyle = ink;
      }
    }

    // 눈썹: [안쪽 높이, 바깥 높이]
    let bIn = -1.65;
    let bOut = -1.65;
    let bw = 0.5;
    switch (expr) {
      case 'grumpy':
        bIn = -1.05;
        bOut = -2.15;
        bw = 0.68;
        break;
      case 'stern':
        bIn = -1.45;
        bOut = -1.75;
        bw = 0.58;
        break;
      case 'smile':
        bIn = -2.0;
        bOut = -1.8;
        break;
      case 'smug':
        bIn = -1.6;
        bOut = -2.2;
        break;
      case 'strain':
        bIn = -1.25;
        bOut = -2.0;
        bw = 0.6;
        break;
      case 'sad':
        bIn = -2.3;
        bOut = -1.45;
        break;
      case 'worried':
        bIn = -2.1;
        bOut = -1.6;
        break;
      case 'surprised':
        bIn = -2.5;
        bOut = -2.4;
        break;
      case 'relieved':
      case 'joy':
        bIn = -2.1;
        bOut = -1.9;
        break;
      case 'calm':
      default:
        bIn = -1.75;
        bOut = -1.85;
    }
    ctx.lineWidth = bw;
    for (let s = -1; s <= 1; s += 2) {
      const x = cx + s * ex;
      ctx.beginPath();
      ctx.moveTo(x - s * 0.25, eyeY + bIn);
      ctx.lineTo(x + s * 1.25, eyeY + bOut);
      ctx.stroke();
    }

    // 콧수염
    if (L.acc === 'mustache') {
      ctx.fillStyle = L.hairColor === '#b8b2a6' ? '#9a948a' : L.hairColor;
      ctx.beginPath();
      ctx.moveTo(cx, cy + 1.7);
      ctx.quadraticCurveTo(cx - 1.8, cy + 1.2, cx - 2.6, cy + 2.4);
      ctx.quadraticCurveTo(cx - 1.4, cy + 2.6, cx, cy + 2.15);
      ctx.quadraticCurveTo(cx + 1.4, cy + 2.6, cx + 2.6, cy + 2.4);
      ctx.quadraticCurveTo(cx + 1.8, cy + 1.2, cx, cy + 1.7);
      ctx.fill();
      ctx.fillStyle = ink;
    }

    // 입
    const my = cy + 2.9;
    ctx.lineWidth = 0.45;
    ctx.beginPath();
    switch (expr) {
      case 'smile':
      case 'joy':
        ctx.arc(cx, my - 1.0, 1.35, Math.PI * 0.2, Math.PI * 0.8);
        ctx.stroke();
        break;
      case 'smug':
        ctx.moveTo(cx - 1.2, my);
        ctx.quadraticCurveTo(cx + 0.2, my + 0.5, cx + 1.4, my - 0.5);
        ctx.stroke();
        break;
      case 'relieved':
        ctx.arc(cx, my - 0.7, 1.0, Math.PI * 0.25, Math.PI * 0.75);
        ctx.stroke();
        break;
      case 'grumpy':
        ctx.arc(cx, my + 1.2, 1.3, Math.PI * 1.25, Math.PI * 1.75);
        ctx.stroke();
        break;
      case 'sad':
        ctx.arc(cx, my + 1.0, 1.0, Math.PI * 1.2, Math.PI * 1.8);
        ctx.stroke();
        break;
      case 'strain': {
        ctx.fillStyle = '#fff';
        roundRect(ctx, cx - 1.3, my - 0.55, 2.6, 1.1, 0.4);
        ctx.fill();
        ctx.lineWidth = 0.35;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - 1.2, my);
        ctx.lineTo(cx + 1.2, my);
        ctx.stroke();
        ctx.fillStyle = ink;
        break;
      }
      case 'surprised':
        ctx.ellipse(cx, my, 0.6, 0.8, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'worried':
        ctx.moveTo(cx - 1, my + 0.2);
        ctx.quadraticCurveTo(cx - 0.4, my - 0.4, cx, my);
        ctx.quadraticCurveTo(cx + 0.4, my + 0.4, cx + 1, my - 0.2);
        ctx.stroke();
        break;
      case 'stern':
      case 'calm':
      default:
        ctx.moveTo(cx - 1.0, my);
        ctx.lineTo(cx + 1.0, my);
        ctx.stroke();
    }
    // 홍조
    if (expr === 'smile' || expr === 'joy' || expr === 'relieved') {
      ctx.fillStyle = 'rgba(230,90,80,0.22)';
      circle(ctx, cx - 3.1, cy + 1.6, 0.9);
      ctx.fill();
      circle(ctx, cx + 3.1, cy + 1.6, 0.9);
      ctx.fill();
    }
  }

  /* 국기 (가상) */
  function drawFlag(ctx, nat, x, y, w, h) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.fillStyle = nat.color;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = nat.color2;
    switch (nat.flag) {
      case 'star': {
        const cx = x + w / 2;
        const cy = y + h / 2;
        const r = h * 0.36;
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          const rr = i % 2 ? r * 0.45 : r;
          ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'sun':
        ctx.beginPath();
        ctx.arc(x + w / 2, y + h / 2, h * 0.3, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'bicolor':
        ctx.fillRect(x, y + h / 2, w, h / 2);
        break;
      case 'diagonal':
        ctx.beginPath();
        ctx.moveTo(x, y + h);
        ctx.lineTo(x + w * 0.25, y + h);
        ctx.lineTo(x + w, y + h * 0.1);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w * 0.75, y);
        ctx.lineTo(x, y + h * 0.9);
        ctx.closePath();
        ctx.fill();
        break;
      case 'crescent':
        ctx.beginPath();
        ctx.arc(x + w * 0.45, y + h / 2, h * 0.32, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = nat.color;
        ctx.beginPath();
        ctx.arc(x + w * 0.55, y + h * 0.45, h * 0.27, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'pale':
        ctx.fillRect(x + w * 0.36, y, w * 0.28, h);
        break;
      case 'cross':
        ctx.fillRect(x + w * 0.3, y, w * 0.14, h);
        ctx.fillRect(x, y + h * 0.43, w, h * 0.14);
        break;
      case 'check':
        for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) if ((i + j) % 2) ctx.fillRect(x + (i * w) / 4, y + (j * h) / 3, w / 4, h / 3);
        break;
      case 'dots':
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.arc(x + w * (0.25 + i * 0.25), y + h / 2, h * 0.12, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = Math.max(0.1, h * 0.08);
    ctx.strokeRect(x, y, w, h);
  }
  D.drawFlag = drawFlag;
  D.roundRect = roundRect;
})(typeof window !== 'undefined' ? window : globalThis);
