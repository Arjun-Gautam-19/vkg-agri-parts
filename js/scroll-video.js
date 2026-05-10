import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const canvas = document.getElementById('hero-canvas');
const stage = document.querySelector('.scroll-stage');
if (!canvas || !stage) {
  console.warn('[scroll-video] hero canvas or stage missing — skipping init');
} else {
  initScrollVideo();
}

function initScrollVideo() {
  // ---- Hidden video element ----
  // iOS Safari will NOT allocate a video decoder for elements with
  // display:none or visibility:hidden — the texture stays black on iPhone.
  // Workaround: keep the element in the layout but visually undetectable
  // (1×1 px, fully transparent, behind everything, no pointer events).
  const video = document.createElement('video');
  video.src = 'assets/hero-scroll.mp4';
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.setAttribute('muted', '');
  video.preload = 'auto';
  video.loop = false;
  Object.assign(video.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '1px',
    height: '1px',
    opacity: '0',
    pointerEvents: 'none',
    zIndex: '-1',
  });
  document.body.appendChild(video);

  // iOS only "unlocks" video playback after a user gesture. Hook into the
  // first touch/click anywhere on the page and prime the decoder, then pause.
  // Without this, the video stays at frame 0 on iPhone Safari.
  function primeOnGesture() {
    const p = video.play();
    if (p && typeof p.then === 'function') {
      p.then(() => video.pause()).catch(() => {});
    }
    window.removeEventListener('touchstart', primeOnGesture);
    window.removeEventListener('click', primeOnGesture);
  }
  window.addEventListener('touchstart', primeOnGesture, { once: true, passive: true });
  window.addEventListener('click', primeOnGesture, { once: true });

  let videoReady = false;
  video.addEventListener('loadedmetadata', () => {
    videoReady = true;
    // iOS / mobile Safari requires play() to "unlock" before seeks scrub correctly.
    const unlock = video.play();
    if (unlock && typeof unlock.then === 'function') {
      unlock.then(() => video.pause()).catch(() => {});
    }
    resize();
  });

  // ---- Three.js scene ----
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
  camera.position.z = 1;

  const texture = new THREE.VideoTexture(video);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;

  // Crop out the "Veo" watermark in the source video's bottom-right corner.
  // We sample only the inner region of the frame (left 93%, top 94%), which
  // pushes the watermarked corner outside the visible plane. The cover-fit
  // math is unaffected since the plane geometry stays the same — the image
  // just zooms in by ~6-7%, which is imperceptible.
  texture.offset.set(0, 0.06);
  texture.repeat.set(0.93, 0.94);

  const material = new THREE.MeshBasicMaterial({ map: texture });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  scene.add(mesh);

  video.addEventListener('seeked', () => { texture.needsUpdate = true; });

  // ---- Resize / cover-fit ----
  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);

    const aspect = w / h;
    camera.left = -aspect;
    camera.right = aspect;
    camera.top = 1;
    camera.bottom = -1;
    camera.updateProjectionMatrix();

    const vAspect = videoReady ? (video.videoWidth / video.videoHeight) : 16 / 9;
    let planeW, planeH;
    if (vAspect > aspect) {
      planeH = 2;
      planeW = 2 * vAspect;
    } else {
      planeW = 2 * aspect;
      planeH = (2 * aspect) / vAspect;
    }
    mesh.scale.set(planeW, planeH, 1);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---- Scrub strategy ----
  // Map scroll progress 0..1 across .scroll-stage to video.currentTime.
  //
  // Two failure modes we have to fight:
  //   A. Slow scroll feels jittery if we hard-bind currentTime to scroll
  //      (the video time becomes a step function of mouse-wheel ticks).
  //   B. Fast scroll falls behind if we lerp toward target, because the gap
  //      grows faster than the lerp can close it — the video lags the cursor.
  //
  // Fix: SNAP-OR-LERP. If the gap between target and current is large
  // (user is scrolling fast), snap directly so the frame matches the scroll.
  // If the gap is small (slow scroll), lerp for buttery smoothness.
  //
  // Plus: only issue a new seek when the previous one has been satisfied
  // (tracked via requestVideoFrameCallback / 'seeked'), so the decoder
  // isn't fighting a queue of stale seeks during fast scrolling.
  const LERP_FACTOR = 0.22;        // smoothing strength when in lerp mode
  const SNAP_THRESHOLD = 0.35;     // seconds — above this gap, snap instead
  const MIN_SEEK_DELTA = 0.015;    // skip seeks smaller than this
  let displayTime = 0;             // the time we're rendering toward
  let pendingSeek = false;

  const supportsRVFC = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;

  function clearPending() { pendingSeek = false; }
  video.addEventListener('seeked', clearPending);

  function getProgress() {
    const rect = stage.getBoundingClientRect();
    const total = stage.offsetHeight - window.innerHeight;
    if (total <= 0) return 0;
    const scrolled = Math.min(Math.max(-rect.top, 0), total);
    return scrolled / total;
  }

  // ---- Headline parallax ----
  // Drives the headline + lead paragraph upward at ~30% of scroll speed and
  // fades them out as the user moves past the first portion of the stage.
  // Uses transform/opacity (compositor-only properties) so it stays smooth.
  const headlineEl = document.querySelector('.scroll-overlay .top');
  const hintEl = document.querySelector('.scroll-hint');

  // Smoothing for the parallax offset so it doesn't jitter when scroll
  // events arrive in coarse chunks (mouse wheel, trackpad inertia).
  let parallaxY = 0;
  const PARALLAX_LERP = 0.18;
  const PARALLAX_DEPTH = 140;     // px the headline drifts up over 0..1 progress
  const FADE_END = 0.45;          // progress at which the headline is fully faded

  function updateParallax(progress) {
    if (!headlineEl) return;
    const targetY = progress * PARALLAX_DEPTH;
    parallaxY += (targetY - parallaxY) * PARALLAX_LERP;
    const fade = Math.max(0, 1 - progress / FADE_END);
    headlineEl.style.transform = `translate3d(0, ${-parallaxY}px, 0)`;
    headlineEl.style.opacity = (0.15 + 0.85 * fade).toFixed(3);
    if (hintEl) {
      // Hint fades earlier — it's only useful at the very top.
      hintEl.style.opacity = Math.max(0, 1 - progress / 0.12).toFixed(3);
    }
  }

  function tick() {
    const progress = getProgress();

    if (videoReady && Number.isFinite(video.duration) && video.duration > 0) {
      const duration = video.duration - 0.05;
      const target = progress * duration;
      const gap = target - displayTime;

      if (Math.abs(gap) > SNAP_THRESHOLD) {
        displayTime = target;       // snap on fast scroll
      } else {
        displayTime += gap * LERP_FACTOR; // lerp on slow scroll
      }

      if (!pendingSeek && Math.abs(video.currentTime - displayTime) > MIN_SEEK_DELTA) {
        pendingSeek = true;
        try {
          video.currentTime = displayTime;
          if (supportsRVFC) {
            video.requestVideoFrameCallback(() => {
              texture.needsUpdate = true;
              pendingSeek = false;
            });
          }
        } catch (_) {
          pendingSeek = false;
        }
      }
    }

    updateParallax(progress);
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  tick();
}
