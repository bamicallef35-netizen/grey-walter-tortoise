const S = require(require('path').join(__dirname,'../docs/speculatrix.js'));
for (const body of ['tricycle','replica']) for (const name of Object.keys(S.scenes)) {
  const w = S.scenes[name](); for (const a of w.agents) a.body = body;
  const counts = {}; let pilotFlips = 0, last = null, minLamp = 9, docked = 0, firstDock = null;
  for (let i = 0; i < 120 / 0.02; i++) {
    w.step(0.02);
    for (const a of w.agents) { counts[a.out.mode] = (counts[a.out.mode]||0)+1;
      if (last !== null && last !== a.out.pilot) pilotFlips++; last = a.out.pilot;
      const L = w.lamps[0] || w.hutch; if (L) minLamp = Math.min(minLamp, Math.hypot(a.x-L.x, a.y-L.y));
      if (a.out.mode === 'docked' && firstDock === null) firstDock = w.t.toFixed(1);
    }
  }
  const tot = Object.values(counts).reduce((x,y)=>x+y,0);
  const pct = Object.fromEntries(Object.entries(counts).map(([k,v])=>[k,(100*v/tot).toFixed(0)+'%']));
  const a = w.agents[0];
  console.log(body.padEnd(8), name.padEnd(7), JSON.stringify(pct), 'flips', pilotFlips, 'minLampDist', minLamp.toFixed(2), 'firstDock', firstDock, 'batt', a.battery.toFixed(2), 'pos', a.x.toFixed(2), a.y.toFixed(2));
}
