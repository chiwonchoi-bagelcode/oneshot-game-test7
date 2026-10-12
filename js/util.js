/* 토르티야 정상회담 — 공용 유틸리티 */
(function (G) {
  'use strict';
  const TS = G.TS || (G.TS = {});
  const U = (TS.U = {});

  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.invLerp = (a, b, v) => U.clamp((v - a) / (b - a), 0, 1);
  U.smooth = (t) => {
    t = U.clamp(t, 0, 1);
    return t * t * (3 - 2 * t);
  };
  U.easeOutCubic = (t) => 1 - Math.pow(1 - U.clamp(t, 0, 1), 3);
  U.easeInCubic = (t) => Math.pow(U.clamp(t, 0, 1), 3);
  U.easeOutBack = (t, s = 1.70158) => {
    t = U.clamp(t, 0, 1) - 1;
    return t * t * ((s + 1) * t + s) + 1;
  };
  U.easeInOut = (t) => {
    t = U.clamp(t, 0, 1);
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  };
  U.dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
  U.angleLerp = (a, b, t) => {
    let d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    return a + d * t;
  };

  /* xorshift32 시드 난수 */
  U.rng = function (seed) {
    let s = (seed >>> 0) || 0x9e3779b9;
    const f = function () {
      s ^= s << 13;
      s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5;
      s >>>= 0;
      return s / 4294967296;
    };
    f.range = (a, b) => a + (b - a) * f();
    f.int = (a, b) => Math.floor(a + (b - a + 1) * f());
    f.pick = (arr) => arr[Math.floor(f() * arr.length)];
    f.sign = () => (f() < 0.5 ? -1 : 1);
    return f;
  };

  /* 값 노이즈 (1D, 2D) */
  U.makeNoise = function (seed) {
    const r = U.rng(seed);
    const N = 256;
    const perm = new Uint8Array(N * 2);
    const vals = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      perm[i] = i;
      vals[i] = r() * 2 - 1;
    }
    for (let i = N - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = perm[i];
      perm[i] = perm[j];
      perm[j] = t;
    }
    for (let i = 0; i < N; i++) perm[N + i] = perm[i];
    const fade = (t) => t * t * (3 - 2 * t);
    const n1 = (x) => {
      const xi = Math.floor(x);
      const xf = x - xi;
      const a = vals[perm[xi & 255]];
      const b = vals[perm[(xi + 1) & 255]];
      return a + (b - a) * fade(xf);
    };
    const n2 = (x, y) => {
      const xi = Math.floor(x);
      const yi = Math.floor(y);
      const xf = x - xi;
      const yf = y - yi;
      const h = (i, j) => vals[perm[(perm[i & 255] + j) & 511 & 255]];
      const v00 = h(xi, yi);
      const v10 = h(xi + 1, yi);
      const v01 = h(xi, yi + 1);
      const v11 = h(xi + 1, yi + 1);
      const u = fade(xf);
      const v = fade(yf);
      return (v00 + (v10 - v00) * u) * (1 - v) + (v01 + (v11 - v01) * u) * v;
    };
    const fbm2 = (x, y, oct = 4) => {
      let s = 0;
      let a = 0.5;
      let f = 1;
      let norm = 0;
      for (let i = 0; i < oct; i++) {
        s += a * n2(x * f, y * f);
        norm += a;
        a *= 0.5;
        f *= 2.03;
      }
      return s / norm;
    };
    return { n1, n2, fbm2 };
  };

  /* 기하 */
  U.segIntersect = function (ax, ay, bx, by, cx, cy, dx, dy) {
    const rx = bx - ax;
    const ry = by - ay;
    const sx = dx - cx;
    const sy = dy - cy;
    const den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-12) return null;
    const qx = cx - ax;
    const qy = cy - ay;
    const t = (qx * sy - qy * sx) / den;
    const u = (qx * ry - qy * rx) / den;
    if (t < 0 || t >= 1 || u < 0 || u >= 1) return null;
    return { t, u, x: ax + rx * t, y: ay + ry * t };
  };

  U.distToSeg = function (px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = U.clamp(t, 0, 1);
    const qx = ax + dx * t;
    const qy = ay + dy * t;
    return { d: Math.hypot(px - qx, py - qy), t, x: qx, y: qy };
  };

  U.polyArea = function (pts) {
    let a = 0;
    for (let i = 0, n = pts.length; i < n; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % n];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return a / 2;
  };

  U.polyCentroid = function (pts) {
    let a = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0, n = pts.length; i < n; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % n];
      const c = p[0] * q[1] - q[0] * p[1];
      a += c;
      cx += (p[0] + q[0]) * c;
      cy += (p[1] + q[1]) * c;
    }
    a /= 2;
    if (Math.abs(a) < 1e-9) return [pts[0][0], pts[0][1]];
    return [cx / (6 * a), cy / (6 * a)];
  };

  U.pointInPoly = function (x, y, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i][0];
      const yi = pts[i][1];
      const xj = pts[j][0];
      const yj = pts[j][1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };

  U.polylineLength = function (pts) {
    let l = 0;
    for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return l;
  };

  /* 폴리라인 위 거리 s 지점 */
  U.pointAlong = function (pts, s) {
    if (s <= 0) return [pts[0][0], pts[0][1], 0];
    for (let i = 1; i < pts.length; i++) {
      const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (s <= l) {
        const t = l > 0 ? s / l : 0;
        return [U.lerp(pts[i - 1][0], pts[i][0], t), U.lerp(pts[i - 1][1], pts[i][1], t), i - 1];
      }
      s -= l;
    }
    const p = pts[pts.length - 1];
    return [p[0], p[1], pts.length - 2];
  };

  /* 폴리라인의 0..s 구간 */
  U.subPolyline = function (pts, s0, s1) {
    const out = [];
    let acc = 0;
    if (s1 < s0) {
      const t = s0;
      s0 = s1;
      s1 = t;
    }
    const a = U.pointAlong(pts, s0);
    out.push([a[0], a[1]]);
    for (let i = 1; i < pts.length; i++) {
      const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      acc += l;
      if (acc > s0 && acc < s1) out.push([pts[i][0], pts[i][1]]);
      if (acc >= s1) break;
    }
    const b = U.pointAlong(pts, s1);
    out.push([b[0], b[1]]);
    return out;
  };

  /* Catmull-Rom 보간 (제어점 → 부드러운 곡선) */
  U.catmull = function (ctrl, step) {
    const out = [];
    const P = (i) => ctrl[U.clamp(i, 0, ctrl.length - 1)];
    for (let i = 0; i < ctrl.length - 1; i++) {
      const p0 = P(i - 1);
      const p1 = P(i);
      const p2 = P(i + 1);
      const p3 = P(i + 2);
      const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const n = Math.max(2, Math.ceil(len / step));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        const t2 = t * t;
        const t3 = t2 * t;
        const x =
          0.5 *
          (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
        const y =
          0.5 *
          (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
        out.push([x, y]);
      }
    }
    out.push([ctrl[ctrl.length - 1][0], ctrl[ctrl.length - 1][1]]);
    return out;
  };

  U.hexToRgb = function (h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  U.rgb = (r, g, b, a) => (a === undefined ? `rgb(${r | 0},${g | 0},${b | 0})` : `rgba(${r | 0},${g | 0},${b | 0},${a})`);
  U.mixHex = function (h1, h2, t, a) {
    const c1 = U.hexToRgb(h1);
    const c2 = U.hexToRgb(h2);
    return U.rgb(U.lerp(c1[0], c2[0], t), U.lerp(c1[1], c2[1], t), U.lerp(c1[2], c2[2], t), a);
  };
  U.shade = function (h, f, a) {
    const c = U.hexToRgb(h);
    if (f >= 0) return U.rgb(c[0] + (255 - c[0]) * f, c[1] + (255 - c[1]) * f, c[2] + (255 - c[2]) * f, a);
    return U.rgb(c[0] * (1 + f), c[1] * (1 + f), c[2] * (1 + f), a);
  };

  /* 한국어 조사: 받침 여부에 따라 이/가, 을/를, 와/과, 은/는 */
  U.josa = function (word, pair) {
    const ch = word.charCodeAt(word.length - 1);
    const has = ch >= 0xac00 && ch <= 0xd7a3 && (ch - 0xac00) % 28 !== 0;
    const [a, b] = pair.split('/');
    return word + (has ? a : b);
  };

  /* 간단한 스프링 */
  U.spring = function (cur, vel, target, k, damp, dt) {
    const a = (target - cur) * k - vel * damp;
    vel += a * dt;
    cur += vel * dt;
    return [cur, vel];
  };
})(typeof window !== 'undefined' ? window : globalThis);
