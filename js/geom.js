/* 토르티야 정상회담 — 금(crack) 네트워크와 조각 계산
 * 판 좌표: 중심 (0,0), 반지름 약 100, x 오른쪽, y 화면 아래(앞쪽).
 * 모든 금은 테두리 밖이나 다른 금 너머까지 살짝 뻗게 작성하고, 첫/마지막 교차점에서 잘라낸다.
 */
(function (G) {
  'use strict';
  const TS = G.TS || (G.TS = {});
  const U = TS.U;
  const Geom = (TS.Geom = {});

  function makeRim(R, seed) {
    const r = U.rng(seed * 7 + 3);
    const nz = U.makeNoise(seed * 13 + 5);
    const M = 180;
    const waves = [
      [2, r.range(0.006, 0.012), r.range(0, 6.28)],
      [3, r.range(0.01, 0.018), r.range(0, 6.28)],
      [5, r.range(0.004, 0.009), r.range(0, 6.28)],
      [7, r.range(0.002, 0.005), r.range(0, 6.28)],
    ];
    const pts = [];
    for (let i = 0; i < M; i++) {
      const th = (i / M) * Math.PI * 2;
      let f = 1;
      for (const w of waves) f += w[1] * Math.sin(w[0] * th + w[2]);
      f += nz.n1(i * 0.9) * 0.006;
      pts.push([Math.cos(th) * R * f, Math.sin(th) * R * f]);
    }
    return pts;
  }

  function jagged(ctrl, seed) {
    const nz = U.makeNoise(seed);
    const base = U.catmull(ctrl, 2.6);
    // 호 길이 재표본
    const total = U.polylineLength(base);
    const step = 2.4;
    const n = Math.max(2, Math.round(total / step));
    const out = [];
    for (let i = 0; i <= n; i++) {
      const s = (i / n) * total;
      const p = U.pointAlong(base, s);
      const q = U.pointAlong(base, Math.min(total, s + 1.2));
      const o = U.pointAlong(base, Math.max(0, s - 1.2));
      let tx = q[0] - o[0];
      let ty = q[1] - o[1];
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      const off = nz.n1(s * 0.16 + 3.1) * 2.1 + nz.n1(s * 0.55 + 9.7) * 0.9 + nz.n1(s * 1.7 + 1.3) * 0.35;
      out.push([p[0] - ty * off, p[1] + tx * off]);
    }
    return out;
  }

  function dedupe(pts) {
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const a = out[out.length - 1];
      if (Math.hypot(pts[i][0] - a[0], pts[i][1] - a[1]) > 1e-6) out.push(pts[i]);
    }
    return out;
  }

  Geom.build = function (spec) {
    const R = spec.R || 100;
    const seed = spec.seed || 1;
    const rim = makeRim(R, seed);
    const M = rim.length;
    const cracks = spec.cracks.map((c, i) => ({
      id: c.id,
      index: i,
      label: c.label || c.id,
      pts: jagged(c.pts, seed * 101 + i * 17 + 7),
      hits: [],
      edges: [],
      nodes: [],
    }));
    const nodes = [];
    const rimHits = [];
    const mkNode = (x, y, kind) => {
      const n = { id: nodes.length, x, y, kind, edges: [] };
      nodes.push(n);
      return n;
    };

    // 금 × 테두리
    for (const c of cracks) {
      const P = c.pts;
      for (let k = 0; k < P.length - 1; k++) {
        const ax = P[k][0];
        const ay = P[k][1];
        const bx = P[k + 1][0];
        const by = P[k + 1][1];
        for (let m = 0; m < M; m++) {
          const p = rim[m];
          const q = rim[(m + 1) % M];
          const hit = U.segIntersect(ax, ay, bx, by, p[0], p[1], q[0], q[1]);
          if (hit) {
            const node = mkNode(hit.x, hit.y, 'rim');
            c.hits.push({ param: k + hit.t, node: node.id });
            rimHits.push({ param: m + hit.u, node: node.id });
          }
        }
      }
    }
    // 금 × 금
    for (let i = 0; i < cracks.length; i++) {
      for (let j = i + 1; j < cracks.length; j++) {
        const A = cracks[i].pts;
        const B = cracks[j].pts;
        for (let k = 0; k < A.length - 1; k++) {
          const ax = A[k][0];
          const ay = A[k][1];
          const bx = A[k + 1][0];
          const by = A[k + 1][1];
          const minx = Math.min(ax, bx);
          const maxx = Math.max(ax, bx);
          const miny = Math.min(ay, by);
          const maxy = Math.max(ay, by);
          for (let m = 0; m < B.length - 1; m++) {
            const cx = B[m][0];
            const cy = B[m][1];
            const dx = B[m + 1][0];
            const dy = B[m + 1][1];
            if (Math.max(cx, dx) < minx || Math.min(cx, dx) > maxx || Math.max(cy, dy) < miny || Math.min(cy, dy) > maxy) continue;
            const hit = U.segIntersect(ax, ay, bx, by, cx, cy, dx, dy);
            if (hit) {
              const node = mkNode(hit.x, hit.y, 'cross');
              cracks[i].hits.push({ param: k + hit.t, node: node.id });
              cracks[j].hits.push({ param: m + hit.u, node: node.id });
            }
          }
        }
      }
    }

    const edges = [];
    const mkEdge = (kind, crack, a, b, pts) => {
      const e = { id: edges.length, kind, crack, a, b, pts: dedupe(pts), faces: [-1, -1], idx: -1 };
      e.len = U.polylineLength(e.pts);
      const mid = U.pointAlong(e.pts, e.len / 2);
      e.mid = [mid[0], mid[1]];
      edges.push(e);
      nodes[a].edges.push(e.id);
      nodes[b].edges.push(e.id);
      return e;
    };

    // 금 가장자리 (첫/마지막 교차점 사이만 남긴다)
    const unused = new Set();
    for (const c of cracks) {
      c.hits.sort((p, q) => p.param - q.param);
      if (c.hits.length < 2) throw new Error('crack ' + c.id + ' has <2 intersections');
      for (let q = 0; q < c.hits.length - 1; q++) {
        const h0 = c.hits[q];
        const h1 = c.hits[q + 1];
        const n0 = nodes[h0.node];
        const n1 = nodes[h1.node];
        const pts = [[n0.x, n0.y]];
        for (let idx = Math.floor(h0.param) + 1; idx <= Math.floor(h1.param); idx++) pts.push([c.pts[idx][0], c.pts[idx][1]]);
        pts.push([n1.x, n1.y]);
        const e = mkEdge('crack', c.index, h0.node, h1.node, pts);
        e.idx = q;
        c.edges.push(e.id);
      }
      c.nodes = c.hits.map((h) => h.node);
      // 잘린 시작/끝 부분 기록 (렌더링에서 필요 없음)
      unused.add(c.id);
    }
    // 테두리 가장자리
    rimHits.sort((p, q) => p.param - q.param);
    for (let q = 0; q < rimHits.length; q++) {
      const h0 = rimHits[q];
      const h1 = rimHits[(q + 1) % rimHits.length];
      const n0 = nodes[h0.node];
      const n1 = nodes[h1.node];
      const pts = [[n0.x, n0.y]];
      const i0 = Math.floor(h0.param) + 1;
      let i1 = Math.floor(h1.param);
      if (q === rimHits.length - 1 || i1 < i0 - 1) {
        for (let idx = i0; idx < M; idx++) pts.push([rim[idx][0], rim[idx][1]]);
        for (let idx = 0; idx <= i1; idx++) pts.push([rim[idx][0], rim[idx][1]]);
      } else {
        for (let idx = i0; idx <= i1; idx++) pts.push([rim[idx][0], rim[idx][1]]);
      }
      pts.push([n1.x, n1.y]);
      mkEdge('rim', -1, h0.node, h1.node, pts);
    }

    // 반-가장자리 (half-edge)
    const H = edges.length * 2;
    const hOrigin = new Int32Array(H);
    const hDest = new Int32Array(H);
    const hAngle = new Float64Array(H);
    const hPts = new Array(H);
    for (const e of edges) {
      const h = e.id * 2;
      hOrigin[h] = e.a;
      hDest[h] = e.b;
      hPts[h] = e.pts;
      hOrigin[h + 1] = e.b;
      hDest[h + 1] = e.a;
      hPts[h + 1] = e.pts.slice().reverse();
    }
    for (let h = 0; h < H; h++) {
      const pts = hPts[h];
      const look = Math.min(2.2, U.polylineLength(pts) * 0.45);
      const p = U.pointAlong(pts, look);
      hAngle[h] = Math.atan2(p[1] - pts[0][1], p[0] - pts[0][0]);
    }
    const out = nodes.map(() => []);
    for (let h = 0; h < H; h++) out[hOrigin[h]].push(h);
    for (const L of out) L.sort((a, b) => hAngle[a] - hAngle[b]);
    const hNext = new Int32Array(H);
    for (let h = 0; h < H; h++) {
      const v = hDest[h];
      const L = out[v];
      const tw = h ^ 1;
      const i = L.indexOf(tw);
      hNext[h] = L[(i - 1 + L.length) % L.length];
    }
    const hFace = new Int32Array(H).fill(-1);
    const faces = [];
    for (let h = 0; h < H; h++) {
      if (hFace[h] >= 0) continue;
      const fid = faces.length;
      const loop = [];
      let cur = h;
      let guard = 0;
      while (hFace[cur] < 0) {
        hFace[cur] = fid;
        loop.push(cur);
        cur = hNext[cur];
        if (++guard > 100000) throw new Error('face loop');
      }
      const pts = [];
      for (const hh of loop) {
        const p = hPts[hh];
        for (let i = 0; i < p.length - 1; i++) pts.push(p[i]);
      }
      const area = U.polyArea(pts);
      faces.push({ id: fid, halfs: loop, pts, area });
    }
    let outer = 0;
    for (const f of faces) if (Math.abs(f.area) > Math.abs(faces[outer].area)) outer = f.id;
    const sign = Math.sign(faces[outer].area);
    for (const f of faces) {
      if (f.id === outer) continue;
      if (Math.sign(f.area) === sign) throw new Error('face orientation mismatch: face ' + f.id);
      const c = U.polyCentroid(f.pts);
      f.cx = c[0];
      f.cy = c[1];
      f.absArea = Math.abs(f.area);
      let minx = 1e9;
      let miny = 1e9;
      let maxx = -1e9;
      let maxy = -1e9;
      for (const p of f.pts) {
        if (p[0] < minx) minx = p[0];
        if (p[1] < miny) miny = p[1];
        if (p[0] > maxx) maxx = p[0];
        if (p[1] > maxy) maxy = p[1];
      }
      f.bbox = [minx, miny, maxx, maxy];
    }
    for (const e of edges) e.faces = [hFace[e.id * 2], hFace[e.id * 2 + 1]];

    const board = {
      R,
      seed,
      rim,
      cracks,
      nodes,
      edges,
      faces,
      outer,
      crackEdges: edges.filter((e) => e.kind === 'crack').map((e) => e.id),
    };
    return board;
  };

  /* 점이 속한 면 */
  Geom.faceAt = function (board, x, y) {
    for (const f of board.faces) {
      if (f.id === board.outer) continue;
      const b = f.bbox;
      if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
      if (U.pointInPoly(x, y, f.pts)) return f.id;
    }
    // 경계 위의 점이면 가장 가까운 면 중심
    let best = -1;
    let bd = 1e9;
    for (const f of board.faces) {
      if (f.id === board.outer) continue;
      const d = Math.hypot(f.cx - x, f.cy - y);
      if (d < bd) {
        bd = d;
        best = f.id;
      }
    }
    return best;
  };

  /* 깨진 가장자리 집합 → 조각(면들의 연결 요소) */
  Geom.pieces = function (board, broken) {
    const F = board.faces.length;
    const parent = new Int32Array(F);
    for (let i = 0; i < F; i++) parent[i] = i;
    const find = (a) => {
      while (parent[a] !== a) {
        parent[a] = parent[parent[a]];
        a = parent[a];
      }
      return a;
    };
    for (const eid of board.crackEdges) {
      if (broken.has(eid)) continue;
      const e = board.edges[eid];
      const a = find(e.faces[0]);
      const b = find(e.faces[1]);
      if (a !== b) parent[a] = b;
    }
    const map = new Map();
    const pieceOfFace = new Int32Array(F).fill(-1);
    const list = [];
    for (const f of board.faces) {
      if (f.id === board.outer) continue;
      const r = find(f.id);
      if (!map.has(r)) {
        map.set(r, list.length);
        list.push({ faces: [] });
      }
      const pid = map.get(r);
      pieceOfFace[f.id] = pid;
      list[pid].faces.push(f.id);
    }
    for (const p of list) {
      p.faces.sort((a, b) => a - b);
      p.key = p.faces.join(',');
      let A = 0;
      let cx = 0;
      let cy = 0;
      for (const fid of p.faces) {
        const f = board.faces[fid];
        A += f.absArea;
        cx += f.cx * f.absArea;
        cy += f.cy * f.absArea;
      }
      p.area = A;
      p.cx = cx / A;
      p.cy = cy / A;
    }
    return { pieceOfFace, list };
  };

  /* 금 가장자리를 눌렀을 때 실제로 갈라질 구간: 이미 벌어진 틈이나 테두리에서 멈춘다 */
  Geom.crackRun = function (board, edgeId, broken) {
    const e0 = board.edges[edgeId];
    if (e0.kind !== 'crack' || broken.has(edgeId)) return null;
    const c = board.cracks[e0.crack];
    const k = e0.idx;
    const stopAt = (nodeId) => {
      const n = board.nodes[nodeId];
      if (n.kind === 'rim') return 'rim';
      for (const eid of n.edges) {
        const e = board.edges[eid];
        if (e.crack !== c.index && broken.has(eid)) return 'gap';
      }
      return null;
    };
    let lo = k;
    let hi = k;
    let loStop = null;
    let hiStop = null;
    for (;;) {
      const s = stopAt(c.nodes[lo]);
      if (s) {
        loStop = s;
        break;
      }
      if (lo === 0 || broken.has(c.edges[lo - 1])) {
        loStop = lo === 0 ? 'end' : 'gap';
        break;
      }
      lo--;
    }
    for (;;) {
      const s = stopAt(c.nodes[hi + 1]);
      if (s) {
        hiStop = s;
        break;
      }
      if (hi === c.edges.length - 1 || broken.has(c.edges[hi + 1])) {
        hiStop = hi === c.edges.length - 1 ? 'end' : 'gap';
        break;
      }
      hi++;
    }
    const ids = [];
    for (let i = lo; i <= hi; i++) ids.push(c.edges[i]);
    return { crack: c.index, edges: ids, lo, hi, loStop, hiStop, loNode: c.nodes[lo], hiNode: c.nodes[hi + 1] };
  };

  /* 구간의 이어진 폴리라인 (lo 노드 → hi 노드 방향) */
  Geom.runPolyline = function (board, run) {
    const pts = [];
    for (const eid of run.edges) {
      const e = board.edges[eid];
      const p = e.pts;
      const start = pts.length ? 1 : 0;
      for (let i = start; i < p.length; i++) pts.push(p[i]);
    }
    return pts;
  };

  /* 모든 가능한 구간(중복 제거) — 해법 탐색용 */
  Geom.allRuns = function (board, broken) {
    const seen = new Set();
    const runs = [];
    for (const eid of board.crackEdges) {
      if (broken.has(eid)) continue;
      const run = Geom.crackRun(board, eid, broken);
      const key = run.edges.join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      runs.push(run);
    }
    return runs;
  };
})(typeof window !== 'undefined' ? window : globalThis);
