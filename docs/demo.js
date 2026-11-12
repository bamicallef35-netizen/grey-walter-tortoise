// demo.js — the page around the model: drawing, controls, status panel.
// The model itself lives in speculatrix.js and is shared with the tools.

(function () {
  "use strict";
  var S = window.Speculatrix, Mode = S.Mode, BODY_R = S.BODY_R;
  var sim = document.getElementById("sim"), trails = document.getElementById("trails");
  var sctx = sim.getContext("2d"), tctx = trails.getContext("2d");
  var stage = document.getElementById("stage"), statusEl = document.getElementById("status");
  var css = getComputedStyle(document.documentElement);
  var INK = css.getPropertyValue("--ink").trim() || "#111", INK2 = css.getPropertyValue("--ink-2").trim() || "#6b6b6b";
  var RULE = css.getPropertyValue("--rule").trim() || "#d4d4d4", PAPER2 = css.getPropertyValue("--paper-2").trim() || "#f4f4f4";
  var PAPER = css.getPropertyValue("--paper").trim() || "#ffffff";
  var ACCENT = css.getPropertyValue("--accent").trim() || "#0000ee";
  var FONT = "12px " + getComputedStyle(document.body).fontFamily;

  var state = { scene: "lamp", body: "tricycle", speed: 1.5, trails: true, running: true, tool: "lamp" };
  var world = null, dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  var view = { s: 1, ox: 0, oy: 0, W: 0, H: 0 };

  // The light in the room, sampled on a grid and drawn as a halftone. It
  // only changes when a lamp moves, so it is drawn once into its own canvas.
  var fieldLayer = document.createElement("canvas"), fctx = fieldLayer.getContext("2d");
  var field = { dirty: true, cols: 0, rows: 0, v: null };
  var lastPos = new Map();   // each tortoise's last screen position, for the trails

  function buildWorld() {
    world = S.scenes[state.scene]();
    for (var i = 0; i < world.agents.length; i++) world.agents[i].body = state.body;
    field.dirty = true;
    clearTrails();
    buildStatus();
  }
  // Size the canvases to the stage. Phones fire resize events while
  // scrolling (the address bar comes and goes), so nothing happens unless
  // the stage itself changed size, and the trails drawn so far are kept.
  function fit() {
    var r = stage.getBoundingClientRect();
    if (Math.round(r.width) === Math.round(view.W) && Math.round(r.height) === Math.round(view.H)) return;
    var old = null;
    if (trails.width && trails.height) {
      old = document.createElement("canvas"); old.width = trails.width; old.height = trails.height;
      old.getContext("2d").drawImage(trails, 0, 0);
    }
    view.W = r.width; view.H = r.height;
    [sim, trails, fieldLayer].forEach(function (c) { c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); });
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0); tctx.setTransform(dpr, 0, 0, dpr, 0, 0); fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    field.dirty = true;
    lastPos.clear();
    if (old) tctx.drawImage(old, 0, 0, view.W, view.H);
  }
  function computeView() {
    var pad = 16, s = Math.min((view.W - 2 * pad) / world.w, (view.H - 2 * pad) / world.h);
    view.s = s; view.ox = (view.W - world.w * s) / 2; view.oy = (view.H - world.h * s) / 2;
  }
  function sx(x) { return view.ox + x * view.s; }
  function sy(y) { return view.oy + y * view.s; }
  function toWorld(cx, cy) { return { x: (cx - view.ox) / view.s, y: (cy - view.oy) / view.s }; }
  function clearTrails() { lastPos.clear(); tctx.save(); tctx.setTransform(1, 0, 0, 1, 0, 0); tctx.clearRect(0, 0, trails.width, trails.height); tctx.restore(); }

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
    sctx.fillStyle = PAPER; sctx.strokeStyle = INK2; sctx.lineWidth = 1;
    sctx.beginPath(); sctx.arc(cx, cy, r * 3.2 * Math.sqrt(l.power), 0, 7); sctx.fill(); sctx.stroke();
    sctx.fillStyle = INK; sctx.beginPath(); sctx.arc(cx, cy, r, 0, 7); sctx.fill();
    sctx.fillStyle = INK2; sctx.font = FONT; sctx.fillText("lamp", cx + r * 3.2 * Math.sqrt(l.power) + 5, cy + 4);
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
    sctx.fillStyle = INK2; sctx.font = FONT; sctx.textAlign = "center";
    sctx.fillText("mirror", sx((m.ax + m.bx) / 2), sy((m.ay + m.by) / 2) + 16); sctx.textAlign = "start";
  }
  // Half-width of the photocell's view: the angle at which its shroud
  // passes half the light (cos^n = 1/2).
  var VIEW_HALF = Math.acos(Math.pow(0.5, 1 / S.FOV_POW));
  function drawAgent(a) {
    var cx = sx(a.x), cy = sy(a.y), r = BODY_R * view.s, dir = a.eyeDir(), mode = a.out.mode;
    // What the photocell is looking at.
    sctx.save();
    sctx.beginPath(); sctx.rect(sx(0), sy(0), world.w * view.s, world.h * view.s); sctx.clip();
    sctx.fillStyle = INK; sctx.globalAlpha = 0.07;
    sctx.beginPath(); sctx.moveTo(cx, cy); sctx.arc(cx, cy, Math.max(r * 4, 0.8 * view.s), dir - VIEW_HALF, dir + VIEW_HALF); sctx.closePath(); sctx.fill();
    sctx.restore();
    // The shell, drawn heavier while it is pressed against something.
    sctx.fillStyle = PAPER; sctx.strokeStyle = INK; sctx.lineWidth = mode === Mode.Contact ? 2.5 : 1.25;
    sctx.beginPath(); sctx.arc(cx, cy, r, 0, 7); sctx.fill(); sctx.stroke();
    sctx.strokeStyle = RULE; sctx.lineWidth = 1;
    sctx.beginPath(); sctx.arc(cx, cy, r * 0.62, 0, 7); sctx.stroke();
    // The steering column with the photocell on it.
    var ex = cx + Math.cos(dir) * r * 1.2, ey = cy + Math.sin(dir) * r * 1.2;
    sctx.strokeStyle = INK; sctx.lineWidth = 1.5;
    sctx.beginPath(); sctx.moveTo(cx, cy); sctx.lineTo(ex, ey); sctx.stroke();
    sctx.fillStyle = INK; sctx.beginPath(); sctx.arc(ex, ey, 2.2, 0, 7); sctx.fill();
    // The pilot lamp, lit only while it scans in the dark.
    if (a.out.pilot) {
      sctx.fillStyle = ACCENT; sctx.globalAlpha = 0.18;
      sctx.beginPath(); sctx.arc(cx, cy, r * 0.62, 0, 7); sctx.fill();
      sctx.globalAlpha = 1;
      sctx.beginPath(); sctx.arc(cx, cy, Math.max(2.5, r * 0.28), 0, 7); sctx.fill();
    } else {
      sctx.strokeStyle = INK2; sctx.lineWidth = 1;
      sctx.beginPath(); sctx.arc(cx, cy, Math.max(2.5, r * 0.28), 0, 7); sctx.stroke();
    }
    // Name and what it is doing.
    var ty = cy - r - 7 < sy(0) + 12 ? cy + r + 15 : cy - r - 7;
    sctx.font = FONT; sctx.textAlign = "center";
    sctx.fillStyle = INK; sctx.fillText(a.name.toLowerCase() + " · " + mode, cx, ty);
    sctx.textAlign = "start";
  }
  // Open-shutter trails, as in Walter's photographs: a fine line for the
  // path, a broad blue stroke wherever the pilot lamp was lit.
  function paintTrails() {
    if (!state.trails) return;
    tctx.lineCap = "round";
    for (var i = 0; i < world.agents.length; i++) {
      var a = world.agents[i], cx = sx(a.x), cy = sy(a.y), p = lastPos.get(a);
      lastPos.set(a, { x: cx, y: cy });
      if (!p || Math.abs(p.x - cx) + Math.abs(p.y - cy) > 30) continue;   // a jump, e.g. after a drag
      if (a.out.pilot) {
        tctx.strokeStyle = ACCENT; tctx.globalAlpha = 0.14; tctx.lineWidth = 3.5;
        tctx.beginPath(); tctx.moveTo(p.x, p.y); tctx.lineTo(cx, cy); tctx.stroke();
      }
      tctx.strokeStyle = INK; tctx.globalAlpha = 0.35; tctx.lineWidth = 0.8;
      tctx.beginPath(); tctx.moveTo(p.x, p.y); tctx.lineTo(cx, cy); tctx.stroke();
    }
    tctx.globalAlpha = 1;
  }
  // ── Status panel ──────────────────────────────────────────────────────
  // One block per tortoise: the six modes with the current one marked, a
  // line saying what that mode means, and gauges for light and battery.
  // The light gauge carries the lock and dazzle thresholds as ticks, so
  // the reason for each change of mode can be read off it.
  var MODES = [Mode.Scan, Mode.Glimpse, Mode.Lock, Mode.Dazzle, Mode.Contact, Mode.Docked];
  var WHY = {};
  WHY[Mode.Scan] = "Dark. It sweeps the photocell round, looking for light. Pilot lamp on.";
  WHY[Mode.Glimpse] = "A faint rise in light. The sweep pauses to see if it holds.";
  WHY[Mode.Lock] = "Moderate light. Steering stops and it drives straight at the source.";
  WHY[Mode.Dazzle] = "Too bright. Steering restarts so it swerves away from the glare.";
  WHY[Mode.Contact] = "Shell pushed. It alternates pushing and steering to work round the obstacle, ignoring light.";
  WHY[Mode.Docked] = "On the charger with a flat battery. It rests until charged.";
  var RUN = "Dark. A short straight run between sweeps (the two-wheel adaptation, see below).";
  var panels = [], lastStatus = 0;

  function buildStatus() {
    statusEl.innerHTML = ""; panels = [];
    world.agents.forEach(function (a) {
      var el = document.createElement("div");
      el.className = "tortoise";
      el.innerHTML =
        '<div class="who"></div>' +
        '<div class="modes">' + MODES.map(function (m) { return '<span data-m="' + m + '">' + m + '</span>'; }).join("") + '</div>' +
        '<p class="why"></p>' +
        '<div class="gauge"><span class="lbl">light</span><span class="bar wide"><i></i><b class="tick" data-label="lock"></b><b class="tick" data-label="dazzle"></b></span><span class="val"></span></div>' +
        '<div class="gauge"><span class="lbl">battery</span><span class="bar wide"><i></i></span><span class="val"></span></div>';
      statusEl.appendChild(el);
      var bars = el.querySelectorAll(".bar > i"), vals = el.querySelectorAll(".val"), ticks = el.querySelectorAll(".tick");
      panels.push({ a: a, who: el.querySelector(".who"), chips: el.querySelectorAll(".modes span"), why: el.querySelector(".why"),
        light: bars[0], lightVal: vals[0], lock: ticks[0], dazzle: ticks[1], batt: bars[1], battVal: vals[1], key: "" });
    });
    lastStatus = 0;
  }
  function updateStatus(now) {
    if (now - lastStatus < 100) return;   // ten times a second is plenty to read
    lastStatus = now;
    panels.forEach(function (p) {
      var a = p.a, mode = a.out.mode, run = a.body === "replica" && mode === Mode.Scan && a.explorer.runLeft > 0;
      var who = a.name.toLowerCase() + " / " + (a.body === "tricycle" ? "1949 tricycle" : "two-wheel replica");
      var key = who + mode + run;
      if (key !== p.key) {
        p.key = key; p.who.textContent = who;
        p.chips.forEach(function (c) { c.className = c.dataset.m === mode ? "on" : ""; });
        p.why.textContent = run ? RUN : WHY[mode];
      }
      var dz = a.brain.dazzleThreshold(a.battery), charge = a.brain.charge(a.battery);
      p.light.style.width = (a.light * 100).toFixed(1) + "%";
      p.lightVal.textContent = (a.light * 100).toFixed(0) + "%";
      p.lock.style.left = (a.brain.p.lock_level * 100) + "%";
      p.dazzle.style.left = (Math.min(dz, 1) * 100).toFixed(1) + "%";
      p.dazzle.style.display = dz < 1 ? "" : "none";
      p.batt.style.width = (charge * 100).toFixed(1) + "%";
      p.battVal.textContent = (charge * 100).toFixed(0) + "% · " + a.battery.toFixed(2) + " V";
    });
  }

  var last = 0;
  function frame(now) {
    if (!last) last = now;
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (state.running) {
      var simDt = dt * state.speed;
      while (simDt > 1e-4) { var h = Math.min(0.02, simDt); world.step(h); simDt -= h; if (drag && drag.kind === "agent" && drag.p) moveTo(drag, drag.p); paintTrails(); }
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
    updateStatus(now);
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

  // ── Editing the room ──────────────────────────────────────────────────
  // Press on a tortoise, lamp, block or the hutch to drag it. Press on
  // empty floor to add whatever the "tap" control is set to; with erase
  // set, pressing a lamp or block removes it.
  var drag = null;
  document.getElementById("tools").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    state.tool = b.dataset.tool; press(e.currentTarget, "tool", state.tool);
  });
  function pointerToWorld(e) {
    var r = stage.getBoundingClientRect();
    return toWorld(e.clientX - r.left, e.clientY - r.top);
  }
  function inRoom(p) { return p.x > 0.05 && p.x < world.w - 0.05 && p.y > 0.05 && p.y < world.h - 0.05; }
  function hitTest(p) {
    var best = null, bestD = Infinity, touch = 22 / view.s;   // at least 22 px to aim at
    function consider(kind, list, item, x, y, r) {
      var d = Math.hypot(p.x - x, p.y - y);
      if (d < Math.max(r, touch) && d < bestD) { best = { kind: kind, list: list, item: item }; bestD = d; }
    }
    world.agents.forEach(function (a) { consider("agent", world.agents, a, a.x, a.y, BODY_R * 1.3); });
    world.lamps.forEach(function (l) { consider("lamp", world.lamps, l, l.x, l.y, 0.14); });
    world.obstacles.forEach(function (o) { consider("block", world.obstacles, o, o.x, o.y, o.r + 0.03); });
    if (world.hutch) consider("hutch", null, world.hutch, world.hutch.x, world.hutch.y, world.hutch.r);
    return best;
  }
  function moveTo(hit, p) {
    hit.p = p;
    hit.item.x = Math.max(0.05, Math.min(world.w - 0.05, p.x));
    hit.item.y = Math.max(0.05, Math.min(world.h - 0.05, p.y));
    if (hit.kind === "agent") lastPos.delete(hit.item);   // no trail streak across the room
    else field.dirty = true;
  }
  stage.addEventListener("pointerdown", function (e) {
    var p = pointerToWorld(e);
    if (!inRoom(p)) return;
    var hit = hitTest(p);
    if (state.tool === "erase") {
      if (hit && hit.list && hit.kind !== "agent") { hit.list.splice(hit.list.indexOf(hit.item), 1); field.dirty = true; }
      return;
    }
    if (!hit) {
      var item = state.tool === "block" ? { x: p.x, y: p.y, r: 0.18 } : { x: p.x, y: p.y, power: 1 };
      var list = state.tool === "block" ? world.obstacles : world.lamps;
      list.push(item); field.dirty = true;
      hit = { kind: state.tool, list: list, item: item };
    }
    drag = hit; drag.p = hit.kind === "agent" ? { x: hit.item.x, y: hit.item.y } : null;
    stage.setPointerCapture(e.pointerId);
    stage.style.cursor = "grabbing";
  });
  stage.addEventListener("pointermove", function (e) {
    var p = pointerToWorld(e);
    if (drag) { moveTo(drag, p); return; }
    if (e.pointerType === "mouse") stage.style.cursor = hitTest(p) ? (state.tool === "erase" ? "pointer" : "grab") : (state.tool === "erase" ? "default" : "crosshair");
  });
  function endDrag() { drag = null; stage.style.cursor = ""; }
  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", endDrag);
  window.addEventListener("resize", fit);
  buildWorld(); fit(); requestAnimationFrame(frame);
})();
