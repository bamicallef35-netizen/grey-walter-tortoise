const fs=require('fs'); const src=fs.readFileSync(require('path').join(__dirname,'../docs/speculatrix.js'),'utf8');
for (const rate of [0.6, 0.9, 1.2, 1.8, 2.4]) {
  const mod = {exports:{}}; new Function('module', src.replace(/const STEER_RATE = [0-9.]+;/, 'const STEER_RATE = '+rate+';'))(mod);
  const S = mod.exports; const w = new S.World({w:20,h:20}); const a = new S.Agent({x:10,y:10}); w.agents.push(a);
  let maxd=0; for (let i=0;i<60/0.02;i++){ w.step(0.02); maxd=Math.max(maxd, Math.hypot(a.x-10,a.y-10)); }
  console.log('rate', rate, 'net', Math.hypot(a.x-10,a.y-10).toFixed(2), 'max', maxd.toFixed(2));
}
