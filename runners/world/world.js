// Runners: the world chart. One canvas, no libraries. Data: world-data.js (generated); pictures: captures.json.
// Two views of the same data: a flat chart (wraps east to west) and a globe (orthographic projection, drawn by hand).
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

  // longitude and latitude of a point in world metres (the game's grid maps them linearly; world_grid.gd)
  var LON0 = -20, HEXW = 9.473684, ROWDEG = HEXW * Math.sqrt(3) / 2, LATC0 = 80 - HEXW / Math.sqrt(3), DEG = Math.PI / 180;
  function lamOf(x) { return (LON0 + HEXW / 2 + x * HEXW / SW) * DEG; }
  function phiOf(y) { return (LATC0 - y * ROWDEG / SH) * DEG; }
  function xOfLam(l) { return (((l / DEG - LON0 - HEXW / 2) * SW / HEXW) % W + W) % W; }
  function yOfPhi(p) { return (LATC0 - p / DEG) * SH / ROWDEG; }
  // an edge list (each edge as 3 points in radians) for the globe; k insets the hex
  function edgeLL(s, d, k) {
    k = k || 1; var e = EDGE[d], a = HEXC[e[0]], b = HEXC[e[1]], out = [];
    for (var t = 0; t <= 2; t++) { var f = t / 2, X = s.x + (a[0] + (b[0] - a[0]) * f) * k, Y = s.y + (a[1] + (b[1] - a[1]) * f) * k; out.push(lamOf(X), phiOf(Y)); }
    return out;
  }
  function edgesOf(codes, k) {
    var set = {}, out = [];
    codes.forEach(function (c) { set[c] = 1; });
    codes.forEach(function (c) { var s = SEC[c]; if (!s) return; for (var d = 0; d < 6; d++) { var n = neighbour(s, d); if (!n || !set[n]) out.push(edgeLL(s, d, k)); } });
    return out;
  }
  // each sector's outline as 18 points (corners and edge thirds), so hexes curve with the globe
  CODES.forEach(function (c) {
    var s = SEC[c], pts = [];
    for (var i = 0; i < 6; i++) {
      var a = HEXC[i], b = HEXC[(i + 1) % 6];
      for (var t = 0; t < 3; t++) { var f = t / 3; pts.push(lamOf(s.x + a[0] + (b[0] - a[0]) * f), phiOf(s.y + a[1] + (b[1] - a[1]) * f)); }
    }
    s.ll = pts; s.lam = lamOf(s.x); s.phi = phiOf(s.y);
  });

  // ------------------------------------------------------------------ colours
  var T = D.territories, SEAS = D.seas;
  var RISK_COL = ['#2c8c7f', '#3f9f86', '#78ad6e', '#a9b25a', '#cfa64a', '#d98a3c', '#d9673a', '#cc4434', '#b02a32', '#8a1020'];
  var riskWord = {}; D.risk.forEach(function (r) { riskWord[r[0]] = r[1]; });
  var AI_COL = '#7cf0ff';
  // the Hot Coast is orange (no rescue); the closed radiation zones it rings are black and yellow stripes (no entry)
  var HOT_COL = '#ff9a3c', RAD_YEL = '#f2dc2e';
  var KIND_COL = { toll: '#ff6a4d', stronghold: '#ff6a4d', crew: '#e06666', gate: '#e3b55c', fallout: HOT_COL, drone: '#ff2d4a',
    city: '#d6b98a', graveyard: '#b9c3cc', fishing: '#f1c232', salvage: '#d6b98a', no_fuel: '#a79bf0' };
  function hexA(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  var RIG_COL = '#cfd8de', RIG_HELD = '#e06666';
  // rig status: Runner Lite's rig map plus the 2055 plan's holders (world-data.js "st")
  var RIG_ST = { working: { name: 'Working', label: 'Working rig', col: '#cfd8de' }, destroyed: { name: 'Destroyed', label: 'Destroyed rig', col: '#8a96a0' },
    twin: { name: 'Twin', label: 'Twin rig', col: '#9fd4e8' }, pirate: { name: 'Pirate-held', label: 'Pirate-held rig', col: '#e06666' },
    breakwater: { name: 'Breakwater', label: 'Breakwater rig', col: '#5b9be0' } };
  var RIG_ORDER = ['working', 'destroyed', 'twin', 'pirate', 'breakwater'];
  // who controls a standing rig (world-data.js "ctl"); structure ("st") is separate: a twin is a structure, not a control
  var RIG_CTL = {
    free: { name: 'Free trading', label: 'Free trading rig', col: '#7fd8b8', text: 'Open for trade.' },
    housing: { name: 'Lantern rig', chip: 'Lantern rigs', short: 'lantern', label: 'Lantern rig', col: '#e3c48a', text: 'People live here. They do not trade and they do not attack. Lit at night.' },
    tribute: { name: 'Paying tribute', label: 'Rig paying tribute', col: '#e8a052', text: 'Pays pirates to be left alone. Still trades.' },
    pirate: { name: 'Pirate-held', label: 'Pirate-held rig', col: '#e06666' },
    dark: { name: 'Dark', label: 'Dark rig', col: '#55616c', text: 'No signal. Nobody answers.' },
    breakwater: { name: 'Breakwater', label: 'Breakwater rig', col: '#5b9be0' } };
  // the chips under Rigs: five controls, then three structures
  var RIG_CHIPS = [['free', 'ctl'], ['housing', 'ctl'], ['tribute', 'ctl'], ['pirate', 'ctl'], ['dark', 'ctl'], ['destroyed', 'st'], ['twin', 'st'], ['breakwater', 'st']];
  function rigChip(k) { return RIG_CTL[k] && k !== 'breakwater' ? RIG_CTL[k] : RIG_ST[k]; }
  function chipName(k) { var c = rigChip(k); return c.chip || c.name; }

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

  var DROWNED_CODES = drownedCodes, CLOSED_CODES = CODES.filter(function (c) { return SEC[c].k === 'closed'; });
  var REACH_CODES = CODES.filter(function (c) { return SEC[c].t === 'drone_core'; });
  function groupCodes(keyOf) { var g = {}; CODES.forEach(function (c) { var k = keyOf(SEC[c]); if (k == null) return; (g[k] = g[k] || []).push(c); }); return g; }
  var GROUPS = { holders: groupCodes(function (s) { return s.t; }), seas: groupCodes(function (s) { return s.s || null; }),
    danger: groupCodes(function (s) { return s.k === 'closed' ? null : s.d; }) };
  function borderEdges(keyOf) {
    var out = [];
    CODES.forEach(function (c) { var s = SEC[c]; for (var d = 0; d < 6; d++) { var n = neighbour(s, d); if (!n || !SEC[n]) continue; if (keyOf(SEC[n]) !== keyOf(s) && c < n) out.push(edgeLL(s, d)); } });
    return out;
  }
  var BORDER_LL = { holders: borderEdges(function (s) { return s.t; }), seas: borderEdges(function (s) { return s.s; }) };
  var LAND_LL = D.land.map(function (ring) { var o = new Float64Array(ring.length); for (var i = 0; i < ring.length; i += 2) { o[i] = lamOf(ring[i] * LS); o[i + 1] = phiOf(ring[i + 1] * LS); } return o; });

  // ------------------------------------------------------------------ everything you can find: ports, places, rigs, seas
  var PORTS = D.ports, PLACES = D.places, RIGS = D.rigs || [];
  PORTS.forEach(function (p) { p.isPort = true; p.rank = p.major ? 0 : 1; });
  RIGS.forEach(function (r) { r.isRig = true; r.rank = 4; r.hash = r.id; r.sectors = [r.s]; r.sector = r.s; });
  var BY_HASH = {};
  PORTS.forEach(function (p) { BY_HASH[p.hash] = p; });
  RIGS.forEach(function (r) { BY_HASH[r.hash] = r; });
  PLACES.forEach(function (p) {
    BY_HASH[p.hash] = p;
    if (p.sectors && p.sectors.length > 1) { p.outline = outline(p.sectors, 0.94); p.edges = edgesOf(p.sectors, 0.94); }
    p.outlineSel = outline(p.sectors || [], 0.97); p.edgesSel = edgesOf(p.sectors || [], 0.97);
  });
  var tollPlaces = PLACES.filter(function (p) { return p.kind === 'toll'; });
  // flooded land: the drowned sectors, and the cuts that are seaways through flooded land (the Suez Cut, the Cut). The
  // sea has the old land there, so it is drawn as water with the old coastline as a faint dotted line.
  var FLOOD_CODES = drownedCodes.slice();
  PLACES.forEach(function (p) { if (p.flooded) p.sectors.forEach(function (c) { if (FLOOD_CODES.indexOf(c) < 0 && SEC[c].k !== 'closed') FLOOD_CODES.push(c); }); });
  var FLOOD = new Path2D(); FLOOD_CODES.forEach(function (c) { hexInto(FLOOD, SEC[c]); });
  // sailing lines through the seaways, sector centre to sector centre in the order the plan gives
  var ROUTES = PLACES.filter(function (p) { return p.route; }).map(function (p) {
    var pts = p.route.map(function (c) { return [SEC[c].x, SEC[c].y]; }), path = new Path2D(), ll = [];
    pts.forEach(function (q, i) { i ? path.lineTo(q[0], q[1]) : path.moveTo(q[0], q[1]); });
    for (var i = 0; i + 1 < pts.length; i++) { var seg = []; for (var t = 0; t <= 4; t++) { var f = t / 4; seg.push(lamOf(pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f), phiOf(pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f)); } ll.push(seg); }
    return { it: p, path: path, ll: ll, pts: pts };
  });
  // separate stretches of a scattered place (the Hot Coast rings twelve closed zones): one label each when it is chosen
  function stretches(codes, skipAt) {
    var set = {}, seen = {}, out = [];
    codes.forEach(function (c) { set[c] = 1; });
    codes.forEach(function (c) {
      if (seen[c]) return;
      var comp = [], q = [c]; seen[c] = 1;
      while (q.length) { var a = q.pop(); comp.push(a); for (var d = 0; d < 6; d++) { var n = neighbour(SEC[a], d); if (n && set[n] && !seen[n]) { seen[n] = 1; q.push(n); } } }
      // label at the member nearest the stretch's middle (on the circle, so a stretch across the date line holds together)
      var ang = comp.map(function (k) { return SEC[k].x / W * 2 * Math.PI; });
      var mx = (Math.atan2(ang.reduce(function (s_, a_) { return s_ + Math.sin(a_); }, 0), ang.reduce(function (s_, a_) { return s_ + Math.cos(a_); }, 0)) / (2 * Math.PI) * W + W) % W;
      var my = comp.reduce(function (s_, k) { return s_ + SEC[k].y; }, 0) / comp.length;
      comp.sort(function (a_, b_) { var da = Math.hypot(((SEC[a_].x - mx + W * 1.5) % W) - W / 2, SEC[a_].y - my), db = Math.hypot(((SEC[b_].x - mx + W * 1.5) % W) - W / 2, SEC[b_].y - my); return da - db || (a_ < b_ ? -1 : 1); });
      if (comp.indexOf(skipAt) < 0) out.push({ at: SEC[comp[0]], n: comp.length });   // the marker already names its own stretch
    });
    return out;
  }
  // the chosen place, when it is an area of several sectors: the paths that dim the rest and band it
  var areaCache = {};
  function areaSel() {
    var it = sel && sel.item;
    if (!it || it.isPort || it.isRig || !it.sectors || it.sectors.length < 2) return null;
    if (areaCache[it.hash]) return areaCache[it.hash];
    var keep = it.sectors.slice(); if (it === hotCoast) keep = keep.concat(CLOSED_CODES);
    var dim = new Path2D(); dim.rect(-SW * 2, TOP - 90000, W + 4 * SW, BOTTOM - TOP + 180000); keep.forEach(function (c) { hexInto(dim, SEC[c]); });
    var band = new Path2D(); it.sectors.forEach(function (c) { hexInto(band, SEC[c]); });
    var col = it.isSea ? SEAS[it.id].color : it === hotCoast ? HOT_COL : (KIND_COL[it.kind] || '#f0c773');
    return (areaCache[it.hash] = { it: it, keep: keep, dimFlat: dim, bandFlat: band, col: col, parts: it.kind === 'fallout' ? stretches(it.sectors, hexAt(it.x, it.y)) : null });
  }
  var hotCoast = PLACES.filter(function (p) { return p.id === 'hot_coast'; })[0];
  // where to letter each sea's name: the member with the most members around it
  var SEA_LABEL = {}, SEA_ITEMS = [];
  Object.keys(SEAS).forEach(function (id) {
    var scored = [], codes = [];
    CODES.forEach(function (c) {
      var s = SEC[c]; if (s.s !== id) return;
      codes.push(c);
      var n = 0;
      for (var d = 0; d < 6; d++) { var a = neighbour(s, d); if (a && SEC[a] && SEC[a].s === id) { n += 2; for (var e = 0; e < 6; e++) { var b = neighbour(SEC[a], e); if (b && SEC[b] && SEC[b].s === id) n++; } } }
      scored.push([n, s]);
    });
    scored.sort(function (a, b) { return b[0] - a[0]; });
    if (!scored.length) return;
    SEA_LABEL[id] = scored.slice(0, 6).map(function (x) { return x[1]; });
    var a0 = SEA_LABEL[id][0];
    var it = { isSea: true, id: id, kind: 'sea', hash: 'sea-' + id.replace(/_/g, '-'), name: SEAS[id].name, x: a0.x, y: a0.y, sectors: codes, rank: 5 };
    it.outlineSel = outline(codes, 0.97); it.edgesSel = edgesOf(codes, 0.97);
    SEA_ITEMS.push(it); BY_HASH[it.hash] = it;
  });
  function catOf(it) {
    if (it.isPort) return 'ports';
    if (it.isRig) return 'rigs';
    if (it.isSea) return 'seas';
    return { toll: 'pirates', stronghold: 'pirates', crew: 'pirates', fishing: 'fishing', graveyard: 'wrecks', city: 'wrecks', salvage: 'wrecks',
      gate: 'danger', fallout: 'danger', drone: 'danger', no_fuel: 'danger' }[it.kind] || 'other';
  }
  var FILTERS = [
    { id: 'all', name: 'All', title: 'Everything' },
    { id: 'ports', name: 'Ports', title: 'Ports' },
    { id: 'rigs', name: 'Rigs', title: 'Oil rigs' },
    { id: 'pirates', name: 'Pirates', title: 'Pirate water and bases' },
    { id: 'fishing', name: 'Fishing', title: 'Fishing grounds' },
    { id: 'wrecks', name: 'Wrecks and ruins', title: 'Wrecks and ruins' },
    { id: 'danger', name: 'Danger zones', title: 'Gates and danger zones' },
    { id: 'seas', name: 'Seas', title: 'The seas' }
  ];
  var CAT = {};
  FILTERS.forEach(function (f) { CAT[f.id] = []; });
  PORTS.concat(PLACES, RIGS, SEA_ITEMS).forEach(function (it) { (CAT[catOf(it)] = CAT[catOf(it)] || []).push(it); });
  CAT.all = PORTS.concat(PLACES);   // the "All" list leaves out the 600-odd rigs; they have their own filter

  // ------------------------------------------------------------------ canvas and view
  var cv = document.getElementById('chart'), ctx = cv.getContext('2d');
  var DPR = 1, CW = 0, CH = 0;
  var V = { s: 0.003, cx: W / 2, cy: (ROWS - 1) * SH / 2 };
  var G = { lam: 170 * DEG, phi: 12 * DEG, R: 300, cx: 0, cy: 0 };
  var testQuiet = false;
  var view = 'flat', mode = 'holders', filter = 'all', rigSt = 'all', sel = null, hits = [], started = false, OFF = [0];
  function minScale() { return Math.min(CW / W, CH / (BOTTOM - TOP)) * 0.98; }
  function maxScale() { return 900 / SW; }
  function gMinR() { return Math.min(CW, CH) * 0.42; }
  function gMaxR() { return 900 / (HEXW * DEG); }
  function clampView() {
    V.s = Math.max(minScale(), Math.min(maxScale(), V.s));
    V.cx = ((V.cx % W) + W) % W;
    // the chart may slide a little past the world's top and bottom, so a place near the edge can sit
    // in the part of the chart a panel leaves open
    var pn = document.getElementById('panel'), half = CH / 2 / V.s, slack = (pn && !pn.hidden ? 0.75 : 0.35) * CH / V.s;
    if (BOTTOM - TOP <= 2 * half) V.cy = (TOP + BOTTOM) / 2;
    else V.cy = Math.max(TOP + half - slack, Math.min(BOTTOM - half + slack, V.cy));
    G.R = Math.max(gMinR(), Math.min(gMaxR(), G.R));
    G.phi = Math.max(-80 * DEG, Math.min(85 * DEG, G.phi));
    G.lam = ((G.lam + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  }
  function homeView() {
    if (CW >= 760) { V.s = CH / (BOTTOM - TOP); V.cx = 195000; V.cy = 56000; }
    else { V.s = (CH - 30) / (BOTTOM - TOP); V.cx = 272000; V.cy = 56000; }
    G.R = gMinR(); G.lam = lamOf(CW >= 760 ? 195000 : 262000); G.phi = 12 * DEG;
    clampView();
  }
  function setVars() {
    var hd = document.querySelector('header.site'), tl = mapEl.querySelector('.map-ui.top-left');
    var root = document.documentElement;
    if (hd) root.style.setProperty('--hdr', Math.round(hd.getBoundingClientRect().height) + 'px');
    if (tl) mapEl.style.setProperty('--tbh', Math.round(tl.getBoundingClientRect().bottom - mapEl.getBoundingClientRect().top) + 'px');
  }
  function resize() {
    setVars();
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
  // the size of one sector on screen, in either view
  function secPx() { return view === 'globe' ? G.R * HEXW * DEG : SW * V.s; }

  // ------------------------------------------------------------------ the globe: orthographic projection
  var gs = { sp: 0, cp: 1 }, P3 = [0, 0, 0];
  function gPrep() { var vc = visibleCentre(); G.cx = vc[0]; G.cy = vc[1]; gs.sp = Math.sin(G.phi); gs.cp = Math.cos(G.phi); }
  function gProj(lam, phi, out) {
    var cph = Math.cos(phi), dl = lam - G.lam, cdl = Math.cos(dl), sph = Math.sin(phi);
    var x = cph * Math.sin(dl), y = gs.cp * sph - gs.sp * cph * cdl, z = gs.sp * sph + gs.cp * cph * cdl;
    if (z < 0) { var n = Math.hypot(x, y) || 1; x /= n; y /= n; }   // behind the globe: pin to the rim
    out[0] = G.cx + G.R * x; out[1] = G.cy - G.R * y; out[2] = z;
    return out;
  }
  function gInverse(X, Y) {
    var x = (X - G.cx) / G.R, y = (G.cy - Y) / G.R, rho = Math.hypot(x, y);
    if (rho > 1) return null;
    if (rho < 1e-9) return [G.lam, G.phi];
    var c = Math.asin(rho), sc = Math.sin(c), cc = Math.cos(c);
    var phi = Math.asin(cc * gs.sp + y * sc * gs.cp / rho);
    var lam = G.lam + Math.atan2(x * sc, rho * cc * gs.cp - y * sc * gs.sp);
    return [lam, phi];
  }
  // Clip at the horizon. A point behind the globe is never drawn; an edge that crosses the horizon is cut where it
  // crosses, and a ring that dips behind the globe follows the rim from where it left to where it comes back. (Pinning
  // hidden points to the rim drew straight lines across the disc between far-apart rim points, so a continent turning
  // over the edge flooded the front of the globe with land colour.)
  var U1 = [0, 0, 0], U2 = [0, 0, 0];
  function gUnit(lam, phi, out) {
    var cph = Math.cos(phi), dl = lam - G.lam, cdl = Math.cos(dl), sph = Math.sin(phi);
    out[0] = cph * Math.sin(dl); out[1] = gs.cp * sph - gs.sp * cph * cdl; out[2] = gs.sp * sph + gs.cp * cph * cdl;
    return out;
  }
  // the point where the edge a -> b crosses the horizon, as a screen angle on the rim
  function gCross(a, b) {
    var t = a[2] / (a[2] - b[2]), x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
    return Math.atan2(-y, x);
  }
  function rimPt(ang) { return [G.cx + G.R * Math.cos(ang), G.cy + G.R * Math.sin(ang)]; }
  // add a ring of [lam, phi] pairs to the current path; false if it is wholly behind the globe
  function gRing(ll, n) {
    var N = n >> 1, i, start = -1, vis = new Array(N), P = new Array(N);
    for (i = 0; i < N; i++) { var u = gUnit(ll[2 * i], ll[2 * i + 1], [0, 0, 0]); P[i] = u; vis[i] = u[2] > 0; if (vis[i] && start < 0) start = i; }
    if (start < 0) return false;
    var first = true, exitAng = null;
    function to(X, Y) { if (first) { ctx.moveTo(X, Y); first = false; } else ctx.lineTo(X, Y); }
    to(G.cx + G.R * P[start][0], G.cy - G.R * P[start][1]);
    for (var k = 0; k < N; k++) {
      var a = (start + k) % N, b = (a + 1) % N;
      if (vis[a] && vis[b]) { if (b !== start) to(G.cx + G.R * P[b][0], G.cy - G.R * P[b][1]); }
      else if (vis[a] && !vis[b]) { exitAng = gCross(P[a], P[b]); var e = rimPt(exitAng); to(e[0], e[1]); }
      else if (!vis[a] && vis[b]) {
        var inAng = gCross(P[a], P[b]);
        if (exitAng !== null) {   // follow the rim the short way round from where the ring left to where it returns
          var d = ((inAng - exitAng) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
          ctx.arc(G.cx, G.cy, G.R, exitAng, exitAng + d, d < 0);
        }
        var q = rimPt(inAng); to(q[0], q[1]);
        if (b !== start) to(G.cx + G.R * P[b][0], G.cy - G.R * P[b][1]);
        exitAng = null;
      }
    }
    ctx.closePath();
    return true;
  }
  // open polylines (edges, graticule): only the visible pieces, cut at the horizon
  function gLines(edges) {
    for (var e = 0; e < edges.length; e++) {
      var ed = edges[e], pen = false;
      gUnit(ed[0], ed[1], U1);
      if (U1[2] > 0) { ctx.moveTo(G.cx + G.R * U1[0], G.cy - G.R * U1[1]); pen = true; }
      for (var j = 2; j < ed.length; j += 2) {
        gUnit(ed[j], ed[j + 1], U2);
        if (U1[2] > 0 && U2[2] > 0) ctx.lineTo(G.cx + G.R * U2[0], G.cy - G.R * U2[1]);
        else if (U1[2] > 0 && U2[2] <= 0) { var x = rimPt(gCross(U1, U2)); ctx.lineTo(x[0], x[1]); pen = false; }
        else if (U1[2] <= 0 && U2[2] > 0) { var y = rimPt(gCross(U1, U2)); ctx.moveTo(y[0], y[1]); ctx.lineTo(G.cx + G.R * U2[0], G.cy - G.R * U2[1]); pen = true; }
        U1[0] = U2[0]; U1[1] = U2[1]; U1[2] = U2[2];
      }
    }
  }
  function gHexes(codes) { for (var i = 0; i < codes.length; i++) { var s = SEC[codes[i]]; gRing(s.ll, s.ll.length); } }

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
    if (m === 'seas') return hexA(SEAS[key].color, 0.5);   // strong enough that a pale sea (the Choked Sea) does not read as land
    return hexA(RISK_COL[key - 1], 0.52);
  }

  // ------------------------------------------------------------------ drawing
  function draw() {
    if (!CW) return;
    screenT();
    ctx.fillStyle = '#081624'; ctx.fillRect(0, 0, CW, CH);
    if (view === 'globe') drawGlobe(); else drawFlat();
    screenT();
    hits = []; boxes = [];
    reserveUI();
    var px = secPx();
    if (mode === 'danger' && px > 30) drawRiskNumbers(px);
    var ar = areaSel();
    if (ar && ar.parts) ar.parts.forEach(function (pt) {
      posOf(pt.at.x, pt.at.y).forEach(function (q) { label(ar.it.name, q[0], q[1], { size: 12.5, center: true, color: HOT_COL, weight: 700 }); });
    });
    if (testQuiet) return;
    drawMarkers(px);
    if (mode === 'seas' || filter === 'seas') drawSeaNames(px);
  }
  function drawFlat() {
    OFF = offsets();
    var px = SW * V.s, area = areaSel();
    // The world is drawn once per copy (the flat chart wraps east to west). Each layer is drawn on every copy before the
    // next layer starts, so one copy's sea never paints over the edge of the copy beside it (that wiped the fill of the
    // hexes on the seam, column 38).
    function each(fn) { for (var i = 0; i < OFF.length; i++) { worldT(OFF[i]); fn(OFF[i]); } }
    each(function () { ctx.fillStyle = '#0c2338'; ctx.fillRect(-SW / 2, TOP - 80000, W, BOTTOM - TOP + 160000); });
    each(function () { var g = FILL[mode]; for (var k in g) { ctx.fillStyle = fillColor(mode, k); ctx.fill(g[k]); } });
    each(function () {
      ctx.fillStyle = '#1b2422'; ctx.fill(LAND, 'evenodd');
      ctx.fillStyle = pattern('land', 7, function (gg) { gg.fillStyle = 'rgba(217,201,163,0.05)'; gg.fillRect(1, 1, 1, 1); });
      ctx.fill(LAND, 'evenodd');
      ctx.lineWidth = 1.1 / V.s; ctx.strokeStyle = 'rgba(217,201,163,0.55)'; ctx.stroke(LAND);
    });
    each(function () {
      // flooded land: the sea has it now. Water over it, the sea or holder colour, waves, and the old coast dotted
      ctx.save(); ctx.clip(FLOOD);
      ctx.fillStyle = '#0c2338'; ctx.fillRect(-SW, TOP - 80000, W + 2 * SW, BOTTOM - TOP + 160000);
      var g = FILL[mode]; for (var k2 in g) { ctx.fillStyle = fillColor(mode, k2); ctx.fill(g[k2]); }
      ctx.fillStyle = pattern('wave', 14, wavePainter); ctx.fill(FLOOD);
      ctx.setLineDash([2 / V.s, 3 / V.s]); ctx.lineWidth = 1 / V.s; ctx.strokeStyle = 'rgba(217,201,163,0.4)'; ctx.stroke(LAND); ctx.setLineDash([]);
      ctx.restore();
    });
    each(function () {
      ctx.fillStyle = 'rgba(16,18,8,0.86)'; ctx.fill(CLOSED);
      ctx.fillStyle = pattern('radhz', 10, hatchPainter(RAD_YEL, 2.6)); ctx.fill(CLOSED);
      ctx.lineWidth = 1.8 / V.s; ctx.strokeStyle = RAD_YEL; ctx.stroke(CLOSED);
      if (mode === 'holders') { ctx.fillStyle = pattern('dead', 9, hatchPainter('rgba(255,90,100,0.45)', 1.4)); ctx.fill(REACH); }
    });
    each(function () {
      if (px > 26) { ctx.lineWidth = 1 / V.s; ctx.strokeStyle = 'rgba(200,225,240,' + Math.min(0.13, (px - 26) / 300) + ')'; ctx.stroke(GRID); }
      var b = BORDER[mode];
      if (b) {
        ctx.lineCap = 'round';
        ctx.lineWidth = 3.2 / V.s; ctx.strokeStyle = 'rgba(3,8,14,0.7)'; ctx.stroke(b);
        ctx.lineWidth = 1.3 / V.s; ctx.strokeStyle = mode === 'holders' ? 'rgba(236,228,206,0.85)' : 'rgba(200,225,240,0.6)'; ctx.stroke(b);
      }
      if ((filter === 'all' || filter === 'pirates') && !area || area && area.it.route) {
        ROUTES.forEach(function (r) {   // the seaway: a sailing line through the cut, in toll red
          ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          ctx.lineWidth = 6 / V.s; ctx.strokeStyle = 'rgba(3,8,14,0.8)'; ctx.stroke(r.path);
          ctx.lineWidth = 3 / V.s; ctx.strokeStyle = '#ffb3a3'; ctx.stroke(r.path);
          ctx.setLineDash([7 / V.s, 6 / V.s]); ctx.lineWidth = 3 / V.s; ctx.strokeStyle = '#ff6a4d'; ctx.stroke(r.path); ctx.setLineDash([]);
        });
      }
      if ((filter === 'all' || filter === 'pirates') && !area) {
        tollPlaces.forEach(function (p) {   // toll lines: a dashed line round the water they hold
          ctx.setLineDash([6 / V.s, 4 / V.s]); ctx.lineWidth = 2.2 / V.s; ctx.strokeStyle = 'rgba(255,106,77,0.95)'; ctx.stroke(p.outline); ctx.setLineDash([]);
        });
      }
      if ((filter === 'all' && px > 46 || filter === 'danger') && hotCoast && !area) {
        ctx.setLineDash([2 / V.s, 4 / V.s]); ctx.lineWidth = 1.2 / V.s; ctx.strokeStyle = hexA(HOT_COL, 0.55); ctx.stroke(hotCoast.outline); ctx.setLineDash([]);
      }
    });
    // a chosen area reads as one shape: everything else dims, the area gets a band, the radiation zones stay sharp
    if (area) each(function () {
      ctx.save(); ctx.beginPath(); ctx.rect(-SW / 2, TOP - 90000, W, BOTTOM - TOP + 180000); ctx.clip();   // one copy of the world per wrap
      ctx.fillStyle = 'rgba(4,10,16,0.5)'; ctx.fill(area.dimFlat, 'evenodd'); ctx.restore();
      ctx.fillStyle = hexA(area.col, 0.22); ctx.fill(area.bandFlat);
      if (area.it === hotCoast) { ctx.lineWidth = 2.4 / V.s; ctx.strokeStyle = RAD_YEL; ctx.stroke(CLOSED); }
    });
    if (sel) each(function () {
      var path = sel.code ? (function () { var p = new Path2D(); hexInto(p, SEC[sel.code], 0.97); return p; })() : sel.item && !sel.item.isPort && !sel.item.isRig && sel.item.outlineSel;
      if (path) {
        ctx.lineWidth = 4.5 / V.s; ctx.strokeStyle = 'rgba(3,8,14,0.75)'; ctx.stroke(path);
        ctx.lineWidth = 2.4 / V.s; ctx.strokeStyle = area ? area.col : '#f0c773'; ctx.stroke(path);
      }
    });
  }
  function drawGlobe() {
    gPrep();
    var R = G.R, px = secPx(), k;
    // a soft glow round the world, then the sea
    var glow = ctx.createRadialGradient(G.cx, G.cy, R * 0.96, G.cx, G.cy, R * 1.12);
    glow.addColorStop(0, 'rgba(125,211,252,0.18)'); glow.addColorStop(1, 'rgba(125,211,252,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(G.cx, G.cy, R * 1.12, 0, 7); ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.arc(G.cx, G.cy, R, 0, 7); ctx.fillStyle = '#0c2338'; ctx.fill(); ctx.clip();
    // the far south and north the game does not use: a darker cap
    var gr = GROUPS[mode];
    for (k in gr) { ctx.beginPath(); gHexes(gr[k]); ctx.fillStyle = fillColor(mode, k); ctx.fill(); }
    // land
    ctx.beginPath(); for (var i = 0; i < LAND_LL.length; i++) gRing(LAND_LL[i], LAND_LL[i].length);
    ctx.fillStyle = '#1b2422'; ctx.fill('evenodd');
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(217,201,163,0.55)'; ctx.stroke();
    // drowned land, radiation, Dex's Wake
    ctx.save(); ctx.beginPath(); gHexes(FLOOD_CODES); ctx.clip();
    ctx.fillStyle = '#0c2338'; ctx.fillRect(G.cx - R, G.cy - R, 2 * R, 2 * R);
    for (k in gr) { var dc = gr[k].filter(function (c) { return FLOOD_CODES.indexOf(c) >= 0; }); if (!dc.length) continue; ctx.beginPath(); gHexes(dc); ctx.fillStyle = fillColor(mode, k); ctx.fill(); }
    ctx.beginPath(); gHexes(FLOOD_CODES); ctx.fillStyle = flatPattern('waveg', 14, wavePainter); ctx.fill();
    ctx.beginPath(); for (var li = 0; li < LAND_LL.length; li++) gRing(LAND_LL[li], LAND_LL[li].length);
    ctx.setLineDash([2, 3]); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(217,201,163,0.4)'; ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
    ctx.beginPath(); gHexes(CLOSED_CODES); ctx.fillStyle = 'rgba(16,18,8,0.86)'; ctx.fill();
    ctx.fillStyle = flatPattern('radhzg', 10, hatchPainter(RAD_YEL, 2.6)); ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = RAD_YEL; ctx.stroke();
    if (mode === 'holders') { ctx.beginPath(); gHexes(REACH_CODES); ctx.fillStyle = flatPattern('deadg', 9, hatchPainter('rgba(255,90,100,0.45)', 1.4)); ctx.fill(); }
    // grid and graticule
    if (px > 26) { ctx.beginPath(); gHexes(CODES); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(200,225,240,' + Math.min(0.13, (px - 26) / 300) + ')'; ctx.stroke(); }
    ctx.beginPath(); gLines(GRATICULE); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(217,201,163,0.08)'; ctx.stroke();
    // borders
    var b = BORDER_LL[mode];
    if (b) {
      ctx.lineCap = 'round'; ctx.beginPath(); gLines(b);
      ctx.lineWidth = 3.2; ctx.strokeStyle = 'rgba(3,8,14,0.7)'; ctx.stroke();
      ctx.lineWidth = 1.3; ctx.strokeStyle = mode === 'holders' ? 'rgba(236,228,206,0.85)' : 'rgba(200,225,240,0.6)'; ctx.stroke();
    }
    var area = areaSel();
    if ((filter === 'all' || filter === 'pirates') && !area || area && area.it.route) {
      ROUTES.forEach(function (r) {
        ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); gLines(r.ll);
        ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(3,8,14,0.8)'; ctx.stroke(); ctx.lineWidth = 3; ctx.strokeStyle = '#ffb3a3'; ctx.stroke();
        ctx.setLineDash([7, 6]); ctx.strokeStyle = '#ff6a4d'; ctx.stroke(); ctx.setLineDash([]);
      });
    }
    if ((filter === 'all' || filter === 'pirates') && !area) {
      ctx.beginPath(); tollPlaces.forEach(function (p) { gLines(p.edges); });
      ctx.setLineDash([6, 4]); ctx.lineWidth = 2.2; ctx.strokeStyle = 'rgba(255,106,77,0.95)'; ctx.stroke(); ctx.setLineDash([]);
    }
    if ((filter === 'all' && px > 46 || filter === 'danger') && hotCoast && !area) {
      ctx.beginPath(); gLines(hotCoast.edges); ctx.setLineDash([2, 4]); ctx.lineWidth = 1.2; ctx.strokeStyle = hexA(HOT_COL, 0.55); ctx.stroke(); ctx.setLineDash([]);
    }
    if (area) {
      ctx.beginPath(); ctx.rect(G.cx - R - 2, G.cy - R - 2, 2 * R + 4, 2 * R + 4); gHexes(area.keep);
      ctx.fillStyle = 'rgba(4,10,16,0.5)'; ctx.fill('evenodd');
      ctx.beginPath(); gHexes(area.it.sectors); ctx.fillStyle = hexA(area.col, 0.22); ctx.fill();
      if (area.it === hotCoast) { ctx.beginPath(); gHexes(CLOSED_CODES); ctx.lineWidth = 2.2; ctx.strokeStyle = RAD_YEL; ctx.stroke(); }
    }
    if (sel) {
      var ed = sel.code ? edgesOf([sel.code], 0.97) : sel.item && !sel.item.isPort && !sel.item.isRig && sel.item.edgesSel;
      if (ed) {
        ctx.beginPath(); gLines(ed);
        ctx.lineWidth = 4.5; ctx.strokeStyle = 'rgba(3,8,14,0.75)'; ctx.stroke(); ctx.lineWidth = 2.4; ctx.strokeStyle = area ? area.col : '#f0c773'; ctx.stroke();
      }
    }
    // shade toward the rim so it reads as a sphere
    var sh = ctx.createRadialGradient(G.cx - R * 0.3, G.cy - R * 0.35, R * 0.2, G.cx, G.cy, R);
    sh.addColorStop(0, 'rgba(255,255,255,0.04)'); sh.addColorStop(0.7, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = sh; ctx.fillRect(G.cx - R, G.cy - R, 2 * R, 2 * R);
    ctx.restore();
    ctx.beginPath(); ctx.arc(G.cx, G.cy, R, 0, 7); ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(217,201,163,0.4)'; ctx.stroke();
  }
  // lines of longitude every 30 degrees and latitude every 30 degrees, for the globe
  var GRATICULE = (function () {
    var out = [], l, p, seg;
    for (l = -180; l < 180; l += 30) for (p = -80; p < 80; p += 10) out.push([l * DEG, p * DEG, l * DEG, (p + 5) * DEG, l * DEG, (p + 10) * DEG]);
    for (p = -60; p <= 60; p += 30) for (l = -180; l < 180; l += 10) { seg = [l * DEG, p * DEG, (l + 5) * DEG, p * DEG, (l + 10) * DEG, p * DEG]; out.push(seg); }
    return out;
  })();
  // a screen-sized pattern (the globe draws in screen pixels)
  var flatCache = {};
  function flatPattern(key, size, paint) {
    if (!flatCache[key]) { var c = document.createElement('canvas'); c.width = c.height = size * 2; var g = c.getContext('2d'); g.scale(2, 2); paint(g, size); flatCache[key] = ctx.createPattern(c, 'repeat'); if (flatCache[key].setTransform && window.DOMMatrix) flatCache[key].setTransform(new DOMMatrix().scale(0.5, 0.5)); }
    return flatCache[key];
  }
  // where a world point shows on screen: several places on the flat chart (it wraps), one or none on the globe
  function posOf(x, y) {
    if (view === 'globe') {
      gProj(lamOf(x), phiOf(y), P3);
      return P3[2] > 0.06 ? [[P3[0], P3[1]]] : [];
    }
    var out = [], Y = sy(y);
    for (var i = 0; i < OFF.length; i++) out.push([sx(x, OFF[i]), Y]);
    return out;
  }

  // label placement: greedy, in order of importance
  var boxes = [];
  function hit(b) { for (var i = 0; i < boxes.length; i++) { var o = boxes[i]; if (b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]) return true; } return false; }
  function reserveUI() {
    var mr = mapEl.getBoundingClientRect();
    mapEl.querySelectorAll('.map-ui, .legend, .readout:not([hidden]), .finder:not([hidden])').forEach(function (el) {
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

  function drawRiskNumbers(px) {
    var fs = Math.max(10, Math.min(18, px / 5));
    ctx.font = '700 ' + fs + 'px Rajdhani, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    CODES.forEach(function (c) {
      var s = SEC[c]; if (s.k === 'closed') return;
      posOf(s.x, s.y + RY * 0.45).forEach(function (q) {
        if (q[0] < -20 || q[0] > CW + 20 || q[1] < -20 || q[1] > CH + 20) return;
        ctx.fillStyle = 'rgba(255,255,255,0.78)'; ctx.fillText(String(s.d), q[0], q[1]);
      });
    });
    ctx.textAlign = 'left';
  }
  function drawSeaNames(px) {
    var fs = Math.max(10, Math.min(22, px * 0.36));
    Object.keys(SEA_LABEL).forEach(function (id) {
      var name = SEAS[id].name.toUpperCase(), isSel = sel && sel.item && sel.item.isSea && sel.item.id === id;
      try { ctx.letterSpacing = Math.round(fs * 0.22) + 'px'; } catch (e) { }
      var done = false;
      SEA_LABEL[id].forEach(function (s) {   // the best-placed member that has room
        if (done) return;
        posOf(s.x, s.y).forEach(function (q) {
          if (done || q[0] < -200 || q[0] > CW + 200) return;
          done = label(name, q[0], q[1], { size: fs, font: 'Saira, Rajdhani, sans-serif', weight: 600, center: true, color: isSel ? '#f0c773' : hexA(SEAS[id].color, 0.95), halo: 4 });
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
    } else if (kind === 'fallout') {   // the Hot Coast: a lifebuoy struck through, for "no rescue here"
      g.beginPath(); g.arc(X, Y, 8.5, 0, 7); g.fillStyle = dark; g.fill();
      g.beginPath(); g.arc(X, Y, 5.6, 0, 7); g.lineWidth = 3; g.strokeStyle = col; g.stroke();
      g.beginPath(); g.moveTo(X - 6.5, Y + 6.5); g.lineTo(X + 6.5, Y - 6.5); g.lineWidth = 3.4; g.strokeStyle = dark; g.stroke(); g.lineWidth = 1.8; g.strokeStyle = '#fff'; g.stroke();
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
    } else if (kind === 'aiport') {   // the automated port: a square inside a diamond, nothing human about it
      g.beginPath(); g.moveTo(X, Y - 9); g.lineTo(X + 9, Y); g.lineTo(X, Y + 9); g.lineTo(X - 9, Y); g.closePath();
      g.fillStyle = dark; g.fill(); g.lineWidth = 2; g.strokeStyle = col; g.stroke();
      g.fillStyle = col; g.fillRect(X - 3.2, Y - 3.2, 6.4, 6.4);
    } else if (kind === 'no_fuel') {
      g.beginPath(); g.arc(X, Y, 7, 0, 7); g.fillStyle = dark; g.fill();
      g.setLineDash([2.5, 2]); g.lineWidth = 2; g.strokeStyle = col; g.stroke(); g.setLineDash([]);
    }
  }

  function markerKind(it) { return it.isRig ? 'rig_' + (it.st || 'working') + '_' + (it.ctl || 'none') : it.isPort ? (it.mystery ? 'aiport' : it.dead ? 'dead' : 'port') : it.kind; }
  function markerColor(it) { return it.isRig ? (it.ctl ? RIG_CTL[it.ctl].col : RIG_ST.destroyed.col) : it.isPort ? (it.mystery ? AI_COL : it.dead ? '#3a4550' : T[it.terr].color) : KIND_COL[it.kind]; }
  function drawGlyph(g, kind, X, Y, col, big, small) {
    if (kind.indexOf('rig_') === 0) { var kp = kind.split('_'); rigGlyph(g, kp[1], kp[2], X, Y, col, small); return; }
    glyph(g, kind, X, Y, col, big);
  }

  // rigs, one shape per status so they read without colour: working = solid deck with a derrick; destroyed = hollow
  // deck crossed out; twin = two decks side by side; pirate-held = solid deck with a dark triangle; Breakwater = deck in a ring
  // rigs: the outline shape says what is standing (one deck; two decks for a twin; crossed out when destroyed; a ring for
  // Breakwater) and the mark inside says who controls it, so they read without colour: a derrick = free trading,
  // a roof = lantern rig (people live there), a coin = paying tribute, a dark triangle = pirate-held, an empty dark deck = dark
  function rigGlyph(g, st, ctl, X, Y, col, small) {
    var r = small ? 3 : 4.6, dark = '#06101a';
    function mark(cx, cy, rr) {
      if (small && ctl !== 'pirate') return;
      g.beginPath();
      if (ctl === 'free' || ctl === 'breakwater') { g.moveTo(cx - rr * 0.5, cy + rr * 0.6); g.lineTo(cx, cy - rr * 0.7); g.lineTo(cx + rr * 0.5, cy + rr * 0.6); g.lineWidth = 1.3; g.strokeStyle = dark; g.stroke(); }
      else if (ctl === 'housing') { g.moveTo(cx - rr * 0.65, cy - rr * 0.05); g.lineTo(cx, cy - rr * 0.7); g.lineTo(cx + rr * 0.65, cy - rr * 0.05); g.moveTo(cx - rr * 0.45, cy - rr * 0.1); g.lineTo(cx - rr * 0.45, cy + rr * 0.65); g.lineTo(cx + rr * 0.45, cy + rr * 0.65); g.lineTo(cx + rr * 0.45, cy - rr * 0.1); g.lineWidth = 1.3; g.strokeStyle = dark; g.stroke(); }
      else if (ctl === 'tribute') { g.arc(cx, cy, rr * 0.45, 0, 7); g.lineWidth = 1.5; g.strokeStyle = dark; g.stroke(); }
      else if (ctl === 'pirate') { g.moveTo(cx, cy - rr * 0.75); g.lineTo(cx + rr * 0.75, cy + rr * 0.6); g.lineTo(cx - rr * 0.75, cy + rr * 0.6); g.closePath(); g.fillStyle = dark; g.fill(); }
    }
    function deck(cx, cy, rr) {
      g.beginPath(); g.rect(cx - rr - 1.5, cy - rr - 1.5, 2 * rr + 3, 2 * rr + 3); g.fillStyle = dark; g.fill();
      g.beginPath(); g.rect(cx - rr, cy - rr, 2 * rr, 2 * rr);
      if (ctl === 'dark') { g.fillStyle = '#10171e'; g.fill(); g.lineWidth = 1.3; g.strokeStyle = col; g.stroke(); }
      else { g.fillStyle = col; g.fill(); }
      mark(cx, cy, rr);
    }
    if (st === 'destroyed') {
      g.beginPath(); g.rect(X - r - 1, Y - r - 1, 2 * r + 2, 2 * r + 2); g.fillStyle = 'rgba(6,16,26,0.85)'; g.fill();
      g.beginPath(); g.rect(X - r, Y - r, 2 * r, 2 * r); g.lineWidth = 1.4; g.strokeStyle = col; g.stroke();
      g.beginPath(); g.moveTo(X - r - 1.5, Y - r - 1.5); g.lineTo(X + r + 1.5, Y + r + 1.5); g.moveTo(X + r + 1.5, Y - r - 1.5); g.lineTo(X - r - 1.5, Y + r + 1.5);
      g.lineWidth = 3.2; g.strokeStyle = dark; g.stroke(); g.lineWidth = 1.5; g.strokeStyle = '#ff6a4d'; g.stroke();
    } else if (st === 'twin') {
      var q = r * 0.78; deck(X - q * 1.15, Y + q * 0.25, q); deck(X + q * 1.15, Y - q * 0.25, q);
    } else if (st === 'breakwater') {
      g.beginPath(); g.arc(X, Y, r * 2, 0, 7); g.lineWidth = 3.4; g.strokeStyle = dark; g.stroke(); g.lineWidth = 1.6; g.strokeStyle = col; g.stroke();
      deck(X, Y, r * 0.8);
    } else deck(X, Y, r);
  }
  function rigShown(r) {
    if (rigSt === 'all') return true;
    var c = RIG_CHIPS.filter(function (x) { return x[0] === rigSt; })[0];
    return c && (c[1] === 'ctl' ? r.ctl === rigSt : r.st === rigSt);
  }

  // which places show: the filter decides; with "All", ports always and minor places as you zoom in
  function visibleRank(px) { return px >= 95 ? 3 : px >= 50 ? 2 : 1; }
  function drawMarkers(px) {
    var vr = visibleRank(px), items, small = false;
    if (filter === 'all') {
      items = PORTS.slice();
      PLACES.forEach(function (p) { if (p.rank <= vr) items.push(p); });
      if (px >= 95) { items = items.concat(RIGS); small = true; }
    } else if (filter === 'seas') items = [];
    else if (filter === 'rigs') items = RIGS.filter(rigShown);
    else items = CAT[filter].slice();
    var selItem = sel && sel.item;
    if (selItem && !selItem.isSea && items.indexOf(selItem) < 0) items.push(selItem);
    items.sort(function (a, b) { return a.rank - b.rank; });
    var placed = [];
    // markers first (so labels avoid every marker), then labels in order of importance
    items.forEach(function (it) {
      posOf(it.x, it.y).forEach(function (q) {
        if (q[0] < -20 || q[0] > CW + 20 || q[1] < -20 || q[1] > CH + 20) return;
        placed.push({ it: it, X: q[0], Y: q[1] });
      });
    });
    for (var i = placed.length - 1; i >= 0; i--) {
      var m = placed[i], isSel = m.it === selItem;
      if (isSel) {   // the chosen place: a gold ring round its marker
        ctx.beginPath(); ctx.arc(m.X, m.Y, 15, 0, 7); ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(3,8,14,0.8)'; ctx.stroke();
        ctx.lineWidth = 2.5; ctx.strokeStyle = '#f0c773'; ctx.stroke();
      }
      drawGlyph(ctx, markerKind(m.it), m.X, m.Y, markerColor(m.it), m.it.id === 'ari', m.it.isRig && small && !isSel);
      hits.push({ X: m.X, Y: m.Y, it: m.it });
    }
    placed.forEach(function (m) { var r = m.it.isRig ? 6 : 8; boxes.push([m.X - r, m.Y - r, m.X + r, m.Y + r]); });
    // the chosen place's label goes first so nothing pushes it out
    placed.sort(function (a, b) { return (b.it === selItem) - (a.it === selItem); });
    placed.forEach(function (m) {
      var it = m.it, isSel = it === selItem, show;
      if (it.isRig) show = isSel || (filter === 'rigs' && px >= 110) || px >= 170;
      else if (filter !== 'all') show = true;
      else show = it.isPort ? (it.major || vr >= 2 || isSel) : (it.rank < vr || it.rank === 1 || isSel || vr === 3);
      if (!show) return;
      var size = it.isPort ? (it.major ? 15 : 13.5) : it.isRig ? 12 : it.rank === 1 ? 14 : 12.5;
      var color = it.isPort ? '#ffffff' : it.isRig ? '#d4dde3' : it.rank === 1 ? '#f0dfb6' : '#d4dde3';
      if (it.id === 'deadmans_land' || it.kind === 'toll') color = '#ffb3a3';
      label(it.isPort ? it.name.replace('Dead port: ', '') : it.name, m.X, m.Y, { size: size, color: isSel ? '#f0c773' : color, weight: it.isPort && it.major ? 700 : 600, force: isSel });
    });
  }

  // ------------------------------------------------------------------ pan, zoom, click (both views)
  var ptrs = new Map(), drag = null, pinch = null, moved = false, hintEl = document.getElementById('map-hint');
  function hideHint() { if (hintEl) hintEl.classList.add('gone'); }
  function zoomAt(px, py, f) {
    if (view === 'globe') {
      var r0 = G.R; G.R = Math.max(gMinR(), Math.min(gMaxR(), G.R * f));
      if (G.R !== r0) { requestDraw(); hideHint(); }
      return;
    }
    var w = toWorld(px, py), s0 = V.s;
    V.s = Math.max(minScale(), Math.min(maxScale(), V.s * f));
    if (V.s === s0) return;
    V.cx = w[0] - (px - CW / 2) / V.s; V.cy = w[1] - (py - CH / 2) / V.s;
    clampView(); requestDraw(); hideHint();
  }
  function panBy(dx, dy) {   // screen pixels
    if (view === 'globe') { G.lam -= dx / G.R; G.phi += dy / G.R; }
    else { V.cx -= dx / V.s; V.cy -= dy / V.s; }
    clampView(); requestDraw();
  }
  function local(e) { var r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  cv.addEventListener('pointerdown', function (e) {
    if (e.button && e.button !== 0) return;
    cv.setPointerCapture(e.pointerId);
    var p = local(e); ptrs.set(e.pointerId, p); stopFly();
    if (ptrs.size === 1) { drag = { x: p[0], y: p[1], lx: p[0], ly: p[1] }; moved = false; }
    else if (ptrs.size === 2) {
      var a = Array.from(ptrs.values());
      pinch = { d: Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]) || 1, s: V.s, R: G.R, w: toWorld((a[0][0] + a[1][0]) / 2, (a[0][1] + a[1][1]) / 2) };
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
      if (view === 'globe') G.R = pinch.R * d / pinch.d;
      else { V.s = Math.max(minScale(), Math.min(maxScale(), pinch.s * d / pinch.d)); V.cx = pinch.w[0] - (mx - CW / 2) / V.s; V.cy = pinch.w[1] - (my - CH / 2) / V.s; }
      clampView(); requestDraw(); hideHint();
    } else if (drag) {
      var dx = p[0] - drag.x, dy = p[1] - drag.y;
      if (!moved && Math.hypot(dx, dy) > (e.pointerType === 'touch' ? 10 : 5)) { moved = true; cv.classList.add('drag'); hideHint(); }
      if (moved) { panBy(p[0] - drag.lx, p[1] - drag.ly); drag.lx = p[0]; drag.ly = p[1]; }
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
      var q = Array.from(ptrs.values())[0]; drag = { x: q[0], y: q[1], lx: q[0], ly: q[1] }; pinch = null;
    }
  }
  cv.addEventListener('pointerup', endPtr);
  cv.addEventListener('pointercancel', endPtr);
  cv.addEventListener('wheel', function (e) {
    e.preventDefault(); stopFly();
    var p = local(e), dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY, dx = e.deltaMode === 1 ? e.deltaX * 16 : e.deltaX;
    if (!e.ctrlKey && Math.abs(dx) > Math.abs(dy)) { panBy(-dx, 0); return; }
    zoomAt(p[0], p[1], Math.exp(-dy * (e.ctrlKey ? 0.012 : 0.0022)));
  }, { passive: false });
  cv.addEventListener('dblclick', function (e) { var p = local(e); zoomAt(p[0], p[1], 2); });
  cv.addEventListener('keydown', function (e) {
    var k = e.key;
    if (k === 'ArrowLeft') panBy(90, 0); else if (k === 'ArrowRight') panBy(-90, 0);
    else if (k === 'ArrowUp') panBy(0, 90); else if (k === 'ArrowDown') panBy(0, -90);
    else if (k === '+' || k === '=') zoomAt(CW / 2, CH / 2, 1.4);
    else if (k === '-' || k === '_') zoomAt(CW / 2, CH / 2, 1 / 1.4);
    else if (k === '0') { homeView(); requestDraw(); }
    else return;
    e.preventDefault(); stopFly(); hideHint();
  });
  function pick(px, py, touch) {
    var best = null, bd = touch ? 22 : 14;
    hits.forEach(function (h) { var d = Math.hypot(h.X - px, h.Y - py); if (d < bd) { bd = d; best = h.it; } });
    return best;
  }
  function worldAt(px, py) {
    if (view !== 'globe') return toWorld(px, py);
    gPrep(); var ll = gInverse(px, py); if (!ll) return null;
    return [xOfLam(ll[0]), yOfPhi(ll[1])];
  }
  function clickAt(px, py, ptype) {
    var it = pick(px, py, ptype === 'touch');
    if (it) { openItem(it, { push: true, fly: false }); return; }
    var w = worldAt(px, py), code = w && hexAt(w[0], w[1]);
    if (code && SEC[code] && w[1] > TOP && w[1] < BOTTOM) showSector(code, true);
    else { sel = null; hideReadout(); requestDraw(); }
  }
  document.getElementById('zoom-in').addEventListener('click', function () { zoomAt(CW / 2, CH / 2, 1.6); });
  document.getElementById('zoom-out').addEventListener('click', function () { zoomAt(CW / 2, CH / 2, 1 / 1.6); });
  document.getElementById('zoom-reset').addEventListener('click', function () { stopFly(); homeView(); requestDraw(); });
  document.querySelectorAll('.seg button[data-mode]').forEach(function (b) {
    b.addEventListener('click', function () {
      mode = b.dataset.mode;
      document.querySelectorAll('.seg button[data-mode]').forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
      buildLegend(); requestDraw();
    });
  });
  // flat chart or globe: keep looking at the same place
  function setView(v) {
    if (v === view) return;
    stopFly();
    var px = secPx();
    if (v === 'globe') {
      var c = view === 'flat' ? [V.cx, V.cy] : null;
      view = 'globe'; gPrep();
      if (c) { G.lam = lamOf(c[0]); G.phi = phiOf(c[1]); }
      G.R = Math.min(px / (HEXW * DEG), gMinR() * 1.5);   // open far enough out to see the curve of the world
    } else {
      view = 'flat';
      V.cx = xOfLam(G.lam); V.cy = yOfPhi(G.phi); V.s = px / SW;
    }
    clampView();
    document.querySelectorAll('.seg button[data-view]').forEach(function (o) { o.setAttribute('aria-pressed', String(o.dataset.view === view)); });
    mapEl.classList.toggle('is-globe', view === 'globe');
    requestDraw();
  }
  document.querySelectorAll('.seg button[data-view]').forEach(function (b) { b.addEventListener('click', function () { setView(b.dataset.view); }); });

  // fly the chart (or turn the globe) to a place
  var flyAnim = null;
  function stopFly() { if (flyAnim) { cancelAnimationFrame(flyAnim); flyAnim = null; } }
  // where the map will sit once a scroll that has just been asked for is done (smooth scrolling moves it later)
  var mapTopAfterScroll = null;
  function isSheet() { return window.matchMedia('(max-width:700px), (orientation:portrait) and (max-width:1100px)').matches; }
  // the middle of the part of the map nothing covers (the detail panel, the list)
  function visibleCentre() {
    var mr = mapEl.getBoundingClientRect(), x0 = 0, y0 = 0, x1 = CW, y1 = CH;
    if (mapTopAfterScroll != null) mr = { left: mr.left, top: mapTopAfterScroll };
    var pn = document.getElementById('panel');
    if (!pn.hidden) {
      var pl = pn.offsetLeft, pt = pn.offsetTop;   // layout box: ignores the slide-in animation
      if (pl > mr.left + CW * 0.3) x1 = Math.min(x1, pl - mr.left);
      else if (pt > mr.top) y1 = Math.min(y1, Math.max(120, pt - mr.top));
    }
    if (!finder.hidden) {
      if (finder.offsetWidth < CW * 0.6) x0 = Math.max(x0, finder.offsetLeft + finder.offsetWidth);
      else y1 = Math.min(y1, Math.max(120, finder.offsetTop));
    }
    if (x1 - x0 < 120) { x0 = 0; x1 = CW; }
    return [(x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0];
  }
  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function flyTo(x, y, scale) {
    stopFly();
    var dur = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 560, t0 = performance.now();
    if (view === 'globe') {
      var tl = lamOf(x), tp = phiOf(y), fl = G.lam, fp = G.phi, fr = G.R;
      var dl = ((tl - fl + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
      var tr = Math.max(gMinR(), Math.min(gMaxR(), scale ? Math.max(G.R, scale * SW / (HEXW * DEG)) : G.R));
      var gstep = function (now) {
        var t = dur ? Math.min(1, (now - t0) / dur) : 1, e = ease(t);
        G.lam = fl + dl * e; G.phi = fp + (tp - fp) * e; G.R = fr * Math.pow(tr / fr, e);
        clampView(); draw();
        flyAnim = t < 1 ? requestAnimationFrame(gstep) : null;
      };
      flyAnim = requestAnimationFrame(gstep);
      return;
    }
    var vc = visibleCentre(), s1 = Math.max(minScale(), Math.min(maxScale(), scale || V.s));
    var tx = x - (vc[0] - CW / 2) / s1, ty = y - (vc[1] - CH / 2) / s1;
    var dx = ((tx - V.cx + W / 2) % W + W) % W - W / 2;
    var from = { cx: V.cx, cy: V.cy, s: V.s };
    function step(now) {
      var t = dur ? Math.min(1, (now - t0) / dur) : 1, e = ease(t);
      V.s = from.s * Math.pow(s1 / from.s, e); V.cx = from.cx + dx * e; V.cy = from.cy + (ty - from.cy) * e;
      clampView(); draw();
      flyAnim = t < 1 ? requestAnimationFrame(step) : null;
    }
    flyAnim = requestAnimationFrame(step);
  }
  function scaleFor(it) {
    // a place scattered round the world (the Hot Coast) goes to its marker at a readable size, not "fit everything"
    var secs = it.sectors && it.sectors.length > 1 && !it.isPort && it.kind !== 'fallout' ? it.sectors : null;
    var vc = visibleCentre();
    if (it.kind === 'fallout') return Math.max(view === 'globe' ? 0 : V.s, (vc[2] < 500 ? 40 : 46) / SW);
    if (secs) {
      var xs = secs.map(function (c) { return SEC[c].x; }), ys = secs.map(function (c) { return SEC[c].y; });
      var x0 = xs[0], spanX = 0;
      xs.forEach(function (x) { var d = Math.abs(((x - x0 + W / 2) % W + W) % W - W / 2); spanX = Math.max(spanX, d * 2); });
      var spanY = Math.max.apply(null, ys) - Math.min.apply(null, ys);
      return Math.min(vc[2] / (spanX + SW * 2.2), vc[3] / (spanY + SH * 2.4), 70 / SW);
    }
    var cur = view === 'globe' ? G.R * HEXW * DEG / SW : V.s;
    return Math.max(cur, (it.isRig ? (vc[2] < 500 ? 110 : 140) : (vc[2] < 500 ? 72 : 90)) / SW);
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
    RIGS.forEach(function (r) { if (r.s === code) out.push(r); });
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
    return '<figure class="ship">' + pic + '<figcaption><span class="tag">' + esc(tag) + (sh.class ? ' · ' + esc(sh.class) : '') + '</span><b>' + esc(sh.name) + '</b>' + esc(sh.role) +
      (tag === 'Sold here' && sh.stats ? statsHTML(sh.stats) : '') + '</figcaption></figure>';
  }
  // the ship card's numbers (approved for the site, 13 Nov 2026): a compact grid that wraps on a phone
  function statsHTML(t) {
    var n = function (v) { return Number(v).toLocaleString('en-GB'); };
    var cargo = (t.containers ? t.containers + ' × 20 ft' : 'No boxes') + ' · ' + t.pallets + ' pallet' + (t.pallets === 1 ? '' : 's');
    var rows = [['Level', t.level], ['Price', t.free ? 'Free' : n(t.price) + ' CR'], ['Speed', t.speed + ' m/s'], ['Hull', n(t.hull) + ' HP'],
      ['Cargo', cargo], ['Guns', t.mounts + ' mount' + (t.mounts === 1 ? '' : 's')], ['Size', t.length + ' × ' + t.beam + ' m']];
    return '<dl class="ship-stats">' + rows.map(function (r) { return '<div' + (r[0] === 'Cargo' || r[0] === 'Size' ? ' class="wide"' : '') + '><dt>' + r[0] + '</dt><dd>' + esc(r[1]) + '</dd></div>'; }).join('') + '</dl>';
  }
  function seaHTML(id) {
    var s = SEAS[id]; if (!s) return '';
    return '<h3>The water round it</h3><div class="p-sea"><p><b>' + esc(s.name) + '.</b> ' + esc(s.what) + '</p><p>' + esc(s.look) + '</p></div>';
  }
  function mysteryHTML(p) {
    var sec = SEC[p.sector];
    return '<div class="p-k">Automated port · Sector ' + esc(p.sector) + '</div>' +
      '<h2 id="panel-title" tabindex="-1">' + esc(p.name) + '</h2>' +
      '<p class="p-place">' + esc(p.place) + ' · danger ' + esc(sec.d) + ', ' + esc(riskWord[sec.d]).toLowerCase() + '</p>' +
      '<p class="p-about">' + esc(p.about) + '</p>' +
      '<h3>The port</h3>' + galleryHTML(p.capture, p.name) +
      '<h3>What is special here</h3><ul class="p-list">' + p.special.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>' +
      seaHTML(p.sea) + '<a class="p-link" href="#' + esc(p.hash) + '">Link to this port</a>';
  }
  function portHTML(p) {
    if (p.mystery) return mysteryHTML(p);
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
    var zk = zoneKey(p);
    if (zk) h += '<ul class="p-zkey">' + zk.map(function (r) { return '<li><span class="sw ' + r[0] + '"></span>' + esc(r[1]) + '</li>'; }).join('') + '</ul>';
    h += '<dl class="facts">' + (p.rule ? '<dt>' + (p.kind === 'toll' ? 'The toll' : p.kind === 'crew' ? 'How they work' : catOf(p) === 'danger' ? 'The danger' : 'The rule') + '</dt><dd>' + esc(p.rule) + '</dd>' : '') +
      (p.detour ? '<dt>The way round</dt><dd>' + esc(p.detour) + '</dd>' : '') +
      (p.reward ? '<dt>The reward</dt><dd>' + esc(p.reward) + '</dd>' : '') + '</dl>';
    if (p.sectors && p.sectors.length === 1) { var s = SEC[p.sectors[0]]; if (s) h += seaHTML(s.s); }
    h += '<a class="p-link" href="#' + esc(p.hash) + '">Link to this place</a>';
    return h;
  }

  // the two-row key inside a danger zone's panel: what the outline is, and what sits inside it
  function zoneKey(p) {
    if (p.kind === 'fallout') return [['sw-hot', 'Hot Coast: no rescue here'], ['sw-rad', 'Closed radiation zone: no entry']];
    if (p.kind === 'drone') return [['sw-picket', T.drone_ring.name + ': deadly if you stop'], ['sw-kill', T.drone_core.name + ' kill zone: nothing comes back']];
    if (p.kind === 'no_fuel') return [['sw-nofuel', 'No rig in reach to refuel']];
    return null;
  }
  function rigHTML(r) {
    var s = SEC[r.s], tw = r.twin && BY_HASH[r.twin], cl = r.ctl && RIG_CTL[r.ctl];
    var kick = r.st === 'destroyed' ? 'Destroyed rig' : r.st === 'twin' ? 'Twin rig' : r.st === 'breakwater' ? 'Breakwater rig' : 'Oil rig';
    var h = '<div class="p-k">' + esc(kick) + ' · Sector ' + esc(r.s) + '</div>' +
      '<h2 id="panel-title" tabindex="-1">' + esc(r.name) + '</h2>' +
      '<p class="p-place">' + esc(s.p || r.s) + ' · danger ' + esc(s.d) + ', ' + esc(riskWord[s.d]).toLowerCase() + '</p>' +
      '<p class="p-place">Water: ' + esc(T[s.t].name) + '</p>' +
      (cl && r.ctl !== 'breakwater' ? '<p class="p-ctl"><span class="sw" style="background:' + cl.col + '"></span><b>' + esc(cl.name) + '</b></p>' : '') +
      (r.held ? heldHTML(r.held, r.st === 'breakwater' ? T.breakwater.color : RIG_HELD) : '') +
      (cl && cl.text ? '<p class="p-about">' + esc(cl.text) + '</p>' : '');
    if (r.st === 'destroyed') h += '<p class="p-about">This rig is destroyed.</p>';
    else if (r.st === 'twin') h += '<p class="p-about">Two rigs inside one sea wall.</p>' +
      (tw ? '<p class="p-about">Its partner: <button type="button" class="p-twin" data-open="' + esc(tw.hash) + '">' + esc(tw.name) + ' · ' + esc(tw.s) + '</button></p>' : '');
    else if (r.st === 'breakwater') h += '<p class="p-about">One of the three old rigs joined into Breakwater\'s walled harbour.</p>';
    if (r.st !== 'destroyed' && r.capture && capImages(r.capture).length) h += '<h3>From the game</h3>' + galleryHTML(r.capture, r.name);
    h += seaHTML(s.s) + '<a class="p-link" href="#' + esc(r.hash) + '">Link to this rig</a>';
    return h;
  }
  function seaPanelHTML(it) {
    var s = SEAS[it.id], hz = D.hazards[s.hazard];
    return '<div class="p-k">Sea · ' + it.sectors.length + ' sectors</div>' +
      '<h2 id="panel-title" tabindex="-1">' + esc(s.name) + '</h2>' +
      '<p class="p-about">' + esc(s.what) + '</p><dl class="facts">' +
      '<dt>What it looks like</dt><dd>' + esc(s.look) + '</dd>' +
      '<dt>Why go</dt><dd>' + esc(s.why) + '</dd>' +
      (hz ? '<dt>The danger</dt><dd><b>' + esc(hz.name) + '.</b> ' + esc(hz.does) + '</dd>' : '') + '</dl>' +
      '<a class="p-link" href="#' + esc(it.hash) + '">Link to this sea</a>';
  }
  function render() {
    if (!current) return;
    pbody.innerHTML = current.isPort ? portHTML(current) : current.isRig ? rigHTML(current) : current.isSea ? seaPanelHTML(current) : placeHTML(current);
    guardImages(pbody);
  }
  function openItem(it, o) {
    if (!it) return;
    o = o || {};
    if (panel.hidden) lastFocus = document.activeElement;
    current = it; sel = { item: it }; hideReadout();
    panel.hidden = false; render();
    if (isSheet()) { lg.open = false; if (!o.keepFinder) closeFinder(true); }
    if (o.push && location.hash !== '#' + it.hash) history.pushState(null, '', '#' + it.hash);
    var h = document.getElementById('panel-title'); if (h) h.focus({ preventScroll: true });
    panel.querySelector('.panel-in').scrollTop = 0;
    mapTopAfterScroll = null;
    if (o.scroll) {
      var mr = mapEl.getBoundingClientRect(), hdr = parseFloat(getComputedStyle(mapEl).scrollMarginTop) || 0;
      if (mr.top > hdr + 80 || mr.top < hdr - 2 || mr.bottom < 200) {
        mapEl.scrollIntoView({ behavior: o.instant ? 'instant' : 'smooth', block: 'start' });
        mapTopAfterScroll = hdr;
      }
    }
    if (o.fly !== false) flyTo(it.x, it.y, scaleFor(it)); else requestDraw();
    mapTopAfterScroll = null;
    markListed();
  }
  function closePanel(fromRoute) {
    if (panel.hidden) return;
    panel.hidden = true; current = null; sel = null; pbody.innerHTML = '';
    if (!fromRoute) history.replaceState(null, '', location.pathname + location.search);
    requestDraw(); markListed();
    if (lastFocus && document.contains(lastFocus) && lastFocus !== document.body) lastFocus.focus({ preventScroll: true });
    else cv.focus({ preventScroll: true });
  }
  document.getElementById('panel-close').addEventListener('click', function () { closePanel(); });
  window.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || document.querySelector('.lb')) return;   // the picture viewer closes first
    if (!panel.hidden) { closePanel(); e.stopPropagation(); }
    else if (!finder.hidden) { closeFinder(); e.stopPropagation(); }
    else if (!ro.hidden) { hideReadout(); sel = null; requestDraw(); }
  }, true);
  pbody.addEventListener('click', function (e) {
    var tb = e.target.closest && e.target.closest('button.p-twin');
    if (tb) { openItem(BY_HASH[tb.dataset.open], { push: true, fly: true }); return; }
    var a = e.target.closest && e.target.closest('a.p-link');
    if (a) { e.preventDefault(); var url = location.href.split('#')[0] + a.getAttribute('href'); if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { a.textContent = 'Link copied'; }, function () { }); history.replaceState(null, '', a.getAttribute('href')); }
  });

  // ------------------------------------------------------------------ the filter and its list
  var finder = document.getElementById('finder'), chipsEl = document.getElementById('chips'), listEl = document.getElementById('finder-list');
  var qEl = document.getElementById('finder-q'), showBtn = document.getElementById('show-btn'), showLabel = document.getElementById('show-label');
  function kindLabel(it) {
    if (it.isPort) return it.mystery ? 'Automated port' : it.dead ? 'Dead navy port' : 'Port';
    if (it.isRig) {
      if (it.st === 'destroyed') return 'Destroyed rig';
      var cl = RIG_CTL[it.ctl] || RIG_CTL.free;
      return it.st === 'twin' ? 'Twin rig, ' + (cl.short || cl.name.toLowerCase()) : cl.label;
    }
    if (it.isSea) return 'Sea';
    return it.kindName;
  }
  function codeLabel(it) {
    if (it.isPort) return it.sector;
    if (it.isRig) return it.s;
    var n = it.sectors ? it.sectors.length : 0;
    return n === 1 ? it.sectors[0] : n + ' sectors';
  }
  // groups for the list: ports by kind, rigs by sea, places by kind
  function groupsFor(f) {
    var items = f === 'rigs' ? CAT.rigs.filter(rigShown) : CAT[f], groups = [], at = {};
    function add(name, it) { if (!(name in at)) { at[name] = groups.length; groups.push({ name: name, items: [] }); } groups[at[name]].items.push(it); }
    items.forEach(function (it) {
      if (it.isPort) add(it.mystery ? 'Automated port' : it.dead ? 'Dead navy ports' : 'Ports', it);
      else if (it.isRig) add(SEAS[SEC[it.s].s] ? SEAS[SEC[it.s].s].name : 'Other water', it);
      else if (it.isSea) add('The seas', it);
      else add(it.kindName === 'Fishing grounds' ? 'Fishing grounds' : it.kindName + 's', it);
    });
    if (f === 'rigs') groups.sort(function (a, b) { return a.name < b.name ? -1 : 1; });
    return groups;
  }
  function buildChips() {
    chipsEl.innerHTML = '';
    FILTERS.forEach(function (f) {
      var b = document.createElement('button');
      b.type = 'button'; b.dataset.filter = f.id; b.setAttribute('aria-pressed', String(f.id === filter));
      b.innerHTML = esc(f.name) + ' <span class="n">' + CAT[f.id].length + '</span>';
      b.addEventListener('click', function () { setFilter(f.id); });
      chipsEl.appendChild(b);
    });
  }
  function buildList() {
    var groups = groupsFor(filter), big = filter === 'rigs', h = '';
    groups.forEach(function (g, gi) {
      var body = '<ul>' + g.items.map(function (it) {
        return '<li data-q="' + esc((it.name + ' ' + codeLabel(it) + ' ' + kindLabel(it) + ' ' + g.name).toLowerCase()) + '"><button type="button" data-h="' + esc(it.hash) + '">' +
          '<span class="fn">' + esc(it.isPort ? it.name.replace('Dead port: ', '') : it.name) + '</span><span class="fk">' + esc(kindLabel(it)) + ' · ' + esc(codeLabel(it)) + '</span></button></li>';
      }).join('') + '</ul>';
      if (big) h += '<details class="fgroup"' + (gi === 0 ? ' open' : '') + '><summary>' + esc(g.name) + ' <span class="n">' + g.items.length + '</span></summary>' + body + '</details>';
      else h += '<div class="fgroup"><h3>' + esc(g.name) + ' <span class="n">' + g.items.length + '</span></h3>' + body + '</div>';
    });
    listEl.innerHTML = h || '<p class="f-empty">Nothing to show.</p>';
    qEl.value = '';
    document.getElementById('finder-search').hidden = !(filter === 'rigs' || filter === 'all');
    buildRigChips();
    markListed();
  }
  // the rig status chips: shown with the Rigs filter; they narrow the list and the markers together
  var rigChipsEl = document.getElementById('rig-chips');
  function buildRigChips() {
    rigChipsEl.hidden = filter !== 'rigs';
    if (rigChipsEl.hidden) return;
    rigChipsEl.innerHTML = '';
    [['all', '']].concat(RIG_CHIPS).forEach(function (ch) {
      var k = ch[0], saved = rigSt; rigSt = k; var n = RIGS.filter(rigShown).length; rigSt = saved;
      var b = document.createElement('button');
      b.type = 'button'; b.dataset.st = k; b.setAttribute('aria-pressed', String(k === rigSt));
      if (k !== 'all') b.appendChild(glyphCanvas(ch[1] === 'ctl' ? 'rig_working_' + k : 'rig_' + k + '_' + (k === 'breakwater' ? 'breakwater' : 'free'), ch[1] === 'ctl' ? RIG_CTL[k].col : k === 'destroyed' ? RIG_ST.destroyed.col : RIG_CTL[k === 'breakwater' ? 'breakwater' : 'free'].col));
      b.appendChild(document.createTextNode(k === 'all' ? 'All' : chipName(k)));
      var sp = document.createElement('span'); sp.className = 'n'; sp.textContent = n; b.appendChild(sp);
      b.addEventListener('click', function () {
        rigSt = k; var q = qEl.value; buildList(); if (q) { qEl.value = q; qEl.dispatchEvent(new Event('input')); }
        requestDraw();
      });
      rigChipsEl.appendChild(b);
    });
  }
  function markListed() {
    listEl.querySelectorAll('button[data-h]').forEach(function (b) { b.setAttribute('aria-current', String(!!(sel && sel.item && sel.item.hash === b.dataset.h))); });
  }
  listEl.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('button[data-h]');
    if (!b) return;
    var it = BY_HASH[b.dataset.h];
    openItem(it, { push: true, fly: true, scroll: true, keepFinder: !isSheet() });
  });
  qEl.addEventListener('input', function () {
    var q = qEl.value.trim().toLowerCase();
    listEl.querySelectorAll('.fgroup').forEach(function (g) {
      var n = 0;
      g.querySelectorAll('li').forEach(function (li) { var ok = !q || li.dataset.q.indexOf(q) >= 0; li.hidden = !ok; if (ok) n++; });
      g.hidden = n === 0;
      if (g.tagName === 'DETAILS' && q) g.open = n > 0;
    });
  });
  function setFilter(f) {
    filter = f;
    chipsEl.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.filter === f)); });
    var fd = FILTERS.filter(function (x) { return x.id === f; })[0];
    showLabel.textContent = fd.name;
    buildList(); buildLegend(); openFinder();
    requestDraw();
  }
  function openFinder() {
    finder.hidden = false; showBtn.setAttribute('aria-expanded', 'true'); mapEl.classList.add('finding');
    if (isSheet()) { lg.open = false; if (!panel.hidden) closePanel(); }
    setVars(); requestDraw();
  }
  function closeFinder(quiet) {
    if (finder.hidden) return;
    finder.hidden = true; showBtn.setAttribute('aria-expanded', 'false'); mapEl.classList.remove('finding');
    if (!quiet) showBtn.focus({ preventScroll: true });
    requestDraw();
  }
  showBtn.addEventListener('click', function () { if (finder.hidden) openFinder(); else closeFinder(); });
  document.getElementById('finder-close').addEventListener('click', function () { closeFinder(); });

  // ------------------------------------------------------------------ hash links: #port-ari, #place-the-cut, #rig-29h-0, #sea-melt, #sector-27F
  function route() {
    var h = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (!h) { closePanel(true); return; }
    if (BY_HASH[h]) { openItem(BY_HASH[h], { fly: true, scroll: true, instant: true }); return; }
    var m = /^sector-(\d{1,2}[A-Q])$/i.exec(h);
    if (m && SEC[m[1].toUpperCase()]) { closePanel(true); var s = SEC[m[1].toUpperCase()]; showSector(s.code); flyTo(s.x, s.y, Math.max(view === 'globe' ? 0 : V.s, 70 / SW)); }
  }
  window.addEventListener('popstate', route);
  window.addEventListener('hashchange', route);

  // ------------------------------------------------------------------ legend and lists
  function glyphCanvas(kind, col) {
    var c = document.createElement('canvas'); c.width = c.height = 36; c.setAttribute('aria-hidden', 'true');
    var g = c.getContext('2d'); g.scale(2, 2); drawGlyph(g, kind, 9, 9, col); return c;
  }
  function buildLegend() {
    var body = document.getElementById('legend-body'), h = '';
    if (mode === 'holders') {
      var groups = {};
      Object.keys(T).forEach(function (id) { var t = T[id]; (groups[t.group] = groups[t.group] || []).push(id); });
      Object.keys(groups).forEach(function (g) {
        h += '<h3>' + esc(g) + '</h3><ul>' + groups[g].map(function (id) {
          var t = T[id], hatch = id === 'drone_core';
          if (id === 'radiation') return '<li><span class="sw sw-rad"></span>Closed radiation zone</li>';
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
    h += '<h3>Water</h3><ul><li><span class="sw" style="background:#0c2338;background-image:repeating-linear-gradient(0deg,rgba(160,215,235,.4) 0 1px,transparent 1px 5px);border-style:dotted"></span>Flooded land: open water now</li>' +
      '<li><span class="sw sw-route"></span>Seaway through flooded land</li>' +
      '<li><span class="sw sw-rad"></span>Closed radiation zone: no entry</li>' +
      '<li><span class="sw sw-hot"></span>Hot Coast: no rescue</li>' +
      '<li><span class="sw" style="background:#1b2422;border-color:#d9c9a3"></span>Land</li></ul>';
    body.innerHTML = h;
    var ul = document.getElementById('legend-marks');
    var all = { ports: [['port', T.ari.color, 'Port'], ['dead', '#3a4550', 'Dead navy port'], ['aiport', AI_COL, 'Automated port']],
      rigs: ['free', 'housing', 'tribute', 'pirate', 'dark'].map(function (k) { return ['rig_working_' + k, RIG_CTL[k].col, RIG_CTL[k].label]; })
        .concat([['rig_twin_free', RIG_CTL.free.col, 'Twin rig (two decks)'], ['rig_destroyed_none', RIG_ST.destroyed.col, 'Destroyed rig'], ['rig_breakwater_breakwater', RIG_CTL.breakwater.col, 'Breakwater rig']]),
      pirates: [['toll', KIND_COL.toll, 'Toll line'], ['stronghold', KIND_COL.stronghold, 'Pirate stronghold'], ['crew', KIND_COL.crew, 'Pirate crew base']],
      danger: [['gate', KIND_COL.gate, 'Sea gate'], ['drone', KIND_COL.drone, 'Drone water'], ['fallout', KIND_COL.fallout, 'Hot Coast (no rescue)'], ['no_fuel', KIND_COL.no_fuel, 'No-fuel water']],
      wrecks: [['graveyard', KIND_COL.graveyard, 'Ship graveyard'], ['city', KIND_COL.city, 'Drowned city'], ['salvage', KIND_COL.salvage, 'Salvage field']],
      fishing: [['fishing', KIND_COL.fishing, 'Fishing grounds']], seas: [] };
    var marks = filter === 'all' ? [].concat(all.ports, all.pirates, all.danger, all.wrecks, all.fishing, all.rigs) : all[filter] || [];
    marks.forEach(function (m) { var li = document.createElement('li'); li.appendChild(glyphCanvas(m[0], m[1])); li.appendChild(document.createTextNode(m[2])); ul.appendChild(li); });
    requestDraw();
  }
  function buildLists() {
    var pl = document.getElementById('port-list');
    PORTS.forEach(function (p) {
      var li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button'; b.className = 'card-btn'; b.style.setProperty('--c', p.mystery ? AI_COL : p.dead ? '#6b7884' : T[p.terr].color);
      b.innerHTML = '<span class="ck">' + (p.mystery ? 'Automated port' : p.dead ? 'Dead navy port' : 'Port') + ' · ' + esc(p.sector) + '</span><span class="cn">' + esc(p.name.replace('Dead port: ', '')) +
        '</span><span class="cs">' + esc(p.place) + (p.mystery ? '' : ' · held by ' + esc(p.holder)) + '</span>';
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
        b.addEventListener('click', function () { openItem(p, { push: true, fly: true, scroll: true }); });
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

  // a hook for the automated checks only (the page must be opened with ?charttest): set the view and sample positions
  if (/[?&]charttest\b/.test(location.search)) {
    var probe = document.createElement('canvas').getContext('2d');
    window.__chart = {
      setGlobe: function (lonDeg, latDeg, scale) { if (view !== 'globe') setView('globe'); stopFly(); G.lam = lonDeg * DEG; G.phi = latDeg * DEG; if (scale) G.R = gMinR() * scale; clampView(); draw(); },
      setFlat: function (x, y, s_) { if (view !== 'flat') setView('flat'); stopFly(); V.cx = x; V.cy = y; if (s_) V.s = s_; clampView(); draw(); },
      view: function () { return { view: view, cx: V.cx, cy: V.cy, s: V.s, lam: G.lam, phi: G.phi, R: G.R, CW: CW, CH: CH }; },
      // screen positions of a world point now, and whether the globe shows it well inside the rim
      at: function (x, y) { if (view === 'globe') { gPrep(); gProj(lamOf(x), phiOf(y), P3); return { pts: P3[2] > 0.25 ? [[P3[0], P3[1]]] : [], z: P3[2] }; } OFF = offsets(); return { pts: posOf(x, y) }; },
      quiet: function (q) { testQuiet = !!q; draw(); },
      isLand: function (x, y) { return probe.isPointInPath(LAND, x, y, 'evenodd'); },
      sectors: function () { return CODES.map(function (c) { var s_ = SEC[c]; return { c: c, x: s_.x, y: s_.y, t: s_.t, k: s_.k, col: T[s_.t].color }; }); }
    };
  }

  // ------------------------------------------------------------------ start
  var lg = document.getElementById('legend');
  buildLists();
  buildChips(); buildList();
  if (window.innerWidth > 700 && !isSheet()) lg.open = true;
  buildLegend();
  lg.addEventListener('toggle', function () { if (lg.open && isSheet()) closeFinder(true); requestDraw(); });
  if (window.ResizeObserver) new ResizeObserver(resize).observe(mapEl); else window.addEventListener('resize', resize);
  window.addEventListener('resize', setVars);
  resize();
  if (document.fonts && document.fonts.load) {
    Promise.all(['600 14px Rajdhani', '700 14px Rajdhani', '600 14px Saira'].map(function (f) { return document.fonts.load(f); })).then(requestDraw, requestDraw);
  }
  route();
  fetch('captures.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
    if (j && typeof j === 'object') { CAP.ports = j.ports || {}; CAP.ships = j.ships || {}; render(); shipGridWhenNear(); }
  }).catch(function () { });
})();
