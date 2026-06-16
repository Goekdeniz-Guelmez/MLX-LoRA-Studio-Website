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

/* =========================================================
   MLX LoRA Studio — Testimonials carousel
   Auto-scrolling X / Twitter-style tweet carousel with:
     - dot indicator (clickable, jumps to that slide)
     - self-rescheduling auto-advance (resilient to browser
       throttling on Safari, Edge, Firefox, mobile)
     - pauses on hover, focus, and touch interaction
     - auto-resumes after a configurable idle delay
     - respects prefers-reduced-motion
     - rAF-driven render so the slide is always centered,
       even after the address bar shows/hides on iOS
   The track is centered in the viewport and only one slide
   is visible at a time; the rest sit off-screen until their
   turn.
   ========================================================= */
(() => {
  "use strict";

  // ---- Bail out cleanly on very old browsers --------------------------
  if (!document.querySelector || !window.requestAnimationFrame) return;

  const root = document.querySelector("[data-carousel]");
  if (!root) return;

  const viewport = root.querySelector("[data-carousel-viewport]");
  const track    = root.querySelector("[data-carousel-track]");
  const dotsHost = root.querySelector("[data-carousel-dots]");
  const slides   = Array.from(track.querySelectorAll("[data-carousel-slide]"));

  if (!viewport || !track || slides.length === 0) return;

  // ---- Build dot indicator ---------------------------------------------
  const dots = slides.map((_, i) => {
    const li  = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "carousel__dot";
    btn.setAttribute("aria-label", `Show tweet ${i + 1} of ${slides.length}`);
    btn.setAttribute("aria-selected", i === 0 ? "true" : "false");
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      goTo(i, true);
    });
    li.appendChild(btn);
    dotsHost.appendChild(li);
    return btn;
  });

  // ---- State -----------------------------------------------------------
  let index = 0;             // active slide
  let autoTimer = null;      // pending setTimeout id (self-rescheduling)
  let autoPaused = false;    // user is interacting right now
  let prefersReducedMotion = false;
  const AUTO_MS = 5500;      // ms between auto-advances
  const RESUME_MS = 1800;    // ms after interaction before auto-advance resumes

  const motionMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
  prefersReducedMotion = motionMQ.matches;
  // Some older Safari builds don't dispatch change events on the MQ
  // object directly — listen to both for safety.
  const onMotionChange = (e) => { prefersReducedMotion = e.matches; };
  if (typeof motionMQ.addEventListener === "function") {
    motionMQ.addEventListener("change", onMotionChange);
  } else if (typeof motionMQ.addListener === "function") {
    motionMQ.addListener(onMotionChange);
  }

  // ---- Layout helpers --------------------------------------------------
  // Read a CSS custom property from the .carousel element (e.g. --slide-w).
  function getSlideWidth() {
    const raw = getComputedStyle(root).getPropertyValue("--slide-w").trim();
    const v = parseFloat(raw);
    return Number.isFinite(v) ? v : viewport.clientWidth;
  }
  function getGap() {
    const raw = getComputedStyle(root).getPropertyValue("--gap").trim();
    const v = parseFloat(raw);
    return Number.isFinite(v) ? v : 0;
  }
  // Width of the viewport's *content box* (excludes padding), so centering
  // math is correct regardless of box-sizing or padding.
  function getViewportContentWidth() {
    const cs = getComputedStyle(viewport);
    const padL = parseFloat(cs.paddingLeft)  || 0;
    const padR = parseFloat(cs.paddingRight) || 0;
    // Prefer the content rect (border-box aware), fall back to clientWidth.
    const rect = viewport.getBoundingClientRect();
    const w = rect.width || viewport.clientWidth;
    return Math.max(0, w - padL - padR);
  }

  // ---- Render ----------------------------------------------------------
  // Center the active slide inside the viewport's content box.
  function render() {
    const w   = getSlideWidth();
    const gap = getGap();
    const vw  = getViewportContentWidth();

    // distance from the track's left edge to the active slide's center
    const slideCenter = index * (w + gap) + w / 2;
    // we want slideCenter to land at vw/2
    const offset = vw / 2 - slideCenter;

    // Use both prefixed and standard for old WebKit.
    track.style.transform = "translate3d(" + offset + "px, 0, 0)";
    track.style.webkitTransform = track.style.transform;

    slides.forEach((s, i) => {
      s.setAttribute("aria-hidden", i === index ? "false" : "true");
    });
    dots.forEach((d, i) => {
      d.setAttribute("aria-selected", i === index ? "true" : "false");
    });
  }

  // ---- Navigation ------------------------------------------------------
  function goTo(i, fromUser) {
    const n = slides.length;
    const next = ((i % n) + n) % n;  // safe modulo for any i
    if (next === index) {
      if (fromUser) scheduleResume();
      return;
    }
    index = next;
    render();
    if (fromUser) scheduleResume();
  }

  // ---- Auto-advance (self-rescheduling) --------------------------------
  // We use a self-rescheduling setTimeout instead of setInterval so that:
  //   1. Safari/Edge throttling can't permanently desync the cadence
  //   2. Visibility / hover pauses cancel cleanly without a stale tick
  //   3. A new schedule can be armed with a different delay (e.g. resume)
  function scheduleNext(delay) {
    cancelAuto();
    if (prefersReducedMotion)        return;
    if (autoPaused)                  return;
    if (document.hidden)             return;
    if (slides.length < 2)           return;
    const wait = typeof delay === "number" ? delay : AUTO_MS;
    autoTimer = window.setTimeout(() => {
      autoTimer = null;
      // Guard against the tab being hidden while we slept.
      if (document.hidden || autoPaused) return;
      goTo(index + 1, false);
      scheduleNext();  // chain the next tick
    }, wait);
  }
  function cancelAuto() {
    if (autoTimer !== null) {
      clearTimeout(autoTimer);
      autoTimer = null;
    }
  }
  // Resume after a short idle so people can read the slide they
  // jumped to without it immediately moving on.
  function scheduleResume() {
    cancelAuto();
    autoPaused = true;
    window.setTimeout(() => {
      autoPaused = false;
      scheduleNext(AUTO_MS);
    }, RESUME_MS);
  }

  // ---- Pause on interaction --------------------------------------------
  // Use a single "paused" flag + timers instead of paired enter/leave
  // listeners, so a missed event can never leave us stuck off.
  let pauseTimer = null;
  function pauseForInteraction(ms) {
    autoPaused = true;
    cancelAuto();
    if (pauseTimer) clearTimeout(pauseTimer);
    pauseTimer = window.setTimeout(() => {
      autoPaused = false;
      pauseTimer = null;
      scheduleNext(AUTO_MS);
    }, ms);
  }

  // Mouse: pause on hover, resume on leave.
  // `mouseenter`/`mouseleave` don't bubble, so we listen on root directly.
  root.addEventListener("mouseenter", () => pauseForInteraction(RESUME_MS));
  root.addEventListener("mouseleave", () => {
    if (pauseTimer) { clearTimeout(pauseTimer); pauseTimer = null; }
    autoPaused = false;
    scheduleNext(AUTO_MS);
  });

  // Touch / pen: pause while the pointer is down, resume on release.
  // We intentionally don't pause on plain `pointerdown` anymore — that
  // was firing on any click and never resuming, killing auto-advance.
  root.addEventListener("pointerdown",   () => pauseForInteraction(RESUME_MS + 2000));
  root.addEventListener("pointerup",     () => {
    if (pauseTimer) { clearTimeout(pauseTimer); pauseTimer = null; }
    autoPaused = false;
    scheduleNext(AUTO_MS);
  });
  root.addEventListener("pointercancel", () => {
    if (pauseTimer) { clearTimeout(pauseTimer); pauseTimer = null; }
    autoPaused = false;
    scheduleNext(AUTO_MS);
  });

  // Focus-within: pause while keyboard users are tabbing through the dots.
  root.addEventListener("focusin",  () => pauseForInteraction(RESUME_MS + 1500));
  root.addEventListener("focusout", () => {
    // focusout fires for every child; only resume when focus leaves the
    // carousel entirely.
    window.setTimeout(() => {
      if (!root.contains(document.activeElement)) {
        if (pauseTimer) { clearTimeout(pauseTimer); pauseTimer = null; }
        autoPaused = false;
        scheduleNext(AUTO_MS);
      }
    }, 0);
  });

  // Visibility: hidden tabs must NOT run our timer. We re-arm on resume.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      cancelAuto();
    } else if (!autoPaused) {
      scheduleNext(AUTO_MS);
    }
  });

  // ---- Re-render on resize / orientation change -----------------------
  // Use both rAF and a small debounce so rapid resize events (iOS
  // address-bar show/hide) still produce a correct centering.
  let resizeRaf = 0;
  let resizeTimer = 0;
  function onResize() {
    cancelAnimationFrame(resizeRaf);
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeRaf = requestAnimationFrame(render);
    resizeTimer = window.setTimeout(render, 150);
  }
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", onResize);

  // Re-render once webfonts settle — the slide width can change.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(render).catch(() => {});
  }

  // ---- Boot ------------------------------------------------------------
  // Don't run at all in browsers that don't support the features we need.
  if (prefersReducedMotion) {
    // Still render once so the first slide is visible; just no auto-advance.
    render();
    return;
  }

  // Defer the initial schedule to the next frame so the browser has
  // finished layout. This avoids a race on first paint where the
  // slide width is still 0.
  requestAnimationFrame(() => {
    render();
    scheduleNext(AUTO_MS);
  });
})();
