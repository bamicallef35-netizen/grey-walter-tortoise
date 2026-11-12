// demo.js — the page around the model: drawing, controls, readout.
// The model itself lives in speculatrix.js and is shared with the tools.

(function () {
  "use strict";
  var S = window.Speculatrix, Mode = S.Mode, BODY_R = S.BODY_R;
  var sim = document.getElementById("sim"), trails = document.getElementById("trails");
  var sctx = sim.getContext("2d"), tctx = trails.getContext("2d");
  var stage = document.getElementById("stage"), readout = document.getElementById("readout");
  var css = getComputedStyle(document.documentElement);
  var INK = css.getPropertyValue("--ink").trim() || "#111", INK2 = css.getPropertyValue("--ink-2").trim() || "#6b6b6b";
  var RULE = css.getPropertyValue("--rule").trim() || "#d4d4d4", PAPER2 = css.getPropertyValue("--paper-2").trim() || "#f4f4f4";
  var ACCENT = css.getPropertyValue("--accent").trim() || "#0000ee";
  var FONT = "12px " + getComputedStyle(document.body).fontFamily;

  var state = { scene: "lamp", body: "tricycle", speed: 1.5, trails: true, running: true };
  var world = null, dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  var view = { s: 1, ox: 0, oy: 0, W: 0, H: 0 };

  // The light in the room, sampled on a grid and drawn as a halftone. It
  // only changes when a lamp moves, so it is drawn once into its own canvas.
  var fieldLayer = document.createElement("canvas"), fctx = fieldLayer.getContext("2d");
  var field = { dirty: true, cols: 0, rows: 0, v: null };

  function buildWorld() {
    world = S.scenes[state.scene]();
    for (var i = 0; i < world.agents.length; i++) world.agents[i].body = state.body;
    field.dirty = true;
    clearTrails();
  }
  function fit() {
    var r = stage.getBoundingClientRect();
    view.W = r.width; view.H = r.height;
    [sim, trails, fieldLayer].forEach(function (c) { c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); });
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0); tctx.setTransform(dpr, 0, 0, dpr, 0, 0); fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    field.dirty = true;
    clearTrails();
  }
  function computeView() {
    var pad = 16, s = Math.min((view.W - 2 * pad) / world.w, (view.H - 2 * pad) / world.h);
    view.s = s; view.ox = (view.W - world.w * s) / 2; view.oy = (view.H - world.h * s) / 2;
  }
  function sx(x) { return view.ox + x * view.s; }
  function sy(y) { return view.oy + y * view.s; }
  function toWorld(cx, cy) { return { x: (cx - view.ox) / view.s, y: (cy - view.oy) / view.s }; }
  function clearTrails() { tctx.save(); tctx.setTransform(1, 0, 0, 1, 0, 0); tctx.clearRect(0, 0, trails.width, trails.height); tctx.restore(); }

  function drawRoom() {
    sctx.clearRect(0, 0, view.W, view.H);
    computeView();
    sctx.strokeStyle = RULE; sctx.lineWidth = 1;
    sctx.strokeRect(sx(0) + 0.5, sy(0) + 0.5, world.w * view.s, world.h * view.s);
  }
  // Sample the room's light on a grid of nodes about 14 px apart.
  function sampleField() {
    var cols = Math.max(8, Math.round(world.w * view.s / 14)), rows = Math.max(6, Math.round(cols * world.h / world.w));
    var v = new Float32Array((cols + 1) * (rows + 1));
    for (var j = 0; j <= rows; j++) for (var i = 0; i <= cols; i++) {
      v[j * (cols + 1) + i] = world.fieldAt(i * world.w / cols, j * world.h / rows);
    }
    field.cols = cols; field.rows = rows; field.v = v;
  }
  function nodeX(i) { return sx(i * world.w / field.cols); }
  function nodeY(j) { return sy(j * world.h / field.rows); }
  function paintField() {
    fctx.clearRect(0, 0, view.W, view.H);
    var cell = world.w * view.s / field.cols, rmax = cell * 0.36;
    fctx.fillStyle = INK;
    for (var j = 0; j <= field.rows; j++) for (var i = 0; i <= field.cols; i++) {
      var val = field.v[j * (field.cols + 1) + i];
      if (val < 0.01) continue;
      fctx.globalAlpha = 0.05 + 0.09 * val;
      fctx.beginPath(); fctx.arc(nodeX(i), nodeY(j), rmax * Math.sqrt(val), 0, 7); fctx.fill();
    }
    fctx.globalAlpha = 1;
  }

  // Marching squares: the line where the room's light crosses `level`,
  // returned as screen-space segments [x1, y1, x2, y2, ...].
  function contour(level) {
    var out = [], c1 = field.cols + 1, v = field.v;
    function lerp(a, b, va, vb) { return a + (b - a) * (level - va) / (vb - va); }
    for (var j = 0; j < field.rows; j++) for (var i = 0; i < field.cols; i++) {
      var a = v[j * c1 + i], b = v[j * c1 + i + 1], c = v[(j + 1) * c1 + i + 1], d = v[(j + 1) * c1 + i];
      var x0 = nodeX(i), x1 = nodeX(i + 1), y0 = nodeY(j), y1 = nodeY(j + 1), p = [];
      if ((a >= level) !== (b >= level)) p.push(lerp(x0, x1, a, b), y0);   // top
      if ((b >= level) !== (c >= level)) p.push(x1, lerp(y0, y1, b, c));   // right
      if ((d >= level) !== (c >= level)) p.push(lerp(x0, x1, d, c), y1);   // bottom
      if ((a >= level) !== (d >= level)) p.push(x0, lerp(y0, y1, a, d));   // left
      if (p.length === 4) out.push(p[0], p[1], p[2], p[3]);
      else if (p.length === 8) {
        // Saddle: pair the crossings according to the value at the centre.
        if ((a + b + c + d) / 4 >= level === a >= level) out.push(p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7]);
        else out.push(p[0], p[1], p[6], p[7], p[2], p[3], p[4], p[5]);
      }
    }
    return out;
  }
  function drawContour(level, dash, label) {
    if (!(level < 1)) return;
    var seg = contour(level);
    if (!seg.length) return;
    sctx.strokeStyle = INK2; sctx.lineWidth = 1; sctx.setLineDash(dash);
    sctx.beginPath();
    var top = 0;
    for (var k = 0; k < seg.length; k += 4) {
      sctx.moveTo(seg[k], seg[k + 1]); sctx.lineTo(seg[k + 2], seg[k + 3]);
      if (seg[k + 1] < seg[top + 1]) top = k;
    }
    sctx.stroke(); sctx.setLineDash([]);
    var lx = seg[top], ly = seg[top + 1];
    sctx.font = FONT; sctx.fillStyle = INK2; sctx.textAlign = "center";
    sctx.fillText(label, lx, ly < sy(0) + 16 ? ly + 14 : ly - 5); sctx.textAlign = "start";
  }
  // The two rings that explain the behaviour: inside "lock" a tortoise facing
  // the lamp drives at it; inside "dazzle" it swerves away. The dazzle ring
  // follows the first tortoise's battery, so it shrinks as the battery runs down.
  function drawRings() {
    var a = world.agents[0];
    if (!a) return;
    drawContour(a.brain.p.lock_level, [3, 3], "lock");
    drawContour(a.brain.dazzleThreshold(a.battery), [], "dazzle");
  }

  function drawLamp(l) {
    var cx = sx(l.x), cy = sy(l.y), r = Math.max(3, 0.03 * view.s);
    sctx.strokeStyle = INK2; sctx.lineWidth = 1;
    sctx.beginPath(); sctx.arc(cx, cy, r * 3.2 * Math.sqrt(l.power), 0, 7); sctx.stroke();
    sctx.fillStyle = INK; sctx.beginPath(); sctx.arc(cx, cy, r, 0, 7); sctx.fill();
  }
  function drawHutch(hc) {
    var cx = sx(hc.x), cy = sy(hc.y), r = hc.r * view.s;
    sctx.strokeStyle = INK2; sctx.lineWidth = 1; sctx.setLineDash([4, 4]);
    sctx.beginPath(); sctx.arc(cx, cy, r, 0, 7); sctx.stroke(); sctx.setLineDash([]);
    sctx.fillStyle = INK; sctx.beginPath(); sctx.arc(cx, cy, 3, 0, 7); sctx.fill();
    sctx.fillStyle = INK2; sctx.font = FONT; sctx.textAlign = "center"; sctx.fillText("hutch", cx, cy - r - 5); sctx.textAlign = "start";
  }
  function drawObstacle(o) {
    var cx = sx(o.x), cy = sy(o.y), r = o.r * view.s;
    sctx.fillStyle = PAPER2; sctx.beginPath(); sctx.arc(cx, cy, r, 0, 7); sctx.fill();
    sctx.strokeStyle = RULE; sctx.lineWidth = 1; sctx.stroke();
  }
  function drawMirror(m) {
    sctx.strokeStyle = INK; sctx.lineWidth = 2; sctx.lineCap = "butt";
    sctx.beginPath(); sctx.moveTo(sx(m.ax), sy(m.ay)); sctx.lineTo(sx(m.bx), sy(m.by)); sctx.stroke();
  }
  function drawAgent(a) {
    var cx = sx(a.x), cy = sy(a.y), r = BODY_R * view.s, dir = a.eyeDir();
    sctx.strokeStyle = INK; sctx.lineWidth = 1;
    sctx.beginPath(); sctx.arc(cx, cy, r, 0, 7); sctx.stroke();
    sctx.beginPath(); sctx.moveTo(cx, cy); sctx.lineTo(cx + Math.cos(dir) * r * 1.5, cy + Math.sin(dir) * r * 1.5); sctx.stroke();
    if (a.out.pilot) { sctx.fillStyle = ACCENT; sctx.beginPath(); sctx.arc(cx, cy, Math.max(2.5, r * 0.3), 0, 7); sctx.fill(); }
    sctx.fillStyle = INK2; sctx.font = FONT; sctx.textAlign = "center"; sctx.fillText(a.name.toLowerCase(), cx, cy - r - 5); sctx.textAlign = "start";
  }
  function paintTrails() {
    if (!state.trails) return;
    for (var i = 0; i < world.agents.length; i++) {
      var a = world.agents[i], cx = sx(a.x), cy = sy(a.y);
      tctx.fillStyle = "rgba(17,17,17,0.05)"; tctx.beginPath(); tctx.arc(cx, cy, 1.2, 0, 7); tctx.fill();
      if (a.out.pilot) { tctx.fillStyle = "rgba(0,0,238,0.32)"; tctx.beginPath(); tctx.arc(cx, cy, 1.6, 0, 7); tctx.fill(); }
    }
  }
  function pad(s, n) { s = String(s); while (s.length < n) s += " "; return s; }
  function updateReadout() {
    var lines = [];
    for (var i = 0; i < world.agents.length; i++) {
      var a = world.agents[i];
      lines.push(
        pad(a.name.toLowerCase() + " / " + (a.body === "tricycle" ? "tricycle" : "replica"), 18) +
        pad(a.out.mode, 9) +
        pad("light " + (a.light * 100).toFixed(0) + "%", 12) +
        pad("dazzle " + a.brain.dazzleThreshold(a.battery).toFixed(2), 13) +
        pad("battery " + a.battery.toFixed(2) + " V (" + (a.brain.charge(a.battery) * 100).toFixed(0) + "%)", 24) +
        "pilot " + (a.out.pilot ? "on" : "off")
      );
    }
    readout.textContent = lines.join("\n");
  }

  var last = 0;
  function frame(now) {
    if (!last) last = now;
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (state.running) {
      var simDt = dt * state.speed;
      while (simDt > 1e-4) { var h = Math.min(0.02, simDt); world.step(h); simDt -= h; paintTrails(); }
    }
    drawRoom();
    if (field.dirty) { sampleField(); paintField(); field.dirty = false; }
    sctx.drawImage(fieldLayer, 0, 0, view.W, view.H);
    drawRings();
    if (world.mirror) drawMirror(world.mirror);
    world.obstacles.forEach(drawObstacle);
    if (world.hutch) drawHutch(world.hutch);
    world.lamps.forEach(drawLamp);
    world.agents.forEach(drawAgent);
    updateReadout();
    requestAnimationFrame(frame);
  }

  function press(container, key, value) {
    container.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset[key] === value ? "true" : "false"); });
  }
  document.getElementById("scenes").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    state.scene = b.dataset.scene; press(e.currentTarget, "scene", state.scene); buildWorld();
  });
  document.getElementById("bodies").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    state.body = b.dataset.body; press(e.currentTarget, "body", state.body);
    for (var i = 0; i < world.agents.length; i++) world.agents[i].body = state.body;
    clearTrails();
  });
  var speed = document.getElementById("speed"), speedVal = document.getElementById("speedVal");
  speed.addEventListener("input", function () { state.speed = parseFloat(speed.value); speedVal.textContent = state.speed.toFixed(2).replace(/\.?0+$/, "") + "×"; });
  var trailsToggle = document.getElementById("trailsToggle");
  trailsToggle.addEventListener("click", function () {
    state.trails = !state.trails; trailsToggle.setAttribute("aria-pressed", String(state.trails));
    trails.style.display = state.trails ? "block" : "none"; if (!state.trails) clearTrails();
  });
  var playPause = document.getElementById("playPause");
  playPause.addEventListener("click", function () {
    state.running = !state.running; playPause.setAttribute("aria-pressed", String(state.running));
    playPause.textContent = state.running ? "running" : "paused";
  });
  document.getElementById("reset").addEventListener("click", buildWorld);
  stage.addEventListener("pointerdown", function (e) {
    var r = stage.getBoundingClientRect(), p = toWorld(e.clientX - r.left, e.clientY - r.top);
    if (p.x < 0.05 || p.x > world.w - 0.05 || p.y < 0.05 || p.y > world.h - 0.05) return;
    world.lamps.push({ x: p.x, y: p.y, power: 1 });
    field.dirty = true;
  });
  window.addEventListener("resize", fit);
  buildWorld(); fit(); requestAnimationFrame(frame);
})();
