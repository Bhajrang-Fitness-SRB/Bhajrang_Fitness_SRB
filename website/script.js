/* ============================================================
   BHAJRANG FITNESS — interactions & animation
   ============================================================ */
(() => {
  "use strict";
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const CFG = window.SITE || {};

  /* ---------- config wiring (links, contact details) ---------- */
  const appBase = (CFG.APP_URL || "").replace(/\/$/, "");
  $$("[data-app]").forEach((a) => {
    a.href = appBase + a.dataset.app;
    a.target = "_blank";
    a.rel = "noopener";
  });

  const field = (name) => $(`[data-field="${name}"]`);
  let hasContact = false;
  const show = (el, set) => { if (el) { set && set(el); el.hidden = false; hasContact = true; } };

  if (CFG.ADDRESS) show(field("address"), (e) => (e.textContent = CFG.ADDRESS));
  if (CFG.PHONE) show(field("phone"), (e) => { e.textContent = CFG.PHONE; e.href = "tel:" + CFG.PHONE.replace(/\s+/g, ""); });
  if (CFG.WHATSAPP) {
    const wa = "https://wa.me/" + CFG.WHATSAPP.replace(/\D/g, "") + "?text=" + encodeURIComponent("Hi Bhajrang Fitness, I'd like to know more about joining.");
    show(field("whatsapp"), (e) => { e.href = wa; e.target = "_blank"; e.rel = "noopener"; });
    const cta = $("[data-whatsapp]");
    if (cta) { cta.href = wa; cta.target = "_blank"; cta.rel = "noopener"; cta.hidden = false; }
  }
  if (CFG.MAP_URL) show(field("map"), (e) => (e.href = CFG.MAP_URL));
  ["instagram", "facebook", "youtube"].forEach((k) => {
    const url = CFG[k.toUpperCase()];
    if (url) show(field(k), (e) => (e.href = url));
  });
  if (hasContact) $("#contactBlock").hidden = false;
  $("#year").textContent = new Date().getFullYear();

  /* ---------- hero word stagger ---------- */
  $$(".hero__title .word").forEach((w, i) => w.style.setProperty("--i", i));

  /* ---------- nav + progress ---------- */
  const nav = $("#nav");
  const progress = $("#progress");
  const burger = $("#burger");
  const links = $("#navLinks");

  const closeMenu = () => {
    links.classList.remove("is-open");
    burger.setAttribute("aria-expanded", "false");
  };
  burger.addEventListener("click", () => {
    const open = links.classList.toggle("is-open");
    burger.setAttribute("aria-expanded", String(open));
  });
  $$("a", links).forEach((a) => a.addEventListener("click", closeMenu));

  /* ---------- scroll handler (rAF-throttled) ---------- */
  const parallaxEls = $$("[data-parallax]");
  let ticking = false;
  const onScroll = () => {
    const y = window.scrollY;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    nav.classList.toggle("is-scrolled", y > 30);
    progress.style.transform = `scaleX(${max > 0 ? Math.min(y / max, 1) : 0})`;
    if (!reduceMotion && y < window.innerHeight * 1.4) {
      parallaxEls.forEach((el) => {
        el.style.transform = `translate3d(0, ${y * parseFloat(el.dataset.parallax)}px, 0)`;
      });
    }
    ticking = false;
  };
  window.addEventListener("scroll", () => {
    if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
  }, { passive: true });
  onScroll();

  /* ---------- reveal on scroll ---------- */
  const revealEls = $$(".reveal, .reveal-left, .reveal-right");
  // stagger siblings inside the same grid/section
  const groups = new Map();
  revealEls.forEach((el) => {
    const parent = el.parentElement;
    const n = groups.get(parent) || 0;
    el.style.setProperty("--d", Math.min(n * 0.09, 0.6) + "s");
    groups.set(parent, n + 1);
  });

  if ("IntersectionObserver" in window && !reduceMotion) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
      });
    }, { threshold: 0.14, rootMargin: "0px 0px -6% 0px" });
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("is-in"));
  }

  /* ---------- count-up numbers ---------- */
  const counters = $$("[data-count]");
  const runCount = (el) => {
    const target = parseFloat(el.dataset.count);
    const dec = parseInt(el.dataset.dec || "0", 10);
    if (reduceMotion) { el.textContent = target.toFixed(dec); return; }
    const dur = 1700;
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min((now - t0) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 4);
      el.textContent = (target * eased).toFixed(dec);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  if ("IntersectionObserver" in window) {
    const co = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { runCount(e.target); co.unobserve(e.target); } });
    }, { threshold: 0.6 });
    counters.forEach((c) => co.observe(c));
  } else {
    counters.forEach(runCount);
  }

  /* ---------- 3D tilt + shine ---------- */
  if (finePointer && !reduceMotion) {
    $$("[data-tilt]").forEach((el) => {
      const strength = el.classList.contains("card") ? 7 : 9;
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        el.style.setProperty("--mx", px * 100 + "%");
        el.style.setProperty("--my", py * 100 + "%");
        el.style.setProperty("--tilt", `perspective(900px) rotateX(${(0.5 - py) * strength}deg) rotateY(${(px - 0.5) * strength}deg) translateZ(0)`);
      });
      el.addEventListener("pointerleave", () => el.style.setProperty("--tilt", "none"));
    });

    /* magnetic buttons */
    $$(".magnetic").forEach((b) => {
      b.addEventListener("pointermove", (e) => {
        const r = b.getBoundingClientRect();
        const x = (e.clientX - (r.left + r.width / 2)) * 0.22;
        const y = (e.clientY - (r.top + r.height / 2)) * 0.3;
        b.style.transform = `translate(${x}px, ${y}px)`;
      });
      b.addEventListener("pointerleave", () => (b.style.transform = ""));
    });

    /* cursor glow */
    const glow = $("#cursorGlow");
    let gx = 0, gy = 0, tx = 0, ty = 0, glowOn = false;
    window.addEventListener("pointermove", (e) => {
      tx = e.clientX; ty = e.clientY;
      if (!glowOn) { glowOn = true; glow.style.opacity = 1; gx = tx; gy = ty; }
    }, { passive: true });
    (function loop() {
      gx += (tx - gx) * 0.12; gy += (ty - gy) * 0.12;
      glow.style.transform = `translate3d(${gx}px, ${gy}px, 0)`;
      requestAnimationFrame(loop);
    })();
  }

  /* ---------- ember particles ---------- */
  const canvas = $("#embers");
  if (canvas && !reduceMotion) {
    const ctx = canvas.getContext("2d");
    const isSmall = window.innerWidth < 700;
    const COUNT = isSmall ? 32 : 78;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let W = 0, H = 0, running = true;

    const resize = () => {
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const palette = ["255,214,90", "255,168,40", "255,110,20", "255,70,10"];
    const make = (initial) => ({
      x: Math.random() * W,
      y: initial ? Math.random() * H : H + 20,
      r: 0.6 + Math.random() * 2.4,
      vy: 0.35 + Math.random() * 1.15,
      sway: Math.random() * Math.PI * 2,
      swaySpeed: 0.008 + Math.random() * 0.02,
      amp: 0.25 + Math.random() * 0.7,
      life: 0.35 + Math.random() * 0.65,
      color: palette[(Math.random() * palette.length) | 0],
    });
    const ps = Array.from({ length: COUNT }, () => make(true));

    const frame = () => {
      if (!running) return;
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        p.sway += p.swaySpeed;
        p.x += Math.sin(p.sway) * p.amp;
        p.y -= p.vy;
        const t = p.y / H;                 // 1 at bottom → 0 at top
        const a = Math.max(0, Math.min(1, t * 1.2)) * p.life;
        if (p.y < -20 || a <= 0.01) { ps[i] = make(false); continue; }
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 6);
        g.addColorStop(0, `rgba(${p.color},${a})`);
        g.addColorStop(0.35, `rgba(${p.color},${a * 0.35})`);
        g.addColorStop(1, `rgba(${p.color},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 6, 0, Math.PI * 2);
        ctx.fill();
      }
      requestAnimationFrame(frame);
    };
    frame();
    document.addEventListener("visibilitychange", () => {
      running = !document.hidden;
      if (running) frame();
    });
  }
})();
