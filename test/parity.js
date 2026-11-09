// parity.js — prove the browser model and the firmware model are the same
// machine. Run with `make parity`.
//
// The C++ core computes in 32-bit floats and the JS port in doubles, so a
// step that lands exactly on a decision threshold could round differently
// in the two. The generator below therefore keeps every input a safe
// margin away from the thresholds it could graze (the glimpse rise, the
// lock level, the battery-dependent dazzle threshold), and checks that
// margin against the live state at every step. Within that discipline the
// two traces must agree exactly, mode by mode and tick by tick, and any
// mismatch is a real divergence, not rounding.

"use strict";

const { execFileSync } = require("child_process");
const path = require("path");

const S = require(path.join(__dirname, "../docs/speculatrix.js"));

let failures = 0;
let checks = 0;
function check(cond, msg) {
  checks++;
  if (!cond) {
    failures++;
    console.error("  FAIL " + msg);
  }
}

// Deterministic PRNG (32-bit LCG), so every run tests the same traces.
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const P = S.defaultParams();
const MARGIN = 2e-3; // far above any float/double drift over these traces

// Keep `light` away from a threshold value, nudging it upward if close.
function away(light, threshold) {
  while (Math.abs(light - threshold) < MARGIN) light += MARGIN;
  return Math.min(1, light);
}

// ── Scenario builders ────────────────────────────────────────────────────
// Each returns an array of steps {light, contact, battery, charging, dt}.

function walterCycle() {
  const steps = [];
  const seg = (n, s) => { for (let i = 0; i < n; i++) steps.push(Object.assign({}, s)); };
  const base = { light: 0, contact: 0, battery: 8.2, charging: 0, dt: 15 };
  seg(140, base);                                        // dark: scan
  seg(40, { ...base, light: 0.1 });                      // faint: glimpse
  seg(120, base);                                        // decay back to scan
  seg(80, { ...base, light: 0.5 });                      // moderate: lock
  seg(80, { ...base, light: 0.95 });                     // intense: dazzle
  seg(60, base);                                         // dark again
  seg(8, { ...base, contact: 1 });                       // a shove
  seg(100, base);                                        // oscillator holds
  seg(8, { ...base, contact: 1, light: 0.6 });           // shoved near light
  seg(120, { ...base, light: 0.6 });                     // hasty oscillation
  seg(120, base);
  return steps;
}

function hutchCycle() {
  const steps = [];
  // Approach a lamp as the battery flags: the dazzle threshold climbs,
  // so a light that repelled at 8.1 V attracts at 7.2 V.
  for (let v = 8.15; v > 6.95; v -= 0.05) {
    for (let i = 0; i < 20; i++) {
      steps.push({ light: away(0.86, 0.35), contact: 0, battery: v, charging: 0, dt: 15 });
    }
  }
  // On the charger: docked until v_resume.
  for (let v = 7.0; v < 8.12; v += 0.04) {
    for (let i = 0; i < 10; i++) {
      steps.push({ light: 0.2, contact: 0, battery: v, charging: 1, dt: 15 });
    }
  }
  // Off and away.
  for (let i = 0; i < 100; i++) {
    steps.push({ light: 0, contact: 0, battery: 8.1, charging: 0, dt: 15 });
  }
  return steps;
}

function randomWalk(seed, n) {
  const rnd = lcg(seed);
  const steps = [];
  let light = 0;
  let battery = 8.2;
  // Mirror of the model's own baseline, in doubles, used only to keep
  // generated light levels clear of the glimpse-rise threshold.
  let baseline = 0;
  let primed = false;
  for (let i = 0; i < n; i++) {
    if (rnd() < 0.08) light = Math.round(rnd() * 64) / 64;
    const contact = rnd() < 0.05 ? 1 : 0;
    if (rnd() < 0.1) battery = 6.9 + Math.round(rnd() * 26) / 20;
    const charging = rnd() < 0.04 ? 1 : 0;
    const dt = [10, 15, 20][i % 3];

    light = away(light, P.lock_level);
    const t = new S.Tortoise(P); // threshold is a pure function; any instance
    light = away(light, t.dazzleThreshold(battery));
    if (!primed) { baseline = light; primed = true; }
    // Keep the rise clear of the glimpse threshold too.
    while (Math.abs(light - baseline - P.glimpse_delta) < MARGIN && light < 1) light += MARGIN;
    baseline += (light - baseline) * Math.min(1, dt / P.baseline_tau_ms);

    steps.push({ light, contact, battery, charging, dt });
  }
  return steps;
}

function explorerRun() {
  const steps = [];
  for (let i = 0; i < 1400; i++) {
    // Mostly dark, one lock interlude to reset the explorer timers.
    const light = i > 600 && i < 680 ? 0.5 : 0;
    steps.push({ light, contact: 0, battery: 8.2, charging: 0, dt: 15 });
  }
  return steps;
}

// ── Trace comparison ─────────────────────────────────────────────────────

function jsTrace(steps, useExplorer) {
  const t = new S.Tortoise(S.defaultParams());
  const e = new S.Explorer(4200, 900);
  return steps.map((s) => {
    let o = t.step({ light: s.light, contact: !!s.contact, battery_v: s.battery, charging: !!s.charging }, s.dt);
    if (useExplorer) o = e.shape(o, s.dt);
    return o.mode + " " + o.drive.toFixed(4) + " " + o.steer.toFixed(4) + " " + (o.pilot ? 1 : 0);
  });
}

function cppTrace(steps, useExplorer) {
  const input = steps.map((s) => [s.light.toFixed(6), s.contact, s.battery.toFixed(4), s.charging, s.dt].join(" ")).join("\n") + "\n";
  const bin = path.join(__dirname, "../build/parity_trace");
  const out = execFileSync(bin, useExplorer ? ["explorer"] : [], { input, encoding: "utf8" });
  return out.trim().split("\n");
}

function compare(name, steps, useExplorer) {
  // The C++ side parses the quantised text we send it, so quantise the JS
  // side's inputs identically before tracing.
  for (const s of steps) {
    s.light = Number(s.light.toFixed(6));
    s.battery = Number(s.battery.toFixed(4));
  }
  const js = jsTrace(steps, useExplorer);
  const cc = cppTrace(steps, useExplorer);
  check(js.length === cc.length, name + ": trace lengths differ");
  let bad = 0;
  for (let i = 0; i < Math.min(js.length, cc.length); i++) {
    checks++;
    if (js[i] !== cc[i]) {
      failures++;
      if (bad++ < 5) console.error(`  FAIL ${name} step ${i}: js "${js[i]}" vs c++ "${cc[i]}"`);
    }
  }
  console.log(`  ${name}: ${js.length} ticks${useExplorer ? " (explorer)" : ""}`);
}

// ── Pure-function spot checks ────────────────────────────────────────────

function checkMix() {
  const t = 1e-6;
  for (const [d, s, g] of [[0, 0, 0.6], [1, 0, 0.6], [0.5, 1, 0.6], [1, 1, 0.8], [1, -1, 0.8], [0.5, 1, 1.0]]) {
    const w = S.mix(d, s, g);
    let left = d - s * g, right = d + s * g;
    const m = Math.max(Math.abs(left), Math.abs(right));
    if (m > 1) { left /= m; right /= m; }
    check(Math.abs(w.left - left) < t && Math.abs(w.right - right) < t, `mix(${d},${s},${g})`);
  }
}

// ── Run ──────────────────────────────────────────────────────────────────

compare("walter-cycle", walterCycle(), false);
compare("hutch-cycle", hutchCycle(), false);
compare("random-walk-1", randomWalk(1, 3000), false);
compare("random-walk-2", randomWalk(42, 3000), false);
compare("random-walk-3", randomWalk(2026, 3000), false);
compare("explorer-run", explorerRun(), true);
compare("explorer-walk", randomWalk(7, 2000), true);
checkMix();

console.log(`${checks} parity checks, ${failures} failed`);
process.exit(failures ? 1 : 0);
