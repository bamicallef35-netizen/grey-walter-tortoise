// speculatrix.js — the tortoise model and a small world to run it in.
//
// `Tortoise` is a line-for-line port of firmware/tortoise/speculatrix.cpp;
// test/parity.js checks the two agree. `World` is a 2-D room with lamps,
// a hutch, obstacles and a mirror. It has no DOM dependency, so it runs in
// the browser (index.html) and in Node (tools/trails.js).

(function (root) {
  "use strict";

  const Mode = Object.freeze({
    Scan: "scan", Glimpse: "glimpse", Lock: "lock",
    Dazzle: "dazzle", Contact: "contact", Docked: "docked",
  });

  function defaultParams() {
    return {
      glimpse_delta: 0.04, glimpse_ms: 180, baseline_tau_ms: 600,
      lock_level: 0.35, dazzle_full: 0.80, dazzle_empty: 1.01,
      contact_period_dark_ms: 1500, contact_period_lit_ms: 700, contact_hold_ms: 900,
      v_full: 8.2, v_empty: 6.8, v_resume: 8.0,
    };
  }

  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

  class Tortoise {
    constructor(p) { this.p = Object.assign(defaultParams(), p || {}); this.reset(); }

    reset() {
      this.baseline = 0; this.glimpseLeft = 0; this.contactPhase = 0;
      this.contactHoldLeft = 0; this.docked = false; this.primed = false;
    }

    charge(v) { const p = this.p; return clamp01((v - p.v_empty) / (p.v_full - p.v_empty)); }

    dazzleThreshold(v) {
      const p = this.p;
      return p.dazzle_empty + (p.dazzle_full - p.dazzle_empty) * this.charge(v);
    }

    step(input, dt) {
      const p = this.p;
      if (dt < 0) dt = 0;
      const light = clamp01(input.light);
      if (!this.primed) { this.baseline = light; this.primed = true; }
      const rise = light - this.baseline;
      this.baseline += (light - this.baseline) * Math.min(1, dt / p.baseline_tau_ms);

      if (input.charging && input.battery_v < p.v_resume) this.docked = true;
      if (this.docked && (!input.charging || input.battery_v >= p.v_resume)) this.docked = false;
      if (this.docked) {
        this.contactHoldLeft = 0; this.glimpseLeft = 0;
        return { drive: 0, steer: 0, pilot: false, mode: Mode.Docked };
      }

      if (input.contact) {
        if (this.contactHoldLeft <= 0) this.contactPhase = 0;
        this.contactHoldLeft = p.contact_hold_ms;
      }
      if (this.contactHoldLeft > 0) {
        if (!input.contact) this.contactHoldLeft -= dt;
        const period = light >= p.lock_level ? p.contact_period_lit_ms : p.contact_period_dark_ms;
        this.contactPhase += dt;
        while (this.contactPhase >= period) this.contactPhase -= period;
        this.glimpseLeft = 0;
        if (this.contactPhase < period / 3) return { drive: 0.5, steer: 1, pilot: true, mode: Mode.Contact };
        return { drive: 1, steer: 0.5, pilot: false, mode: Mode.Contact };
      }

      if (light >= this.dazzleThreshold(input.battery_v)) {
        this.glimpseLeft = 0;
        return { drive: 1, steer: 0.5, pilot: false, mode: Mode.Dazzle };
      }
      if (light >= p.lock_level) {
        this.glimpseLeft = 0;
        return { drive: 1, steer: 0, pilot: false, mode: Mode.Lock };
      }
      if (rise >= p.glimpse_delta) this.glimpseLeft = p.glimpse_ms;
      if (this.glimpseLeft > 0) {
        this.glimpseLeft -= dt;
        return { drive: 1, steer: 0, pilot: false, mode: Mode.Glimpse };
      }
      return { drive: 0.5, steer: 1, pilot: true, mode: Mode.Scan };
    }
  }

  // Replica adaptation: a short straight run after each full scan.
  // See Explorer in speculatrix.h.
  class Explorer {
    constructor(revolutionMs, runMs) { this.rev = revolutionMs; this.run = runMs; this.scanned = 0; this.runLeft = 0; }
    shape(o, dt) {
      if (o.mode !== Mode.Scan) { this.scanned = 0; this.runLeft = 0; return o; }
      if (this.runLeft > 0) { this.runLeft -= dt; return { drive: 1, steer: 0, pilot: o.pilot, mode: o.mode }; }
      this.scanned += dt;
      if (this.scanned >= this.rev) { this.scanned = 0; this.runLeft = this.run; }
      return o;
    }
  }

  function mix(drive, steer, gain) {
    let left = drive - steer * gain, right = drive + steer * gain;
    const m = Math.max(Math.abs(left), Math.abs(right));
    if (m > 1) { left /= m; right /= m; }
    return { left, right };
  }

  // ── World ──────────────────────────────────────────────────────────────
  // Units: metres, seconds, radians. y points down, as on a canvas.

  const BODY_R = 0.14;          // shell radius
  const WHEELBASE = 0.18;       // tricycle: front wheel to rear axle
  const TRACK = 0.16;           // replica: distance between the wheels
  const V_MAX = 0.22;           // m/s at full drive
  const STEER_RATE = 2.4;       // rad/s, 1949 steering column at full effort
  const FOV_POW = 4;            // shroud sharpness: cos^n
  const PILOT_POWER = 0.4;      // pilot lamp, relative to a 1.0 room lamp
  const SENSE_GAIN = 0.8;       // photocell saturation
  const TURN_GAIN = 0.8;        // differential mixing for the two-wheel body

  function reflectPoint(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
    const fx = ax + t * dx, fy = ay + t * dy;
    return { x: 2 * fx - px, y: 2 * fy - py };
  }

  function segIntersect(p1x, p1y, p2x, p2y, q1x, q1y, q2x, q2y) {
    const rX = p2x - p1x, rY = p2y - p1y, sX = q2x - q1x, sY = q2y - q1y;
    const den = rX * sY - rY * sX;
    if (Math.abs(den) < 1e-12) return false;
    const t = ((q1x - p1x) * sY - (q1y - p1y) * sX) / den;
    const u = ((q1x - p1x) * rY - (q1y - p1y) * rX) / den;
    return t > 0 && t < 1 && u > 0 && u < 1;
  }

  function closestOnSeg(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    let t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
    t = Math.max(0, Math.min(1, t));
    return { x: ax + t * dx, y: ay + t * dy };
  }

  class Agent {
    constructor(opts) {
      this.name = opts.name || "Elsie";
      this.x = opts.x; this.y = opts.y; this.heading = opts.heading || 0;
      this.phi = 0;                               // steering angle (tricycle)
      this.body = opts.body || "tricycle";        // "tricycle" | "replica"
      this.battery = opts.battery != null ? opts.battery : 8.2;
      this.brain = new Tortoise(opts.params);
      this.explorer = new Explorer(4200, 900);
      this.out = { drive: 0, steer: 0, pilot: true, mode: Mode.Scan };
      this.light = 0; this.contact = false; this.charging = false;
      this.trail = [];
      this.colour = opts.colour || "#f5b942";
    }
    eyeDir() { return this.body === "tricycle" ? this.heading + this.phi : this.heading; }
  }

  class World {
    constructor(opts) {
      opts = opts || {};
      this.w = opts.w || 4; this.h = opts.h || 3;
      this.lamps = [];      // {x, y, power}
      this.hutch = null;    // {x, y, r, power}
      this.mirror = null;   // {ax, ay, bx, by}
      this.obstacles = [];  // {x, y, r}
      this.agents = [];
      this.t = 0;
      this.drain = opts.drain != null ? opts.drain : 0.003;   // V/s at full effort
      this.chargeRate = opts.chargeRate != null ? opts.chargeRate : 0.25;
    }

    sources(exclude) {
      const s = [];
      for (const l of this.lamps) s.push({ x: l.x, y: l.y, power: l.power });
      if (this.hutch) s.push({ x: this.hutch.x, y: this.hutch.y, power: this.hutch.power });
      for (const a of this.agents) {
        if (a.out.pilot) s.push({ x: a.x, y: a.y, power: PILOT_POWER, own: a === exclude });
      }
      return s;
    }

    // Photocell reading for an agent: inverse-square sources seen through a
    // narrow shroud, plus their images in the mirror, through a saturating
    // response. The agent's own pilot lamp is visible only in the mirror.
    sense(a) {
      const dir = a.eyeDir();
      const ex = a.x + Math.cos(dir) * BODY_R * 0.6, ey = a.y + Math.sin(dir) * BODY_R * 0.6;
      let total = 0;
      const see = (sx, sy, power) => {
        const dx = sx - ex, dy = sy - ey;
        const d2 = dx * dx + dy * dy;
        const ang = Math.atan2(dy, dx) - dir;
        const c = Math.cos(ang);
        if (c <= 0) return 0;
        return power * Math.pow(c, FOV_POW) / (0.04 + d2);
      };
      for (const s of this.sources(a)) {
        if (!s.own) total += see(s.x, s.y, s.power);
        const m = this.mirror;
        if (m) {
          const img = reflectPoint(s.x, s.y, m.ax, m.ay, m.bx, m.by);
          if (segIntersect(ex, ey, img.x, img.y, m.ax, m.ay, m.bx, m.by)) {
            total += 0.85 * see(img.x, img.y, s.power);
          }
        }
      }
      return 1 - Math.exp(-SENSE_GAIN * total);
    }

    collide(a) {
      let hit = false;
      const r = BODY_R;
      if (a.x < r) { a.x = r; hit = true; }
      if (a.x > this.w - r) { a.x = this.w - r; hit = true; }
      if (a.y < r) { a.y = r; hit = true; }
      if (a.y > this.h - r) { a.y = this.h - r; hit = true; }
      const pushOut = (cx, cy, minD) => {
        const dx = a.x - cx, dy = a.y - cy, d = Math.hypot(dx, dy);
        if (d < minD && d > 1e-9) { a.x = cx + dx / d * minD; a.y = cy + dy / d * minD; hit = true; }
      };
      for (const o of this.obstacles) pushOut(o.x, o.y, o.r + r);
      for (const l of this.lamps) pushOut(l.x, l.y, 0.04 + r);
      for (const b of this.agents) if (b !== a) pushOut(b.x, b.y, 2 * r);
      if (this.mirror) {
        const m = this.mirror, c = closestOnSeg(a.x, a.y, m.ax, m.ay, m.bx, m.by);
        pushOut(c.x, c.y, r);
      }
      return hit;
    }

    step(dt) {
      this.t += dt;
      for (const a of this.agents) {
        a.light = this.sense(a);
        a.charging = !!this.hutch && Math.hypot(a.x - this.hutch.x, a.y - this.hutch.y) < this.hutch.r;
        a.out = a.brain.step({ light: a.light, contact: a.contact, battery_v: a.battery, charging: a.charging }, dt * 1000);
        if (a.body === "replica") a.out = a.explorer.shape(a.out, dt * 1000);
        const { drive, steer } = a.out;
        const v = drive * V_MAX;
        if (a.body === "tricycle") {
          // Front-wheel drive and steering, as Walter built it: the
          // photocell turns with the front wheel, and the body follows.
          a.phi += steer * STEER_RATE * dt;
          a.heading += (v * Math.sin(a.phi) / WHEELBASE) * dt;
          a.x += v * Math.cos(a.phi) * Math.cos(a.heading) * dt;
          a.y += v * Math.cos(a.phi) * Math.sin(a.heading) * dt;
        } else {
          const w = mix(drive, steer, TURN_GAIN);
          const vl = w.left * V_MAX, vr = w.right * V_MAX;
          a.heading += ((vr - vl) / TRACK) * dt;
          a.x += ((vl + vr) / 2) * Math.cos(a.heading) * dt;
          a.y += ((vl + vr) / 2) * Math.sin(a.heading) * dt;
        }
        a.contact = this.collide(a);
        const effort = Math.abs(drive) + 0.5 * Math.abs(steer);
        if (a.charging && a.out.mode === Mode.Docked) a.battery = Math.min(8.4, a.battery + this.chargeRate * dt);
        else a.battery = Math.max(6.6, a.battery - this.drain * (0.3 + effort) * dt);
        a.trail.push(a.x, a.y, a.out.pilot ? 1 : 0);
        if (a.trail.length > 3 * 6000) a.trail.splice(0, 3 * 600);
      }
    }
  }

  // Preset rooms. Each returns a fresh World.
  const scenes = {
    lamp() {
      const w = new World();
      w.lamps.push({ x: 3.2, y: 0.7, power: 1 });
      w.obstacles.push({ x: 1.9, y: 1.4, r: 0.22 }, { x: 2.8, y: 2.3, r: 0.16 });
      w.agents.push(new Agent({ name: "Elsie", x: 0.6, y: 2.4, heading: -0.6 }));
      return w;
    },
    mirror() {
      const w = new World();
      w.mirror = { ax: 2.1, ay: 0.02, bx: 3.1, by: 0.02 };
      w.agents.push(new Agent({ name: "Elsie", x: 2.6, y: 0.8, heading: -1.3 }));
      return w;
    },
    pair() {
      const w = new World();
      w.agents.push(new Agent({ name: "Elmer", x: 1.2, y: 1.2, heading: 0.4, colour: "#7ec8e3" }));
      w.agents.push(new Agent({ name: "Elsie", x: 2.8, y: 1.9, heading: 3.4 }));
      return w;
    },
    hutch() {
      const w = new World({ drain: 0.02 });
      w.hutch = { x: 3.5, y: 0.5, r: 0.28, power: 4.0 };
      w.lamps.push({ x: 0.6, y: 2.5, power: 0.45 });
      w.obstacles.push({ x: 2.0, y: 1.8, r: 0.2 });
      w.agents.push(new Agent({ name: "Elsie", x: 1.2, y: 1.0, heading: 0.3, battery: 7.6 }));
      return w;
    },
  };

  const api = { Mode, defaultParams, Tortoise, Explorer, mix, World, Agent, scenes, BODY_R };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Speculatrix = api;
})(typeof self !== "undefined" ? self : this);
