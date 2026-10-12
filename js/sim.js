/* 토르티야 정상회담 — 규칙 시뮬레이션과 해법 탐색
 * 공동 작업: 팀 전원이 같은 조각에 있고, 같은 조각에서 그 작업을 붙잡는 방해꾼이 없을 때만 진행된다.
 * 완료된 작업의 팀은 이후 갈라져도 된다. 완료 전에 팀이 갈라지면 그 작업은 영영 이어 갈 수 없다.
 */
(function (G) {
  'use strict';
  const TS = G.TS || (G.TS = {});
  const Geom = TS.Geom;
  const Sim = (TS.Sim = {});

  Sim.create = function (level, board) {
    const st = {
      level,
      board,
      broken: new Set(),
      pieces: null,
      dip: {},
      tasks: {},
      cracksUsed: 0,
    };
    for (const d of level.diplomats) {
      st.dip[d.id] = {
        id: d.id,
        x: d.x,
        y: d.y,
        face: -1,
        piece: -1,
        obstructs: d.obstructs || null,
        busy: !!d.busy,
        target: d.obstructs || null,
      };
    }
    for (const t of level.tasks) st.tasks[t.id] = { id: t.id, done: false, progress: 0, lost: false };
    // 이미 갈라진 채 나온 판
    for (const cid of level.prebroken || []) {
      const c = board.cracks.find((cc) => cc.id === cid);
      if (c) for (const e of c.edges) st.broken.add(e);
    }
    Sim.refreshPieces(st);
    Sim.resolve(st);
    return st;
  };

  Sim.clone = function (st) {
    const c = {
      level: st.level,
      board: st.board,
      broken: new Set(st.broken),
      pieces: st.pieces,
      dip: {},
      tasks: {},
      cracksUsed: st.cracksUsed,
    };
    for (const k in st.dip) c.dip[k] = Object.assign({}, st.dip[k]);
    for (const k in st.tasks) c.tasks[k] = Object.assign({}, st.tasks[k]);
    return c;
  };

  Sim.refreshPieces = function (st) {
    st.pieces = Geom.pieces(st.board, st.broken);
    for (const k in st.dip) {
      const d = st.dip[k];
      d.face = Geom.faceAt(st.board, d.x, d.y);
      d.piece = st.pieces.pieceOfFace[d.face];
    }
  };

  Sim.pieceAt = function (st, x, y) {
    return st.pieces.pieceOfFace[Geom.faceAt(st.board, x, y)];
  };

  Sim.taskDef = (st, id) => st.level.tasks.find((t) => t.id === id);

  Sim.teamPiece = function (st, tid) {
    const t = Sim.taskDef(st, tid);
    const p = st.dip[t.team[0]].piece;
    for (const m of t.team) if (st.dip[m].piece !== p) return -1;
    return p;
  };

  Sim.obstructorsOf = function (st, tid) {
    const p = Sim.teamPiece(st, tid);
    const out = [];
    if (p < 0) return out;
    for (const k in st.dip) {
      const d = st.dip[k];
      if (d.target === tid && d.piece === p) out.push(d.id);
    }
    return out;
  };

  Sim.status = function (st, tid) {
    const ts = st.tasks[tid];
    if (ts.done) return 'done';
    if (Sim.teamPiece(st, tid) < 0) return 'lost';
    if (Sim.obstructorsOf(st, tid).length) return 'blocked';
    return 'working';
  };

  /* 방해꾼 목표 정리. 참견꾼은 같은 조각의 다른 미완료 작업을 찾아간다. */
  Sim.resolve = function (st) {
    const events = [];
    for (const k in st.dip) {
      const d = st.dip[k];
      if (!d.obstructs && !d.busy) continue;
      const valid = (tid) => {
        if (!tid) return false;
        const ts = st.tasks[tid];
        if (ts.done || ts.lost) return false;
        return Sim.teamPiece(st, tid) === d.piece;
      };
      if (valid(d.target)) continue;
      const prev = d.target;
      d.target = null;
      if (d.busy) {
        let best = null;
        let bd = 1e9;
        for (const t of st.level.tasks) {
          if (t.team.indexOf(d.id) >= 0) continue;
          if (!valid(t.id)) continue;
          const sp = t.spot || Sim.defaultSpot(st, t);
          const dd = Math.hypot(sp[0] - d.x, sp[1] - d.y);
          if (dd < bd) {
            bd = dd;
            best = t;
          }
        }
        if (best) {
          d.target = best.id;
          const sp = best.spot || Sim.defaultSpot(st, best);
          events.push({ type: 'retarget', who: d.id, from: prev, to: best.id, spot: sp });
          if (Sim.pieceAt(st, sp[0], sp[1]) === d.piece) {
            d.x = sp[0];
            d.y = sp[1];
            d.face = Geom.faceAt(st.board, d.x, d.y);
          }
          continue;
        }
      }
      if (prev) events.push({ type: 'release', who: d.id, from: prev });
    }
    return events;
  };

  Sim.defaultSpot = function (st, t) {
    let x = 0;
    let y = 0;
    for (const m of t.team) {
      x += st.dip[m].x;
      y += st.dip[m].y;
    }
    x /= t.team.length;
    y /= t.team.length;
    return [x, y - 18];
  };

  /* 구간을 깨뜨린다. 결과 이벤트를 돌려준다. */
  Sim.applyRun = function (st, run) {
    const before = {};
    for (const k in st.dip) before[k] = st.dip[k].piece;
    const beforeCount = st.pieces.list.length;
    for (const e of run.edges) st.broken.add(e);
    st.cracksUsed++;
    Sim.refreshPieces(st);
    const separated = st.pieces.list.length > beforeCount;
    const lostNow = [];
    for (const t of st.level.tasks) {
      const ts = st.tasks[t.id];
      if (ts.done || ts.lost) continue;
      if (Sim.teamPiece(st, t.id) < 0) {
        ts.lost = true;
        lostNow.push(t.id);
      }
    }
    const events = Sim.resolve(st);
    return { separated, lostNow, events, before };
  };

  /* 진행 가능한 작업을 모두 완료 (탐색용: 플레이어가 기다린다고 가정) */
  Sim.completeFree = function (st) {
    let changed = true;
    let guard = 0;
    while (changed && guard++ < 20) {
      changed = false;
      for (const t of st.level.tasks) {
        if (Sim.status(st, t.id) === 'working') {
          st.tasks[t.id].done = true;
          st.tasks[t.id].progress = 1;
          changed = true;
        }
      }
      if (changed) Sim.resolve(st);
    }
  };

  Sim.allDone = (st) => st.level.tasks.every((t) => st.tasks[t.id].done);
  Sim.anyLost = (st) => st.level.tasks.some((t) => st.tasks[t.id].lost);

  function stateKey(st) {
    const b = Array.from(st.broken).sort((a, c) => a - c).join(',');
    const d = st.level.tasks.map((t) => (st.tasks[t.id].done ? 1 : 0)).join('');
    let bz = '';
    for (const k in st.dip) if (st.dip[k].busy) bz += k + ':' + (st.dip[k].target || '-') + ':' + st.dip[k].x.toFixed(1) + ',' + st.dip[k].y.toFixed(1) + ';';
    return b + '|' + d + '|' + bz;
  }

  /* 너비 우선 탐색: 최소 금 개수 해법 */
  Sim.solve = function (st0, opts) {
    opts = opts || {};
    const maxDepth = opts.maxDepth || 8;
    const maxStates = opts.maxStates || 20000;
    const start = Sim.clone(st0);
    Sim.completeFree(start);
    if (Sim.anyLost(start)) return { win: false, reason: 'lost' };
    if (Sim.allDone(start)) return { win: true, depth: 0, path: [] };
    let frontier = [{ st: start, path: [] }];
    const seen = new Set([stateKey(start)]);
    let count = 0;
    for (let depth = 1; depth <= maxDepth; depth++) {
      const next = [];
      for (const node of frontier) {
        const runs = Geom.allRuns(node.st.board, node.st.broken);
        for (const run of runs) {
          const s = Sim.clone(node.st);
          Sim.applyRun(s, run);
          if (Sim.anyLost(s)) continue;
          Sim.completeFree(s);
          const path = node.path.concat([run]);
          if (Sim.allDone(s)) return { win: true, depth, path, explored: count };
          const key = stateKey(s);
          if (seen.has(key)) continue;
          seen.add(key);
          if (++count > maxStates) return { win: false, reason: 'limit', explored: count };
          next.push({ st: s, path });
        }
      }
      if (!next.length) break;
      frontier = next;
    }
    return { win: false, reason: 'exhausted', explored: count };
  };

  /* 진단: 한 번에 깨면 지는 구간, 해법 수 등 (레벨 설계 검증용) */
  Sim.analyze = function (st0) {
    const res = Sim.solve(st0, { maxDepth: 8 });
    const start = Sim.clone(st0);
    Sim.completeFree(start);
    const first = Geom.allRuns(start.board, start.broken).map((run) => {
      const s = Sim.clone(start);
      const r = Sim.applyRun(s, run);
      let outcome;
      if (Sim.anyLost(s)) outcome = 'LOSE:' + r.lostNow.join('+');
      else {
        Sim.completeFree(s);
        if (Sim.allDone(s)) outcome = 'WIN';
        else outcome = Sim.solve(s).win ? 'ok' : 'STUCK';
      }
      return { crack: start.board.cracks[run.crack].id, edges: run.edges.length, outcome };
    });
    return { solution: res, first };
  };
})(typeof window !== 'undefined' ? window : globalThis);
