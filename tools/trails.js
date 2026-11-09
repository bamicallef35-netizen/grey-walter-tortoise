// trails.js — render a long-exposure of the tortoise's pilot light to SVG,
// the way Walter photographed Elmer and Elsie by fixing a lamp to the shell
// and leaving the camera shutter open. Run:
//
//   node tools/trails.js [scene] [seconds] [body]   > media/trails.svg
//
// Defaults: lamp, 90 s, tricycle. The output is a standalone SVG with the
// room, the lamp glow, and each tortoise's path — bright where the pilot
// lamp was lit, faint where it was dark.

const fs = require("fs");
const path = require("path");
const S = require(path.join(__dirname, "../docs/speculatrix.js"));

const scene = process.argv[2] || "lamp";
const seconds = Number(process.argv[3] || 90);
const body = process.argv[4] || "tricycle";

if (!S.scenes[scene]) {
  console.error("unknown scene: " + scene + " (lamp, mirror, pair, hutch)");
  process.exit(1);
}

const world = S.scenes[scene]();
for (const a of world.agents) a.body = body;

const dt = 0.02;
const paths = world.agents.map(() => []);
for (let i = 0; i < seconds / dt; i++) {
  world.step(dt);
  world.agents.forEach((a, k) => paths[k].push([a.x, a.y, a.out.pilot ? 1 : 0]));
}

const SCALE = 240;
const W = Math.round(world.w * SCALE);
const H = Math.round(world.h * SCALE);
const X = (x) => (x * SCALE).toFixed(1);
const Y = (y) => (y * SCALE).toFixed(1);

// Break a path into runs of equal pilot state, so lit and dark stretches can
// be drawn with different weights.
function runs(pts) {
  const out = [];
  let cur = null;
  for (const p of pts) {
    if (!cur || p[2] !== cur.lit) {
      cur = { lit: p[2], pts: [] };
      if (out.length) cur.pts.push(out[out.length - 1].pts.slice(-1)[0]); // bridge the gap
      out.push(cur);
    }
    cur.pts.push(p);
  }
  return out;
}
const poly = (pts) => pts.map((p) => X(p[0]) + "," + Y(p[1])).join(" ");

let body_svg = "";
world.agents.forEach((a, k) => {
  const colour = a.colour || "#f5b942";
  for (const r of runs(paths[k])) {
    if (r.pts.length < 2) continue;
    const warm = r.lit ? "#ffcf82" : colour;
    const wDark = r.lit ? 2.4 : 1.0;
    const op = r.lit ? 0.9 : 0.22;
    body_svg +=
      `<polyline points="${poly(r.pts)}" fill="none" stroke="${warm}" ` +
      `stroke-width="${wDark}" stroke-opacity="${op}" stroke-linecap="round" ` +
      `stroke-linejoin="round" filter="url(#glow)"/>\n`;
  }
});

let lamps_svg = "";
const sources = [...world.lamps];
if (world.hutch) sources.push({ x: world.hutch.x, y: world.hutch.y, power: world.hutch.power });
for (const l of sources) {
  const r = (0.05 + 0.5 * Math.sqrt(l.power)) * SCALE;
  lamps_svg +=
    `<circle cx="${X(l.x)}" cy="${Y(l.y)}" r="${r.toFixed(0)}" fill="url(#lamp)"/>` +
    `<circle cx="${X(l.x)}" cy="${Y(l.y)}" r="4" fill="#fff4dc"/>\n`;
}

let mirror_svg = "";
if (world.mirror) {
  const m = world.mirror;
  mirror_svg = `<line x1="${X(m.ax)}" y1="${Y(m.ay)}" x2="${X(m.bx)}" y2="${Y(m.by)}" stroke="#96d2eb" stroke-width="3" stroke-opacity="0.8"/>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Long-exposure trail of ${scene} scene">
  <defs>
    <radialGradient id="lamp" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffdca0" stop-opacity="0.55"/>
      <stop offset="40%" stop-color="#ffc878" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="#ffc878" stop-opacity="0"/>
    </radialGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="1.6" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="${W}" height="${H}" fill="#080a0e"/>
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" fill="none" stroke="#2a3240" stroke-width="2"/>
  ${lamps_svg}${mirror_svg}
  ${body_svg}</svg>
`;

const outDir = path.join(__dirname, "../media");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "trails.svg");
fs.writeFileSync(outFile, svg);
console.error(`wrote ${outFile} — ${scene}, ${seconds}s, ${body}, ${world.agents.length} path(s)`);
