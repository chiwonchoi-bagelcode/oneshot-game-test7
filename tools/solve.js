// 레벨 검증: node tools/solve.js [levelId]
const path = require('path');
const root = path.join(__dirname, '..', 'js');
for (const f of ['util.js', 'geom.js', 'levels.js', 'sim.js']) require(path.join(root, f));
const TS = globalThis.TS;
const only = process.argv[2];
let bad = 0;
for (const lv of TS.LEVELS) {
  if (only && lv.id !== only) continue;
  let board;
  try {
    board = TS.Geom.build(lv);
  } catch (e) {
    console.log(lv.id, 'BUILD FAIL', e.message);
    bad++;
    continue;
  }
  const st = TS.Sim.create(lv, board);
  // 배치 점검: 인물과 금 사이 거리
  const warn = [];
  for (const d of lv.diplomats) {
    let md = 1e9, mc = '';
    for (const e of board.edges) {
      if (e.kind !== 'crack') continue;
      for (let i = 1; i < e.pts.length; i++) {
        const r = TS.U.distToSeg(d.x, d.y, e.pts[i - 1][0], e.pts[i - 1][1], e.pts[i][0], e.pts[i][1]);
        if (r.d < md) { md = r.d; mc = board.cracks[e.crack].id; }
      }
    }
    const rr = Math.hypot(d.x, d.y);
    if (md < 11) warn.push(`${d.id} near crack ${mc} (${md.toFixed(1)})`);
    if (rr > 88) warn.push(`${d.id} near rim (${rr.toFixed(0)})`);
  }
  for (const t of lv.tasks) if (t.spot) {
    let md = 1e9;
    for (const e of board.edges) if (e.kind === 'crack') for (let i = 1; i < e.pts.length; i++) md = Math.min(md, TS.U.distToSeg(t.spot[0], t.spot[1], e.pts[i-1][0], e.pts[i-1][1], e.pts[i][0], e.pts[i][1]).d);
    if (md < 9) warn.push(`spot ${t.id} near crack (${md.toFixed(1)})`);
  }
  const a = TS.Sim.analyze(st);
  const sol = a.solution;
  const pathStr = sol.win ? sol.path.map((r) => board.cracks[r.crack].id + '[' + r.lo + '-' + r.hi + ']').join(' → ') : '';
  console.log(`\n== ${lv.id} ${lv.title}: faces=${board.faces.length - 1} crackEdges=${board.crackEdges.length}`);
  console.log(sol.win ? `  WIN in ${sol.depth}: ${pathStr}` : `  NO SOLUTION (${sol.reason})`);
  console.log('  first moves: ' + a.first.map((f) => `${f.crack}(${f.edges}):${f.outcome}`).join('  '));
  if (warn.length) console.log('  WARN: ' + warn.join('; '));
  if (!sol.win) bad++;
}
process.exit(bad ? 1 : 0);
