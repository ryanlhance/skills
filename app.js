/* Skills Constellation — renders the star atlas from window.MAP_DATA. No build step, no dependencies. */
(function () {
  "use strict";
  const DATA = window.MAP_DATA;
  const svg = document.getElementById("sky");
  const NS = "http://www.w3.org/2000/svg";

  /* ---------- helpers ---------- */
  const el = (name, attrs, parent) => {
    const n = document.createElementNS(NS, name);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  };
  const hash = (str) => {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) / 4294967296;
  };
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const wrap = (s, max) => {
    const words = s.split(" "), lines = [""];
    for (const w of words) {
      const cur = lines[lines.length - 1];
      if (cur && (cur + " " + w).length > max) lines.push(w);
      else lines[lines.length - 1] = cur ? cur + " " + w : w;
    }
    return lines;
  };

  /* ---------- layout ---------- */
  const SPACING = 76;
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));
  const clusters = DATA.categories.map((cat) => {
    const n = cat.skills.length;
    const R = SPACING * Math.sqrt(n) * 0.68 + 30;
    return { cat, n, R, cx: 0, cy: 0, nodes: [] };
  });

  // place clusters around a ring: binary-search ring radius so all fit
  (function placeClusters() {
    const gap = 190;
    const need = (ring) => {
      let sum = 0;
      for (let i = 0; i < clusters.length; i++) {
        const a = clusters[i], b = clusters[(i + 1) % clusters.length];
        const half = Math.min(0.99, (a.R + b.R + gap) / (2 * ring));
        sum += 2 * Math.asin(half);
      }
      return sum;
    };
    let lo = 300, hi = 6000;
    for (let it = 0; it < 40; it++) {
      const mid = (lo + hi) / 2;
      if (need(mid) > Math.PI * 2) lo = mid; else hi = mid;
    }
    const ring = hi;
    let angle = -Math.PI / 2; // start at top
    for (let i = 0; i < clusters.length; i++) {
      const c = clusters[i];
      c.cx = Math.cos(angle) * ring;
      c.cy = Math.sin(angle) * ring * 0.9; // slightly elliptical sky
      const nxt = clusters[(i + 1) % clusters.length];
      angle += 2 * Math.asin(Math.min(0.99, (c.R + nxt.R + gap) / (2 * ring)));
    }
  })();

  // phyllotaxis inside each cluster; bigger stars drift toward the middle
  for (const c of clusters) {
    const ordered = c.cat.skills.slice().sort((a, b) => b[1] - a[1] || hash(a[0]) - hash(b[0]));
    ordered.forEach((sk, i) => {
      const t = (i + 0.6) / c.n;
      const r = (c.R - 40) * Math.sqrt(t);
      const th = i * GOLDEN + hash(c.cat.id) * 7;
      const jx = (hash(sk[0] + "x") - 0.5) * 26, jy = (hash(sk[0] + "y") - 0.5) * 26;
      c.nodes.push({
        name: sk[0], w: sk[1], ev: sk[2], cat: c.cat,
        x: c.cx + Math.cos(th) * r + jx,
        y: c.cy + Math.sin(th) * r + jy,
        slug: slug(sk[0]),
      });
    });
  }
  const allNodes = clusters.flatMap((c) => c.nodes);
  const bySlug = {}; allNodes.forEach((n) => (bySlug[n.slug] = n));

  // world bounds
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  for (const c of clusters) {
    minX = Math.min(minX, c.cx - c.R); maxX = Math.max(maxX, c.cx + c.R);
    minY = Math.min(minY, c.cy - c.R); maxY = Math.max(maxY, c.cy + c.R);
  }

  /* ---------- static scenery ---------- */
  const root = el("g", {}, svg);
  const scenery = el("g", {}, root);
  // graticule
  const maxR = Math.max(maxX - minX, maxY - minY) * 0.72;
  for (let r = 340; r < maxR; r += 340)
    el("circle", { cx: 0, cy: 0, r, fill: "none", stroke: "rgba(236,232,221,0.06)", "stroke-width": 1, "stroke-dasharray": "1 7" }, scenery);
  for (let a = 0; a < 12; a++) {
    const th = (a / 12) * Math.PI * 2;
    el("line", {
      x1: Math.cos(th) * 240, y1: Math.sin(th) * 240,
      x2: Math.cos(th) * maxR, y2: Math.sin(th) * maxR,
      stroke: "rgba(236,232,221,0.04)", "stroke-width": 1,
    }, scenery);
  }
  // faint background dust
  for (let i = 0; i < 340; i++) {
    const a = hash("dust" + i) * Math.PI * 2, rr = Math.sqrt(hash("dr" + i)) * maxR * 1.05;
    el("circle", {
      cx: Math.cos(a) * rr, cy: Math.sin(a) * rr * 0.9,
      r: 0.8 + hash("ds" + i) * 1.1, fill: "rgba(236,232,221," + (0.07 + hash("do" + i) * 0.1) + ")",
    }, scenery);
  }

  /* ---------- constellation lines (MST per cluster over proven stars) ---------- */
  // invisible per-cluster hit areas: at overview zoom, clicking a star system zooms into it
  const hitG = el("g", {}, root);
  for (const c of clusters) {
    const h = el("circle", { cx: c.cx, cy: c.cy, r: c.R, fill: "transparent", "data-cluster": c.cat.id, cursor: "zoom-in" }, hitG);
    c.hit = h;
  }
  const linesG = el("g", {}, root);
  for (const c of clusters) {
    const pts = c.nodes.filter((n) => n.w >= 2);
    if (pts.length < 2) continue;
    const inTree = [0], edges = [];
    const used = new Set([0]);
    while (used.size < pts.length) {
      let best = null;
      for (const i of used) for (let j = 0; j < pts.length; j++) {
        if (used.has(j)) continue;
        const d = (pts[i].x - pts[j].x) ** 2 + (pts[i].y - pts[j].y) ** 2;
        if (!best || d < best.d) best = { i, j, d };
      }
      used.add(best.j); edges.push([pts[best.i], pts[best.j]]);
    }
    for (const [a, b] of edges)
      el("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: c.cat.hue, "stroke-opacity": 0.22, "stroke-width": 1.1 }, linesG);
  }

  /* ---------- stars + labels ---------- */
  const starsG = el("g", {}, root);
  const labelTiers = { 1: el("g", { class: "tier t1" }, root), 2: el("g", { class: "tier t2" }, root), 3: el("g", { class: "tier t3" }, root) };
  const catLabelG = el("g", {}, root);

  const NODE_R = { 1: 3.2, 2: 4.8, 3: 7.5 };

  // label de-collision pass: within each cluster, if two labels' boxes overlap,
  // flip the lower-priority one above its star (positions are deterministic, so one pass suffices)
  const labelBox = (n) => {
    const w = Math.max(...n.lines.map((l) => l.length)) * n.fs * 0.58;
    const h = n.lines.length * n.fs * 1.15 + 4;
    const y0 = n.above ? n.y - NODE_R[n.w] - 4 - h : n.y + NODE_R[n.w] + 2;
    return { x0: n.x - w / 2, x1: n.x + w / 2, y0, y1: y0 + h };
  };
  const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
  for (const n of allNodes) {
    n.fs = n.w === 3 ? 11.5 : n.w === 2 ? 9 : 7.8;
    n.lines = wrap(n.name, n.w === 3 ? 18 : 16);
    n.above = false;
  }
  for (const c of clusters) {
    const labeled = c.nodes.filter((n) => n.w >= 2).sort((a, b) => b.w - a.w);
    const placed = [];
    for (const n of labeled) {
      let box = labelBox(n);
      if (placed.some((p) => overlaps(box, p))) {
        n.above = true;
        const flipped = labelBox(n);
        if (placed.some((p) => overlaps(flipped, p))) { n.above = false; box = labelBox(n); }
        else box = flipped;
      }
      placed.push(box);
    }
  }

  for (const n of allNodes) {
    const g = el("g", { class: "star", "data-slug": n.slug, cursor: "pointer" }, starsG);
    n.g = g;
    if (n.w === 3) {
      el("circle", { cx: n.x, cy: n.y, r: 20, fill: n.cat.hue, opacity: 0.15 }, g);
      el("circle", { cx: n.x, cy: n.y, r: 11, fill: n.cat.hue, opacity: 0.24 }, g);
      // four-point flare
      const f = 15;
      el("path", {
        d: `M ${n.x - f} ${n.y} L ${n.x} ${n.y - 2} L ${n.x + f} ${n.y} L ${n.x} ${n.y + 2} Z M ${n.x} ${n.y - f} L ${n.x + 2} ${n.y} L ${n.x} ${n.y + f} L ${n.x - 2} ${n.y} Z`,
        fill: n.cat.hue, opacity: 0.62,
      }, g);
    } else if (n.w === 2) {
      el("circle", { cx: n.x, cy: n.y, r: 9, fill: n.cat.hue, opacity: 0.18 }, g);
    }
    el("circle", { cx: n.x, cy: n.y, r: NODE_R[n.w], fill: n.w === 1 ? "rgba(240,236,223,0.95)" : n.cat.hue }, g);
    n.ring = el("circle", { cx: n.x, cy: n.y, r: NODE_R[n.w] + 7, fill: "none", stroke: "#e8c884", "stroke-width": 1.4, opacity: 0 }, g);

    const fs = n.fs;
    const fill = n.w === 3 ? "rgba(240,236,223,1)" : n.w === 2 ? "rgba(240,236,223,0.88)" : "rgba(240,236,223,0.74)";
    const lines = n.lines;
    const baseY = n.above
      ? n.y - NODE_R[n.w] - 8 - (lines.length - 1) * fs * 1.15
      : n.y + NODE_R[n.w] + fs + 4;
    const t = el("text", {
      x: n.x, y: baseY, "text-anchor": "middle",
      "font-family": "Archivo, sans-serif", "font-size": fs, fill,
      "data-slug": n.slug, cursor: "pointer",
    }, labelTiers[n.w]);
    lines.forEach((ln, i) => {
      const ts = el("tspan", { x: n.x, dy: i === 0 ? 0 : fs * 1.15 }, t);
      ts.textContent = ln;
    });
    n.label = t;
  }

  // category labels (counter-scaled so they hold size on screen)
  for (const c of clusters) {
    const g = el("g", { transform: `translate(${c.cx}, ${c.cy - c.R - 14})`, cursor: "pointer", "data-cat": c.cat.id }, catLabelG);
    const inner = el("g", {}, g);
    const lines = wrap(c.cat.name, 20);
    const t = el("text", { "text-anchor": "middle", y: -(lines.length - 1) * 16, "font-family": "Archivo, sans-serif", "font-weight": 600, "font-size": 13, fill: c.cat.hue, "letter-spacing": "0.4", opacity: 0.95 }, inner);
    lines.forEach((ln, i) => { const ts = el("tspan", { x: 0, dy: i === 0 ? 0 : 16 }, t); ts.textContent = ln; });
    c.labelInner = inner;
    g.addEventListener("click", (e) => { e.stopPropagation(); flyToCluster(c); });
  }

  /* ---------- view / camera ---------- */
  let W = innerWidth, H = innerHeight;
  const view = { x: 0, y: 0, k: 0.4 };
  const clusterK = (c) => Math.min(2.2, (Math.min(W, H) * 0.66) / (c.R * 2));
  // "zoomed into this cluster" = at (or past) that cluster's own fly-to zoom, minus a small epsilon
  const zoomedInto = (c) => view.k >= clusterK(c) * 0.92;
  function fitAll() {
    const pad = 110;
    const k = Math.min((W - pad) / (maxX - minX), (H - pad) / (maxY - minY));
    view.k = k;
    view.x = (minX + maxX) / 2 - (W > 900 ? 70 / k : 0); // breathing room for the masthead
    view.y = (minY + maxY) / 2;
  }
  function apply() {
    root.setAttribute("transform", `translate(${W / 2},${H / 2}) scale(${view.k}) translate(${-view.x},${-view.y})`);
    // label visibility tiers
    labelTiers[3].style.opacity = 1;
    labelTiers[2].style.opacity = view.k >= 0.75 ? 1 : Math.max(0, (view.k - 0.45) / 0.3);
    labelTiers[1].style.opacity = view.k >= 1.2 ? 1 : Math.max(0, (view.k - 0.8) / 0.4);
    const inv = 1 / view.k;
    for (const c of clusters) {
      // hold category labels at a near-constant screen size at every zoom level
      const s = Math.max(0.32, Math.min(inv * 0.82, 5.5));
      c.labelInner.setAttribute("transform", `scale(${s})`);
      c.hit.setAttribute("cursor", zoomedInto(c) ? "grab" : "zoom-in");
    }
  }
  window.addEventListener("resize", () => { W = innerWidth; H = innerHeight; svg.setAttribute("width", W); svg.setAttribute("height", H); apply(); });
  svg.setAttribute("width", W); svg.setAttribute("height", H);
  fitAll(); apply();

  /* ---------- interaction: pan / zoom / pinch ---------- */
  const pointers = new Map();
  let dragMoved = 0, pinchD = 0;
  const dismissHint = () => { const h = document.getElementById("hint"); if (h) h.classList.add("gone"); };
  svg.addEventListener("pointerdown", (e) => {
    svg.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragMoved = 0;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchD = Math.hypot(a.x - b.x, a.y - b.y);
    }
    svg.classList.add("dragging");
  });
  svg.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    const p = pointers.get(e.pointerId);
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    dragMoved += Math.abs(dx) + Math.abs(dy);
    if (pointers.size === 1) {
      view.x -= dx / view.k; view.y -= dy / view.k; apply(); dismissHint();
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchD > 0) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinchD);
      pinchD = d; dismissHint();
    }
  });
  const endPointer = (e) => { pointers.delete(e.pointerId); pinchD = 0; svg.classList.remove("dragging"); };
  svg.addEventListener("pointerup", endPointer);
  svg.addEventListener("pointercancel", endPointer);
  svg.addEventListener("wheel", (e) => {
    e.preventDefault(); dismissHint();
    zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0016));
  }, { passive: false });
  function zoomAt(sx, sy, f) {
    const k2 = Math.min(6, Math.max(0.08, view.k * f));
    const wx = view.x + (sx - W / 2) / view.k, wy = view.y + (sy - H / 2) / view.k;
    view.x = wx - (sx - W / 2) / k2; view.y = wy - (sy - H / 2) / k2; view.k = k2;
    apply();
  }

  /* ---------- fly-to animation ---------- */
  let flying = null;
  function flyTo(tx, ty, tk, ms = 700) {
    cancelAnimationFrame(flying);
    const s = { x: view.x, y: view.y, k: view.k }, t0 = performance.now();
    const ease = (u) => 1 - Math.pow(1 - u, 3);
    const step = (now) => {
      const u = Math.min(1, (now - t0) / ms), e = ease(u);
      view.x = s.x + (tx - s.x) * e; view.y = s.y + (ty - s.y) * e;
      view.k = s.k * Math.pow(tk / s.k, e);
      apply();
      if (u < 1) flying = requestAnimationFrame(step);
    };
    flying = requestAnimationFrame(step);
  }
  const flyToCluster = (c) => flyTo(c.cx, c.cy - c.R * 0.06, clusterK(c));

  /* ---------- dossier panel ---------- */
  const dossier = document.getElementById("dossier");
  const scroll = dossier.querySelector(".dossier-scroll");
  let selected = null;
  function openNode(n, fly) {
    if (selected) selected.ring.setAttribute("opacity", 0);
    selected = n; n.ring.setAttribute("opacity", 0.9);
    let html = `
      <div class="cat-kicker" style="color:${n.cat.hue}">${n.cat.name}</div>
      <h2>${n.name}</h2>`;
    if (n.ev.length) {
      for (const id of n.ev) {
        const e = DATA.evidence[id];
        if (!e) continue;
        html += `<div class="evidence-card"><h3>${e.t}</h3><p>${e.b}</p><div class="src">${e.s}</div></div>`;
      }
      // related skills that share evidence
      const rel = new Set();
      for (const other of allNodes) {
        if (other === n) continue;
        if (other.ev.some((id) => n.ev.includes(id))) rel.add(other);
      }
      if (rel.size) {
        html += `<div class="also"><div class="proof-label">Connected Skills</div><div class="also-chips">`;
        [...rel].slice(0, 8).forEach((o) => { html += `<button data-goto="${o.slug}">${o.name}</button>`; });
        html += `</div></div>`;
      }
    } else {
      html += `<div class="evidence-card" style="margin-top:18px"><p>Part of the ${n.cat.name} practice — carried across the whole body of work rather than pinned to a single engagement.</p></div>`;
    }
    scroll.innerHTML = html;
    scroll.scrollTop = 0;
    scroll.querySelectorAll("[data-goto]").forEach((b) =>
      b.addEventListener("click", () => { const o = bySlug[b.dataset.goto]; if (o) { openNode(o); flyTo(o.x, o.y, Math.max(view.k, 1.6)); } })
    );
    dossier.classList.add("open");
    history.replaceState(null, "", "#" + n.slug);
    if (fly) flyTo(n.x, n.y, Math.max(view.k, 1.6));
  }
  function closeDossier() {
    dossier.classList.remove("open");
    if (selected) selected.ring.setAttribute("opacity", 0);
    selected = null;
    history.replaceState(null, "", location.pathname + location.search);
  }
  document.getElementById("dossier-close").addEventListener("click", closeDossier);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDossier(); });

  // star / label clicks (delegated; ignore drags).
  // Below the zoom threshold a click anywhere in a star system zooms into it;
  // once zoomed in, clicks open individual stars.
  svg.addEventListener("click", (e) => {
    if (dragMoved > 6) return;
    // pointer capture retargets click events to the svg, so resolve the real element under the cursor
    const real = document.elementFromPoint(e.clientX, e.clientY) || e.target;
    const cat = real.closest && real.closest("[data-cat]");
    if (cat) {
      dismissHint();
      flyToCluster(clusters.find((c) => c.cat.id === cat.getAttribute("data-cat")));
      return;
    }
    const t = real.closest && real.closest("[data-slug]");
    if (t) {
      const n = bySlug[t.getAttribute("data-slug")];
      if (n) {
        dismissHint();
        const c = clusters.find((cl) => cl.cat === n.cat);
        if (!zoomedInto(c)) { flyToCluster(c); return; }
        openNode(n); return;
      }
    }
    const h = real.closest && real.closest("[data-cluster]");
    if (h) {
      const c = clusters.find((cl) => cl.cat.id === h.getAttribute("data-cluster"));
      if (!zoomedInto(c)) { dismissHint(); flyToCluster(c); return; }
    }
    closeDossier();
  });

  /* ---------- search ---------- */
  const input = document.getElementById("search");
  const countEl = document.getElementById("search-count");
  let matches = [];
  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    matches = [];
    for (const n of allNodes) {
      const hit = q && n.name.toLowerCase().includes(q);
      if (q) {
        n.g.style.opacity = hit ? 1 : 0.1;
        n.label.style.opacity = hit ? 1 : 0.12;
        if (hit) matches.push(n);
      } else {
        n.g.style.opacity = 1; n.label.style.opacity = 1;
      }
    }
    countEl.textContent = q ? matches.length + (matches.length === 1 ? " star" : " stars") : "";
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && matches.length) { openNode(matches[0]); flyTo(matches[0].x, matches[0].y, Math.max(view.k, 1.6)); }
    if (e.key === "Escape") { input.value = ""; input.dispatchEvent(new Event("input")); input.blur(); }
  });

  /* ---------- controls ---------- */
  document.getElementById("zoom-in").addEventListener("click", () => zoomAt(W / 2, H / 2, 1.45));
  document.getElementById("zoom-out").addEventListener("click", () => zoomAt(W / 2, H / 2, 1 / 1.45));
  document.getElementById("reset").addEventListener("click", () => { closeDossier(); fitAll(); apply(); const s = { ...view }; fitAll(); flyTo(view.x, view.y, view.k); Object.assign(view, s); });

  /* ---------- deep link ---------- */
  if (location.hash.length > 1) {
    const n = bySlug[location.hash.slice(1)];
    if (n) setTimeout(() => { openNode(n); flyTo(n.x, n.y, 1.7, 900); }, 350);
  }
})();
