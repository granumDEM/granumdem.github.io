/* Granum website: a live 2D DEM in the hero, the compressible-clay-aggregate animation,
   benchmark bars, gallery, downloads and the contact form. No libraries. */
(() => {
  "use strict";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  /* ---------- nav ---------- */
  const nav = document.querySelector(".nav");
  const links = document.querySelector(".links");
  const menu = document.querySelector(".menu");
  const onScroll = () => nav.classList.toggle("solid", scrollY > 40);
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  menu.addEventListener("click", () => {
    const open = links.classList.toggle("open");
    menu.setAttribute("aria-expanded", open);
  });
  links.addEventListener("click", (e) => { if (e.target.tagName === "A") { links.classList.remove("open"); menu.setAttribute("aria-expanded", false); } });

  /* ---------- reveal + counters ---------- */
  const countUp = (el) => {
    const end = parseFloat(el.dataset.count), dec = +(el.dataset.dec || 0), suf = el.dataset.suffix || "";
    const fmt = (v) => (dec ? v.toFixed(dec) : Math.round(v).toLocaleString("en-US")) + suf;
    if (reduce) { el.textContent = fmt(end); return; }
    const t0 = performance.now(), dur = 1600;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(end * e);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const io = new IntersectionObserver((es) => {
    for (const e of es) {
      if (!e.isIntersecting) continue;
      e.target.classList.add("in");
      e.target.querySelectorAll?.("[data-count]").forEach(countUp);
      if (e.target.classList.contains("perf")) fillBars();
      io.unobserve(e.target);
    }
  }, { threshold: 0.15 });
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

  /* ---------- hero: a small 2D DEM ---------- */
  const cv = document.getElementById("dem");
  const ctx = cv.getContext("2d");
  const tag = document.getElementById("stageTag");
  const S = 16; // sub-steps per frame
  const DT = 1 / 60 / S;
  let W, H, dpr, box, u, N, rmax;
  let x, y, vx, vy, fx, fy, r, m, col, alive;
  let count, cell, nxC, nyC, cellStart, cellItems, cellOf;
  let k, g, plate, phase, phaseT, fade, chains, meanF, surf0, born;

  const PAL = [
    ["#1f6f8b", "#2a86a0", "#1a5f7a"],   // clay
    ["#c9762c", "#d98a3d", "#b8662a"],   // sand
    ["#e3b26b", "#efc285", "#d7a35a"],   // fill
  ];

  function setup() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const wide = W > 900;
    box = wide ? { l: W * 0.53, r: W * 0.97, t: H * 0.12, b: H * 0.93 } : { l: W * 0.03, r: W * 0.97, t: H * 0.58, b: H * 0.985 };
    const bw = box.r - box.l, bh = box.b - box.t;
    u = Math.max(3.2, Math.min(7, bw / 110));
    rmax = 1.5 * u;
    const fillH = bh * (wide ? 0.56 : 0.62);
    N = Math.min(1100, Math.floor(0.8 * bw * fillH / (Math.PI * (1.2 * u) ** 2)));
    x = new Float32Array(N); y = new Float32Array(N); vx = new Float32Array(N); vy = new Float32Array(N);
    fx = new Float32Array(N); fy = new Float32Array(N); r = new Float32Array(N); m = new Float32Array(N);
    col = new Array(N); alive = new Uint8Array(N); cellOf = new Int32Array(N); cellItems = new Int32Array(N);
    cell = 2 * rmax;
    nxC = Math.ceil(W / cell) + 2; nyC = Math.ceil(H / cell) + 2;
    cellStart = new Int32Array(nxC * nyC + 1);
    const mmin = (0.9 * u) ** 2;
    k = mmin * (0.18 / DT) ** 2;
    g = 60 * u;
    for (let i = 0; i < N; i++) {
      r[i] = u * (0.9 + 0.6 * Math.random());
      m[i] = r[i] * r[i];
      const layer = i < N * 0.42 ? 0 : i < N * 0.8 ? 1 : 2;
      col[i] = PAL[layer][(Math.random() * 3) | 0];
    }
    restart();
  }

  function restart() {
    alive.fill(0); count = 0; born = 0;
    phase = 0; phaseT = 0; fade = 1; chains = []; meanF = 1;
    const pw = (box.r - box.l) * (W > 900 ? 0.26 : 0.3);
    const cx = (box.l + box.r) / 2;
    plate = { x0: cx - pw / 2, x1: cx + pw / 2, yb: box.t - 30, th: 14, v: 0, F: 0 };
    setTag("Stage 1 · Generating grains, layer by layer");
  }
  function setTag(s) { if (tag) tag.textContent = s; }

  function spawn(dtF) {
    born += dtF * N / 3.2; // all grains within about 3 s
    while (count < Math.min(N, born)) {
      const i = count++;
      x[i] = box.l + rmax + Math.random() * (box.r - box.l - 2 * rmax);
      y[i] = box.t + rmax + Math.random() * 3 * rmax;
      vx[i] = (Math.random() - 0.5) * 20; vy[i] = 40 + Math.random() * 40;
      alive[i] = 1;
    }
  }

  function substep(record) {
    const n = count;
    // bin
    cellStart.fill(0);
    for (let i = 0; i < n; i++) {
      const cx = Math.max(0, Math.min(nxC - 1, ((x[i] / cell) | 0) + 1));
      const cy = Math.max(0, Math.min(nyC - 1, ((y[i] / cell) | 0) + 1));
      const c = cy * nxC + cx; cellOf[i] = c; cellStart[c + 1]++;
    }
    for (let c = 0; c < nxC * nyC; c++) cellStart[c + 1] += cellStart[c];
    const fillp = cellStart.slice(0, nxC * nyC);
    for (let i = 0; i < n; i++) cellItems[fillp[cellOf[i]]++] = i;

    for (let i = 0; i < n; i++) { fx[i] = 0; fy[i] = m[i] * g; }
    if (record) chains = [];
    let fsum = 0, fcnt = 0;
    const zeta = 0.35, mu = 0.5;
    for (let i = 0; i < n; i++) {
      const ci = cellOf[i], cy = (ci / nxC) | 0, cx = ci - cy * nxC;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = cy + dy; if (yy < 0 || yy >= nyC) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = cx + dx; if (xx < 0 || xx >= nxC) continue;
          const c = yy * nxC + xx;
          for (let p = cellStart[c]; p < cellStart[c + 1]; p++) {
            const j = cellItems[p]; if (j <= i) continue;
            const ddx = x[j] - x[i], ddy = y[j] - y[i], R = r[i] + r[j];
            const d2 = ddx * ddx + ddy * ddy; if (d2 >= R * R || d2 === 0) continue;
            const d = Math.sqrt(d2), nx = ddx / d, ny = ddy / d, ov = R - d;
            const rvx = vx[j] - vx[i], rvy = vy[j] - vy[i];
            const vn = rvx * nx + rvy * ny;
            const me = m[i] * m[j] / (m[i] + m[j]);
            let fn = k * ov - 2 * zeta * Math.sqrt(k * me) * vn;
            if (fn < 0) fn = 0;
            // tangential: viscous, capped by Coulomb
            const tx = -ny, ty = nx, vt = rvx * tx + rvy * ty;
            let ft = 0.5 * 2 * zeta * Math.sqrt(k * me) * vt;
            const cap = mu * fn; if (ft > cap) ft = cap; else if (ft < -cap) ft = -cap;
            const Fx = -fn * nx + ft * tx, Fy = -fn * ny + ft * ty;
            fx[i] += Fx; fy[i] += Fy; fx[j] -= Fx; fy[j] -= Fy;
            if (record) { chains.push(i, j, fn); fsum += fn; fcnt++; }
          }
        }
      }
    }
    if (record && fcnt) meanF = fsum / fcnt;

    // walls and the plate
    plate.F = 0;
    for (let i = 0; i < n; i++) {
      const ri = r[i], cw = 2 * zeta * Math.sqrt(k * m[i]);
      let o = y[i] + ri - box.b; if (o > 0) fy[i] -= k * o + cw * vy[i];
      o = box.l - (x[i] - ri); if (o > 0) fx[i] += k * o - cw * vx[i];
      o = x[i] + ri - box.r; if (o > 0) fx[i] -= k * o + cw * vx[i];
      // plate: a rectangle [x0,x1] x [yb-th, yb]
      const qx = Math.max(plate.x0, Math.min(plate.x1, x[i]));
      const qy = Math.max(plate.yb - plate.th, Math.min(plate.yb, y[i]));
      const ex = x[i] - qx, ey = y[i] - qy, e2 = ex * ex + ey * ey;
      if (e2 < ri * ri && e2 > 1e-9) {
        const e = Math.sqrt(e2), nx = ex / e, ny = ey / e, ov = ri - e;
        const vrel = (vx[i] - 0) * nx + (vy[i] - plate.v) * ny;
        let fn = k * ov - cw * vrel; if (fn < 0) fn = 0;
        fx[i] += fn * nx; fy[i] += fn * ny; plate.F += fn * ny;
      }
    }
    // integrate (semi-implicit Euler) with a little global damping
    const damp = 1 - 0.4 * DT;
    for (let i = 0; i < n; i++) {
      vx[i] = (vx[i] + DT * fx[i] / m[i]) * damp;
      vy[i] = (vy[i] + DT * fy[i] / m[i]) * damp;
      x[i] += DT * vx[i]; y[i] += DT * vy[i];
    }
    plate.yb += DT * plate.v;
  }

  function surface() {
    // mean top of the grains under the plate
    let top = box.b;
    for (let i = 0; i < count; i++) if (x[i] > plate.x0 && x[i] < plate.x1) top = Math.min(top, y[i] - r[i]);
    return top;
  }
  function kinetic() { let e = 0; for (let i = 0; i < count; i++) e += vx[i] * vx[i] + vy[i] * vy[i]; return e / Math.max(1, count); }

  function control(dtF) {
    phaseT += dtF;
    if (phase === 0) {
      spawn(dtF);
      if (count >= N && phaseT > 3.4) { phase = 1; phaseT = 0; setTag("Stage 2 · Settling under gravity"); }
    } else if (phase === 1) {
      if ((phaseT > 1.5 && kinetic() < (0.5 * u) ** 2) || phaseT > 5) {
        phase = 2; phaseT = 0; surf0 = null; plate.yb = box.t + plate.th; plate.v = 18 * u;
        setTag("Stage 3 · Footing pushed in, force chains form");
      }
    } else if (phase === 2) {
      // approach fast, then push in slowly from the first contact with the bed
      if (surf0 === null && plate.F > 0) { surf0 = plate.yb; plate.v = 3 * u; }
      const pen = surf0 === null ? 0 : plate.yb - surf0;
      if ((surf0 !== null && pen > (box.b - surf0) * 0.2) || phaseT > 14) { plate.v = 0; phase = 3; phaseT = 0; setTag("Stage 4 · Load held"); }
    } else if (phase === 3) {
      if (phaseT > 1.6) { plate.v = -6 * u; phase = 4; phaseT = 0; setTag("Stage 5 · Unloading"); }
    } else if (phase === 4) {
      if (plate.yb < box.t + plate.th) { plate.v = 0; phase = 5; phaseT = 0; }
    } else if (phase === 5) {
      fade = Math.max(0, 1 - phaseT / 0.9);
      if (fade === 0) restart();
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    // faint box
    ctx.globalAlpha = 0.5 * fade;
    ctx.strokeStyle = "rgba(160,200,215,.35)"; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(box.l, box.t + 20); ctx.lineTo(box.l, box.b); ctx.lineTo(box.r, box.b); ctx.lineTo(box.r, box.t + 20); ctx.stroke();
    // grains
    ctx.globalAlpha = 0.92 * fade;
    for (let i = 0; i < count; i++) {
      ctx.fillStyle = col[i];
      ctx.beginPath(); ctx.arc(x[i], y[i], r[i] * 0.97, 0, 6.2832); ctx.fill();
    }
    // force chains
    if (phase >= 1 && chains.length) {
      ctx.lineCap = "round";
      const thr = 1.15 * meanF;
      for (let p = 0; p < chains.length; p += 3) {
        const f = chains[p + 2]; if (f < thr) continue;
        const a = chains[p], b = chains[p + 1], s = Math.min(1, f / (3.5 * meanF));
        ctx.globalAlpha = (0.25 + 0.6 * s) * fade;
        ctx.strokeStyle = s > 0.6 ? "#fff3d6" : "#f6dcb0";
        ctx.lineWidth = 0.6 + 2.6 * s;
        ctx.beginPath(); ctx.moveTo(x[a], y[a]); ctx.lineTo(x[b], y[b]); ctx.stroke();
      }
    }
    // plate
    if (phase >= 2 && phase <= 5) {
      ctx.globalAlpha = fade;
      ctx.fillStyle = "#9fb3c2";
      ctx.fillRect(plate.x0, plate.yb - plate.th, plate.x1 - plate.x0, plate.th);
      ctx.fillStyle = "#cfdbe3";
      const stemTop = Math.max(box.t + (W > 900 ? -10 : 40), plate.yb - plate.th - 60);
      if (plate.yb - plate.th > stemTop) ctx.fillRect(plate.x0 + (plate.x1 - plate.x0) / 2 - 3, stemTop, 6, plate.yb - plate.th - stemTop);
    }
    ctx.globalAlpha = 1;
  }

  let running = true, last = 0;
  function frame(t) {
    if (!running) return;
    const dtF = Math.min(0.033, last ? (t - last) / 1000 : 1 / 60); last = t;
    control(dtF);
    for (let s = 0; s < S; s++) substep(s === S - 1);
    draw();
    requestAnimationFrame(frame);
  }
  function start() {
    setup();
    if (reduce) {
      // one settled, loaded picture instead of the animation
      count = N; for (let i = 0; i < N; i++) { x[i] = box.l + rmax + Math.random() * (box.r - box.l - 2 * rmax); y[i] = box.t + Math.random() * (box.b - box.t) * 0.9; alive[i] = 1; }
      for (let s = 0; s < 60 * S * 4; s++) substep(false);
      surf0 = surface(); plate.yb = surf0 + 0.05 * (box.b - surf0);
      for (let s = 0; s < 60 * S; s++) substep(s === 60 * S - 1);
      phase = 3; draw(); setTag("Footing on a settled bed, force chains in light");
      return;
    }
    requestAnimationFrame(frame);
  }
  start();
  let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { if (Math.abs(cv.clientWidth - W) > 40 || Math.abs(cv.clientHeight - H) > 120) { running = false; setTimeout(() => { running = true; last = 0; start(); }, 30); } }, 250); });
  new IntersectionObserver((es) => {
    const vis = es[0].isIntersecting;
    if (reduce) return;
    if (vis && !running) { running = true; last = 0; requestAnimationFrame(frame); } else if (!vis) running = false;
  }).observe(cv);
  document.addEventListener("visibilitychange", () => { if (reduce) return; if (document.hidden) running = false; else if (!running) { running = true; last = 0; requestAnimationFrame(frame); } });

  /* ---------- compressible clay aggregates ---------- */
  const cc = document.getElementById("cca"), c2 = cc.getContext("2d");
  const E0 = 3.0, LAM = 0.45, KAP = 0.07, P0 = 20, P1 = 200, P2 = 50;
  const plateCache = [];
  for (let a = 0; a < 11; a++) {
    const ls = [];
    for (let q = 0; q < 22; q++) ls.push([Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * Math.PI]);
    plateCache.push(ls);
  }
  function ccaState(t) {
    // 10 s cycle: load 20 -> 200 kPa (4 s), hold (1 s), unload to 50 (2.5 s), back to start (2.5 s, faded)
    const T = t % 10;
    const ln = Math.log;
    const eN = (p) => E0 - LAM * ln(p / P0);
    const eU = (p) => eN(P1) - KAP * ln(p / P1);
    if (T < 4) { const p = P0 * Math.pow(P1 / P0, T / 4); return { p, e: eN(p), a: 1, ld: true }; }
    if (T < 5) return { p: P1, e: eN(P1), a: 1, ld: true };
    if (T < 7.5) { const p = P1 * Math.pow(P2 / P1, (T - 5) / 2.5); return { p, e: eU(p), a: 1, ld: false }; }
    const k2 = (T - 7.5) / 2.5; const p = P2 * Math.pow(P0 / P2, k2);
    return { p, e: eU(P2) + (E0 - eU(P2)) * k2, a: Math.abs(1 - 2 * k2) < 0.999 ? Math.max(0.15, Math.abs(1 - 2 * k2)) : 1, ld: false, reset: true };
  }
  let trail = [];
  function drawCCA(t) {
    const w = cc.clientWidth, h = cc.clientHeight, pr = Math.min(devicePixelRatio || 1, 2);
    if (cc.width !== Math.round(w * pr)) { cc.width = Math.round(w * pr); cc.height = Math.round(h * pr); }
    c2.setTransform(pr, 0, 0, pr, 0, 0);
    c2.clearRect(0, 0, w, h);
    const ink = css("--ink"), ink2 = css("--ink-2"), teal = css("--teal"), sand = css("--sand"), line = css("--line");
    const st = ccaState(t);
    // left: the assembly in a compression cell
    const L = { x: 0, w: w * 0.52, h };
    const R0 = Math.min(L.w / 8.6, h / 7.4);
    const R = R0 * Math.cbrt((1 + st.e) / (1 + E0));
    const rows = [4, 3, 4], dyr = R * Math.sqrt(3);
    const cx = L.w / 2, by = h * 0.86;
    const asmW = 8 * R, asmH = 2 * R + 2 * dyr;
    c2.globalAlpha = st.a;
    // cell walls follow the assembly
    c2.strokeStyle = ink2; c2.lineWidth = 2;
    c2.strokeRect(cx - asmW / 2 - 3, by - asmH - 3, asmW + 6, asmH + 6);
    let a = 0;
    rows.forEach((n, ri) => {
      const yy = by - R - ri * dyr;
      const x0 = cx - (n - 1) * R;
      for (let q = 0; q < n; q++, a++) {
        const xx = x0 + q * 2 * R;
        const grd = c2.createRadialGradient(xx - R * 0.35, yy - R * 0.35, R * 0.1, xx, yy, R);
        grd.addColorStop(0, "#5fb4c4"); grd.addColorStop(1, "#1b5f7a");
        c2.fillStyle = grd; c2.beginPath(); c2.arc(xx, yy, R * 0.985, 0, 6.2832); c2.fill();
        // clay platelets inside, closer together as the aggregate shrinks
        c2.save(); c2.beginPath(); c2.arc(xx, yy, R * 0.93, 0, 6.2832); c2.clip();
        c2.strokeStyle = "rgba(235,245,248,.55)"; c2.lineWidth = 1.1;
        for (const [px, py, th] of plateCache[a]) {
          const s = R * 0.8, lx = xx + px * s, ly = yy + py * s, hl = R0 * 0.16;
          c2.beginPath(); c2.moveTo(lx - Math.cos(th) * hl, ly - Math.sin(th) * hl); c2.lineTo(lx + Math.cos(th) * hl, ly + Math.sin(th) * hl); c2.stroke();
        }
        c2.restore();
      }
    });
    // load arrows
    c2.fillStyle = st.ld ? sand : teal; c2.strokeStyle = c2.fillStyle; c2.lineWidth = 2.2;
    const arrow = (x1, y1, x2, y2) => {
      c2.beginPath(); c2.moveTo(x1, y1); c2.lineTo(x2, y2); c2.stroke();
      const an = Math.atan2(y2 - y1, x2 - x1);
      c2.beginPath(); c2.moveTo(x2, y2); c2.lineTo(x2 - 8 * Math.cos(an - 0.45), y2 - 8 * Math.sin(an - 0.45)); c2.lineTo(x2 - 8 * Math.cos(an + 0.45), y2 - 8 * Math.sin(an + 0.45)); c2.fill();
    };
    const top = by - asmH - 8, len = 10 + 22 * Math.log(st.p / P0) / Math.log(P1 / P0);
    for (const f of [-0.3, 0, 0.3]) arrow(cx + f * asmW, top - len - 6, cx + f * asmW, top);
    arrow(cx - asmW / 2 - 8 - len, by - asmH / 2, cx - asmW / 2 - 8, by - asmH / 2);
    arrow(cx + asmW / 2 + 8 + len, by - asmH / 2, cx + asmW / 2 + 8, by - asmH / 2);
    c2.globalAlpha = 1;
    c2.fillStyle = ink; c2.font = "600 13px Inter, sans-serif"; c2.textAlign = "left";
    c2.fillText(`p′ = ${st.p.toFixed(0)} kPa`, 10, 20);
    c2.fillStyle = ink2; c2.font = "500 12px 'JetBrains Mono', monospace";
    c2.fillText(`e_m = ${st.e.toFixed(2)}`, 10, 38);
    c2.fillText(st.ld ? "loading: normal compression" : "unloading: swelling", 10, 56);

    // right: e against log p'
    const P = { x: w * 0.6, y: h * 0.1, w: w * 0.36, h: h * 0.72 };
    const lx = (p) => P.x + P.w * Math.log(p / 10) / Math.log(400 / 10);
    const ly = (e) => P.y + P.h * (3.35 - e) / (3.35 - 1.6);
    c2.strokeStyle = line; c2.lineWidth = 1;
    c2.strokeRect(P.x, P.y, P.w, P.h);
    c2.fillStyle = ink2; c2.font = "12px Inter, sans-serif"; c2.textAlign = "center";
    c2.fillText("p′ (log scale)", P.x + P.w / 2, P.y + P.h + 20);
    c2.save(); c2.translate(P.x - 12, P.y + P.h / 2); c2.rotate(-Math.PI / 2); c2.fillText("e_m", 0, 0); c2.restore();
    c2.strokeStyle = ink2; c2.setLineDash([5, 4]); c2.lineWidth = 1.2;
    c2.beginPath(); c2.moveTo(lx(12), ly(E0 - LAM * Math.log(12 / P0))); c2.lineTo(lx(380), ly(E0 - LAM * Math.log(380 / P0))); c2.stroke();
    c2.setLineDash([]);
    c2.fillStyle = ink2; c2.textAlign = "left"; c2.fillText("NCL", lx(30), ly(E0 - LAM * Math.log(30 / P0)) - 8);
    if (!st.reset) { trail.push([st.p, st.e]); if (trail.length > 400) trail.shift(); } else trail = [];
    c2.strokeStyle = sand; c2.lineWidth = 2.4; c2.beginPath();
    trail.forEach(([p, e], q) => (q ? c2.lineTo(lx(p), ly(e)) : c2.moveTo(lx(p), ly(e))));
    c2.stroke();
    if (!st.reset) { c2.fillStyle = sand; c2.beginPath(); c2.arc(lx(st.p), ly(st.e), 5.5, 0, 6.2832); c2.fill(); }
  }
  let ccaOn = false;
  const ccaLoop = (t) => { if (!ccaOn) return; drawCCA(t / 1000); requestAnimationFrame(ccaLoop); };
  new IntersectionObserver((es) => {
    const vis = es[0].isIntersecting;
    if (reduce) { drawCCA(4.5); return; }
    if (vis && !ccaOn) { ccaOn = true; requestAnimationFrame(ccaLoop); } else if (!vis) ccaOn = false;
  }).observe(cc);

  /* ---------- benchmark bars ---------- */
  const PERF = [
    ["Drained triaxial, sand", 4415, 0.26, "RTX 3090"],
    ["Bangna unit cell, clay", 49503, 0.24, "RTX 5090"],
    ["DEM8 penetration", 100000, 3.81, "RTX 3090"],
    ["Wang Noi wall, forming", 254530, 1.08, "RTX 5090"],
    ["Wang Noi wall, undrained stages", 254530, 1.28, "RTX 5090"],
    ["Bangna half-section, forming", 502797, 4.01, "RTX 5090"],
    ["Bangna half-section, consolidating", 502797, 5.36, "RTX 5090"],
    ["Footing at 50 g", 550815, 4.30, "RTX 4090"],
    ["Embankment on DCM columns", 785000, 4.5, "RTX 4090"],
  ];
  const bars = document.getElementById("bars");
  const maxMs = Math.max(...PERF.map((p) => p[2]));
  bars.innerHTML = PERF.map(([lab, n, ms, gpu]) =>
    `<div class="bar" role="listitem"><span class="lbl"><b>${lab}</b><br>${n.toLocaleString("en-US")} particles · ${gpu}</span>` +
    `<span class="track"><span class="fill" data-w="${(100 * ms / maxMs).toFixed(1)}"></span></span><span class="val">${ms.toFixed(2)} ms</span></div>`).join("");
  function fillBars() { bars.querySelectorAll(".fill").forEach((f, q) => setTimeout(() => (f.style.width = f.dataset.w + "%"), reduce ? 0 : q * 90)); }

  /* ---------- gallery + lightbox ---------- */
  const shot = document.getElementById("shot");
  document.querySelectorAll("#gallery .tabs button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("#gallery .tabs button").forEach((o) => o.setAttribute("aria-selected", o === b));
    shot.style.opacity = 0;
    setTimeout(() => { shot.src = b.dataset.shot; shot.onload = () => (shot.style.opacity = 1); }, reduce ? 0 : 180);
  }));
  const lb = document.getElementById("lb");
  document.querySelectorAll(".fig").forEach((f) => f.addEventListener("click", () => {
    lb.querySelector("img").src = f.dataset.full; lb.querySelector("img").alt = f.querySelector("img").alt; lb.showModal();
  }));
  lb.addEventListener("click", (e) => { if (e.target === lb) lb.close(); });


  /* ---------- agents: snippets, tools and a replay of an agent run ---------- */
  const TOOLS = {
    "Project": ["new_project", "open_project", "save_project", "set_title", "get_model", "set_model", "validate"],
    "Particles and test": ["add_material", "update_material", "delete_material", "set_grading", "set_specimen", "set_test", "set_bonds", "set_curing", "set_solver"],
    "Staged models": ["add_region", "update_region", "delete_region", "add_structure", "update_structure", "delete_structure", "add_phase", "update_phase", "delete_phase"],
    "Run and results": ["calculate", "get_compute", "set_compute", "get_results", "get_curve", "show_picture", "write_animation", "write_report"],
  };
  const toolsEl = document.getElementById("tools");
  toolsEl.innerHTML = Object.entries(TOOLS).map(([g, ts]) => `<span class="grp">${g}</span>` + ts.map((t) => `<code data-tool="${t}">${t}</code>`).join("")).join("");
  document.querySelectorAll("#mcpTabs button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("#mcpTabs button").forEach((o) => o.setAttribute("aria-selected", o === b));
    ["cc", "json", "http"].forEach((k) => (document.getElementById("snip-" + k).hidden = k !== b.dataset.snip));
  }));
  document.querySelector(".copy").addEventListener("click", async (e) => {
    const pre = [...document.querySelectorAll(".code pre")].find((p) => !p.hidden);
    const txt = [...pre.querySelector("code").childNodes].filter((n) => !(n.classList && n.classList.contains("c"))).map((n) => n.textContent).join("").trim();
    try { await navigator.clipboard.writeText(txt); e.target.textContent = "Copied"; } catch { e.target.textContent = "Select and copy"; }
    setTimeout(() => (e.target.textContent = "Copy"), 1600);
  });

  const SCRIPT = [
    ["user", "Oedometer test on a uniform 1–1.5 mm sand to 300 kPa. Show me e–log σv and the force chains."],
    ["call", "new_project", '{ "template": "oedometer" }'],
    ["res", "project created"],
    ["call", "set_grading", '{ "d_min_mm": 1.0, "d_max_mm": 1.5 }'],
    ["res", "grading set"],
    ["call", "set_test", '{ "kind": "oedometer", "sigma_max_kpa": 300 }'],
    ["res", "test set"],
    ["call", "validate", "{}"],
    ["res", "valid · particle count, time step and steps estimated"],
    ["call", "calculate", "{}"],
    ["res", "running on the GPU … done"],
    ["call", "get_curve", '{ "curve": "e–log σv" }'],
    ["res", "curve returned"],
    ["call", "show_picture", '{ "quantity": "force chains" }'],
    ["res", "picture attached to the reply"],
    ["reply", "Done in 25 s: the e–log σv curve and the force chains are below. Note that the 9 mm box is only six grains wide, so the result depends on the walls. A wider specimen would be more representative."],
  ];
  const term = document.getElementById("term");
  let termRun = 0;
  async function replay() {
    const id = ++termRun;
    const sleep = (ms) => new Promise((r) => setTimeout(r, reduce ? 0 : ms));
    term.innerHTML = "";
    const add = (cls, html) => { const d = document.createElement("div"); d.className = "ln " + cls; d.innerHTML = html; term.appendChild(d); while (term.scrollHeight > term.clientHeight + 2 && term.children.length > 1) term.removeChild(term.firstChild); return d; };
    for (const [kind, a, b] of SCRIPT) {
      if (id !== termRun) return;
      if (kind === "user" || kind === "reply") {
        const d = add(kind + " cur", "");
        for (let i = 1; i <= a.length; i += 2) { if (id !== termRun) return; d.textContent = a.slice(0, i); await sleep(14); }
        d.textContent = a; d.classList.remove("cur"); await sleep(kind === "user" ? 600 : 0);
      } else if (kind === "call") {
        document.querySelectorAll(".tools code.hot").forEach((c) => c.classList.remove("hot"));
        document.querySelector(`.tools code[data-tool="${a}"]`)?.classList.add("hot");
        add("call", `→ <b>${a}</b> ${b.replace(/</g, "&lt;")}`); await sleep(a === "calculate" ? 1300 : 520);
      } else { add("res", "✓ " + a); await sleep(300); }
    }
    document.querySelectorAll(".tools code.hot").forEach((c) => c.classList.remove("hot"));
    await sleep(6000);
    if (id === termRun && termOn) replay();
  }
  let termOn = false;
  new IntersectionObserver((es) => {
    const vis = es[0].isIntersecting;
    if (vis && !termOn) { termOn = true; replay(); } else if (!vis) { termOn = false; termRun++; }
  }, { threshold: 0.3 }).observe(term);

  /* ---------- citation ---------- */
  document.getElementById("copyCite").addEventListener("click", async (e) => {
    try { await navigator.clipboard.writeText(document.getElementById("bibtex").textContent); e.target.textContent = "Copied"; } catch { e.target.textContent = "Select and copy"; }
    setTimeout(() => (e.target.textContent = "Copy BibTeX"), 1600);
  });

  /* ---------- downloads ---------- */
  const D = window.GRANUM_DOWNLOADS || {};
  const dlg = document.getElementById("dlg"), agree = document.getElementById("agree"), go = document.getElementById("dlgGo");
  const miss = document.getElementById("dlgMissing"), osTxt = document.getElementById("dlgOs");
  const NAMES = { macos: "macOS 11 or later, Apple silicon and Intel (universal)", windows: "Windows 10 and 11, 64-bit" };
  let available = false;
  const refresh = () => { const ok = agree.checked && available; go.classList.toggle("disabled", !ok); go.setAttribute("aria-disabled", !ok); };
  agree.addEventListener("change", refresh);
  document.querySelectorAll("[data-os]").forEach((b) => b.addEventListener("click", async () => {
    const os = b.dataset.os, url = D[os];
    osTxt.textContent = `${NAMES[os]}${D.version ? " · version " + D.version : ""}`;
    agree.checked = false; go.href = url || "#"; go.setAttribute("download", "");
    available = !!url; miss.hidden = true;
    // check files on this site only: a browser cannot check another site's file (GitHub Releases)
    if (url && location.protocol.startsWith("http") && new URL(url, location.href).origin === location.origin) {
      try { const r = await fetch(url, { method: "HEAD" }); available = r.ok; } catch { available = false; }
    }
    miss.hidden = available; refresh(); dlg.showModal();
  }));
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  go.addEventListener("click", () => setTimeout(() => dlg.close(), 300));
  const topic = document.querySelector("select[name=topic]");
  document.getElementById("dlgAsk").addEventListener("click", () => { topic.value = "Education edition"; dlg.close(); });
  document.querySelectorAll("[data-pro]").forEach((a) => a.addEventListener("click", () => (topic.value = "Professional edition licence")));
  document.querySelectorAll("[data-research]").forEach((a) => a.addEventListener("click", () => (topic.value = "Academic Research licence")));

  /* ---------- contact (opens the mail program) ---------- */
  const form = document.getElementById("contactForm"), note = document.getElementById("formNote");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const name = (f.get("name") || "").trim(), email = (f.get("email") || "").trim(), msg = (f.get("msg") || "").trim();
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || !msg) { note.textContent = "Please give your name, a valid email and a message."; return; }
    const subject = `Granum: ${f.get("topic")}`;
    const body = `Name: ${name}\nEmail: ${email}\nOrganisation: ${f.get("org") || "-"}\nInterested in: ${f.get("topic")}\n\n${msg}`;
    location.href = `mailto:tellusfem@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    note.textContent = "Your email program should open with the message. If it does not, write to tellusfem@gmail.com.";
  });
})();
