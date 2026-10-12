/* 효과: 부스러기, 말풍선, 표식, 날아가는 부품 */
(function (G) {
  'use strict';
  const TS = G.TS || (G.TS = {});
  const U = TS.U;
  const FX = (TS.FX = {});

  const CRUMB_COLORS = ['#e9c37c', '#d9a656', '#c98f43', '#f1d9a0', '#b97a35', '#8d5524'];

  FX.create = function () {
    return { crumbs: [], landed: [], tableCrumbs: [], bubbles: [], marks: [], flyers: [], sparks: [], rnd: U.rng(1234) };
  };

  /* 월드 판 좌표에서 부스러기 튀기기 */
  FX.burst = function (fx, x, y, n, power, dir) {
    const r = fx.rnd;
    for (let i = 0; i < n; i++) {
      const a = dir !== undefined ? dir + r.range(-1.2, 1.2) : r.range(0, Math.PI * 2);
      const sp = r.range(6, 28) * (power || 1);
      fx.crumbs.push({
        x: x + r.range(-1, 1),
        y: y + r.range(-1, 1),
        z: r.range(0.2, 1.5),
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        vz: r.range(10, 38) * (power || 1),
        rot: r.range(0, 6.28),
        vr: r.range(-14, 14),
        size: r.range(0.45, 1.5) * (r() < 0.12 ? 1.8 : 1),
        color: r.pick(CRUMB_COLORS),
        sides: r.int(3, 5),
        life: 0,
      });
    }
  };

  FX.spark = function (fx, x, y) {
    fx.sparks.push({ x, y, t: 0, life: 0.18 });
  };

  /* 말풍선 */
  FX.say = function (fx, who, text, dur, kind) {
    fx.bubbles = fx.bubbles.filter((b) => b.who !== who);
    fx.bubbles.push({ who, text, t: 0, dur: dur || 2.2, kind: kind || 'say' });
  };
  FX.clearSay = function (fx, who) {
    fx.bubbles = fx.bubbles.filter((b) => b.who !== who);
  };

  FX.mark = function (fx, m) {
    m.t = 0;
    fx.marks.push(m);
    return m;
  };

  FX.fly = function (fx, part, from, to, onArrive) {
    fx.flyers.push({ part, from, to, t: 0, dur: 1.05, onArrive });
  };

  /* 갱신: landFn(x,y) → {face, lx, ly} | null(식탁) */
  FX.update = function (fx, dt, landFn) {
    for (const c of fx.crumbs) {
      c.life += dt;
      c.vz -= 120 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.z += c.vz * dt;
      c.rot += c.vr * dt;
      c.vx *= 1 - 1.2 * dt;
      c.vy *= 1 - 1.2 * dt;
      if (c.z <= 0) {
        if (Math.abs(c.vz) > 14 && !c.bounced) {
          c.vz = -c.vz * 0.32;
          c.z = 0.01;
          c.bounced = true;
          c.vx *= 0.5;
          c.vy *= 0.5;
        } else {
          c.dead = true;
          const L = landFn ? landFn(c.x, c.y) : null;
          if (L) fx.landed.push({ face: L.face, lx: L.lx, ly: L.ly, rot: c.rot, size: c.size, color: c.color, sides: c.sides });
          else fx.tableCrumbs.push({ x: c.x, y: c.y, rot: c.rot, size: c.size, color: c.color, sides: c.sides });
        }
      }
    }
    fx.crumbs = fx.crumbs.filter((c) => !c.dead);
    if (fx.landed.length > 260) fx.landed.splice(0, fx.landed.length - 260);
    if (fx.tableCrumbs.length > 260) fx.tableCrumbs.splice(0, fx.tableCrumbs.length - 260);
    for (const b of fx.bubbles) b.t += dt;
    fx.bubbles = fx.bubbles.filter((b) => b.t < b.dur);
    for (const m of fx.marks) m.t += dt;
    fx.marks = fx.marks.filter((m) => !m.life || m.t < m.life);
    for (const s of fx.sparks) s.t += dt;
    fx.sparks = fx.sparks.filter((s) => s.t < s.life);
    for (const f of fx.flyers) {
      f.t += dt;
      if (f.t >= f.dur && !f.done) {
        f.done = true;
        if (f.onArrive) f.onArrive();
      }
    }
    fx.flyers = fx.flyers.filter((f) => !f.done);
  };

  function crumbShape(ctx, x, y, r, rot, sides, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = rot + (i / sides) * Math.PI * 2;
      const rr = r * (0.7 + 0.3 * Math.sin(i * 2.3 + rot));
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.75);
    }
    ctx.closePath();
    ctx.fill();
  }
  FX.crumbShape = crumbShape;

  FX.drawTableCrumbs = function (fx, ctx, view) {
    for (const c of fx.tableCrumbs) {
      const sx = view.cx + c.x * view.S;
      const sy = view.cy + c.y * view.S * view.K + view.thick + 1;
      crumbShape(ctx, sx, sy, c.size * view.S * 0.55, c.rot, c.sides, c.color);
    }
  };

  FX.drawLanded = function (fx, ctx, view, faceToTf) {
    for (const c of fx.landed) {
      const tf = faceToTf(c.face);
      if (!tf) continue;
      const s = TS.Tortilla.toScreen(view, tf, c.lx, c.ly, 0);
      ctx.fillStyle = 'rgba(80,40,10,0.25)';
      ctx.beginPath();
      ctx.ellipse(s[0] + 0.4, s[1] + 0.6, c.size * view.S * 0.55, c.size * view.S * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      crumbShape(ctx, s[0], s[1], c.size * view.S * 0.55, c.rot, c.sides, c.color);
    }
  };

  FX.drawAir = function (fx, ctx, view) {
    for (const c of fx.crumbs) {
      const sx = view.cx + c.x * view.S;
      const sy = view.cy + c.y * view.S * view.K - c.z * view.S;
      crumbShape(ctx, sx, sy, c.size * view.S * 0.55, c.rot, c.sides, c.color);
    }
    for (const s of fx.sparks) {
      const k = s.t / s.life;
      const sx = view.cx + s.x * view.S;
      const sy = view.cy + s.y * view.S * view.K;
      ctx.fillStyle = `rgba(255,248,220,${0.9 * (1 - k)})`;
      ctx.beginPath();
      ctx.arc(sx, sy, (1.5 + k * 3) * view.S * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  /* 말풍선 그리기: headPos(who) → [x,y] */
  FX.drawBubbles = function (fx, ctx, headPos, W) {
    ctx.save();
    ctx.font = '600 12.5px "Gowun Dodum", sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    // 배치: 겹치면 위로 쌓는다
    const placed = [];
    const items = [];
    for (const b of fx.bubbles) {
      const hp = headPos(b.who);
      if (!hp) continue;
      const tw = ctx.measureText(b.text).width;
      const w = tw + 16;
      const h = 22;
      const x = U.clamp(hp[0], w / 2 + 4, W - w / 2 - 4);
      items.push({ b, hp, w, h, x, y: hp[1] - 10 - h / 2 });
    }
    items.sort((p, q) => q.y - p.y);
    for (const it of items) {
      let moved = true;
      let guard = 0;
      while (moved && guard++ < 8) {
        moved = false;
        for (const r of placed) {
          if (Math.abs(it.x - r.x) < (it.w + r.w) / 2 + 2 && Math.abs(it.y - r.y) < (it.h + r.h) / 2 + 2) {
            it.y = r.y - (it.h + r.h) / 2 - 3;
            moved = true;
          }
        }
      }
      placed.push(it);
    }
    for (const it of items) {
      const b = it.b;
      const hp = it.hp;
      const fin = U.smooth(b.t / 0.18);
      const fout = 1 - U.smooth((b.t - (b.dur - 0.3)) / 0.3);
      const a = Math.min(fin, fout);
      if (a <= 0) continue;
      const w = it.w;
      const h = it.h;
      const x = it.x;
      const y = it.y - (1 - fin) * 4;
      ctx.globalAlpha = a;
      ctx.fillStyle = b.kind === 'think' ? 'rgba(255,253,246,0.92)' : b.kind === 'sad' ? '#efe6ff' : '#fffaf0';
      ctx.strokeStyle = 'rgba(70,45,25,0.45)';
      ctx.lineWidth = 1;
      TS.Diplomat.roundRect(ctx, x - w / 2, y - h / 2, w, h, 9);
      ctx.fill();
      ctx.stroke();
      // 꼬리
      ctx.beginPath();
      const tx = U.clamp(hp[0], x - w / 2 + 10, x + w / 2 - 10);
      if (b.kind === 'think') {
        ctx.arc(tx, y + h / 2 + 4, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(tx + 1, y + h / 2 + 8.5, 1.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        const tail = Math.max(6, hp[1] - 4 - (y + h / 2));
        ctx.moveTo(tx - 4, y + h / 2 - 0.5);
        ctx.lineTo(tx, y + h / 2 + tail);
        ctx.lineTo(tx + 4, y + h / 2 - 0.5);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(tx - 4, y + h / 2);
        ctx.lineTo(tx, y + h / 2 + tail);
        ctx.lineTo(tx + 4, y + h / 2);
        ctx.stroke();
      }
      ctx.fillStyle = '#3a2a1c';
      ctx.fillText(b.text, x, y + 0.5);
    }
    ctx.restore();
  };
})(typeof window !== 'undefined' ? window : globalThis);
