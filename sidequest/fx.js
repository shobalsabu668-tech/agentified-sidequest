// Campus Sidequest's visual layer: the ASCII hourglass, the living ASCII field behind it, the
// square cursor and its white trail, click hearts, the liquid ink on the finale and the GSAP
// motion. Decorative only. It never touches the planner, the chat, the consent dialog or the
// agent (sidequest.js and site.js own those).
(() => {
  "use strict";
  const { gsap } = window;
  if (!gsap) { document.documentElement.classList.remove("fx"); return; }
  const ScrollTrigger = window.ScrollTrigger;
  const SplitText = window.SplitText;
  gsap.registerPlugin(...[ScrollTrigger, SplitText, window.ScrambleTextPlugin].filter(Boolean));

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const TAU = Math.PI * 2;
  const DEG = Math.PI / 180;
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const rand = gsap.utils.random;
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];

  // ---- Colour: a GTA-style sunset ramp, violet → magenta → coral → orange → gold ----------
  const SUNSET = ["#7b2ff7", "#a62bea", "#d01bc4", "#f107a3", "#ff2d75", "#ff5f6d", "#ff8a3d", "#ffb627", "#ffd23f"]
    .map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
  function sunset(t) {
    const x = clamp(t, 0, 0.9999) * (SUNSET.length - 1);
    const i = Math.floor(x), f = x - i, a = SUNSET[i], b = SUNSET[i + 1];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  }
  const css = ([r, g, b], k = 1, white = 0) =>
    `rgb(${Math.round(r * k + (255 - r * k) * white)},${Math.round(g * k + (255 - g * k) * white)},${Math.round(b * k + (255 - b * k) * white)})`;

  // Fill styles shared by every glyph layer: HUES × LEVELS sunset shades, then greys and glass.
  const HUES = 28, LEVELS = 8;
  const STYLES = [];
  for (let h = 0; h < HUES; h++) {
    const rgb = sunset(h / (HUES - 1));
    for (let l = 0; l < LEVELS; l++) {
      const k = 0.14 + 0.86 * (l / (LEVELS - 1));
      STYLES.push(css(rgb, k, l === LEVELS - 1 ? 0.4 : l === LEVELS - 2 ? 0.1 : 0));
    }
  }
  const GREY = STYLES.length;
  [26, 34, 44, 58, 78, 108, 150].forEach((v) => STYLES.push(`rgb(${v},${v},${v + 5})`));
  const GLASS = STYLES.length; STYLES.push("rgba(214,218,235,.62)");
  const GLASS_HI = STYLES.length; STYLES.push("rgba(255,255,255,.96)");
  const WHITE = STYLES.length; STYLES.push("#ffffff");
  const INK = STYLES.length; STYLES.push("rgba(10,4,24,.62)");
  const CHALK = STYLES.length; STYLES.push("rgba(255,255,255,.62)");
  const hueLevel = (h, l) => Math.round(clamp(h, 0, 1) * (HUES - 1)) * LEVELS + clamp(Math.round(l), 0, LEVELS - 1);

  // ---- Glyphs ----------------------------------------------------------------------------
  const GLYPHS = " .·:-=+*#%@oO°/\\|_~^',;!<>[]{}()?&$ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const GLYPH_STR = [...GLYPHS];
  const G = Object.fromEntries(GLYPH_STR.map((c, i) => [c, i]));
  const ids = (s) => [...s].map((c) => G[c]);
  const SCRAMBLE = ids("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&*+=?@<>{}[]/\\");
  const FIELD_RAMP = ids("..·:-=+*");
  const SHADE = ids(".,-~:;=!*#$@");
  const SAND_SHADE = ids("·:;+=*%#@");
  const STREAM = ids(".:'|");
  const randGlyph = () => SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0];

  /** A line glyph for a direction (dx right, dy up). */
  function lineGlyph(dx, dy) {
    let a = Math.atan2(dy, dx) / DEG;
    if (a < 0) a += 180;
    if (a < 22 || a >= 158) return G["_"];
    if (a < 68) return G["/"];
    if (a < 112) return G["|"];
    return G["\\"];
  }

  /** A grid of characters drawn on a canvas, batched by colour. */
  class GlyphLayer {
    constructor(canvas) { this.canvas = canvas; this.ctx = canvas.getContext("2d"); this.cols = 0; this.rows = 0; }
    resize(cols, rows, cw, ch, fontPx, weight = 500) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      Object.assign(this, { cols, rows, cw, ch });
      const n = cols * rows;
      this.glyph = new Uint8Array(n);
      this.bucket = new Int16Array(n).fill(-1);
      this.order = new Int32Array(n);
      this.counts = new Int32Array(STYLES.length + 1);
      this.pos = new Int32Array(STYLES.length);
      this.canvas.width = Math.ceil(cols * cw * dpr);
      this.canvas.height = Math.ceil(rows * ch * dpr);
      this.canvas.style.width = `${cols * cw}px`;
      this.canvas.style.height = `${rows * ch}px`;
      const ctx = this.ctx;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = `${weight} ${fontPx}px "Geist Mono", ui-monospace, Consolas, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
    }
    clear() { this.bucket.fill(-1); }
    put(i, g, b) { this.glyph[i] = g; this.bucket[i] = b; }
    flush() {
      const { ctx, counts, pos, order, bucket, glyph, cols, cw, ch } = this;
      ctx.clearRect(0, 0, cols * cw + 2, this.rows * ch + 2);
      counts.fill(0);
      const n = bucket.length, B = STYLES.length;
      for (let i = 0; i < n; i++) { const b = bucket[i]; if (b >= 0) counts[b + 1]++; }
      for (let b = 1; b <= B; b++) counts[b] += counts[b - 1];
      pos.set(counts.subarray(0, B));
      for (let i = 0; i < n; i++) { const b = bucket[i]; if (b >= 0) order[pos[b]++] = i; }
      const hx = cw / 2, hy = ch / 2;
      for (let b = 0; b < B; b++) {
        const start = counts[b], end = counts[b + 1];
        if (start === end) continue;
        ctx.fillStyle = STYLES[b];
        for (let k = start; k < end; k++) {
          const i = order[k], c = i % cols, r = (i - c) / cols;
          ctx.fillText(GLYPH_STR[glyph[i]], c * cw + hx, r * ch + hy);
        }
      }
    }
  }
  const measureCell = (fontPx, weight = 500) => {
    const probe = document.createElement("canvas").getContext("2d");
    probe.font = `${weight} ${fontPx}px "Geist Mono", ui-monospace, Consolas, monospace`;
    return probe.measureText("M").width || fontPx * 0.6;
  };

  /** Smooth 2D value noise in [0, 1]. */
  const NOISE = new Float32Array(512).map(() => Math.random());
  function noise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const n = (a, b) => NOISE[((a & 255) + (b & 255) * 57) & 511];
    const a = n(xi, yi), b = n(xi + 1, yi), c = n(xi, yi + 1), d = n(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }

  // ---- Pointer --------------------------------------------------------------------------
  const pointer = { x: -999, y: -999, moved: 0, inHero: false, hx: 0, hy: 0, inFinale: false };
  let heroCard = null;
  window.addEventListener("pointermove", (event) => {
    pointer.x = event.clientX; pointer.y = event.clientY; pointer.moved = performance.now();
    if (heroCard) {
      const r = heroCard.getBoundingClientRect();
      pointer.inHero = event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
      pointer.hx = event.clientX - r.left; pointer.hy = event.clientY - r.top;
    }
  }, { passive: true });
  document.addEventListener("pointerleave", () => { pointer.inHero = false; });

  // ---- The hourglass: a 3D object drawn in characters ----------------------------------
  // Points on its surfaces (glass bulbs, end plates, posts, sand) are rotated, projected onto
  // the character grid and depth-sorted per cell. Solids are shaded by a light; the glass is
  // drawn only along its outline and highlights, with a line glyph that follows the edge.
  const HG = { spin: 0, introSpin: 0, yaw: 0, tilt: 0.3, tiltOff: 0, flip: 0, flipDir: 1, fill: 1, t: 0, flipping: false, reveal: reduceMotion ? 2 : 0, pileTop: -0.975 };
  const hg = { layer: null, zbuf: null, gz: null, cols: 0, rows: 0, cw: 6.6, ch: 12, k: 200, statics: null, staticCount: 0, sand: new Float32Array(8 * 48000), sandCount: 0, step: 0.02, vstep: 0.02 };
  const PROFILE_N = 512;
  const PROF = new Float32Array(PROFILE_N + 1);
  for (let i = 0; i <= PROFILE_N; i++) {
    const y = (i / PROFILE_N) * 2 - 1;
    PROF[i] = 0.075 + 0.47 * Math.pow(Math.sin((Math.PI * Math.abs(y)) / 1.17), 0.78);
  }
  const rAt = (y) => PROF[clamp(Math.round((y + 1) * 0.5 * PROFILE_N), 0, PROFILE_N)];
  const drAt = (y) => (rAt(y + 0.006) - rAt(y - 0.006)) / 0.012;
  const K_GLASS = 0, K_FRAME = 1, K_SAND = 2, K_STREAM = 3, K_SPARK = 4;

  function setupHourglass(canvas, box) {
    hg.layer ||= new GlyphLayer(canvas);
    const fontPx = box.width < 460 ? 9 : 11;
    const cw = measureCell(fontPx, 600), ch = Math.round(fontPx * 1.08);
    const size = Math.max(200, Math.min(box.width, box.height * 0.92, 720));
    hg.cols = Math.floor(size / cw);
    hg.rows = Math.floor(size / ch);
    hg.cw = cw; hg.ch = ch; hg.k = size / 2.6;
    hg.layer.resize(hg.cols, hg.rows, cw, ch, fontPx, 600);
    hg.zbuf = new Float32Array(hg.cols * hg.rows);
    hg.gz = new Float32Array(hg.cols * hg.rows);
    hg.step = (cw * 0.55) / hg.k;
    hg.vstep = (ch * 0.42) / hg.k;
    buildStatics();
  }

  function buildStatics() {
    const { step, vstep } = hg;
    const P = [];
    const push = (x, y, z, nx, ny, nz, kind, param) => { P.push(x, y, z, nx, ny, nz, kind, param); };
    const ring = (n, fn) => { for (let j = 0; j < n; j++) { const a = (j / n) * TAU; fn(Math.cos(a), Math.sin(a), a); } };
    // Glass bulbs.
    for (let y = -0.995; y <= 0.995; y += vstep * 0.7) {
      const r = rAt(y), dr = drAt(y), inv = 1 / Math.sqrt(1 + dr * dr);
      ring(Math.max(24, Math.ceil((TAU * r) / step)), (c, s) => push(r * c, y, r * s, c * inv, -dr * inv, s * inv, K_GLASS, 0));
    }
    // End plates: both faces and the rim.
    const R = 0.6, ds = step * 1.1;
    for (const sign of [1, -1]) {
      const inner = sign * 1.0, outer = sign * 1.09;
      for (let rho = 0; rho <= R; rho += ds) {
        ring(Math.max(1, Math.ceil((TAU * rho) / ds)), (c, s) => {
          push(rho * c, outer, rho * s, 0, sign, 0, K_FRAME, rho);
          push(rho * c, inner, rho * s, 0, -sign, 0, K_FRAME, rho);
        });
      }
      for (let y = Math.min(inner, outer); y <= Math.max(inner, outer) + 1e-6; y += vstep * 0.6) {
        ring(Math.ceil((TAU * R) / step), (c, s) => push(R * c, y, R * s, c, 0, s, K_FRAME, -1));
      }
    }
    // Three turned posts.
    for (let p = 0; p < 3; p++) {
      const ang = Math.PI / 2 + (p * TAU) / 3, px = 0.56 * Math.cos(ang), pz = 0.56 * Math.sin(ang);
      for (let y = -1; y <= 1; y += vstep * 0.6) {
        const near = Math.min(Math.abs(y + 0.62), Math.abs(y), Math.abs(y - 0.62));
        const rad = near < 0.04 ? 0.019 + 0.022 * (1 - near / 0.04) : 0.019;
        ring(Math.max(10, Math.ceil((TAU * rad) / step) + 6), (c, s) => push(px + rad * c, y, pz + rad * s, c, 0, s, K_FRAME, -1));
      }
    }
    hg.statics = new Float32Array(P);
    hg.staticCount = P.length / 8;
  }

  /** Sand for the current fill: the top heap with its funnel, the falling stream, the pile. */
  function buildSand() {
    const { step, vstep } = hg, B = hg.sand, cap = B.length / 8;
    let n = 0;
    const push = (x, y, z, nx, ny, nz, kind, param) => {
      if (n >= cap) return;
      const o = n * 8;
      B[o] = x; B[o + 1] = y; B[o + 2] = z; B[o + 3] = nx; B[o + 4] = ny; B[o + 5] = nz; B[o + 6] = kind; B[o + 7] = param;
      n++;
    };
    const wall = 0.024, f = HG.fill;
    const side = (y0, y1) => {
      for (let y = y0; y < y1; y += vstep * 0.75) {
        const r = rAt(y) - wall;
        if (r < 0.012) continue;
        const dr = drAt(y), inv = 1 / Math.sqrt(1 + dr * dr), m = Math.max(12, Math.ceil((TAU * r) / step));
        for (let j = 0; j < m; j++) { const a = (j / m) * TAU, c = Math.cos(a), s = Math.sin(a); push(r * c, y, r * s, c * inv, -dr * inv, s * inv, K_SAND, 0); }
      }
    };
    if (f > 0.004) {
      const yt = 0.035 + 0.8 * Math.pow(f, 0.65);
      side(0.035, yt);
      const Rt = Math.max(0.012, rAt(yt) - wall), crater = HG.flipping ? 0 : 0.09 * Math.min(1, (1 - f) * 4);
      for (let rho = 0; rho <= Rt; rho += step) {
        const q = 1 - rho / Rt, yy = yt - crater * q * q, slope = (2 * crater * q) / Rt, inv = 1 / Math.sqrt(1 + slope * slope);
        const m = Math.max(1, Math.ceil((TAU * rho) / step));
        for (let j = 0; j < m; j++) { const a = (j / m) * TAU + rho * 5, c = Math.cos(a), s = Math.sin(a); push(rho * c, yy, rho * s, -c * slope * inv, inv, -s * slope * inv, K_SAND, 0); }
      }
    }
    let pileTop = -0.975;
    if (f < 0.996) {
      const g = 1 - f, yb = -0.975 + 0.7 * Math.pow(g, 0.75), hc = 0.17 * Math.min(1, g * 5);
      side(-0.975, yb);
      const Rb = Math.max(0.012, rAt(yb) - wall), slope = hc / Rb, inv = 1 / Math.sqrt(1 + slope * slope);
      for (let rho = 0; rho <= Rb; rho += step) {
        const yy = yb + hc * (1 - rho / Rb), m = Math.max(1, Math.ceil((TAU * rho) / step));
        for (let j = 0; j < m; j++) { const a = (j / m) * TAU + rho * 5, c = Math.cos(a), s = Math.sin(a); push(rho * c, yy, rho * s, c * slope * inv, inv, s * slope * inv, K_SAND, 0); }
      }
      pileTop = yb + hc;
    }
    HG.pileTop = pileTop;
    if (f > 0.004 && f < 0.999 && !HG.flipping) {
      for (let y = 0.03; y > pileTop; y -= vstep * 0.5) push(0, y, 0, 0, 0, 1, K_STREAM, y);
      for (let s = 0; s < 7; s++) { const a = Math.random() * TAU, rr = Math.random() * 0.1; push(rr * Math.cos(a), pileTop + Math.random() * 0.06, rr * Math.sin(a), 0, 0, 1, K_SPARK, 0); }
    }
    hg.sandCount = n;
  }

  const LIGHT = (() => { const l = [-0.5, 0.62, 0.6], m = Math.hypot(...l); return l.map((v) => v / m); })();
  const HALF = (() => { const h = [LIGHT[0], LIGHT[1], LIGHT[2] + 1], m = Math.hypot(...h); return h.map((v) => v / m); })();

  function renderHourglass() {
    if (!hg.layer || !hg.statics) return;
    buildSand();
    const { layer, zbuf, gz, cols, rows, cw, ch, k } = hg;
    // world = Rx(tilt) · Rz(flip) · Ry(spin)
    const ay = HG.spin + HG.yaw + HG.introSpin, cy = Math.cos(ay), sy = Math.sin(ay);
    const cz = Math.cos(HG.flip), sz = Math.sin(HG.flip);
    const ax = HG.tilt + HG.tiltOff, cx = Math.cos(ax), sx = Math.sin(ax);
    const a10 = sz * cy, a11 = cz, a12 = sz * sy, a20 = -sy, a22 = cy;
    const m00 = cz * cy, m01 = -sz, m02 = cz * sy;
    const m10 = cx * a10 - sx * a20, m11 = cx * a11, m12 = cx * a12 - sx * a22;
    const m20 = sx * a10 + cx * a20, m21 = sx * a11, m22 = sx * a12 + cx * a22;
    const kx = k / cw, ky = k / ch, ox = cols / 2, oy = rows / 2;
    const revealRow = HG.reveal * (rows + 6) - 3;
    const [lx, ly, lz] = LIGHT, [hx, hy, hz] = HALF;
    const tick = Math.floor(HG.t * 16);
    layer.clear(); zbuf.fill(-1e9); gz.fill(-1e9);

    const solids = (buf, count) => {
      for (let p = 0; p < count; p++) {
        const o = p * 8, kind = buf[o + 6];
        if (kind === K_GLASS) continue;
        const x = buf[o], y = buf[o + 1], z = buf[o + 2];
        const X = m00 * x + m01 * y + m02 * z, Y = m10 * x + m11 * y + m12 * z, Z = m20 * x + m21 * y + m22 * z;
        const c = Math.floor(ox + X * kx), r = Math.floor(oy - Y * ky);
        if (c < 0 || c >= cols || r < 0 || r >= rows || r > revealRow) continue;
        const i = r * cols + c;
        if (Z <= zbuf[i]) continue;
        let g, b;
        if (kind <= K_SAND) {
          const nx = buf[o + 3], ny = buf[o + 4], nz = buf[o + 5];
          const NZ = m20 * nx + m21 * ny + m22 * nz;
          if (NZ < 0.03) continue;
          const NX = m00 * nx + m01 * ny + m02 * nz, NY = m10 * nx + m11 * ny + m12 * nz;
          const lum = clamp(NX * lx + NY * ly + NZ * lz, 0, 1);
          if (kind === K_FRAME) {
            const rho = buf[o + 7], grain = rho >= 0 ? 0.16 * Math.sin(rho * 70) - (rho > 0.53 ? 0.25 : 0) : 0;
            const l = clamp(lum * 0.92 + grain, 0, 1);
            g = SHADE[1 + Math.min(10, (l * 11) | 0)]; b = GREY + clamp(Math.round(0.6 + l * 5.6), 0, 6);
          }
          else { g = SAND_SHADE[Math.min(8, ((lum * 0.75 + 0.25) * 9) | 0)]; b = hueLevel(0.6 + Y * 0.33, 2.6 + lum * 5); }
        } else if (kind === K_STREAM) {
          g = STREAM[(((r - tick) % 4) + 4) % 4]; b = hueLevel(0.62 + Y * 0.33, 7);
        } else {
          g = Math.random() < 0.5 ? G["."] : G["'"]; b = hueLevel(0.8, 7);
        }
        zbuf[i] = Z;
        layer.put(i, g, b);
      }
    };
    solids(hg.statics, hg.staticCount);
    solids(hg.sand, hg.sandCount);

    // Glass: silhouette edges and highlights only, in front of whatever sits behind.
    const S = hg.statics;
    for (let p = 0; p < hg.staticCount; p++) {
      const o = p * 8;
      if (S[o + 6] !== K_GLASS) continue;
      const nx = S[o + 3], ny = S[o + 4], nz = S[o + 5];
      const NZ = m20 * nx + m21 * ny + m22 * nz;
      const fres = 1 - Math.abs(NZ);
      const NX = m00 * nx + m01 * ny + m02 * nz, NY = m10 * nx + m11 * ny + m12 * nz;
      const spec = NZ > 0 ? NX * hx + NY * hy + NZ * hz : 0;
      if (fres < 0.85 && spec < 0.955) continue;
      const x = S[o], y = S[o + 1], z = S[o + 2];
      const X = m00 * x + m01 * y + m02 * z, Y = m10 * x + m11 * y + m12 * z, Z = m20 * x + m21 * y + m22 * z;
      const c = Math.floor(ox + X * kx), r = Math.floor(oy - Y * ky);
      if (c < 0 || c >= cols || r < 0 || r >= rows || r > revealRow) continue;
      const i = r * cols + c;
      if (Z < zbuf[i] || Z <= gz[i]) continue;
      gz[i] = Z;
      if (spec >= 0.955) layer.put(i, spec > 0.985 ? G["!"] : G["'"], GLASS_HI);
      else layer.put(i, lineGlyph(-NY, NX), fres > 0.95 ? GLASS_HI : GLASS);
    }

    // The intro draws it in with a scan line of random characters.
    if (HG.reveal < 1.15) {
      const r = Math.floor(revealRow);
      for (let dr = 0; dr < 2; dr++) {
        const rr = r - dr;
        if (rr < 0 || rr >= rows) continue;
        for (let c = 0; c < cols; c++) {
          const i = rr * cols + c;
          if (layer.bucket[i] >= 0 || Math.random() < 0.04) layer.put(i, randGlyph(), dr ? GREY + 5 : WHITE);
        }
      }
    }
    layer.flush();
  }

  // ---- The ASCII field behind the hero -------------------------------------------------
  // Slow noise contours in grey, falling grains of "sand", a sunset sweep that passes through
  // now and then, rings from clicks and flips, and a soft white glow around the cursor.
  const field = { layer: null, cols: 0, rows: 0, cw: 7.2, ch: 15, t: 0, alpha: reduceMotion ? 1 : 0, heat: null, hue: null, seed: null, pulses: [], grains: [] };
  function newGrain(anywhere) {
    return { c: (Math.random() * field.cols) | 0, y: anywhere ? Math.random() * field.rows : -Math.random() * 12, v: rand(1.6, 6.5), len: (rand(2, 6)) | 0, g: Math.random() < 0.7 ? G[":"] : G["|"] };
  }
  function setupField(canvas) {
    field.layer ||= new GlyphLayer(canvas);
    const rect = canvas.parentElement.getBoundingClientRect();
    field.cw = measureCell(12);
    field.ch = 15;
    field.cols = Math.ceil(rect.width / field.cw) + 1;
    field.rows = Math.ceil(rect.height / field.ch) + 1;
    field.layer.resize(field.cols, field.rows, field.cw, field.ch, 12);
    const n = field.cols * field.rows;
    field.heat = new Float32Array(n);
    field.hue = new Float32Array(n);
    field.seed = new Float32Array(n).map(() => Math.random());
    field.grains = Array.from({ length: Math.round(n / 240) }, () => newGrain(true));
  }
  function pulseAt(x, y, options = {}) {
    if (reduceMotion) return;
    field.pulses.push({ x, y, age: 0, life: options.life || 1.6, reach: options.reach || 600, hue: options.hue ?? Math.random(), white: !!options.white });
  }
  function renderField(dt) {
    const { layer, cols, rows, heat, hue, seed } = field;
    if (!layer) return;
    field.t += dt;
    const t = field.t, a = field.alpha;
    for (const pulse of field.pulses) {
      pulse.age += dt / pulse.life;
      const radius = 18 + pulse.age * pulse.reach, steps = Math.max(30, (radius * TAU) / field.cw);
      const strength = 0.7 * (1 - pulse.age);
      for (let k = 0; k < steps; k++) {
        const ang = (k / steps) * TAU;
        const c = Math.round((pulse.x + Math.cos(ang) * radius) / field.cw), r = Math.round((pulse.y + Math.sin(ang) * radius * 0.7) / field.ch);
        if (c < 0 || c >= cols || r < 0 || r >= rows) continue;
        const i = r * cols + c;
        if (seed[i] > 0.5) continue;
        if (heat[i] < strength) { heat[i] = strength; hue[i] = pulse.white ? -1 : (pulse.hue + (k / steps) * 0.6) % 1; }
      }
    }
    field.pulses = field.pulses.filter((pulse) => pulse.age < 1);
    layer.clear();
    const tick = Math.floor(t * 10);
    const sweep = ((t * 0.055) % 1.8) - 0.4;
    const pc = pointer.inHero && finePointer ? pointer.hx / field.cw : -999, pr = pointer.inHero && finePointer ? pointer.hy / field.ch : -999;
    for (let r = 0; r < rows; r++) {
      const ny = r * 0.115, vig = 1 - Math.pow(Math.abs(r / rows - 0.45) * 1.3, 2);
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const h = heat[i];
        if (h > 0.06) {
          heat[i] = h * 0.7;
          const sd = seed[i];
          const g = SCRAMBLE[((sd * 977 + tick * (1 + sd * 3)) | 0) % SCRAMBLE.length];
          layer.put(i, g, hue[i] < 0 ? GREY + clamp(Math.round(h * 8), 0, 6) : hueLevel(hue[i], 1 + h * 7 * a));
          continue;
        }
        heat[i] = 0;
        const n = noise(c * 0.055 + t * 0.06, ny - t * 0.045) * 0.68 + noise(c * 0.14 - t * 0.035, r * 0.28 + t * 0.06) * 0.32;
        const band = Math.abs(((n * 7 + t * 0.2) % 1) - 0.5);
        let level = -1, g = 0;
        if (n > 0.6) { const q = (n - 0.6) / 0.4; g = FIELD_RAMP[Math.min(FIELD_RAMP.length - 1, (q * FIELD_RAMP.length * 1.4) | 0)]; level = 1.1 + q * 5.2; }
        else if (band < 0.04) { g = G["."]; level = 0.8; }
        const dx = (c - pc) / 1.9, dy = r - pr, d2 = dx * dx + dy * dy;
        if (d2 < 81) {
          const boost = 1 - Math.sqrt(d2) / 9;
          if (level < 0 && seed[i] < boost * 0.55) { g = seed[i] < 0.12 ? G["+"] : G["·"]; level = 1; }
          if (level >= 0) level += boost * 5;
        }
        if (level < 0) continue;
        level *= vig * a;
        if (level < 0.4) continue;
        const sp = (c / cols) * 0.72 + (r / rows) * 0.38 - sweep;
        if (sp > -0.06 && sp < 0.06) { layer.put(i, g, hueLevel(c / cols, 1.5 + level * 0.7 + (1 - Math.abs(sp) / 0.06) * 2.5)); continue; }
        layer.put(i, g, GREY + clamp(Math.round(level), 0, 6));
      }
    }
    for (const grain of field.grains) {
      grain.y += grain.v * dt;
      if (grain.y - grain.len > rows) Object.assign(grain, newGrain(false));
      const head = Math.floor(grain.y);
      for (let k = 0; k < grain.len; k++) {
        const r = head - k;
        if (r < 0 || r >= rows || grain.c >= cols) continue;
        layer.put(r * cols + grain.c, k === 0 ? grain.g : G["·"], GREY + clamp(Math.round((5 - k * 1.3) * a), 0, 6));
      }
    }
    layer.flush();
  }

  // ---- ASCII hearts on click -----------------------------------------------------------
  const HEART = {
    tiny: "<3",
    small: " _  _\n( \\/ )\n \\  /\n  \\/",
    big: " .:::.   .:::.\n:::::::.:::::::\n:::::::::::::::\n':::::::::::::'\n  ':::::::::'\n    ':::::'\n      ':'",
    bold: " ,d88b.d88b,\n 88888888888\n `Y8888888Y'\n   `Y888Y'\n     `Y'",
  };
  let burstHearts = () => {};
  function initHearts() {
    if (reduceMotion) return;
    const pool = Array.from({ length: 48 }, () => {
      const el = document.createElement("pre");
      el.className = "ascii-heart";
      el.setAttribute("aria-hidden", "true");
      el.style.opacity = "0";
      document.body.append(el);
      return el;
    });
    let next = 0;
    const take = () => { const el = pool[next++ % pool.length]; gsap.killTweensOf(el); return el; };
    burstHearts = (x, y) => {
      const big = take();
      big.textContent = Math.random() < 0.5 ? HEART.big : HEART.bold;
      big.style.fontSize = "11px";
      big.style.color = css(sunset(rand(0.3, 0.62)), 1, 0.08);
      gsap.timeline()
        .fromTo(big, { x, y, xPercent: -50, yPercent: -50, scale: 0.1, opacity: 1, rotation: rand(-14, 14) },
          { y: y - rand(120, 170), scale: 1, rotation: 0, duration: 1.1, ease: "back.out(2.2)" })
        .to(big, { y: "-=70", opacity: 0, scale: 0.75, duration: 0.8, ease: "power2.in" }, ">-0.15");
      for (let i = 0; i < 12; i++) {
        const el = take();
        const small = i % 3 === 0;
        el.textContent = small ? HEART.small : HEART.tiny;
        el.style.fontSize = `${small ? 9 : Math.round(rand(12, 19))}px`;
        el.style.color = css(sunset(rand(0.15, 1)), 1, Math.random() < 0.3 ? 0.55 : 0.04);
        const ang = rand(-165, -15) * DEG, dist = rand(70, 210);
        gsap.timeline()
          .fromTo(el, { x, y, xPercent: -50, yPercent: -50, scale: 0.2, opacity: 1, rotation: rand(-40, 40) },
            { x: x + Math.cos(ang) * dist, y: y + Math.sin(ang) * dist, scale: rand(0.85, 1.25), duration: rand(0.45, 0.7), ease: "power3.out" })
          .to(el, { y: `+=${rand(90, 190)}`, x: `+=${rand(-30, 30)}`, rotation: `+=${rand(-100, 100)}`, opacity: 0, duration: rand(0.8, 1.25), ease: "power1.in" }, ">-0.05");
      }
    };
  }

  // ---- Hero: hourglass + field loop -----------------------------------------------------
  let flipHourglass = () => {};
  function initHero() {
    heroCard = $(".hero-card");
    const fieldCanvas = $(".ascii-field"), hgCanvas = $(".hourglass"), visual = $(".hero-visual");
    if (!heroCard || !fieldCanvas || !hgCanvas || !visual) return;
    setupField(fieldCanvas);
    setupHourglass(hgCanvas, visual.getBoundingClientRect());

    const hourglassCenter = () => {
      const cr = heroCard.getBoundingClientRect(), r = hgCanvas.getBoundingClientRect();
      return { x: r.left - cr.left + r.width / 2, y: r.top - cr.top + r.height / 2 };
    };
    let drainTween = null;
    const drain = () => { drainTween = gsap.to(HG, { fill: 0, duration: 15 * HG.fill + 0.01, ease: "none", onComplete: () => gsap.delayedCall(0.9, flipHourglass) }); };
    flipHourglass = () => {
      if (HG.flipping || reduceMotion) return;
      HG.flipping = true;
      drainTween?.kill();
      HG.flipDir *= -1;
      const c = hourglassCenter();
      pulseAt(c.x, c.y, { reach: Math.max(heroCard.clientWidth, 700) * 0.7, life: 2.2, hue: 0.2 });
      gsap.to(HG, {
        flip: Math.PI * HG.flipDir, duration: 1.6, ease: "expo.inOut",
        onComplete() { HG.flip = 0; HG.fill = 1 - HG.fill; HG.flipping = false; drain(); },
      });
    };

    const yawTo = gsap.quickTo(HG, "yaw", { duration: 1.4, ease: "power3.out" });
    const tiltTo = gsap.quickTo(HG, "tiltOff", { duration: 1.4, ease: "power3.out" });
    const hud = { sand: $('[data-hud="sand"]'), left: $('[data-hud="left"]') };
    let active = true, frame = 0;

    function tick(time, deltaMs) {
      if (!active) return;
      const dt = Math.min(deltaMs, 50) / 1000;
      HG.t += dt;
      if (pointer.inHero && finePointer && performance.now() - pointer.moved < 3000) {
        const w = heroCard.clientWidth, h = heroCard.clientHeight;
        yawTo((pointer.hx / w - 0.5) * 1.1);
        tiltTo((pointer.hy / h - 0.5) * -0.35);
      } else { yawTo(0); tiltTo(0); }
      frame++;
      if (frame % 2 === 0) renderHourglass(); else renderField(dt * 2);
      if (frame % 10 === 0 && hud.sand) {
        hud.sand.textContent = `${Math.round(HG.fill * 100)}%`;
        const secs = Math.round(HG.fill * 3600);
        hud.left.textContent = `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
      }
    }

    if (reduceMotion) {
      HG.fill = 0.62;
      renderHourglass(); renderField(0);
    } else {
      gsap.to(HG, { spin: `+=${TAU}`, duration: 18, ease: "none", repeat: -1 });
      drain();
      gsap.ticker.add(tick);
      if (ScrollTrigger) {
        ScrollTrigger.create({ trigger: heroCard, start: "top bottom", end: "bottom top", onToggle: (self) => { active = self.isActive; } });
        gsap.to(".hero-visual", { y: -70, ease: "none", scrollTrigger: { trigger: heroCard, start: "top top", end: "bottom top", scrub: true } });
        gsap.to(".hero-copy", { y: 60, opacity: 0.2, ease: "none", scrollTrigger: { trigger: heroCard, start: "center center", end: "bottom top", scrub: true } });
      }
    }

    heroCard.addEventListener("click", (event) => {
      if (event.target.closest("a, button, input, label, textarea, select")) return;
      burstHearts(event.clientX, event.clientY);
      const cr = heroCard.getBoundingClientRect();
      pulseAt(event.clientX - cr.left, event.clientY - cr.top, { reach: 380, life: 1.1, hue: 0.4 });
      if (event.target.closest(".hero-visual")) flipHourglass();
    });

    let resizeTimer = null;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        setupField(fieldCanvas);
        setupHourglass(hgCanvas, visual.getBoundingClientRect());
        if (reduceMotion) { renderHourglass(); renderField(0); }
      }, 160);
    });
  }

  // ---- Intro timeline -------------------------------------------------------------------
  function playIntro() {
    window.__fxStarted = true;
    const root = document.documentElement;
    if (reduceMotion) { root.classList.remove("fx"); return; }
    let titleTargets = [".hero-title"];
    if (SplitText) {
      const split = SplitText.create(".hero-title", { type: "words,chars", mask: "words", ignore: ".grad-text" });
      if (split.chars.length) titleTargets = split.chars;
    }
    const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
    tl.from(".hero-card", { opacity: 0, scale: 0.985, duration: 1.4 }, 0)
      .to(field, { alpha: 1, duration: 2.4, ease: "power2.inOut" }, 0.1)
      .to(HG, { reveal: 1.3, duration: 1.9, ease: "power2.inOut" }, 0.35)
      .from(HG, { introSpin: -TAU * 1.1, duration: 2.8, ease: "expo.out" }, 0.35)
      .from(".hero-badge", { y: 18, autoAlpha: 0, duration: 1.1 }, 0.5)
      .from(titleTargets, { yPercent: 115, duration: 1.3, stagger: 0.022 }, 0.6)
      .from(".grad-text", { yPercent: 60, autoAlpha: 0, rotate: -6, scale: 0.9, duration: 1.6, ease: "elastic.out(1, .6)" }, 1.0)
      .from([".hero-lede", ".hero-actions > *", ".reassurance"], { y: 26, autoAlpha: 0, duration: 1.1, stagger: 0.08 }, 1.0)
      .from([".hero-hud span", ".visual-caption"], { autoAlpha: 0, y: 6, duration: 1, stagger: 0.1 }, 1.3)
      .from(".topbar", { y: -24, autoAlpha: 0, duration: 1 }, 0.4);
    if (window.ScrambleTextPlugin) {
      tl.to(".badge-text", { duration: 1.4, scrambleText: { text: "{original}", chars: "ABCDEFGHIJKLMNOPQRSTUVWXYZ#%&*+=", speed: 0.6, revealDelay: 0.3 } }, 0.55);
    }
    root.classList.remove("fx");
  }

  // ---- Square cursor with a white trail ------------------------------------------------
  function initCursor() {
    if (!finePointer) return;
    const square = document.createElement("div");
    square.className = "cursor-square";
    const dot = document.createElement("div");
    dot.className = "cursor-dot";
    for (const el of [square, dot]) { el.setAttribute("aria-hidden", "true"); document.body.append(el); }
    document.documentElement.classList.add("custom-cursor");
    gsap.set([square, dot], { xPercent: -50, yPercent: -50, x: -100, y: -100 });
    const sx = gsap.quickTo(square, "x", { duration: reduceMotion ? 0.01 : 0.26, ease: "power3.out" });
    const sy = gsap.quickTo(square, "y", { duration: reduceMotion ? 0.01 : 0.26, ease: "power3.out" });
    const dx = gsap.quickSetter(dot, "x", "px"), dy = gsap.quickSetter(dot, "y", "px");

    const make = (cls, n) => Array.from({ length: n }, () => {
      const el = document.createElement(cls === "trail-ghost" ? "div" : "span");
      el.className = cls;
      el.setAttribute("aria-hidden", "true");
      el.style.opacity = "0";
      document.body.append(el);
      return el;
    });
    const chars = reduceMotion ? [] : make("trail-char", 44);
    const ghosts = reduceMotion ? [] : make("trail-ghost", 10);
    const PICK = "01ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#+*=/\\<>";
    let ci = 0, gi = 0, dist = 0, ghostDist = 0, lastX = null, lastY = null;
    const emitChar = (x, y, vx, vy) => {
      const el = chars[ci++ % chars.length];
      gsap.killTweensOf(el);
      el.textContent = PICK[(Math.random() * PICK.length) | 0];
      // Leave from a random point on the square's edge, away from the direction of travel.
      const edge = (Math.random() * 4) | 0, u = rand(-11, 11);
      const ox = edge === 0 ? -11 : edge === 1 ? 11 : u, oy = edge === 2 ? -11 : edge === 3 ? 11 : u;
      let flips = 0;
      gsap.fromTo(el, { x: x + ox, y: y + oy, xPercent: -50, yPercent: -50, opacity: rand(0.55, 1), scale: rand(0.8, 1.15) },
        {
          x: `+=${-vx * rand(0.5, 1.4) + ox * 1.6}`, y: `+=${-vy * rand(0.5, 1.4) + oy * 1.6 + rand(2, 14)}`, opacity: 0, scale: 0.35,
          duration: rand(0.5, 0.95), ease: "power2.out",
          onUpdate() { if (flips < 3 && Math.random() < 0.1) { flips++; el.textContent = PICK[(Math.random() * PICK.length) | 0]; } },
        });
    };
    const emitGhost = (x, y) => {
      const el = ghosts[gi++ % ghosts.length];
      gsap.killTweensOf(el);
      gsap.fromTo(el, { x, y, xPercent: -50, yPercent: -50, opacity: 0.7, scale: 1, rotation: 0 },
        { opacity: 0, scale: 2.4, rotation: rand(-30, 30), duration: 0.85, ease: "power2.out" });
    };
    window.addEventListener("pointermove", (event) => {
      if (event.pointerType && event.pointerType !== "mouse") return;
      sx(event.clientX); sy(event.clientY); dx(event.clientX); dy(event.clientY);
      square.classList.remove("is-out"); dot.classList.remove("is-out");
      if (lastX === null) { lastX = event.clientX; lastY = event.clientY; return; }
      const mx = event.clientX - lastX, my = event.clientY - lastY, d = Math.hypot(mx, my);
      lastX = event.clientX; lastY = event.clientY;
      if (reduceMotion || pointer.inFinale || !d) return;
      dist += d; ghostDist += d;
      const vx = (mx / d) * 26, vy = (my / d) * 26;
      let n = 0;
      while (dist > 13 && n < 3) { dist -= 13; n++; emitChar(event.clientX, event.clientY, vx, vy); }
      if (dist > 40) dist = 0;
      if (ghostDist > 95) { ghostDist = 0; emitGhost(event.clientX, event.clientY); }
    }, { passive: true });
    document.addEventListener("pointerover", (event) => {
      const t = event.target;
      if (!(t instanceof Element)) return;
      const text = t.closest("input:not([type=radio]):not([type=checkbox]), textarea, select, [contenteditable='true']");
      const press = !text && t.closest("a, button, label, summary, [role='button'], .hero-visual");
      pointer.inFinale = !!t.closest(".finale");
      square.classList.toggle("is-text", !!text);
      dot.classList.toggle("is-text", !!text);
      square.classList.toggle("is-hover", !!press);
      square.classList.toggle("is-paint", !press && pointer.inFinale);
    });
    window.addEventListener("pointerdown", () => gsap.to(square, { scale: 0.7, duration: 0.15, ease: "power2.out" }));
    window.addEventListener("pointerup", () => gsap.to(square, { scale: 1, duration: 0.7, ease: "elastic.out(1, .4)" }));
    document.documentElement.addEventListener("mouseleave", () => { square.classList.add("is-out"); dot.classList.add("is-out"); });
  }

  // ---- Magnetic, glowing buttons -------------------------------------------------------
  function initMagnetic() {
    if (!finePointer || reduceMotion) return;
    for (const el of $$(".btn")) {
      const xTo = gsap.quickTo(el, "x", { duration: 0.5, ease: "power3.out" });
      const yTo = gsap.quickTo(el, "y", { duration: 0.5, ease: "power3.out" });
      el.addEventListener("pointermove", (event) => {
        const r = el.getBoundingClientRect();
        xTo((event.clientX - (r.left + r.width / 2)) * 0.22);
        yTo((event.clientY - (r.top + r.height / 2)) * 0.32);
      });
      el.addEventListener("pointerleave", () => { gsap.to(el, { x: 0, y: 0, duration: 0.9, ease: "elastic.out(1, .4)" }); });
    }
  }

  // ---- ASCII reveal: characters resolve column by column, spaces kept -----------------
  function asciiReveal(el, duration = 1.1) {
    const target = el.dataset.ascii || el.textContent;
    el.dataset.ascii = target;
    const rows = target.split("\n");
    const width = Math.max(...rows.map((row) => row.length));
    const state = { p: 0 };
    const SET = "#%&*+=/\\|<>01";
    gsap.killTweensOf(el.__reveal || {});
    el.__reveal = state;
    return gsap.to(state, {
      p: 1, duration, ease: "power2.out",
      onUpdate() {
        const edge = state.p * (width + 6);
        el.textContent = rows.map((row) => [...row].map((c, x) => (c === " " || x < edge - 6 ? c : x < edge ? SET[(Math.random() * SET.length) | 0] : " ")).join("")).join("\n");
      },
      onComplete() { el.textContent = target; },
    });
  }

  // ---- Scroll: headings, cards, marquee, finale ----------------------------------------
  let finaleChars = [];
  function initScroll() {
    const topbar = $(".topbar");
    const onScroll = () => topbar?.classList.toggle("scrolled", window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    if (SplitText && $(".finale-title")) {
      finaleChars = SplitText.create(".finale-title", { type: "chars", mask: "chars", charsClass: "fchar" }).chars;
    }
    if (reduceMotion || !ScrollTrigger) return;

    for (const head of $$(".split-head")) {
      if (!SplitText) break;
      SplitText.create(head, {
        type: "lines", mask: "lines", autoSplit: true,
        onSplit: (self) => gsap.from(self.lines, { yPercent: 105, duration: 1.2, stagger: 0.12, ease: "expo.out", scrollTrigger: { trigger: head, start: "top 86%", once: true } }),
      });
    }
    gsap.set(".reveal:not(.section-head)", { autoAlpha: 0, y: 40 });
    ScrollTrigger.batch(".reveal:not(.section-head)", {
      start: "top 88%", once: true,
      onEnter: (batch) => gsap.to(batch, { autoAlpha: 1, y: 0, duration: 1.1, stagger: 0.1, ease: "expo.out", clearProps: "transform" }),
    });
    for (const pre of $$(".step-ascii")) {
      pre.dataset.ascii = pre.textContent;
      ScrollTrigger.create({ trigger: pre, start: "top 85%", once: true, onEnter: () => asciiReveal(pre, 1.4) });
      pre.closest(".step-card")?.addEventListener("pointerenter", () => asciiReveal(pre, 0.7));
    }
    gsap.from([".planner-main", ".side-agent"], { y: 50, opacity: 0, duration: 1.2, stagger: 0.12, ease: "expo.out", clearProps: "transform,opacity", scrollTrigger: { trigger: "#planner", start: "top 85%", once: true } });
    gsap.from(".partner-card", { y: 50, opacity: 0, duration: 1.2, stagger: 0.12, ease: "expo.out", clearProps: "transform,opacity", scrollTrigger: { trigger: ".partner-grid", start: "top 88%", once: true } });

    // Marquee: endless, and it surges with scroll speed.
    const track = $(".marquee-track");
    if (track) {
      const loop = gsap.to(track, { xPercent: -50, duration: 32, ease: "none", repeat: -1 });
      ScrollTrigger.create({
        onUpdate: (self) => {
          const v = self.getVelocity();
          gsap.to(loop, { timeScale: clamp(1 + v / 260, -6, 8), duration: 0.25, overwrite: true });
          gsap.to(loop, { timeScale: 1, duration: 1.4, delay: 0.25, ease: "power2.out" });
        },
      });
    }

    // The finale's sunset shifts as it scrolls past; its title rises letter by letter.
    const finale = $(".finale");
    if (finale) {
      gsap.fromTo(finale, { backgroundPosition: "0% 0%" }, { backgroundPosition: "100% 100%", ease: "none", scrollTrigger: { trigger: finale, start: "top bottom", end: "bottom top", scrub: true } });
      if (finaleChars.length) gsap.from(finaleChars, { yPercent: 110, rotate: 8, duration: 1.2, stagger: 0.035, ease: "expo.out", scrollTrigger: { trigger: finale, start: "top 70%", once: true } });
      gsap.from([".finale-kicker", ".finale .btn"], { y: 30, autoAlpha: 0, duration: 1, stagger: 0.15, ease: "expo.out", scrollTrigger: { trigger: finale, start: "top 60%", once: true } });
    }
  }

  // ---- Spotlights on cards --------------------------------------------------------------
  function initSpotlights() {
    for (const card of $$(".step-card, .partner-card")) {
      card.addEventListener("pointermove", (event) => {
        const r = card.getBoundingClientRect();
        card.style.setProperty("--mx", `${event.clientX - r.left}px`);
        card.style.setProperty("--my", `${event.clientY - r.top}px`);
      });
    }
    const finale = $(".finale");
    if (finale && finePointer) {
      const spot = { x: 50, y: 50 };
      const paint = () => { finale.style.setProperty("--fx", `${spot.x}%`); finale.style.setProperty("--fy", `${spot.y}%`); };
      const fx = gsap.quickTo(spot, "x", { duration: 0.8, ease: "power3.out", onUpdate: paint });
      const fy = gsap.quickTo(spot, "y", { duration: 0.8, ease: "power3.out", onUpdate: paint });
      finale.addEventListener("pointermove", (event) => {
        const r = finale.getBoundingClientRect();
        fx(((event.clientX - r.left) / r.width) * 100);
        fy(((event.clientY - r.top) / r.height) * 100);
      });
    }
  }

  // ---- Finale: ASCII grain on the sunset ----------------------------------------------
  function initFinaleAscii() {
    const canvas = $(".finale-ascii");
    if (!canvas) return;
    const layer = new GlyphLayer(canvas);
    const RAMP = ids(" .:-=+*#");
    let cols = 0, rows = 0, t = Math.random() * 10, visible = false, frame = 0;
    const setup = () => {
      const r = canvas.parentElement.getBoundingClientRect();
      const cw = 8.4, ch = 16;
      cols = Math.ceil(r.width / cw); rows = Math.ceil(r.height / ch);
      layer.resize(cols, rows, cw, ch, 13, 600);
    };
    const draw = (dt) => {
      t += dt;
      layer.clear();
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const wave = Math.sin(c * 0.09 + r * 0.16 + t * 1.2) * 0.5 + 0.5;
          const n = noise(c * 0.045 + t * 0.12, r * 0.08 - t * 0.06) * 0.7 + wave * 0.3;
          const k = (n * RAMP.length) | 0;
          if (k <= 0) continue;
          layer.put(r * cols + c, RAMP[Math.min(RAMP.length - 1, k)], n > 0.72 ? CHALK : INK);
        }
      }
      layer.flush();
    };
    setup();
    draw(0);
    if (reduceMotion) return;
    if (ScrollTrigger) ScrollTrigger.create({ trigger: canvas.parentElement, start: "top bottom", end: "bottom top", onToggle: (self) => { visible = self.isActive; } });
    gsap.ticker.add((time, deltaMs) => { if (visible && frame++ % 3 === 0) draw((Math.min(deltaMs, 50) / 1000) * 3); });
    let timer = null;
    window.addEventListener("resize", () => { clearTimeout(timer); timer = setTimeout(() => { setup(); draw(0); }, 200); });
  }

  // ---- Finale: liquid ink that recolours the letters it passes over -------------------
  // The cursor leaves a tapering liquid trail. Where it crosses MAKE YOUR BREAK, the letters
  // fill with flowing ASCII ink in sunset colours; elsewhere the liquid is a faint sheen.
  function initFinaleLiquid() {
    const finale = $(".finale"), canvas = $(".finale-liquid"), title = $(".finale-title");
    if (!finale || !canvas || !title || !finePointer || reduceMotion || !finaleChars.length) return;
    const ctx = canvas.getContext("2d");
    const off = document.createElement("canvas"), octx = off.getContext("2d");
    const mask = document.createElement("canvas"), mctx = mask.getContext("2d");
    let W = 0, H = 0, dpr = 1;
    const resize = () => {
      const r = finale.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = r.width; H = r.height;
      for (const cv of [canvas, off, mask]) { cv.width = Math.ceil(W * dpr); cv.height = Math.ceil(H * dpr); }
      canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
      glyphCache = null;
    };
    // A tile of characters in sunset colours on near-black: the ink the letters fill with.
    const tile = document.createElement("canvas");
    const TW = 264, TH = 168, tdpr = 2;
    tile.width = TW * tdpr; tile.height = TH * tdpr;
    const tctx = tile.getContext("2d");
    tctx.scale(tdpr, tdpr);
    tctx.fillStyle = "#08020f";
    tctx.fillRect(0, 0, TW, TH);
    tctx.font = '700 11px "Geist Mono", ui-monospace, monospace';
    tctx.textBaseline = "top";
    const INKS = "#%@*+=<>/\\01$&";
    for (let y = 0; y < TH; y += 12) {
      for (let x = 0; x < TW; x += 7.33) {
        tctx.fillStyle = css(sunset((x / TW) * 0.65 + (y / TH) * 0.35), 0.6 + Math.random() * 0.4, Math.random() < 0.08 ? 0.6 : 0);
        tctx.fillText(INKS[(Math.random() * INKS.length) | 0], x, y);
      }
    }
    const pattern = octx.createPattern(tile, "repeat");

    // The letters, painted once into a mask (and again whenever they may have moved).
    let glyphCache = null, glyphTime = 0;
    const paintMask = (now) => {
      if (glyphCache && now - glyphTime < 0.25) return;
      glyphTime = now;
      const r0 = finale.getBoundingClientRect();
      const cs = getComputedStyle(title);
      const font = `${cs.fontWeight} ${parseFloat(cs.fontSize)}px Geist, ui-sans-serif, sans-serif`;
      mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      mctx.clearRect(0, 0, W, H);
      mctx.font = font;
      mctx.textAlign = "left";
      mctx.textBaseline = "alphabetic";
      mctx.fillStyle = "#000";
      const m = mctx.measureText("M"), A = m.fontBoundingBoxAscent, D = m.fontBoundingBoxDescent;
      for (const el of finaleChars) {
        const r = el.getBoundingClientRect();
        mctx.fillText(el.textContent.toUpperCase(), r.left - r0.left, r.top - r0.top + (r.height - (A + D)) / 2 + A);
      }
      glyphCache = true;
    };

    const points = [];
    const head = { x: 0, y: 0 };
    let moving = false, visible = false, drawn = false, flow = 0;
    const hx = gsap.quickTo(head, "x", { duration: 0.3, ease: "power3.out" });
    const hy = gsap.quickTo(head, "y", { duration: 0.3, ease: "power3.out" });
    finale.addEventListener("pointermove", (event) => {
      const r = finale.getBoundingClientRect();
      const x = event.clientX - r.left, y = event.clientY - r.top;
      if (!moving && !points.length) { head.x = x; head.y = y; }
      hx(x); hy(y);
      moving = true;
      clearTimeout(finale.__still);
      finale.__still = setTimeout(() => { moving = false; }, 120);
    });
    finale.addEventListener("pointerleave", () => { moving = false; });
    resize();
    window.addEventListener("resize", () => { clearTimeout(canvas.__t); canvas.__t = setTimeout(resize, 160); });
    if (ScrollTrigger) ScrollTrigger.create({ trigger: finale, start: "top bottom", end: "bottom top", onToggle: (self) => { visible = self.isActive; } });

    gsap.ticker.add((time, deltaMs) => {
      if (!visible) return;
      const dt = Math.min(deltaMs, 50) / 1000;
      if (moving) points.push({ x: head.x, y: head.y, life: 1 });
      for (const p of points) p.life -= dt / 0.95;
      while (points.length && points[0].life <= 0) points.shift();
      if (!points.length) {
        if (drawn) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); drawn = false; }
        return;
      }
      drawn = true;
      flow += dt * 38;
      // The liquid: circles along the path, wide at the head and thinning to the tail.
      const shape = new Path2D();
      for (let i = 0; i < points.length; i++) {
        const p = points[i], prev = points[i - 1];
        const rad = 5 + 74 * Math.pow(p.life, 1.35) * (0.92 + 0.08 * Math.sin(time * 9 + i * 0.7));
        if (prev) {
          const ddx = p.x - prev.x, ddy = p.y - prev.y, d = Math.hypot(ddx, ddy), n = Math.floor(d / Math.max(4, rad * 0.35));
          for (let k = 1; k < n; k++) { const q = k / n, x = prev.x + ddx * q, y = prev.y + ddy * q; shape.moveTo(x + rad, y); shape.arc(x, y, rad, 0, TAU); }
        }
        shape.moveTo(p.x + rad, p.y);
        shape.arc(p.x, p.y, rad, 0, TAU);
      }
      // Letters ∩ liquid, filled with the flowing ASCII ink.
      paintMask(time);
      octx.setTransform(dpr, 0, 0, dpr, 0, 0);
      octx.globalCompositeOperation = "source-over";
      octx.clearRect(0, 0, W, H);
      pattern.setTransform(new DOMMatrix().translate(flow, flow * 0.4).scale(1 / tdpr));
      octx.fillStyle = pattern;
      octx.fill(shape);
      octx.globalCompositeOperation = "destination-in";
      octx.drawImage(mask, 0, 0, W, H);
      octx.globalCompositeOperation = "source-over";
      // The liquid itself is only a faint sheen; the inked letters go on top.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "rgba(255,255,255,0.07)";
      ctx.fill(shape);
      ctx.drawImage(off, 0, 0, W, H);
    });
  }

  // ---- Boot ----------------------------------------------------------------------------
  async function start() {
    const fontsReady = Promise.all([
      document.fonts?.load('500 12px "Geist Mono"'),
      document.fonts?.load('600 12px "Geist Mono"'),
      document.fonts?.load('450 64px "Geist"'),
      document.fonts?.load('800 64px "Geist"'),
    ].filter(Boolean));
    await Promise.race([fontsReady, new Promise((resolve) => setTimeout(resolve, 1200))]).catch(() => {});
    initHearts();
    initHero();
    playIntro();
    initScroll();
    initCursor();
    initMagnetic();
    initSpotlights();
    initFinaleAscii();
    initFinaleLiquid();
    if (ScrollTrigger) ScrollTrigger.refresh();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
