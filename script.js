/* =========================================================
   MLX LoRA Studio — animated ember background
   Port of Sources/MLXLoRAStudio/Views/SharedControls.swift
   `StudioAnimatedBackground` (the ember star sky).

   - 3 ember orbs that drift with sine waves
   - 4,200 stars with seeded random positions
   - twinkle (sin envelope), wobble (low-freq sin), flare (bright only)
   - rAF loop, time-based dt, subpixel jitter noise on velocity
   ========================================================= */

(() => {
  "use strict";

  // ---- Palettes (matches the Swift code in dark mode; remapped for light) ----
  // In light mode we paint deep, saturated ember dots on a warm cream wash
  // so the stars are actually visible against the white backdrop.
  const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const DARK_PALETTE = [
    [209, 92, 15],   // warm orange
    [209, 56, 31],   // deep orange-red
    [209, 140, 51],  // amber / peach
    [189, 71, 36],   // ember
  ];
  const DARK_FLARE = [255, 71, 10];
  // Light-mode palette: dark, warm, very saturated so the dots register on white.
  const LIGHT_PALETTE = [
    [180, 60, 10],
    [170, 40, 18],
    [200, 110, 30],
    [150, 45, 22],
  ];
  const LIGHT_FLARE = [200, 50, 15];
  const PALETTE = isDark ? DARK_PALETTE : LIGHT_PALETTE;
  const FLARE_RGB = isDark ? DARK_FLARE : LIGHT_FLARE;

  // Orbs (x, y, radius, color, opacity, driftX, driftY, phase)
  // Light-mode orbs are less saturated and use lower alpha so they tint
  // the page instead of dominating it.
  const ORBS = isDark
    ? [
        { x: 0.48, y: 0.48, r: 0.42, rgb: [255, 51, 8],   o: 0.18, dx:  0.010, dy:  0.008, ph: 0.1 },
        { x: 0.18, y: 0.24, r: 0.24, rgb: [230, 36, 10],  o: 0.12, dx:  0.014, dy:  0.010, ph: 1.7 },
        { x: 0.82, y: 0.70, r: 0.26, rgb: [255, 107, 20], o: 0.10, dx: -0.012, dy:  0.010, ph: 3.2 },
      ]
    : [
        { x: 0.48, y: 0.48, r: 0.42, rgb: [255, 130, 60],  o: 0.10, dx:  0.010, dy:  0.008, ph: 0.1 },
        { x: 0.18, y: 0.24, r: 0.24, rgb: [240, 100, 50],  o: 0.07, dx:  0.014, dy:  0.010, ph: 1.7 },
        { x: 0.82, y: 0.70, r: 0.26, rgb: [255, 150, 70],  o: 0.06, dx: -0.012, dy:  0.010, ph: 3.2 },
      ];

  const STAR_COUNT = 4200;

  // ---- Seeded RNG (splitmix64, mirrors SeededGenerator in Swift) ----
  function makeRng(seed) {
    let state = (seed === 0 ? 0xDEADBEEFn : seed) >>> 0;
    return function () {
      state = (state + 0x9E3779B97F4A7C15n) & 0xFFFFFFFFFFFFFFFFn;
      let z = state;
      z = (z ^ (z >> 30n)) * 0xBF58476D1CE4E5B9n & 0xFFFFFFFFFFFFFFFFn;
      z = (z ^ (z >> 27n)) * 0x94D049BB133111EBn & 0xFFFFFFFFFFFFFFFFn;
      z = z ^ (z >> 31n);
      return Number(z & 0xFFFFFFFFn) / 0xFFFFFFFF;
    };
  }

  // Mutable per-star physics
  function buildStars() {
    const rng = makeRng(0x5EED5A0Fn);
    const stars = [];
    for (let i = 0; i < STAR_COUNT; i++) {
      const isBright = rng() > 0.90;
      const isSoft = rng() > 0.70;
      const baseSize = isBright
        ? 0.9 + rng() * 1.0
        : 0.18 + rng() * 0.67;
      const angle = rng() * Math.PI * 2;
      const mag = 0.00008 + rng() * 0.00047;
      const vx = Math.cos(angle) * mag;
      const vy = Math.sin(angle) * mag;
      const starRng = makeRng(
        ((0xA1B2C3D4n << 32n) | BigInt(i & 0xFFFFFFFF)) & 0xFFFFFFFFFFFFFFFFn
      );
      stars.push({
        // base properties
        life: 18.0 + rng() * 28.0,
        birthOffset: rng() * 46.0,
        x0: rng(),
        y0: rng(),
        wobbleAmp: 1.4 + rng() * 7.6,
        wobbleFreq: 0.08 + rng() * 0.34,
        twinkleSpeed: 0.25 + rng() * 1.40,
        twinkleDepth: 0.20 + rng() * 0.58,
        size: baseSize,
        colorIndex: Math.floor(rng() * 4),
        blurRatio: isSoft ? 0.002 + rng() * 0.010 : rng() * 0.003,
        baseOpacity: isBright
          ? (isDark ? 0.55 + rng() * 0.45 : 0.85 + rng() * 0.15)
          : (isDark ? 0.10 + rng() * 0.48 : 0.45 + rng() * 0.50),
        glowScale: isBright ? 2.8 + rng() * 4.0 : 1.3 + rng() * 2.1,
        // mutable
        vx, vy,
        ox: 0, oy: 0,
        nseed: starRng(),
      });
    }
    return stars;
  }

  function nextRng(state) {
    // splitmix64
    let z = (state + 0x9E3779B97F4A7C15n) & 0xFFFFFFFFFFFFFFFFn;
    z = (z ^ (z >> 30n)) * 0xBF58476D1CE4E5B9n & 0xFFFFFFFFFFFFFFFFn;
    z = (z ^ (z >> 27n)) * 0x94D049BB133111EBn & 0xFFFFFFFFFFFFFFFFn;
    z = z ^ (z >> 31n);
    return z & 0xFFFFFFFFn;
  }

  // ---- Canvas setup ----
  const canvas = document.getElementById("ember-sky");
  if (!canvas) {
    console.error("[ember-sky] canvas element not found in DOM");
    return;
  }
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) {
    console.error("[ember-sky] could not get 2d context");
    return;
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let last = performance.now() / 1000;

  let width = 0, height = 0;
  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener("resize", resize, { passive: true });

  const stars = buildStars();
  console.log(
    `[ember-sky] running: ${stars.length} stars, ${isDark ? "dark" : "light"} mode, ` +
      `${width}x${height} (dpr ${dpr})`
  );

  // ---- Drawing ----
  function drawOrbs(t) {
    const base = Math.max(width, height);
    for (const orb of ORBS) {
      const pulse = 0.86 + 0.14 * Math.sin(t * 0.24 + orb.ph);
      const x = (orb.x + orb.dx * Math.sin(t * 0.035 + orb.ph)) * width;
      const y = (orb.y + orb.dy * Math.cos(t * 0.030 + orb.ph)) * height;
      const r = orb.r * base * pulse;

      // Radial gradient via offscreen approach: concentric fill, blurred
      // using a thick shadow blur.
      const grd = ctx.createRadialGradient(x, y, r * 0.08, x, y, r);
      const [cr, cg, cb] = orb.rgb;
      grd.addColorStop(0.00, `rgba(${cr}, ${cg}, ${cb}, ${orb.o * 0.95})`);
      grd.addColorStop(0.45, `rgba(${cr}, ${cg}, ${cb}, ${orb.o * 0.32})`);
      grd.addColorStop(1.00, `rgba(${cr}, ${cg}, ${cb}, 0)`);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = grd;
      ctx.shadowColor = `rgba(${cr}, ${cg}, ${cb}, ${orb.o})`;
      ctx.shadowBlur = r * 0.18;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawStars(t, dt) {
    const blurBase = Math.min(width, height);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];

      // life cycle
      const tc = (t + s.birthOffset) % s.life;
      const lp = tc / s.life;
      const twinkle =
        1.0 - s.twinkleDepth +
        s.twinkleDepth * (0.5 + 0.5 * Math.sin(t * s.twinkleSpeed + s.birthOffset * 2.1));

      const FADE_IN = 0.18, FADE_OUT = 0.18;
      let env;
      if (lp < FADE_IN) env = lp / FADE_IN;
      else if (lp > 1.0 - FADE_OUT) env = (1.0 - lp) / FADE_OUT;
      else env = 1.0;
      if (env <= 0.001) continue;

      // noise jitter on velocity (splitmix64 step on the seed)
      let ns = s.nseed;
      ns = nextRng(ns);
      const n1 = (ns / 0xFFFFFFFF) - 0.5;
      ns = nextRng(ns);
      const n2 = (ns / 0xFFFFFFFF) - 0.5;
      s.nseed = ns;

      const NOISE_AMP = 0.00026;
      s.vx = (s.vx + n1 * NOISE_AMP) * 0.992;
      s.vy = (s.vy + n2 * NOISE_AMP) * 0.992;

      const VMAX = 0.0065;
      const vmag = Math.hypot(s.vx, s.vy);
      if (vmag > VMAX) {
        s.vx = (s.vx / vmag) * VMAX;
        s.vy = (s.vy / vmag) * VMAX;
      }

      s.ox += s.vx * dt * 42;
      s.oy += s.vy * dt * 42;

      let x = s.x0 + s.ox;
      let y = s.y0 + s.oy;
      x = ((x % 1) + 1) % 1;
      y = ((y % 1) + 1) % 1;
      s.ox = x - s.x0;
      s.oy = y - s.y0;

      const rx = x * width;
      const ry = y * height;
      const wx = Math.sin(t * s.wobbleFreq + s.birthOffset) * s.wobbleAmp;
      const wy = Math.cos(t * s.wobbleFreq * 1.13 + s.birthOffset * 1.7) * s.wobbleAmp;

      const radius = s.size * (0.75 + 0.35 * twinkle);
      const blur = s.blurRatio * blurBase;
      const alpha = s.baseOpacity * twinkle * env;

      const c = PALETTE[s.colorIndex];
      const fill = `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})`;

      if (radius > 0.65) {
        // soft flare
        const flareR = radius * s.glowScale;
        const flareAlpha = Math.min(0.30, s.baseOpacity * twinkle * 0.34);
        const fgrd = ctx.createRadialGradient(rx + wx, ry + wy, 0, rx + wx, ry + wy, radius + flareR);
        fgrd.addColorStop(0.0, `rgba(${FLARE_RGB[0]}, ${FLARE_RGB[1]}, ${FLARE_RGB[2]}, ${flareAlpha})`);
        fgrd.addColorStop(1.0, `rgba(${FLARE_RGB[0]}, ${FLARE_RGB[1]}, ${FLARE_RGB[2]}, 0)`);
        ctx.fillStyle = fgrd;
        ctx.beginPath();
        ctx.arc(rx + wx, ry + wy, radius + flareR, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = fill;
      ctx.shadowColor = fill;
      ctx.shadowBlur = blur > 0.05 ? blur : 0;
      ctx.beginPath();
      ctx.arc(rx + wx, ry + wy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ---- RAF loop ----
  function frame(now) {
    try {
      const t = now / 1000;
      const dt = Math.min(Math.max(t - last, 1 / 240), 1 / 30);
      last = t;

      ctx.clearRect(0, 0, width, height);
      drawOrbs(t);
      drawStars(t, dt);
    } catch (err) {
      console.error("[ember-sky] draw error:", err);
      return; // stop the loop on first error so the console doesn't spam
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
