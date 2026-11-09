const S = require(require('path').join(__dirname,'../docs/speculatrix.js'));
const [scene, body, secs] = [process.argv[2], process.argv[3], +process.argv[4]];
const w = S.scenes[scene](); for (const a of w.agents) a.body = body;
let line = '';
for (let i = 0; i < secs / 0.02; i++) {
  w.step(0.02);
  const a = w.agents[0];
  line += a.out.mode[0];
  if (i % 50 === 49) {
    const L = w.lamps[0] || w.hutch || {x:0,y:0};
    console.log(w.t.toFixed(1).padStart(5), line, 'L=' + a.light.toFixed(2), 'd=' + Math.hypot(a.x-L.x,a.y-L.y).toFixed(2), 'pos', a.x.toFixed(2), a.y.toFixed(2), 'phi', ((a.phi%6.283)).toFixed(1), 'v', a.battery.toFixed(2));
    line = '';
  }
}
