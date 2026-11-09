// Patch world constants in docs/speculatrix.js, run every scene for both
// bodies, and print the numbers that matter for tuning. Usage:
//   node tools/sweep.js STEER_RATE=2.4 PILOT_POWER=0.3
const fs = require('fs');
const path = require('path');
let src = fs.readFileSync(path.join(__dirname, '../docs/speculatrix.js'), 'utf8');
for (const kv of process.argv.slice(2)) {
  const [k, v] = kv.split('=');
  const re = new RegExp('const ' + k + ' = [0-9.]+;');
  if (!re.test(src)) throw new Error('no constant ' + k);
  src = src.replace(re, 'const ' + k + ' = ' + v + ';');
}
const mod = { exports: {} };
new Function('module', src)(mod);
const S = mod.exports;

for (const body of ['tricycle', 'replica']) {
  for (const name of Object.keys(S.scenes)) {
    const w = S.scenes[name]();
    for (const a of w.agents) a.body = body;
    const counts = {};
    let firstDock = null, minLamp = 9, lockNearPeer = 0;
    for (let i = 0; i < 180 / 0.02; i++) {
      w.step(0.02);
      for (const a of w.agents) {
        counts[a.out.mode] = (counts[a.out.mode] || 0) + 1;
        const L = w.lamps[0] || w.hutch;
        if (L) minLamp = Math.min(minLamp, Math.hypot(a.x - L.x, a.y - L.y));
        if (a.out.mode === 'docked' && firstDock === null) firstDock = w.t.toFixed(0);
        if (name === 'pair' && (a.out.mode === 'lock' || a.out.mode === 'glimpse')) lockNearPeer++;
      }
    }
    const tot = Object.values(counts).reduce((x, y) => x + y, 0);
    const pc = (k) => (100 * (counts[k] || 0) / tot).toFixed(0).padStart(3) + '%';
    console.log(
      body.padEnd(8), name.padEnd(6),
      'scan' + pc('scan'), 'seek' + pc('glimpse'), 'lock' + pc('lock'),
      'daz' + pc('dazzle'), 'con' + pc('contact'),
      'minLamp', minLamp === 9 ? '  - ' : minLamp.toFixed(2),
      'dock', firstDock ? firstDock + 's' : '  - ',
      name === 'pair' ? 'attend ' + lockNearPeer : ''
    );
  }
}
