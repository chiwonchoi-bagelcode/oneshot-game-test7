/* 식탁 위 물그릇과 공동 구조선 */
(function (G) {
  'use strict';
  const TS = G.TS || (G.TS = {});
  const U = TS.U;
  const Props = TS.Props;
  const S = (TS.Ship = {});

  S.ORDER = ['hull', 'mast', 'deck', 'flag', 'oars', 'rail', 'helm', 'ring', 'cabin', 'anchor', 'bunting', 'lamp'];

  /* 그릇 그리기: 중심 (x,y), 가로 반지름 rx */
  S.drawBowl = function (ctx, x, y, rx, t, ripples) {
    const ry = rx * 0.36;
    ctx.save();
    // 그림자
    ctx.fillStyle = 'rgba(8,14,10,0.45)';
    ctx.beginPath();
    ctx.ellipse(x, y + ry * 0.55, rx * 1.03, ry * 1.08, 0, 0, Math.PI * 2);
    ctx.fill();
    // 바깥 몸통
    const body = ctx.createLinearGradient(x - rx, 0, x + rx, 0);
    body.addColorStop(0, '#c9cfd2');
    body.addColorStop(0.35, '#f7f7f2');
    body.addColorStop(1, '#b7bfc4');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, Math.PI, 0, true);
    ctx.lineTo(x + rx, y);
    ctx.bezierCurveTo(x + rx * 0.95, y + ry * 1.25, x - rx * 0.95, y + ry * 1.25, x - rx, y);
    ctx.fill();
    // 파란 무늬 띠
    ctx.strokeStyle = 'rgba(40,80,150,0.55)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI;
      const px = x - Math.cos(a) * rx * 0.97;
      const py = y + Math.sin(a) * ry * 0.62 + Math.sin(i * 1.7) * 1.2;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.stroke();
    // 테두리
    ctx.fillStyle = '#fbfbf7';
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2f5c9e';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(x, y, rx * 0.985, ry * 0.97, 0, 0, Math.PI * 2);
    ctx.stroke();
    // 물
    const wr = rx * 0.9;
    const wry = ry * 0.84;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(x, y + ry * 0.04, wr, wry, 0, 0, Math.PI * 2);
    ctx.clip();
    const wg = ctx.createLinearGradient(0, y - wry, 0, y + wry);
    wg.addColorStop(0, '#3f8da8');
    wg.addColorStop(1, '#7fc3cf');
    ctx.fillStyle = wg;
    ctx.fillRect(x - wr, y - wry * 1.2, wr * 2, wry * 2.6);
    // 그릇 안쪽 그늘
    ctx.fillStyle = 'rgba(20,50,70,0.3)';
    ctx.beginPath();
    ctx.ellipse(x, y - wry * 0.95, wr * 1.05, wry * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // 반짝임
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 7; i++) {
      const px = x + Math.sin(i * 2.3 + t * 0.4) * wr * 0.7;
      const py = y + Math.cos(i * 1.7) * wry * 0.6;
      const w = 6 + (i % 3) * 4;
      ctx.beginPath();
      ctx.moveTo(px - w, py);
      ctx.quadraticCurveTo(px, py - 1.5 + Math.sin(t * 2 + i) * 0.8, px + w, py);
      ctx.stroke();
    }
    // 물결 고리
    if (ripples) {
      for (const r of ripples) {
        const k = r.t / r.life;
        ctx.strokeStyle = `rgba(255,255,255,${0.6 * (1 - k)})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(r.x, r.y, 6 + k * rx * 0.6, (6 + k * rx * 0.6) * 0.35, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
    ctx.restore();
    return { wr, wry };
  };

  /* 배: built = Set(부품), plan = Set(설계도에 표시할 부품) */
  S.drawShip = function (ctx, x, y, scale, t, built, plan, glow) {
    const bobY = Math.sin(t * 1.6) * 1.2 * scale;
    const roll = Math.sin(t * 1.1) * 0.035;
    ctx.save();
    ctx.translate(x, y + bobY);
    ctx.rotate(roll);
    ctx.scale(scale, scale);
    const has = (p) => built.has(p);
    const ghost = (p) => !built.has(p) && plan.has(p);
    const g = (p) => glow && glow[p] ? glow[p] : 0;

    const ghostStyle = () => {
      ctx.setLineDash([2.5, 2.5]);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 0.9;
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
    };

    // 노 (물 아래로)
    if (has('oars') || ghost('oars')) {
      for (let i = 0; i < 3; i++) {
        const ox = -18 + i * 16;
        ctx.save();
        if (ghost('oars')) ghostStyle();
        else {
          ctx.strokeStyle = '#a8743f';
          ctx.lineWidth = 1.8;
        }
        ctx.beginPath();
        ctx.moveTo(ox, 2);
        ctx.lineTo(ox + 7, 15 + Math.sin(t * 2 + i) * 1.2);
        ctx.stroke();
        if (has('oars')) {
          ctx.fillStyle = '#b5773d';
          ctx.beginPath();
          ctx.ellipse(ox + 8, 16 + Math.sin(t * 2 + i) * 1.2, 2.2, 1.1, 1.1, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    // 돛대와 돛
    if (has('mast') || ghost('mast')) {
      ctx.save();
      if (ghost('mast')) {
        ghostStyle();
        ctx.beginPath();
        ctx.moveTo(2, -6);
        ctx.lineTo(2, -62);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(4, -58);
        ctx.quadraticCurveTo(26, -40, 30, -12);
        ctx.lineTo(4, -12);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.strokeStyle = '#6e4420';
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(2, -4);
        ctx.lineTo(2, -62);
        ctx.stroke();
        ctx.strokeStyle = '#a8743f';
        ctx.lineWidth = 1.6;
        ctx.stroke();
        Props.drawSail(ctx, [4, -58], [4, -12], [30 + Math.sin(t * 1.3) * 0.8, -12], 7 + Math.sin(t * 1.7) * 1.5, 0, 1);
        if (g('mast')) {
          ctx.globalAlpha = g('mast');
          ctx.fillStyle = '#fff6c9';
          ctx.beginPath();
          ctx.moveTo(4, -58);
          ctx.lineTo(30, -12);
          ctx.lineTo(4, -12);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    // 깃발
    if (has('flag') || ghost('flag')) {
      ctx.save();
      if (ghost('flag')) {
        ghostStyle();
        ctx.beginPath();
        ctx.rect(-14, -70, 15, 9);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(2, -62);
        ctx.lineTo(2, -72);
        ctx.stroke();
      } else {
        ctx.strokeStyle = '#6e4420';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(2, -60);
        ctx.lineTo(2, -73);
        ctx.stroke();
        Props.drawFlag(ctx, [1.5, -72], [-16, -72 + Math.sin(t * 3) * 0.6], 9, t, 1.2, 0);
      }
      ctx.restore();
    }

    // 선체
    const hullPath = () => {
      ctx.beginPath();
      ctx.moveTo(-46, -8);
      ctx.quadraticCurveTo(-40, 12, -18, 13);
      ctx.lineTo(22, 13);
      ctx.quadraticCurveTo(44, 10, 52, -12);
      ctx.lineTo(40, -6);
      ctx.lineTo(-38, -4);
      ctx.closePath();
    };
    if (has('hull')) {
      ctx.save();
      hullPath();
      const hg = ctx.createLinearGradient(0, -10, 0, 14);
      hg.addColorStop(0, '#c48a4c');
      hg.addColorStop(1, '#7a4a22');
      ctx.fillStyle = hg;
      ctx.fill();
      ctx.clip();
      ctx.strokeStyle = 'rgba(70,40,15,0.5)';
      ctx.lineWidth = 0.7;
      for (let k = 0; k < 4; k++) {
        ctx.beginPath();
        ctx.moveTo(-48, -3 + k * 4.2);
        ctx.quadraticCurveTo(0, 1 + k * 4.2, 54, -9 + k * 4.4);
        ctx.stroke();
      }
      ctx.fillStyle = '#c8452c';
      ctx.fillRect(-50, 4.5, 110, 2.4);
      // 수면 아래 반투명
      ctx.fillStyle = 'rgba(60,140,170,0.45)';
      ctx.fillRect(-60, 9.5, 120, 10);
      ctx.restore();
      if (g('hull')) {
        ctx.save();
        ctx.globalAlpha = g('hull');
        hullPath();
        ctx.fillStyle = '#fff6c9';
        ctx.fill();
        ctx.restore();
      }
    } else if (ghost('hull')) {
      ctx.save();
      ghostStyle();
      hullPath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // 갑판
    if (has('deck') || ghost('deck')) {
      ctx.save();
      if (ghost('deck')) ghostStyle();
      else ctx.fillStyle = '#d9a36a';
      ctx.beginPath();
      ctx.moveTo(-38, -4);
      ctx.lineTo(40, -6);
      ctx.lineTo(37, -9);
      ctx.lineTo(-35, -7.5);
      ctx.closePath();
      ctx.fill();
      if (ghost('deck')) ctx.stroke();
      else {
        ctx.strokeStyle = 'rgba(110,62,26,0.5)';
        ctx.lineWidth = 0.5;
        for (let i = -30; i < 38; i += 7) {
          ctx.beginPath();
          ctx.moveTo(i, -4.2 - (i + 38) * 0.026);
          ctx.lineTo(i + 2, -7.6 - (i + 38) * 0.02);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // 선실
    if (has('cabin') || ghost('cabin')) {
      ctx.save();
      if (ghost('cabin')) {
        ghostStyle();
        ctx.beginPath();
        ctx.rect(-30, -18, 18, 11);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillStyle = '#b77a3f';
        ctx.fillRect(-30, -17, 18, 11);
        ctx.fillStyle = '#7f4f25';
        ctx.fillRect(-31.5, -19, 21, 2.6);
        ctx.fillStyle = '#9ad3e0';
        ctx.fillRect(-26, -14, 4, 4);
        ctx.fillRect(-19, -14, 4, 4);
        if (g('cabin')) {
          ctx.globalAlpha = g('cabin');
          ctx.fillStyle = '#fff6c9';
          ctx.fillRect(-31.5, -19, 21, 13);
        }
      }
      ctx.restore();
    }

    // 닻
    if (has('anchor') || ghost('anchor')) {
      ctx.save();
      if (ghost('anchor')) {
        ghostStyle();
        ctx.beginPath();
        ctx.moveTo(47, -6);
        ctx.lineTo(50, 6);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(50, 8, 3, 0, Math.PI);
        ctx.stroke();
      } else {
        ctx.strokeStyle = '#3c3f45';
        ctx.lineWidth = 0.8;
        ctx.setLineDash([1.2, 0.8]);
        ctx.beginPath();
        ctx.moveTo(46, -7);
        ctx.quadraticCurveTo(50, -2, 49, 2);
        ctx.stroke();
        ctx.setLineDash([]);
        Props.drawAnchor(ctx, [49, 1.5], 10, Math.sin(t * 1.3) * 0.08);
      }
      ctx.restore();
    }

    // 난간
    if (has('rail') || ghost('rail')) {
      ctx.save();
      if (ghost('rail')) ghostStyle();
      else {
        ctx.strokeStyle = '#7f4f25';
        ctx.lineWidth = 1.1;
      }
      ctx.beginPath();
      ctx.moveTo(10, -13);
      ctx.lineTo(42, -15);
      for (let i = 0; i < 6; i++) {
        const px = 11 + i * 6;
        ctx.moveTo(px, -13 - i * 0.35);
        ctx.lineTo(px, -6.5 - i * 0.3);
      }
      ctx.stroke();
      ctx.restore();
    }

    // 조타륜
    if (has('helm') || ghost('helm')) {
      ctx.save();
      if (ghost('helm')) {
        ghostStyle();
        ctx.beginPath();
        ctx.arc(-40, -16, 5, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.strokeStyle = '#6e4420';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(-40, -6);
        ctx.lineTo(-40, -15);
        ctx.stroke();
        Props.drawPartIcon(ctx, 'helm', -40, -16, 11, Math.sin(t) * 0.3);
      }
      ctx.restore();
    }

    // 구명환
    if (has('ring') || ghost('ring')) {
      ctx.save();
      if (ghost('ring')) {
        ghostStyle();
        ctx.beginPath();
        ctx.arc(26, 0, 4, 0, Math.PI * 2);
        ctx.stroke();
      } else Props.drawPartIcon(ctx, 'ring', 26, 0, 10, 0);
      ctx.restore();
    }
    // 뱃머리 등
    if (has('lamp') || ghost('lamp')) {
      ctx.save();
      if (ghost('lamp')) {
        ghostStyle();
        ctx.beginPath();
        ctx.moveTo(44, -7);
        ctx.lineTo(44, -22);
        ctx.stroke();
        ctx.beginPath();
        ctx.rect(41.5, -21, 5, 6);
        ctx.stroke();
      } else {
        ctx.strokeStyle = '#6e4420';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(44, -7);
        ctx.lineTo(44, -24);
        ctx.lineTo(47, -24);
        ctx.stroke();
        Props.drawLantern(ctx, [47, -24], 8, 0.8 + 0.2 * Math.sin(t * 3), Math.sin(t * 1.4) * 0.12);
      }
      ctx.restore();
    }

    // 만국기
    if (has('bunting') || ghost('bunting')) {
      ctx.save();
      if (ghost('bunting')) {
        ghostStyle();
        ctx.beginPath();
        ctx.moveTo(-44, -8);
        ctx.quadraticCurveTo(-20, -30, 2, -64);
        ctx.quadraticCurveTo(30, -34, 50, -12);
        ctx.stroke();
      } else {
        const cols = ['#d23b35', '#2f6fd0', '#e8b326', '#2f9a58', '#7d4bc2', '#ee7d2b', '#1f9aa0', '#c4487e'];
        Props.drawBunting(ctx, [2, -64], [50, -12], 5, t, cols, 0.8);
        Props.drawBunting(ctx, [2, -64], [-44, -8], 5, t + 1, cols.slice().reverse(), 0.8);
      }
      ctx.restore();
    }
    ctx.restore();
  };
})(typeof window !== 'undefined' ? window : globalThis);
