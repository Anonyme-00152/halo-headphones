/* HALO — animations sur téléphone et tablette (< 992 px).
   La version desktop du site rejoue une chorégraphie au scroll (animation du casque, rideaux,
   textes qui se colorent, séquences épinglées…), mais Taptop la désactive sous 992 px et affiche
   des sections « --static » immobiles. Ce script rejoue ces effets sur les sections mobiles.
   Styles associés : halo-mobile.css. */
(function () {
  'use strict';
  if (!window.matchMedia('(max-width: 991px)').matches || !window.gsap || !window.ScrollTrigger) return;

  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true });

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const make = (tag, className, count = 0) => {
    const el = document.createElement(tag);
    el.className = className;
    for (let i = 0; i < count; i++) el.appendChild(document.createElement('i'));
    return el;
  };

  // ---------- Intro : écran de chargement + scroll bloqué 2,6 s, comme sur desktop ----------
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);
  const root = document.documentElement;
  const block = e => e.preventDefault();
  root.style.overflow = 'hidden';
  window.addEventListener('touchmove', block, { passive: false });
  const preload = $('section.preload');
  if (preload) gsap.to(preload, { autoAlpha: 0, duration: 0.7, delay: 1.7, ease: 'power1.inOut' });
  setTimeout(() => {
    root.style.overflow = '';
    window.removeEventListener('touchmove', block);
    window.scrollTo(0, 0);
    ScrollTrigger.refresh();
  }, 2600);

  // Élément qui apparaît en glissant/zoomant pendant qu'il entre dans l'écran.
  function reveal(target, from, trigger = {}) {
    const el = typeof target === 'string' ? $(target) : target;
    if (!el) return;
    gsap.fromTo(el, { autoAlpha: 0, ...from }, {
      autoAlpha: 1, x: 0, y: 0, xPercent: 0, yPercent: 0, scale: 1, ease: 'power1.out',
      scrollTrigger: { trigger: el, start: 'top 95%', end: 'top 60%', scrub: 0.6, ...trigger },
    });
  }

  // Découpe un texte en mots (en gardant les retours à la ligne) pour les colorer un à un.
  function words(target) {
    const el = $(target);
    if (!el) return [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) if (walker.currentNode.nodeValue.trim()) nodes.push(walker.currentNode);
    const out = [];
    for (const node of nodes) {
      const frag = document.createDocumentFragment();
      for (const part of node.nodeValue.split(/(\s+)/)) {
        if (!part) continue;
        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); continue; }
        const span = make('span', 'halo-m-word');
        span.textContent = part;
        frag.appendChild(span);
        out.push(span);
      }
      node.replaceWith(frag);
    }
    return out;
  }

  function fillWords(target, from, to) {
    const list = words(target);
    if (!list.length) return;
    gsap.fromTo(list, { color: from }, {
      color: to, ease: 'none', stagger: 0.1,
      scrollTrigger: { trigger: $(target), start: 'top 85%', end: 'bottom 45%', scrub: true },
    });
  }

  // Amène un slider Swiper en boucle sur la slide `target`. slideToLoop() ne bouge pas ces sliders
  // (boucle avec peu de slides), on avance donc slide par slide : sauts instantanés, dernier pas animé.
  function goTo(swiper, target, speed = 600) {
    for (let guard = 0; swiper.realIndex !== target && guard < 10; guard++) {
      const lastStep = Math.abs(target - swiper.realIndex) === 1;
      swiper.animating = false;
      if (target > swiper.realIndex) swiper.slideNext(lastStep ? speed : 0);
      else swiper.slidePrev(lastStep ? speed : 0);
    }
  }

  // Séquence épinglée qui fait avancer un slider Swiper au rythme du scroll.
  function scrollSlider({ section, swiperEl, steps, perStep = 80, onChange }) {
    const host = $(section);
    if (!host) return;
    let current = -1;
    ScrollTrigger.create({
      trigger: host,
      start: 'top top',
      end: `+=${(steps - 1) * perStep}%`,
      pin: true,
      anticipatePin: 1,
      onUpdate(self) {
        const swiper = $(swiperEl) && $(swiperEl).swiper;
        if (!swiper) return;
        swiper.allowTouchMove = false;
        const index = Math.min(steps - 1, Math.floor(self.progress * steps));
        if (index === current) return;
        current = index;
        goTo(swiper, index);
        if (onChange) onChange(swiper);
      },
    });
  }

  const zoomActive = swiper => {
    const img = swiper.slides[swiper.activeIndex] && swiper.slides[swiper.activeIndex].querySelector('img');
    if (img) gsap.fromTo(img, { scale: 1.15 }, { scale: 1, duration: 1.2, ease: 'power2.out' });
  };

  function setup() {
    // ---------- 1. Accueil : le casque tourne au scroll, puis des rideaux blancs recouvrent l'écran ----------
    const cover = $('#iyzjstuxs_0');
    const coverBox = $('#i4ig4m74q_0');
    if (cover && coverBox) {
      coverBox.style.position = 'relative';
      coverBox.style.overflow = 'hidden';
      const hero = make('div', 'halo-m-hero');
      const canvas = document.createElement('canvas');
      hero.appendChild(canvas);
      const shade = make('div', 'halo-m-shade');
      const curtains = make('div', 'halo-m-curtains', 6);
      coverBox.prepend(hero);
      coverBox.append(shade, curtains);
      gsap.set(curtains.children, { yPercent: 101 });

      const ctx = canvas.getContext('2d');
      let frames = [];
      let wanted = 0;
      const draw = () => {
        if (!frames.length) return;
        // image chargée la plus proche de celle demandée
        let img = null;
        for (let d = 0; d < frames.length && !img; d++) {
          img = [frames[wanted - d], frames[wanted + d]].find(f => f && f.complete && f.naturalWidth) || null;
        }
        if (!img) return;
        const cw = canvas.width, ch = canvas.height;
        const s = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
        const w = img.naturalWidth * s, h = img.naturalHeight * s;
        ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
      };
      const fit = () => {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.round(hero.clientWidth * dpr);
        canvas.height = Math.round(hero.clientHeight * dpr);
        draw();
      };
      fetch('f/hero-mobile.json')
        .then(r => r.json())
        .then(data => {
          frames = data.assets.map((a, i) => {
            const img = new Image();
            img.decoding = 'async';
            img.onload = () => {
              if (i === 0) { cover.classList.add('halo-m-ready'); fit(); }
              if (i === wanted) draw();
            };
            img.src = a.p;
            return img;
          });
        })
        .catch(() => {}); // sans la séquence, l'image fixe d'origine reste affichée
      window.addEventListener('resize', fit);

      const state = { p: 0 };
      gsap.timeline({
        scrollTrigger: { trigger: cover, start: 'top top', end: '+=180%', pin: true, scrub: 0.5, anticipatePin: 1 },
      })
        .to(state, {
          p: 1, duration: 0.72, ease: 'none',
          onUpdate: () => { wanted = Math.round(state.p * Math.max(0, frames.length - 1)); draw(); },
        })
        .to(shade, { opacity: 0.75, duration: 0.28, ease: 'none' }, 0.72)
        .to(curtains.children, { yPercent: 0, duration: 0.18, stagger: 0.02, ease: 'power1.inOut' }, 0.72);
    }

    // ---------- 2. Spécifications : titre, photo et cartes qui montent ----------
    reveal('#irv6cx8mg_0', { y: 90 });
    reveal('#iivj6t60b_0', { y: 70 });
    $$('#i6u5b0o3x_0 > *').forEach(card => reveal(card, { y: 140 }, { start: 'top 100%', end: 'top 65%' }));

    // ---------- 3. Transition : bandes noires qui s'étirent, puis « Who it's for » ----------
    const who = $('#icu3mt31j_0');
    if (who) {
      const wipe = make('div', 'halo-m-wipe', 4);
      who.parentNode.insertBefore(wipe, who);
      gsap.to(wipe.children, {
        scaleX: 1, ease: 'power1.out', stagger: 0.12,
        scrollTrigger: { trigger: wipe, start: 'top top', end: '+=100%', pin: true, scrub: 0.5 },
      });
    }
    fillWords('#iwqe5b6fn_0', 'rgba(255,255,255,0.18)', '#ffffff');
    reveal('#i8c9qivfs_0', { y: 30 });
    fillWords('#idpcsvwdq_0', 'rgba(255,255,255,0.18)', '#ffffff');
    $$('#ivb8l3mrf_0 > *').forEach(item => reveal(item, { xPercent: 110 }, { start: 'top 95%', end: 'top 55%' }));
    reveal('#i1fv3adl9_0', { scale: 0.7 }, { start: 'top 100%', end: 'top 40%' });

    // ---------- 4. Paper : le fond devient noir, puis les cartes défilent au scroll ----------
    const paperHead = $('#irlxty1yt_0');
    if (paperHead) {
      gsap.timeline({ scrollTrigger: { trigger: paperHead, start: 'top top', end: '+=70%', pin: true, scrub: 0.5 } })
        .to($$('#ipcpsatcm_0 > *'), { autoAlpha: 0, y: -40, stagger: 0.1, duration: 0.5 }, 0)
        .to(paperHead, { backgroundColor: '#000000', duration: 0.6 }, 0.4);
    }
    scrollSlider({ section: '#igotnhv8e_0', swiperEl: '#ih5e35t5e_0', steps: 4, onChange: zoomActive });

    // ---------- 5. Inside the box : cercle blanc, stores qui se lèvent, texte qui se colore ----------
    const insideTitle = $('#icty6qooh_0');
    if (insideTitle) {
      insideTitle.classList.add('halo-m-circle-host');
      insideTitle.style.backgroundColor = '#000';
      const circle = make('div', 'halo-m-circle');
      insideTitle.prepend(circle);
      gsap.timeline({ scrollTrigger: { trigger: insideTitle, start: 'top top', end: '+=80%', pin: true, scrub: 0.5 } })
        .to(circle, { scale: 1, duration: 0.7, ease: 'power1.in' }, 0)
        .fromTo('#ike3aix17_0', { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: 0.4 }, 0.55);
    }
    $$('.inside__blinds-item--static').forEach(item => {
      item.classList.add('halo-m-blinds-host');
      const blinds = make('div', 'halo-m-blinds', 12);
      item.appendChild(blinds);
      gsap.fromTo(blinds.children, { scaleY: 1 }, {
        scaleY: 0, ease: 'none', stagger: 0.05,
        scrollTrigger: { trigger: item, start: 'top 85%', end: 'top 25%', scrub: 0.5 },
      });
    });
    fillWords('#i20h3u4xy_0', '#d4d4d4', '#000000');

    // ---------- 6. Details : les gros plans arrivent en dézoomant ----------
    $$('.details__card-image--static').forEach(img => reveal(img, { scale: 1.3 }, { start: 'top 100%', end: 'top 45%' }));
    $$('.details__text-wrapper--static').forEach(label => reveal(label, { y: 30 }, { start: 'top 95%', end: 'top 70%' }));
    reveal('#ijy19jm9y_0', { scale: 1.15 }, { start: 'top 100%', end: 'top 45%' });

    // ---------- 7. Coloris : les cinq coloris défilent au scroll ----------
    scrollSlider({ section: '#ius70bmqv_0', swiperEl: '#i0z78cl1f_0', steps: 5, perStep: 70, onChange: zoomActive });

    headerContrast();
    ScrollTrigger.refresh();
  }

  // ---------- Header lisible pendant les transitions ajoutées ----------
  // Le script d'origine colore le header selon la section qui passe dessous, mais ne connaît pas
  // les transitions ci-dessus, qui inversent le fond (rideaux blancs, bandes noires, fond qui noircit,
  // cercle blanc). Dans ces zones, on regarde ce qui est réellement derrière le header à chaque image.
  // Ailleurs on reprend ses sections, mais mesurées sous le header affiché : lui mesure le header caché
  // (au-dessus de l'écran) et se trompe dès qu'une section est épinglée en haut.
  function headerContrast() {
    const header = $('.header__wrapper');
    if (!header) return;
    const parts = [...$$('.header__icon'), $('.header__burger'), $('.header__logo-icon')].filter(Boolean);
    const within = (el, y) => { const r = el.getBoundingClientRect(); return r.top <= y && r.bottom > y; };
    const set = color => {
      if (parts.every(p => p.style.color === color)) return;
      parts.forEach(p => (p.style.color = color));
      header.style.borderBottom = `1px solid ${color === WHITE ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'}`;
    };
    const WHITE = 'rgb(255, 255, 255)', BLACK = 'rgb(0, 0, 0)';
    const cover = $('#iyzjstuxs_0'), curtains = $$('.halo-m-curtains i');
    const wipeTop = $('.halo-m-wipe i'), wipe = $('.halo-m-wipe');
    const paperHead = $('#irlxty1yt_0');
    const insideTitle = $('#icty6qooh_0'), circle = $('.halo-m-circle');
    // mêmes sections et couleurs que le script d'origine (TABLET + MOBILE)
    const sections = [
      ['.specs--static', BLACK], ['.who--static', WHITE], ['.paper__cover--static', BLACK],
      ['.paper__slider--static', WHITE], ['.inside--static', BLACK], ['.details--static', WHITE],
    ].map(([sel, color]) => [$(sel), color]).filter(([el]) => el);

    gsap.ticker.add(() => {
      // bas du header quand il est affiché (il se cache en remontant quand on descend)
      const y = header.offsetHeight;
      if (cover && curtains.length && within(cover, y)) {
        // rideaux blancs : noir dès que la plupart des bandes sont montées jusqu'au header
        const h = cover.getBoundingClientRect().height;
        const up = curtains.filter(c => (gsap.getProperty(c, 'yPercent') / 100) * h <= y).length;
        set(up >= curtains.length / 2 ? BLACK : WHITE);
      } else if (wipe && wipeTop && within(wipe, y)) {
        // bandes noires sur fond blanc : la bande du haut passe derrière le header
        set(gsap.getProperty(wipeTop, 'scaleX') > 0.5 ? WHITE : BLACK);
      } else if (paperHead && within(paperHead, y)) {
        // fond qui passe du blanc (transparent sur la page blanche) au noir
        const [r, g, b, a = 1] = (getComputedStyle(paperHead).backgroundColor.match(/[\d.]+/g) || [255, 255, 255]).map(Number);
        const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) * a + 255 * (1 - a);
        set(lum < 128 ? WHITE : BLACK);
      } else if (insideTitle && circle && within(insideTitle, y)) {
        // cercle blanc sur fond noir : noir quand il recouvre les deux coins du header
        const c = circle.getBoundingClientRect();
        const cx = c.left + c.width / 2, cy = c.top + c.height / 2, radius = c.width / 2;
        const covered = [0, window.innerWidth].every(x => Math.hypot(x - cx, y - cy) <= radius);
        set(covered ? BLACK : WHITE);
      } else {
        // dernière section commencée sous le header (blanc avant la première)
        let color = WHITE;
        for (const [el, c] of sections) if (el.getBoundingClientRect().top <= y) color = c;
        set(color);
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
  window.addEventListener('load', () => ScrollTrigger.refresh());
})();
