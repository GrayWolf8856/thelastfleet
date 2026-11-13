// Runners: the world chart. One canvas, no libraries. Data: world-data.js (generated); pictures: captures.json.
(function () {
  'use strict';
  var D = window.RUNNERS_WORLD;
  var mapEl = document.getElementById('map');
  if (!D || !mapEl) return;

  // ------------------------------------------------------------------ world geometry (pointy hexes, odd rows half a sector east)
  var W = D.meta.W, SW = D.meta.SW, SH = D.meta.SH, RY = SH * 2 / 3, COLS = D.meta.cols, ROWS = D.meta.rows;
  var TOP = -RY - 1500, BOTTOM = (ROWS - 1) * SH + RY + 1500;
  var HEXC = [[0, -RY], [SW / 2, -RY / 2], [SW / 2, RY / 2], [0, RY], [-SW / 2, RY / 2], [-SW / 2, -RY / 2]];
  var NB_EVEN = [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]];
  var NB_ODD = [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]];
  var EDGE = [[1, 2], [0, 1], [5, 0], [4, 5], [3, 4], [2, 3]];
  var codeOf = function (c, r) { return (c + 1) + String.fromCharCode(65 + r); };
  var SEC = D.sectors, CODES = Object.keys(SEC);
  CODES.forEach(function (k) { var s = SEC[k]; s.code = k; s.x = s.c * SW + (s.r % 2 ? SW / 2 : 0); s.y = s.r * SH; });
  function neighbour(s, d) {
    var o = (s.r % 2 ? NB_ODD : NB_EVEN)[d], r = s.r + o[1];
    if (r < 0 || r >= ROWS) return null;
    return codeOf(((s.c + o[0]) % COLS + COLS) % COLS, r);
  }
  function hexAt(x, y) {
    var k = (Math.sqrt(3) / 2 * SW) / SH, best = null, bd = Infinity, r0 = Math.floor(y / SH);
    x = ((x % W) + W) % W;
    for (var r = r0 - 1; r <= r0 + 2; r++) {
      if (r < 0 || r >= ROWS) continue;
      var off = r % 2 ? SW / 2 : 0, c0 = Math.round((x - off) / SW);
      for (var c = c0 - 1; c <= c0 + 1; c++) {
        var dx = x - (c * SW + off), dy = (y - r * SH) * k, d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = codeOf(((c % COLS) + COLS) % COLS, r); }
      }
    }
    return best;
  }
  function hexInto(p, s, k) {
    k = k || 1;
    for (var i = 0; i < 6; i++) { var X = s.x + HEXC[i][0] * k, Y = s.y + HEXC[i][1] * k; i ? p.lineTo(X, Y) : p.moveTo(X, Y); }
    p.closePath();
  }
  function edgeInto(p, s, d, k) {
    k = k || 1; var e = EDGE[d], a = HEXC[e[0]], b = HEXC[e[1]];
    p.moveTo(s.x + a[0] * k, s.y + a[1] * k); p.lineTo(s.x + b[0] * k, s.y + b[1] * k);
  }
  function outline(codes, k) {   // outer edges of a set of sectors
    var set = {}, p = new Path2D();
    codes.forEach(function (c) { set[c] = 1; });
    codes.forEach(function (c) {
      var s = SEC[c]; if (!s) return;
      for (var d = 0; d < 6; d++) { var n = neighbour(s, d); if (!n || !set[n]) edgeInto(p, s, d, k); }
    });
    return p;
  }

  // ------------------------------------------------------------------ colours
  var T = D.territories, SEAS = D.seas;
  var RISK_COL = ['#2c8c7f', '#3f9f86', '#78ad6e', '#a9b25a', '#cfa64a', '#d98a3c', '#d9673a', '#cc4434', '#b02a32', '#8a1020'];
  var riskWord = {}; D.risk.forEach(function (r) { riskWord[r[0]] = r[1]; });
  var KIND_COL = { toll: '#ff6a4d', stronghold: '#ff6a4d', crew: '#e06666', gate: '#e3b55c', fallout: '#c9e04a', drone: '#ff2d4a',
    city: '#d6b98a', graveyard: '#b9c3cc', fishing: '#f1c232', salvage: '#d6b98a', no_fuel: '#a79bf0' };
  function hexA(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  // ------------------------------------------------------------------ paths (world metres), built once
  var LAND = new Path2D(), LS = D.meta.landScale;
  D.land.forEach(function (ring) {
    for (var i = 0; i < ring.length; i += 2) { var X = ring[i] * LS, Y = ring[i + 1] * LS; i ? LAND.lineTo(X, Y) : LAND.moveTo(X, Y); }
    LAND.closePath();
  });
  function groupPaths(keyOf) {
    var g = {};
    CODES.forEach(function (c) { var s = SEC[c], k = keyOf(s); if (k == null) return; (g[k] = g[k] || new Path2D()); hexInto(g[k], s); });
    return g;
  }
  var FILL = {
    holders: groupPaths(function (s) { return s.t; }),
    seas: groupPaths(function (s) { return s.s || null; }),
    danger: groupPaths(function (s) { return s.k === 'closed' ? null : s.d; })
  };
  var drownedCodes = CODES.filter(function (c) { return SEC[c].k === 'drowned'; });
  var DROWNED = new Path2D(); drownedCodes.forEach(function (c) { hexInto(DROWNED, SEC[c]); });
  var DROWNED_FILL = { holders: groupPaths(function (s) { return s.k === 'drowned' ? s.t : null; }),
    seas: groupPaths(function (s) { return s.k === 'drowned' ? s.s || null : null; }),
    danger: groupPaths(function (s) { return s.k === 'drowned' ? s.d : null; }) };
  var CLOSED = new Path2D(); CODES.forEach(function (c) { if (SEC[c].k === 'closed') hexInto(CLOSED, SEC[c], 0.97); });
  var GRID = new Path2D(); CODES.forEach(function (c) { hexInto(GRID, SEC[c]); });
  function borderPath(keyOf) {
    var p = new Path2D();
    CODES.forEach(function (c) {
      var s = SEC[c];
      for (var d = 0; d < 6; d++) {
        var n = neighbour(s, d); if (!n || !SEC[n]) continue;
        if (keyOf(SEC[n]) !== keyOf(s) && c < n) edgeInto(p, s, d);
      }
    });
    return p;
  }
  var BORDER = { holders: borderPath(function (s) { return s.t; }), seas: borderPath(function (s) { return s.s; }) };
  var REACH = new Path2D(); CODES.forEach(function (c) { if (SEC[c].t === 'drone_core') hexInto(REACH, SEC[c]); });

  // ------------------------------------------------------------------ places and ports
  var PORTS = D.ports, PLACES = D.places;
  PORTS.forEach(function (p) { p.isPort = true; p.rank = p.major ? 0 : 1; });
  var BY_HASH = {};
  PORTS.forEach(function (p) { BY_HASH[p.hash] = p; });
  PLACES.forEach(function (p) {
    BY_HASH[p.hash] = p;
    if (p.sectors && p.sectors.length > 1) p.outline = outline(p.sectors, 0.94);
    p.outlineSel = outline(p.sectors || [], 0.97);
  });
  var tollPlaces = PLACES.filter(function (p) { return p.kind === 'toll'; });
  var hotCoast = PLACES.filter(function (p) { return p.id === 'hot_coast'; })[0];
  // where to letter each sea's name: the member with the most members around it
  var SEA_LABEL = {};
  Object.keys(SEAS).forEach(function (id) {
    var scored = [];
    CODES.forEach(function (c) {
      var s = SEC[c]; if (s.s !== id) return;
      var n = 0;
      for (var d = 0; d < 6; d++) { var a = neighbour(s, d); if (a && SEC[a] && SEC[a].s === id) { n += 2; for (var e = 0; e < 6; e++) { var b = neighbour(SEC[a], e); if (b && SEC[b] && SEC[b].s === id) n++; } } }
      scored.push([n, s]);
    });
    scored.sort(function (a, b) { return b[0] - a[0]; });
    if (scored.length) SEA_LABEL[id] = scored.slice(0, 6).map(function (x) { return x[1]; });
  });

  // ------------------------------------------------------------------ canvas and view
  var cv = document.getElementById('chart'), ctx = cv.getContext('2d');
  var DPR = 1, CW = 0, CH = 0;
  var V = { s: 0.003, cx: W / 2, cy: (ROWS - 1) * SH / 2 };
  var mode = 'holders', showPlaces = true, sel = null, hits = [], started = false;
  function minScale() { return Math.min(CW / W, CH / (BOTTOM - TOP)) * 0.98; }
  function maxScale() { return 900 / SW; }
  function clampView() {
    V.s = Math.max(minScale(), Math.min(maxScale(), V.s));
    V.cx = ((V.cx % W) + W) % W;
    // the chart may slide a little past the world's top and bottom, so a place near the edge can sit
    // in the part of the chart a panel leaves open
    var half = CH / 2 / V.s, slack = 0.35 * CH / V.s;
    if (BOTTOM - TOP <= 2 * half) V.cy = (TOP + BOTTOM) / 2;
    else V.cy = Math.max(TOP + half - slack, Math.min(BOTTOM - half + slack, V.cy));
  }
  function homeView() {
    if (CW >= 760) { V.s = CH / (BOTTOM - TOP); V.cx = 195000; V.cy = 56000; }
    else { V.s = (CH - 30) / (BOTTOM - TOP); V.cx = 272000; V.cy = 56000; }
    clampView();
  }
  function resize() {
    var r = mapEl.getBoundingClientRect();
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    CW = Math.max(1, Math.round(r.width)); CH = Math.max(1, Math.round(r.height));
    cv.width = Math.round(CW * DPR); cv.height = Math.round(CH * DPR);
    if (!started) { homeView(); started = true; } else clampView();
    draw();
  }
  var sx = function (x, off) { return (x + off - V.cx) * V.s + CW / 2; };
  var sy = function (y) { return (y - V.cy) * V.s + CH / 2; };
  function toWorld(px, py) { return [(px - CW / 2) / V.s + V.cx, (py - CH / 2) / V.s + V.cy]; }
  function offsets() {
    var left = V.cx - CW / 2 / V.s, right = V.cx + CW / 2 / V.s, out = [];
    for (var k = Math.floor((left - SW) / W); k <= Math.floor((right + SW) / W); k++) out.push(k * W);
    return out;
  }
  function worldT(off) { var k = V.s * DPR; ctx.setTransform(k, 0, 0, k, ((off - V.cx) * V.s + CW / 2) * DPR, (CH / 2 - V.cy * V.s) * DPR); }
  function screenT() { ctx.setTransform(DPR, 0, 0, DPR, 0, 0); }
  var queued = false;
  function requestDraw() { if (!queued) { queued = true; requestAnimationFrame(function () { queued = false; draw(); }); } }

  // patterns that stay the same size on screen
  var patCache = {};
  function pattern(key, size, paint) {
    if (!patCache[key]) {
      var c = document.createElement('canvas'); c.width = c.height = size * 2;
      var g = c.getContext('2d'); g.scale(2, 2); paint(g, size);
      patCache[key] = ctx.createPattern(c, 'repeat');
    }
    var p = patCache[key];
    if (p.setTransform && window.DOMMatrix) p.setTransform(new DOMMatrix().scale(1 / (V.s * 2), 1 / (V.s * 2)));
    return p;
  }
  function hatchPainter(color, w) { return function (g, n) { g.strokeStyle = color; g.lineWidth = w; g.beginPath(); g.moveTo(-1, n + 1); g.lineTo(n + 1, -1); g.moveTo(-1, 1); g.lineTo(1, -1); g.moveTo(n - 1, n + 1); g.lineTo(n + 1, n - 1); g.stroke(); }; }
  function wavePainter(g, n) { g.strokeStyle = 'rgba(160,215,235,0.45)'; g.lineWidth = 1; g.beginPath(); g.moveTo(1, n * 0.6); g.quadraticCurveTo(n * 0.25, n * 0.35, n * 0.5, n * 0.6); g.quadraticCurveTo(n * 0.75, n * 0.85, n - 1, n * 0.6); g.stroke(); }

  function fillColor(m, key) {
    if (m === 'holders') { var t = T[key]; return hexA(t.color, key === 'lawless' ? 0.42 : key === 'drone_core' ? 0.62 : key === 'radiation' ? 0.28 : 0.4); }
    if (m === 'seas') return hexA(SEAS[key].color, 0.3);
    return hexA(RISK_COL[key - 1], 0.52);
  }

  // ------------------------------------------------------------------ drawing
  function draw() {
    if (!CW) return;
    var OFF = offsets(), secPx = SW * V.s;
    screenT();
    ctx.fillStyle = '#081624'; ctx.fillRect(0, 0, CW, CH);
    var i, off;
    for (i = 0; i < OFF.length; i++) {
      off = OFF[i]; worldT(off);
      // open water
      ctx.fillStyle = '#0c2338'; ctx.fillRect(-SW, TOP - 80000, W + 2 * SW, BOTTOM - TOP + 160000);
      // who holds the water / which sea / how dangerous
      var g = FILL[mode];
      for (var k in g) { ctx.fillStyle = fillColor(mode, k); ctx.fill(g[k]); }
      // land
      ctx.fillStyle = '#1b2422'; ctx.fill(LAND, 'evenodd');
      ctx.fillStyle = pattern('land', 7, function (gg, n) { gg.fillStyle = 'rgba(217,201,163,0.05)'; gg.fillRect(1, 1, 1, 1); });
      ctx.fill(LAND, 'evenodd');
      ctx.lineWidth = 1.1 / V.s; ctx.strokeStyle = 'rgba(217,201,163,0.55)'; ctx.stroke(LAND);
      // drowned land: the sea has it now
      ctx.fillStyle = 'rgba(12,35,56,0.72)'; ctx.fill(DROWNED);
      var dg = DROWNED_FILL[mode];
      for (var k2 in dg) { ctx.fillStyle = fillColor(mode, k2); ctx.fill(dg[k2]); }
      ctx.fillStyle = pattern('wave', 14, wavePainter); ctx.fill(DROWNED);
      // closed radiation sectors
      ctx.fillStyle = pattern('rad', 8, hatchPainter('rgba(201,224,74,0.55)', 1.3)); ctx.fill(CLOSED);
      ctx.setLineDash([5 / V.s, 4 / V.s]); ctx.lineWidth = 1.4 / V.s; ctx.strokeStyle = 'rgba(201,224,74,0.85)'; ctx.stroke(CLOSED); ctx.setLineDash([]);
      // Dex's Reach
      if (mode === 'holders') { ctx.fillStyle = pattern('dead', 9, hatchPainter('rgba(255,90,100,0.45)', 1.4)); ctx.fill(REACH); }
      // grid, faint, once sectors are big enough to read
      if (secPx > 26) { ctx.lineWidth = 1 / V.s; ctx.strokeStyle = 'rgba(200,225,240,' + Math.min(0.13, (secPx - 26) / 300) + ')'; ctx.stroke(GRID); }
      // borders
      var b = BORDER[mode];
      if (b) {
        ctx.lineCap = 'round';
        ctx.lineWidth = 3.2 / V.s; ctx.strokeStyle = 'rgba(3,8,14,0.7)'; ctx.stroke(b);
        ctx.lineWidth = 1.3 / V.s; ctx.strokeStyle = mode === 'holders' ? 'rgba(236,228,206,0.85)' : 'rgba(200,225,240,0.6)'; ctx.stroke(b);
      }
      if (showPlaces) {
        // toll lines: a dashed line round the water they hold
        tollPlaces.forEach(function (p) {
          ctx.setLineDash([6 / V.s, 4 / V.s]); ctx.lineWidth = 2.2 / V.s; ctx.strokeStyle = 'rgba(255,106,77,0.95)'; ctx.stroke(p.outline); ctx.setLineDash([]);
        });
        if (hotCoast && secPx > 46 && !(sel && sel.item === hotCoast)) {
          ctx.setLineDash([2 / V.s, 4 / V.s]); ctx.lineWidth = 1.2 / V.s; ctx.strokeStyle = 'rgba(201,224,74,0.5)'; ctx.stroke(hotCoast.outline); ctx.setLineDash([]);
        }
      }
      // selection
      if (sel) {
        var path = sel.code ? (function () { var p = new Path2D(); hexInto(p, SEC[sel.code], 0.97); return p; })() : sel.item && sel.item.outlineSel;
        if (path) {
          ctx.lineWidth = 4.5 / V.s; ctx.strokeStyle = 'rgba(3,8,14,0.75)'; ctx.stroke(path);
          ctx.lineWidth = 2.2 / V.s; ctx.strokeStyle = '#f0c773'; ctx.stroke(path);
        }
      }
    }
    screenT();
    hits = []; boxes = [];
    reserveUI();
    if (mode === 'danger' && secPx > 30) drawRiskNumbers(OFF, secPx);
    drawMarkers(OFF, secPx);
    if (mode === 'seas') drawSeaNames(OFF, secPx);
  }

  // label placement: greedy, in order of importance
  var boxes = [];
  function hit(b) { for (var i = 0; i < boxes.length; i++) { var o = boxes[i]; if (b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]) return true; } return false; }
  function reserveUI() {
    var mr = mapEl.getBoundingClientRect();
    mapEl.querySelectorAll('.map-ui, .legend, .readout:not([hidden])').forEach(function (el) {
      var r = el.getBoundingClientRect(); if (!r.width) return;
      boxes.push([r.left - mr.left - 4, r.top - mr.top - 4, r.right - mr.left + 4, r.bottom - mr.top + 4]);
    });
  }
  function label(text, x, y, o) {
    ctx.font = (o.weight || 600) + ' ' + o.size + 'px ' + (o.font || 'Rajdhani, "Segoe UI", sans-serif');
    var w = ctx.measureText(text).width, h = o.size, gap = o.gap || 12;
    var cands = o.center ? [[x - w / 2, y - h / 2]] : [[x + gap, y - h / 2 - 1], [x - gap - w, y - h / 2 - 1], [x - w / 2, y - gap - h], [x - w / 2, y + gap - 2]];
    for (var i = 0; i < cands.length; i++) {
      var bx = cands[i][0], by = cands[i][1], box = [bx - 1, by - 1, bx + w + 2, by + h + 1];
      if (bx < 2 || by < 2 || bx + w > CW - 2 || by + h > CH - 2) continue;
      if (!o.force && hit(box)) continue;
      boxes.push(box);
      ctx.textBaseline = 'top'; ctx.lineJoin = 'round';
      ctx.lineWidth = o.halo || 4; ctx.strokeStyle = 'rgba(4,10,17,0.92)'; ctx.strokeText(text, bx, by);
      ctx.fillStyle = o.color || '#eef3f5'; ctx.fillText(text, bx, by);
      return true;
    }
    return false;
  }
  function drawRiskNumbers(OFF, secPx) {
    var fs = Math.max(10, Math.min(18, secPx / 5));
    ctx.font = '700 ' + fs + 'px Rajdhani, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    OFF.forEach(function (off) {
      CODES.forEach(function (c) {
        var s = SEC[c]; if (s.k === 'closed') return;
        var X = sx(s.x, off), Y = sy(s.y + RY * 0.45); if (X < -20 || X > CW + 20 || Y < -20 || Y > CH + 20) return;
        ctx.fillStyle = 'rgba(255,255,255,0.78)'; ctx.fillText(String(s.d), X, Y);
      });
    });
    ctx.textAlign = 'left';
  }
  function drawSeaNames(OFF, secPx) {
    var fs = Math.max(10, Math.min(22, secPx * 0.36));
    Object.keys(SEA_LABEL).forEach(function (id) {
      var name = SEAS[id].name.toUpperCase();
      try { ctx.letterSpacing = Math.round(fs * 0.22) + 'px'; } catch (e) { }
      OFF.forEach(function (off) {
        SEA_LABEL[id].some(function (s) {   // the best-placed member that has room
          var X = sx(s.x, off), Y = sy(s.y);
          if (X < -200 || X > CW + 200) return false;
          return label(name, X, Y, { size: fs, font: 'Saira, Rajdhani, sans-serif', weight: 600, center: true, color: hexA(SEAS[id].color, 0.95), halo: 4 });
        });
      });
      try { ctx.letterSpacing = '0px'; } catch (e) { }
    });
  }

  // ------------------------------------------------------------------ glyphs
  function glyph(g, kind, X, Y, col, big) {
    g.lineJoin = 'round'; g.lineCap = 'round';
    var dark = '#06101a';
    if (kind === 'port') {
      var r = big ? 8.5 : 7;
      g.beginPath(); g.arc(X, Y, r + 2.5, 0, 7); g.fillStyle = dark; g.fill();
      g.beginPath(); g.arc(X, Y, r, 0, 7); g.fillStyle = col; g.fill();
      g.lineWidth = 2; g.strokeStyle = '#fff'; g.stroke();
      g.beginPath(); g.arc(X, Y, 2.4, 0, 7); g.fillStyle = dark; g.fill();
      if (big) { g.beginPath(); g.arc(X, Y, r + 5, 0, 7); g.lineWidth = 1.6; g.strokeStyle = '#e3b55c'; g.stroke(); }
    } else if (kind === 'dead') {
      g.beginPath(); g.arc(X, Y, 8, 0, 7); g.fillStyle = dark; g.fill();
      g.beginPath(); g.arc(X, Y, 5.8, 0, 7); g.fillStyle = '#3a4550'; g.fill(); g.lineWidth = 1.8; g.strokeStyle = '#b8c3cc'; g.stroke();
      g.beginPath(); g.moveTo(X - 4, Y + 4); g.lineTo(X + 4, Y - 4); g.lineWidth = 2; g.strokeStyle = '#ff6a4d'; g.stroke();
    } else if (kind === 'toll') {
      g.beginPath(); g.moveTo(X, Y - 8); g.lineTo(X + 8, Y); g.lineTo(X, Y + 8); g.lineTo(X - 8, Y); g.closePath();
      g.fillStyle = col; g.fill(); g.lineWidth = 2; g.strokeStyle = dark; g.stroke();
      g.beginPath(); g.moveTo(X - 3, Y); g.lineTo(X + 3, Y); g.lineWidth = 2; g.stroke();
    } else if (kind === 'stronghold') {
      g.beginPath(); g.rect(X - 6, Y - 5, 12, 11); g.fillStyle = col; g.fill(); g.lineWidth = 2; g.strokeStyle = dark; g.stroke();
      g.beginPath(); g.rect(X - 6, Y - 9, 3, 4); g.rect(X - 1.5, Y - 9, 3, 4); g.rect(X + 3, Y - 9, 3, 4); g.fill(); g.stroke();
    } else if (kind === 'crew') {
      g.beginPath(); g.moveTo(X, Y - 7); g.lineTo(X + 6.5, Y + 5); g.lineTo(X - 6.5, Y + 5); g.closePath();
      g.fillStyle = col; g.fill(); g.lineWidth = 2; g.strokeStyle = dark; g.stroke();
    } else if (kind === 'gate') {
      g.lineWidth = 6; g.strokeStyle = dark; g.beginPath(); g.moveTo(X - 4, Y - 7); g.lineTo(X - 4, Y + 7); g.moveTo(X + 4, Y - 7); g.lineTo(X + 4, Y + 7); g.stroke();
      g.lineWidth = 3; g.strokeStyle = col; g.stroke();
    } else if (kind === 'fallout') {
      g.beginPath(); g.arc(X, Y, 8, 0, 7); g.fillStyle = dark; g.fill();
      for (var a = 0; a < 3; a++) { var t0 = -Math.PI / 2 + a * 2 * Math.PI / 3 - 0.5; g.beginPath(); g.moveTo(X, Y); g.arc(X, Y, 6.5, t0, t0 + 1); g.closePath(); g.fillStyle = col; g.fill(); }
      g.beginPath(); g.arc(X, Y, 1.6, 0, 7); g.fill();
    } else if (kind === 'drone') {
      g.beginPath(); g.arc(X, Y, 8.5, 0, 7); g.fillStyle = dark; g.fill();
      g.beginPath(); g.arc(X, Y, 6.5, 0, 7); g.fillStyle = col; g.fill();
      g.lineWidth = 1.8; g.strokeStyle = '#fff'; g.beginPath(); g.moveTo(X - 3.5, Y - 3.5); g.lineTo(X + 3.5, Y + 3.5); g.moveTo(X + 3.5, Y - 3.5); g.lineTo(X - 3.5, Y + 3.5); g.stroke();
    } else if (kind === 'city') {
      g.beginPath(); g.rect(X - 5, Y - 5, 10, 10); g.fillStyle = dark; g.fill(); g.lineWidth = 1.8; g.strokeStyle = col; g.stroke();
      g.beginPath(); g.moveTo(X - 2, Y + 3); g.lineTo(X - 2, Y - 1); g.moveTo(X + 1.5, Y + 3); g.lineTo(X + 1.5, Y - 3); g.lineWidth = 1.6; g.stroke();
    } else if (kind === 'graveyard') {
      g.save(); g.translate(X, Y); g.rotate(-0.45);
      g.beginPath(); g.moveTo(-8, -1); g.lineTo(8, -1); g.lineTo(5, 4); g.lineTo(-6, 4); g.closePath();
      g.fillStyle = col; g.fill(); g.lineWidth = 2; g.strokeStyle = dark; g.stroke();
      g.beginPath(); g.rect(-2, -5, 4, 4); g.fill(); g.stroke(); g.restore();
    } else if (kind === 'fishing') {
      g.beginPath(); g.ellipse(X - 1.5, Y, 6, 3.6, 0, 0, 7); g.moveTo(X + 3.5, Y); g.lineTo(X + 8, Y - 4); g.lineTo(X + 8, Y + 4); g.closePath();
      g.lineWidth = 3; g.strokeStyle = dark; g.stroke(); g.fillStyle = col; g.fill();
    } else if (kind === 'salvage') {
      g.beginPath(); g.arc(X, Y, 7, 0, 7); g.fillStyle = dark; g.fill(); g.lineWidth = 2; g.strokeStyle = col; g.stroke();
      g.beginPath(); g.arc(X, Y, 2.5, 0, 7); g.fillStyle = col; g.fill();
    } else if (kind === 'no_fuel') {
      g.beginPath(); g.arc(X, Y, 7, 0, 7); g.fillStyle = dark; g.fill();
      g.setLineDash([2.5, 2]); g.lineWidth = 2; g.strokeStyle = col; g.stroke(); g.setLineDash([]);
    }
  }
  function markerKind(it) { return it.isPort ? (it.dead ? 'dead' : 'port') : it.kind; }
  function markerColor(it) { return it.isPort ? (it.dead ? '#3a4550' : T[it.terr].color) : KIND_COL[it.kind]; }

  // which places show at this zoom: ports always; minor places as you zoom in
  function visibleRank(secPx) { return secPx >= 95 ? 3 : secPx >= 50 ? 2 : 1; }
  function drawMarkers(OFF, secPx) {
    var vr = visibleRank(secPx), items = PORTS.slice();
    if (showPlaces) PLACES.forEach(function (p) { if (p.rank <= vr) items.push(p); });
    items.sort(function (a, b) { return a.rank - b.rank; });
    var placed = [];
    // markers first (so labels avoid every marker), then labels in order of importance
    items.forEach(function (it) {
      OFF.forEach(function (off) {
        var X = sx(it.x, off), Y = sy(it.y);
        if (X < -20 || X > CW + 20 || Y < -20 || Y > CH + 20) return;
        placed.push({ it: it, X: X, Y: Y });
      });
    });
    for (var i = placed.length - 1; i >= 0; i--) {
      var m = placed[i];
      glyph(ctx, markerKind(m.it), m.X, m.Y, markerColor(m.it), m.it.id === 'ari');
      hits.push({ X: m.X, Y: m.Y, it: m.it });
    }
    placed.forEach(function (m) { boxes.push([m.X - 8, m.Y - 8, m.X + 8, m.Y + 8]); });
    var selItem = sel && sel.item;
    placed.forEach(function (m) {
      var it = m.it, isSel = it === selItem;
      var showLabel = it.isPort ? (it.major || vr >= 2 || isSel) : (it.rank < vr || it.rank === 1 || isSel || vr === 3);
      if (!showLabel) return;
      var size = it.isPort ? (it.major ? 15 : 13.5) : it.rank === 1 ? 14 : 12.5;
      var color = it.isPort ? '#ffffff' : it.rank === 1 ? '#f0dfb6' : '#d4dde3';
      if (it.id === 'deadmans_land' || it.kind === 'toll') color = '#ffb3a3';
      label(it.isPort ? it.name.replace('Dead port: ', '') : it.name, m.X, m.Y, { size: size, color: isSel ? '#f0c773' : color, weight: it.isPort && it.major ? 700 : 600, force: isSel });
    });
  }

  // ------------------------------------------------------------------ pan, zoom, click
  var ptrs = new Map(), drag = null, pinch = null, moved = false, hintEl = document.getElementById('map-hint');
  function hideHint() { if (hintEl) hintEl.classList.add('gone'); }
  function zoomAt(px, py, f) {
    var w = toWorld(px, py), s0 = V.s;
    V.s = Math.max(minScale(), Math.min(maxScale(), V.s * f));
    if (V.s === s0) return;
    V.cx = w[0] - (px - CW / 2) / V.s; V.cy = w[1] - (py - CH / 2) / V.s;
    clampView(); requestDraw(); hideHint();
  }
  function local(e) { var r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  cv.addEventListener('pointerdown', function (e) {
    if (e.button && e.button !== 0) return;
    cv.setPointerCapture(e.pointerId);
    var p = local(e); ptrs.set(e.pointerId, p); stopFly();
    if (ptrs.size === 1) { drag = { x: p[0], y: p[1], cx: V.cx, cy: V.cy }; moved = false; }
    else if (ptrs.size === 2) {
      var a = Array.from(ptrs.values());
      pinch = { d: Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]) || 1, s: V.s, w: toWorld((a[0][0] + a[1][0]) / 2, (a[0][1] + a[1][1]) / 2) };
      moved = true;
    }
  });
  cv.addEventListener('pointermove', function (e) {
    var p = local(e);
    if (!ptrs.has(e.pointerId)) { if (e.pointerType === 'mouse') cv.style.cursor = pick(p[0], p[1]) ? 'pointer' : ''; return; }
    ptrs.set(e.pointerId, p);
    if (ptrs.size >= 2 && pinch) {
      var a = Array.from(ptrs.values()), mx = (a[0][0] + a[1][0]) / 2, my = (a[0][1] + a[1][1]) / 2;
      var d = Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]) || 1;
      V.s = Math.max(minScale(), Math.min(maxScale(), pinch.s * d / pinch.d));
      V.cx = pinch.w[0] - (mx - CW / 2) / V.s; V.cy = pinch.w[1] - (my - CH / 2) / V.s;
      clampView(); requestDraw(); hideHint();
    } else if (drag) {
      var dx = p[0] - drag.x, dy = p[1] - drag.y;
      if (!moved && Math.hypot(dx, dy) > (e.pointerType === 'touch' ? 10 : 5)) { moved = true; cv.classList.add('drag'); hideHint(); }
      if (moved) { V.cx = drag.cx - dx / V.s; V.cy = drag.cy - dy / V.s; clampView(); requestDraw(); }
    }
  });
  function endPtr(e) {
    if (!ptrs.has(e.pointerId)) return;
    var p = ptrs.get(e.pointerId);
    ptrs.delete(e.pointerId);
    if (ptrs.size === 0) {
      cv.classList.remove('drag');
      if (!moved && drag && e.type === 'pointerup') clickAt(p[0], p[1], e.pointerType);
      drag = null; pinch = null;
    } else if (ptrs.size === 1) {
      var q = Array.from(ptrs.values())[0]; drag = { x: q[0], y: q[1], cx: V.cx, cy: V.cy }; pinch = null;
    }
  }
  cv.addEventListener('pointerup', endPtr);
  cv.addEventListener('pointercancel', endPtr);
  cv.addEventListener('wheel', function (e) {
    e.preventDefault(); stopFly();
    var p = local(e), dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY, dx = e.deltaMode === 1 ? e.deltaX * 16 : e.deltaX;
    if (!e.ctrlKey && Math.abs(dx) > Math.abs(dy)) { V.cx += dx / V.s; clampView(); requestDraw(); return; }
    zoomAt(p[0], p[1], Math.exp(-dy * (e.ctrlKey ? 0.012 : 0.0022)));
  }, { passive: false });
  cv.addEventListener('dblclick', function (e) { var p = local(e); zoomAt(p[0], p[1], 2); });
  cv.addEventListener('keydown', function (e) {
    var step = 90 / V.s, k = e.key;
    if (k === 'ArrowLeft') V.cx -= step; else if (k === 'ArrowRight') V.cx += step;
    else if (k === 'ArrowUp') V.cy -= step; else if (k === 'ArrowDown') V.cy += step;
    else if (k === '+' || k === '=') { zoomAt(CW / 2, CH / 2, 1.4); e.preventDefault(); return; }
    else if (k === '-' || k === '_') { zoomAt(CW / 2, CH / 2, 1 / 1.4); e.preventDefault(); return; }
    else if (k === '0') { homeView(); requestDraw(); return; }
    else return;
    e.preventDefault(); stopFly(); clampView(); requestDraw(); hideHint();
  });
  function pick(px, py, touch) {
    var best = null, bd = touch ? 22 : 14;
    hits.forEach(function (h) { var d = Math.hypot(h.X - px, h.Y - py); if (d < bd) { bd = d; best = h.it; } });
    return best;
  }
  function clickAt(px, py, ptype) {
    var it = pick(px, py, ptype === 'touch');
    if (it) { openItem(it, { push: true, fly: false }); return; }
    var w = toWorld(px, py), code = hexAt(w[0], w[1]);
    if (code && SEC[code]) showSector(code, true);
    else { sel = null; hideReadout(); requestDraw(); }
  }
  document.getElementById('zoom-in').addEventListener('click', function () { zoomAt(CW / 2, CH / 2, 1.6); });
  document.getElementById('zoom-out').addEventListener('click', function () { zoomAt(CW / 2, CH / 2, 1 / 1.6); });
  document.getElementById('zoom-reset').addEventListener('click', function () { stopFly(); homeView(); requestDraw(); });
  document.querySelectorAll('.seg button').forEach(function (b) {
    b.addEventListener('click', function () {
      mode = b.dataset.mode;
      document.querySelectorAll('.seg button').forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
      buildLegend(); requestDraw();
    });
  });
  var togP = document.getElementById('tog-places');
  togP.addEventListener('click', function () { showPlaces = !showPlaces; togP.setAttribute('aria-pressed', String(showPlaces)); buildLegend(); requestDraw(); });

  // fly the chart to a place
  var flyAnim = null;
  function stopFly() { if (flyAnim) { cancelAnimationFrame(flyAnim); flyAnim = null; } }
  function visibleCentre() {
    var mr = mapEl.getBoundingClientRect(), x0 = 0, y0 = 0, x1 = CW, y1 = CH;
    var pn = document.getElementById('panel');
    if (!pn.hidden) {
      var pl = pn.offsetLeft, pt = pn.offsetTop;   // layout box: ignores the slide-in animation
      if (pl > mr.left + CW * 0.3) x1 = Math.min(x1, pl - mr.left);
      else if (pt > mr.top) y1 = Math.min(y1, Math.max(120, pt - mr.top));
    }
    return [(x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0];
  }
  function flyTo(x, y, scale) {
    stopFly();
    var vc = visibleCentre(), s1 = Math.max(minScale(), Math.min(maxScale(), scale || V.s));
    var tx = x - (vc[0] - CW / 2) / s1, ty = y - (vc[1] - CH / 2) / s1;
    var dx = ((tx - V.cx + W / 2) % W + W) % W - W / 2;
    var from = { cx: V.cx, cy: V.cy, s: V.s }, t0 = performance.now();
    var dur = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 520;
    function step(now) {
      var t = dur ? Math.min(1, (now - t0) / dur) : 1, e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      V.s = from.s * Math.pow(s1 / from.s, e); V.cx = from.cx + dx * e; V.cy = from.cy + (ty - from.cy) * e;
      clampView(); draw();
      flyAnim = t < 1 ? requestAnimationFrame(step) : null;
    }
    flyAnim = requestAnimationFrame(step);
  }
  function scaleFor(it) {
    var secs = it.sectors && it.sectors.length > 1 && !it.isPort ? it.sectors : null;
    var vc = visibleCentre();
    if (secs) {
      var xs = secs.map(function (c) { return SEC[c].x; }), ys = secs.map(function (c) { return SEC[c].y; });
      var x0 = xs[0], spanX = 0;
      xs.forEach(function (x) { var d = Math.abs(((x - x0 + W / 2) % W + W) % W - W / 2); spanX = Math.max(spanX, d * 2); });
      var spanY = Math.max.apply(null, ys) - Math.min.apply(null, ys);
      return Math.min(vc[2] / (spanX + SW * 2.2), vc[3] / (spanY + SH * 2.4), 70 / SW);
    }
    return Math.max(V.s, (vc[2] < 500 ? 72 : 90) / SW);
  }

  // ------------------------------------------------------------------ sector readout
  var ro = document.getElementById('readout');
  function dangerHTML(s) {
    if (s.k === 'closed') return '<span class="dg"><b style="background:#c9e04a">×</b> Closed</span>';
    return '<span class="dg"><b style="background:' + RISK_COL[s.d - 1] + '">' + s.d + '</b> ' + esc(riskWord[s.d]) + '</span>';
  }
  function placesIn(code) {
    var out = [];
    PORTS.forEach(function (p) { if (p.sector === code) out.push(p); });
    PLACES.forEach(function (p) { if (p.sectors && p.sectors.indexOf(code) >= 0) out.push(p); });
    return out;
  }
  function showSector(code, push) {
    var s = SEC[code]; sel = { code: code };
    var t = T[s.t], sea = SEAS[s.s];
    var hz = s.hz.map(function (h) { return D.hazards[h] ? D.hazards[h].name : h; }).join(', ');
    var sv = s.sv.map(function (h) { return D.salvage[h] ? D.salvage[h].name : h; }).join(', ');
    var h = '<button type="button" class="ro-x" aria-label="Close the sector readout">×</button>' +
      '<div class="ro-k">Sector ' + esc(code) + '</div><h2>' + esc(s.p || code) + '</h2><dl>' +
      '<dt>Water</dt><dd><span class="dg"><span class="sw" style="background:' + t.color + '"></span>' + esc(t.name) + '</span></dd>' +
      (sea ? '<dt>Sea</dt><dd>' + esc(sea.name) + '</dd>' : '') +
      '<dt>Danger</dt><dd>' + dangerHTML(s) + '</dd>' +
      (hz ? '<dt>Hazards</dt><dd>' + esc(hz) + '</dd>' : '') +
      (sv ? '<dt>Salvage</dt><dd>' + esc(sv) + '</dd>' : '') +
      (s.city ? '<dt>Under it</dt><dd>Drowned ' + esc(s.city) + '</dd>' : '') + '</dl>';
    var pl = placesIn(code);
    if (pl.length) h += '<div class="ro-links">' + pl.map(function (p) { return '<button type="button" data-open="' + esc(p.hash) + '">' + esc(p.name) + '</button>'; }).join('') + '</div>';
    ro.innerHTML = h; ro.hidden = false;
    ro.querySelector('.ro-x').addEventListener('click', function () { hideReadout(); sel = null; requestDraw(); cv.focus(); });
    ro.querySelectorAll('[data-open]').forEach(function (b) { b.addEventListener('click', function () { openItem(BY_HASH[b.dataset.open], { push: true, fly: true }); }); });
    if (push) history.replaceState(null, '', '#sector-' + code);
    requestDraw();
  }
  function hideReadout() { ro.hidden = true; ro.innerHTML = ''; }

  // ------------------------------------------------------------------ captures from the game (captures.json, optional)
  var CAP = { ports: {}, ships: {} };
  var SAFE = /^img\/(ports|ships)\/[A-Za-z0-9_.\-]+\.(jpe?g|png|webp)$/i;
  function capImages(id) {
    var c = CAP.ports && CAP.ports[id];
    if (!c || !c.in_game || !Array.isArray(c.images)) return [];
    return c.images.filter(function (im) { return im && typeof im.file === 'string' && SAFE.test(im.file); });
  }
  function capShip(id) {
    var c = CAP.ships && CAP.ships[id];
    return c && c.in_game && typeof c.file === 'string' && SAFE.test(c.file) ? c : null;
  }
  function noCap(small) { return '<div class="nocap"><p>No capture from the game yet' + (small ? '' : '<span>Only real stills from the game are shown here</span>') + '</p></div>'; }
  // a picture that fails to load turns into the empty state, never a broken image
  function guardImages(root) {
    root.querySelectorAll('img[data-cap]').forEach(function (img) {
      img.addEventListener('error', function () {
        var holder = img.closest('a') || img;
        var d = document.createElement('div'); d.className = 'nocap'; d.innerHTML = '<p>No capture from the game yet</p>';
        holder.replaceWith(d);
      });
    });
  }

  // ------------------------------------------------------------------ the detail panel
  var panel = document.getElementById('panel'), pbody = document.getElementById('panel-body'), lastFocus = null, current = null;
  function heldHTML(name, color) { return '<p class="p-held"><span class="sw" style="background:' + color + '"></span>Held by ' + esc(name) + '</p>'; }
  function galleryHTML(id, name) {
    var ims = capImages(id);
    if (!ims.length) return noCap();
    return '<div class="gal">' + ims.map(function (im) {
      var alt = im.alt || ('A still from the game: ' + name);
      return '<a href="' + esc(im.file) + '"><img data-cap loading="lazy" decoding="async" width="1280" height="720" src="' + esc(im.file) + '" alt="' + esc(alt) + '"></a>';
    }).join('') + '</div>';
  }
  function shipHTML(id, tag) {
    var sh = D.ships[id]; if (!sh) return '';
    var c = capShip(id), pic;
    if (c) pic = '<a href="' + esc(c.file) + '"><img data-cap loading="lazy" decoding="async" width="1280" height="720" src="' + esc(c.file) + '" alt="' + esc(c.alt || ('The ' + sh.name + ', from the game')) + '"></a>';
    else pic = noCap(true);
    return '<figure class="ship">' + pic + '<figcaption><span class="tag">' + esc(tag) + '</span><b>' + esc(sh.name) + '</b>' + esc(sh.role) + '</figcaption></figure>';
  }
  function seaHTML(id) {
    var s = SEAS[id]; if (!s) return '';
    return '<h3>The water round it</h3><div class="p-sea"><p><b>' + esc(s.name) + '.</b> ' + esc(s.what) + '</p><p>' + esc(s.look) + '</p></div>';
  }
  function portHTML(p) {
    var t = T[p.terr], sec = SEC[p.sector];
    var h = '<div class="p-k">' + (p.dead ? 'Dead navy port' : 'Port') + ' · Sector ' + esc(p.sector) + '</div>' +
      '<h2 id="panel-title" tabindex="-1">' + esc(p.name) + '</h2>' +
      '<p class="p-place">' + esc(p.place) + ' · danger ' + esc(sec.d) + ', ' + esc(riskWord[sec.d]).toLowerCase() + '</p>' +
      heldHTML(p.holder, p.dead ? '#3a4550' : t.color) +
      (p.about ? '<p class="p-about">' + esc(p.about) + '</p>' : '');
    h += '<h3>The port</h3>' + (p.capture ? galleryHTML(p.capture, p.name) : noCap());
    if (p.capture && p.capNote && capImages(p.capture).length) h += '<p class="cap-note">' + esc(p.capNote) + '</p>';
    var ships = p.yardShips.map(function (id) { return shipHTML(id, 'Sold here'); }).concat(p.seenShips.map(function (id) { return shipHTML(id, 'Seen here'); }));
    h += '<h3>Ships you see here</h3>';
    h += ships.length ? '<div class="ships gal">' + ships.join('') + '</div>' : '<p class="p-about">' + esc(p.yard) + '</p>';
    h += '<h3>What is special here</h3><dl class="facts">' +
      '<dt>The yard</dt><dd>' + esc(p.yard) + '</dd>' +
      (p.services && p.services.length ? '<dt>Services</dt><dd><ul>' + p.services.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul></dd>' : '') +
      '<dt>Exports</dt><dd>' + esc(p.export) + '</dd>' +
      '<dt>Needs</dt><dd>' + esc(p.need) + '</dd>' +
      '<dt>At the market</dt><dd>' + esc(p.market) + '</dd>' +
      '<dt>How the door works</dt><dd>' + esc(p.door) + '</dd>' +
      (p.attitude ? '<dt>How they treat runners</dt><dd>' + esc(p.attitude) + '</dd>' : '') + '</dl>';
    h += seaHTML(p.sea);
    h += '<a class="p-link" href="#' + esc(p.hash) + '">Link to this port</a>';
    return h;
  }
  function placeHTML(p) {
    var h = '<div class="p-k">' + esc(p.kindName) + (p.sectors && p.sectors.length === 1 ? ' · Sector ' + esc(p.sectors[0]) : p.sectors ? ' · ' + p.sectors.length + ' sectors' : '') + '</div>' +
      '<h2 id="panel-title" tabindex="-1">' + esc(p.name) + '</h2>' +
      (p.holder ? heldHTML(p.holder, KIND_COL[p.kind]) : '') +
      '<p class="p-about">' + esc(p.what) + '</p>';
    if (p.capture && capImages(p.capture).length) h += '<h3>From the game</h3>' + galleryHTML(p.capture, p.name);
    h += '<dl class="facts">' + (p.rule ? '<dt>' + (p.kind === 'toll' ? 'The toll' : p.kind === 'crew' ? 'How they work' : 'The rule') + '</dt><dd>' + esc(p.rule) + '</dd>' : '') +
      (p.detour ? '<dt>The way round</dt><dd>' + esc(p.detour) + '</dd>' : '') +
      (p.reward ? '<dt>The reward</dt><dd>' + esc(p.reward) + '</dd>' : '') + '</dl>';
    if (p.sectors && p.sectors.length === 1) { var s = SEC[p.sectors[0]]; if (s) h += seaHTML(s.s); }
    h += '<a class="p-link" href="#' + esc(p.hash) + '">Link to this place</a>';
    return h;
  }
  function render() {
    if (!current) return;
    pbody.innerHTML = current.isPort ? portHTML(current) : placeHTML(current);
    guardImages(pbody);
  }
  function openItem(it, o) {
    if (!it) return;
    o = o || {};
    if (panel.hidden) lastFocus = document.activeElement;
    current = it; sel = { item: it }; hideReadout();
    panel.hidden = false; render();
    if (o.push && location.hash !== '#' + it.hash) history.pushState(null, '', '#' + it.hash);
    var h = document.getElementById('panel-title'); if (h) h.focus({ preventScroll: true });
    panel.querySelector('.panel-in').scrollTop = 0;
    if (o.scroll) { var mr = mapEl.getBoundingClientRect(); if (mr.top > 140 || mr.bottom < 200) mapEl.scrollIntoView({ behavior: o.instant ? 'auto' : 'smooth', block: 'start' }); }
    if (o.fly !== false) flyTo(it.x, it.y, scaleFor(it)); else requestDraw();
  }
  function closePanel(fromRoute) {
    if (panel.hidden) return;
    panel.hidden = true; current = null; sel = null; pbody.innerHTML = '';
    if (!fromRoute) history.replaceState(null, '', location.pathname + location.search);
    requestDraw();
    if (lastFocus && document.contains(lastFocus) && lastFocus !== document.body) lastFocus.focus({ preventScroll: true });
    else cv.focus({ preventScroll: true });
  }
  document.getElementById('panel-close').addEventListener('click', function () { closePanel(); });
  window.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || document.querySelector('.lb')) return;   // the picture viewer closes first
    if (!panel.hidden) { closePanel(); e.stopPropagation(); }
    else if (!ro.hidden) { hideReadout(); sel = null; requestDraw(); }
  }, true);
  pbody.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a.p-link');
    if (a) { e.preventDefault(); var url = location.href.split('#')[0] + a.getAttribute('href'); if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { a.textContent = 'Link copied'; }, function () { }); history.replaceState(null, '', a.getAttribute('href')); }
  });

  // ------------------------------------------------------------------ hash links: #port-ari, #place-the-cut, #sector-27F
  function route() {
    var h = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (!h) { closePanel(true); return; }
    if (BY_HASH[h]) { openItem(BY_HASH[h], { fly: true, scroll: true, instant: true }); return; }
    var m = /^sector-(\d{1,2}[A-Q])$/i.exec(h);
    if (m && SEC[m[1].toUpperCase()]) { closePanel(true); var s = SEC[m[1].toUpperCase()]; showSector(s.code); flyTo(s.x, s.y, Math.max(V.s, 70 / SW)); }
  }
  window.addEventListener('popstate', route);
  window.addEventListener('hashchange', route);

  // ------------------------------------------------------------------ legend and lists
  function glyphCanvas(kind, col) {
    var c = document.createElement('canvas'); c.width = c.height = 36; c.setAttribute('aria-hidden', 'true');
    var g = c.getContext('2d'); g.scale(2, 2); glyph(g, kind, 9, 9, col); return c;
  }
  function buildLegend() {
    var body = document.getElementById('legend-body'), h = '';
    if (mode === 'holders') {
      var groups = {};
      Object.keys(T).forEach(function (id) { var t = T[id]; (groups[t.group] = groups[t.group] || []).push(id); });
      Object.keys(groups).forEach(function (g) {
        h += '<h3>' + esc(g) + '</h3><ul>' + groups[g].map(function (id) {
          var t = T[id], hatch = id === 'radiation' || id === 'drone_core';
          return '<li><span class="sw' + (hatch ? ' hatch' : '') + '" style="background-color:' + t.color + '"></span>' + esc(t.name) + '</li>';
        }).join('') + '</ul>';
      });
    } else if (mode === 'seas') {
      h += '<h3>The seas</h3><ul>' + Object.keys(SEAS).map(function (id) { return '<li><span class="sw" style="background:' + SEAS[id].color + '"></span>' + esc(SEAS[id].name) + '</li>'; }).join('') + '</ul>';
    } else {
      h += '<h3>Danger, 1 to 10</h3><div class="ramp">' + RISK_COL.map(function (c, i) { return '<span style="background:' + c + '">' + (i + 1) + '</span>'; }).join('') + '</div>' +
        '<div class="ramp-ends"><span>' + esc(riskWord[1]) + '</span><span>' + esc(riskWord[10]) + '</span></div>';
    }
    h += '<h3>On the chart</h3><ul id="legend-marks"></ul>';
    h += '<h3>Water</h3><ul><li><span class="sw" style="background:#0c2338;background-image:repeating-linear-gradient(0deg,rgba(160,215,235,.4) 0 1px,transparent 1px 5px)"></span>Drowned land</li>' +
      '<li><span class="sw hatch" style="background-color:#b6d43a"></span>Radiation, closed</li>' +
      '<li><span class="sw" style="background:#1b2422;border-color:#d9c9a3"></span>Land</li></ul>';
    body.innerHTML = h;
    var ul = document.getElementById('legend-marks');
    var marks = [['port', T.ari.color, 'Port'], ['dead', '#3a4550', 'Dead navy port']];
    if (showPlaces) marks = marks.concat([['toll', KIND_COL.toll, 'Toll line'], ['stronghold', KIND_COL.stronghold, 'Pirate stronghold'], ['crew', KIND_COL.crew, 'Pirate crew base'],
      ['gate', KIND_COL.gate, 'Sea gate'], ['drone', KIND_COL.drone, 'Drone water'], ['fallout', KIND_COL.fallout, 'Fallout coast'], ['graveyard', KIND_COL.graveyard, 'Ship graveyard'],
      ['city', KIND_COL.city, 'Drowned city'], ['fishing', KIND_COL.fishing, 'Fishing grounds'], ['salvage', KIND_COL.salvage, 'Salvage field'], ['no_fuel', KIND_COL.no_fuel, 'No-fuel water']]);
    marks.forEach(function (m) { var li = document.createElement('li'); li.appendChild(glyphCanvas(m[0], m[1])); li.appendChild(document.createTextNode(m[2])); ul.appendChild(li); });
    requestDraw();
  }
  function buildLists() {
    var pl = document.getElementById('port-list');
    PORTS.forEach(function (p) {
      var li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button'; b.className = 'card-btn'; b.style.setProperty('--c', p.dead ? '#6b7884' : T[p.terr].color);
      b.innerHTML = '<span class="ck">' + (p.dead ? 'Dead navy port' : 'Port') + ' · ' + esc(p.sector) + '</span><span class="cn">' + esc(p.name.replace('Dead port: ', '')) +
        '</span><span class="cs">' + esc(p.place) + ' · held by ' + esc(p.holder) + '</span>';
      b.addEventListener('click', function () { openItem(p, { push: true, fly: true, scroll: true }); });
      li.appendChild(b); pl.appendChild(li);
    });
    var groups = {}, order = [];
    PLACES.forEach(function (p) { if (!groups[p.kindName]) { groups[p.kindName] = []; order.push(p.kindName); } groups[p.kindName].push(p); });
    var plist = document.getElementById('place-list');
    order.forEach(function (k) {
      var div = document.createElement('div');
      div.innerHTML = '<h3>' + esc(k === 'Fishing grounds' ? 'Fishing grounds' : k + (groups[k].length > 1 ? 's' : '')) + '</h3><ul></ul>';
      var ul = div.querySelector('ul');
      groups[k].forEach(function (p) {
        var li = document.createElement('li'), b = document.createElement('button');
        b.type = 'button'; b.textContent = p.name;
        b.addEventListener('click', function () { if (!showPlaces) togP.click(); openItem(p, { push: true, fly: true, scroll: true }); });
        li.appendChild(b); ul.appendChild(li);
      });
      plist.appendChild(div);
    });
    var rl = document.getElementById('risk-list');
    D.risk.forEach(function (r) {
      var li = document.createElement('li');
      li.innerHTML = '<span class="rn" style="background:' + RISK_COL[r[0] - 1] + '">' + r[0] + '</span><b>' + esc(r[1]) + '</b><span>' + esc(r[2]) + '</span>';
      rl.appendChild(li);
    });
  }

  // every ship the game has a still of: picture, name and a plain kind, nothing more
  function buildShipGrid() {
    var grid = document.getElementById('ship-grid'), sec = document.getElementById('ships');
    if (!grid || !sec) return;
    var ids = Object.keys(CAP.ships || {}).filter(function (id) { return capShip(id); });
    if (!ids.length) return;
    grid.innerHTML = ids.map(function (id) {
      var c = CAP.ships[id], kind = D.shipKinds[c.kind] || '';
      var nm = String(c.name || id).toLowerCase().replace(/(^|[\s-])\S/g, function (m) { return m.toUpperCase(); }).replace(/^Ari /, 'ARI ');
      return '<figure class="ship"><a href="' + esc(c.file) + '"><img data-cap loading="lazy" decoding="async" width="1280" height="720" src="' + esc(c.file) + '" alt="' + esc(c.alt || nm) + '"></a>' +
        '<figcaption>' + (kind ? '<span class="tag">' + esc(kind) + '</span>' : '') + '<b>' + esc(nm) + '</b></figcaption></figure>';
    }).join('');
    guardImages(grid);
    sec.hidden = false;
  }

  // the grid's pictures are only put on the page when a reader scrolls near it, so none load on open
  function shipGridWhenNear() {
    var sec = document.getElementById('ships');
    if (!sec || !Object.keys(CAP.ships || {}).some(capShip)) return;
    sec.hidden = false;
    if (!window.IntersectionObserver) { buildShipGrid(); return; }
    var io = new IntersectionObserver(function (es) {
      if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); buildShipGrid(); }
    }, { rootMargin: '400px 0px' });
    io.observe(sec);
  }

  // ------------------------------------------------------------------ start
  buildLists();
  var lg = document.getElementById('legend');
  if (window.innerWidth > 700) lg.open = true;
  buildLegend();
  lg.addEventListener('toggle', requestDraw);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(mapEl); else window.addEventListener('resize', resize);
  resize();
  if (document.fonts && document.fonts.load) {
    Promise.all(['600 14px Rajdhani', '700 14px Rajdhani', '600 14px Saira'].map(function (f) { return document.fonts.load(f); })).then(requestDraw, requestDraw);
  }
  route();
  fetch('captures.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
    if (j && typeof j === 'object') { CAP.ports = j.ports || {}; CAP.ships = j.ships || {}; render(); shipGridWhenNear(); }
  }).catch(function () { });
})();
