'use client';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export type CoffeeLook = { liquid: string; iced?: boolean };

/** Grey-scale swirl painted on the coffee: the liquid colour multiplies it, so the swirl stays lighter than the coffee whatever the drink. */
function swirlTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const bg = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  bg.addColorStop(0, '#d8d8d8'); bg.addColorStop(0.7, '#bdbdbd'); bg.addColorStop(1, '#8e8e8e');
  g.fillStyle = bg; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#ffffff'; g.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    g.globalAlpha = 0.85 - i * 0.1; g.lineWidth = 18 - i * 2.4;
    g.beginPath(); g.moveTo(128, 214 - i * 16); g.bezierCurveTo(60 + i * 8, 170 - i * 10, 70 + i * 6, 90 + i * 8, 128, 52 + i * 12); g.bezierCurveTo(186 - i * 6, 90 + i * 8, 196 - i * 8, 170 - i * 10, 128, 214 - i * 16); g.stroke();
  }
  g.globalAlpha = 0.9; g.lineWidth = 6; g.beginPath(); g.moveTo(128, 222); g.lineTo(128, 40); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function beanTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d')!;
  const bg = g.createLinearGradient(0, 0, 0, 128);
  bg.addColorStop(0, '#6b3f26'); bg.addColorStop(0.5, '#4a2817'); bg.addColorStop(1, '#2e1709');
  g.fillStyle = bg; g.fillRect(0, 0, 256, 128);
  g.strokeStyle = '#1a0c05'; g.lineWidth = 7; g.lineCap = 'round';
  g.beginPath(); g.moveTo(0, 64); g.bezierCurveTo(60, 40, 90, 92, 128, 64); g.bezierCurveTo(166, 36, 196, 92, 256, 64); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function steamTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/**
 * A 3D coffee you can turn with a finger or the mouse. Click it and the beans scatter. `look` changes the drink (colour, hot cup or iced glass),
 * so the page around it can let people try the menu. It stops drawing when it is off screen and draws once for people who prefer no motion.
 */
export default function Coffee3D({ look, interactive = true, onFail }: { look: CoffeeLook; interactive?: boolean; onFail?: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const lookRef = useRef(look);
  lookRef.current = look;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' }); } catch { onFail?.(); return; }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;touch-action:pan-y;';
    renderer.domElement.setAttribute('aria-hidden', 'true');
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
    camera.position.set(0, 2.5, 6.6);
    camera.lookAt(0, 0.85, 0);
    scene.add(new THREE.HemisphereLight(0xfff1dc, 0x4a2c1a, 1.15));
    const key = new THREE.DirectionalLight(0xffe2b8, 2.6); key.position.set(3.5, 5, 4); scene.add(key);
    const rim = new THREE.DirectionalLight(0xff9a6b, 1.2); rim.position.set(-4, 2, -3); scene.add(rim);

    const world = new THREE.Group(); scene.add(world);
    const owned: { dispose: () => void }[] = [];
    const own = <T extends { dispose: () => void }>(o: T) => { owned.push(o); return o; };

    // saucer
    const saucerMat = own(new THREE.MeshStandardMaterial({ color: 0xf4ead9, roughness: 0.35 }));
    const saucer = new THREE.Mesh(own(new THREE.LatheGeometry([[0, -0.06], [1.45, -0.06], [1.72, 0.04], [1.78, 0.1], [1.62, 0.07], [0, 0.0]].map(([x, y]) => new THREE.Vector2(x, y)), 64)), saucerMat);
    world.add(saucer);

    // hot cup
    const hot = new THREE.Group(); world.add(hot);
    const cupMat = own(new THREE.MeshStandardMaterial({ color: 0xfbf4e8, roughness: 0.22, side: THREE.DoubleSide }));
    hot.add(new THREE.Mesh(own(new THREE.LatheGeometry([[0, 0.02], [0.52, 0.02], [0.62, 0.08], [0.95, 0.78], [1.05, 1.32], [0.98, 1.32], [0.88, 0.84], [0.56, 0.2], [0, 0.17]].map(([x, y]) => new THREE.Vector2(x, y)), 72)), cupMat));
    const handle = new THREE.Mesh(own(new THREE.TorusGeometry(0.4, 0.09, 14, 32, Math.PI * 1.3)), cupMat);
    handle.position.set(1.0, 0.82, 0); handle.rotation.z = -Math.PI * 0.65; hot.add(handle);
    const swirl = swirlTexture(); own(swirl);
    const liquidMat = own(new THREE.MeshStandardMaterial({ map: swirl, color: new THREE.Color(look.liquid), roughness: 0.18 }));
    const liquid = new THREE.Mesh(own(new THREE.CircleGeometry(0.92, 64)), liquidMat);
    liquid.rotation.x = -Math.PI / 2; liquid.position.y = 1.12; hot.add(liquid);

    // iced glass
    const iced = new THREE.Group(); iced.visible = false; iced.scale.setScalar(0.001); world.add(iced);
    const glassMat = own(new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.26, roughness: 0.04, metalness: 0, side: THREE.DoubleSide, clearcoat: 1 }));
    iced.add(new THREE.Mesh(own(new THREE.LatheGeometry([[0, 0.03], [0.62, 0.03], [0.78, 0.06], [0.98, 2.1], [0.93, 2.1], [0.74, 0.14], [0, 0.12]].map(([x, y]) => new THREE.Vector2(x, y)), 64)), glassMat));
    const icedLiquidMat = own(new THREE.MeshStandardMaterial({ color: new THREE.Color(look.liquid), roughness: 0.2, transparent: true, opacity: 0.94 }));
    const icedLiquid = new THREE.Mesh(own(new THREE.CylinderGeometry(0.86, 0.7, 1.55, 48)), icedLiquidMat); icedLiquid.position.y = 0.92; iced.add(icedLiquid);
    const iceMat = own(new THREE.MeshPhysicalMaterial({ color: 0xdff1ff, transparent: true, opacity: 0.55, roughness: 0.08 }));
    const cubes: THREE.Mesh[] = [];
    for (let i = 0; i < 5; i++) {
      const cube = new THREE.Mesh(own(new THREE.BoxGeometry(0.4, 0.4, 0.4)), iceMat);
      cube.position.set(Math.cos(i * 1.9) * 0.35, 1.5 + (i % 2) * 0.12, Math.sin(i * 1.9) * 0.35); cube.rotation.set(i, i * 0.7, i * 0.4); cubes.push(cube); iced.add(cube);
    }
    const straw = new THREE.Mesh(own(new THREE.CylinderGeometry(0.06, 0.06, 2.3, 12)), own(new THREE.MeshStandardMaterial({ color: 0xc9363e, roughness: 0.4 })));
    straw.position.set(0.22, 1.35, 0.1); straw.rotation.z = -0.16; iced.add(straw);

    // beans
    const beanMat = own(new THREE.MeshStandardMaterial({ map: own(beanTexture()), roughness: 0.55 }));
    const beanGeo = own(new THREE.SphereGeometry(0.17, 24, 16));
    const beans = Array.from({ length: 22 }, (_, i) => {
      const m = new THREE.Mesh(beanGeo, beanMat);
      const a = (i / 22) * Math.PI * 2 + (i % 3) * 0.2, r = 1.95 + (i % 4) * 0.28;
      const base = new THREE.Vector3(Math.cos(a) * r, 0.12 + (i % 5) * 0.55 * (i > 11 ? 1 : 0.1), Math.sin(a) * r * 0.8);
      m.scale.set(1, 0.62, 0.72); m.position.copy(base);
      world.add(m);
      return { m, base, vel: new THREE.Vector3(), ph: i * 1.7, spin: 0.4 + (i % 5) * 0.15 };
    });

    // steam
    const steamTex = own(steamTexture());
    const puffs = Array.from({ length: 14 }, (_, i) => {
      const mat = own(new THREE.SpriteMaterial({ map: steamTex, transparent: true, depthWrite: false, opacity: 0 }));
      const s = new THREE.Sprite(mat); world.add(s);
      return { s, t: i / 14, x: (Math.random() - 0.5) * 0.5 };
    });

    // sizing, drag, hover
    const size = () => { const w = el.clientWidth || 300, h = el.clientHeight || 300; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    size();
    const ro = new ResizeObserver(size); ro.observe(el);
    let dragging = false, lastX = 0, lastY = 0, rotY = -0.5, rotX = 0.05, hoverX = 0, hoverY = 0, spinV = 0, visible = true;
    const down = (e: PointerEvent) => { if (!interactive) return; dragging = true; lastX = e.clientX; lastY = e.clientY; renderer.domElement.setPointerCapture(e.pointerId); renderer.domElement.style.cursor = 'grabbing'; };
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      hoverX = ((e.clientX - r.left) / r.width - 0.5) * 2; hoverY = ((e.clientY - r.top) / r.height - 0.5) * 2;
      if (!dragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY; lastX = e.clientX; lastY = e.clientY;
      rotY += dx * 0.011; spinV = dx * 0.011; rotX = Math.max(-0.35, Math.min(0.55, rotX + dy * 0.006));
    };
    const up = (e: PointerEvent) => { dragging = false; renderer.domElement.style.cursor = interactive ? 'grab' : ''; try { renderer.domElement.releasePointerCapture(e.pointerId); } catch { /* not captured */ } };
    const leave = () => { hoverX = 0; hoverY = 0; };
    const burst = () => { beans.forEach((b) => { b.vel.set((Math.random() - 0.5) * 2.4, 2 + Math.random() * 2.2, (Math.random() - 0.5) * 2.4); }); };
    if (interactive) {
      renderer.domElement.style.cursor = 'grab';
      renderer.domElement.addEventListener('pointerdown', down); renderer.domElement.addEventListener('pointermove', move);
      renderer.domElement.addEventListener('pointerup', up); renderer.domElement.addEventListener('pointercancel', up); renderer.domElement.addEventListener('pointerleave', leave);
      renderer.domElement.addEventListener('dblclick', burst);
    }
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0.05 }); io.observe(el);

    const target = new THREE.Color(look.liquid);
    let showIced = 0, raf = 0, last = performance.now();
    const tmp = new THREE.Vector3();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible && !reduce) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const t = now / 1000;
      const L = lookRef.current;
      target.set(L.liquid);
      liquidMat.color.lerp(target, 0.12); icedLiquidMat.color.lerp(target, 0.12);
      showIced += ((L.iced ? 1 : 0) - showIced) * Math.min(1, dt * 7);
      const hs = Math.max(0.001, 1 - showIced), is = Math.max(0.001, showIced);
      hot.visible = hs > 0.01; hot.scale.setScalar(hs); iced.visible = is > 0.01; iced.scale.setScalar(is);
      if (!reduce) { if (!dragging) { rotY += dt * 0.28 + spinV; spinV *= 0.92; } }
      world.rotation.y += (rotY + hoverX * 0.25 - world.rotation.y) * 0.12;
      world.rotation.x += (rotX + hoverY * 0.12 - world.rotation.x) * 0.1;
      world.position.y = reduce ? 0 : Math.sin(t * 1.3) * 0.05;
      cubes.forEach((c, i) => { c.position.y = 1.5 + (i % 2) * 0.12 + Math.sin(t * 1.6 + i) * 0.05; c.rotation.y += dt * 0.3; });
      beans.forEach((b) => {
        b.vel.y -= 7 * dt;
        tmp.copy(b.base); tmp.y += reduce ? 0 : Math.sin(t * 0.9 + b.ph) * 0.07;
        b.m.position.addScaledVector(b.vel, dt);
        b.vel.multiplyScalar(0.985);
        b.m.position.lerp(tmp, b.vel.lengthSq() > 0.4 ? 0.01 : 0.05);
        if (b.m.position.y < 0.1) { b.m.position.y = 0.1; b.vel.y = Math.abs(b.vel.y) * 0.3; }
        if (!reduce) b.m.rotation.y += dt * b.spin;
      });
      puffs.forEach((p) => {
        if (!reduce) p.t = (p.t + dt * 0.16) % 1;
        const top = L.iced ? 0 : 1;
        p.s.position.set(p.x * (0.6 + p.t), 1.3 + p.t * 2.1, Math.sin(p.t * 6 + p.x * 9) * 0.2);
        p.s.scale.setScalar(0.5 + p.t * 1.1);
        (p.s.material as THREE.SpriteMaterial).opacity = top * Math.sin(p.t * Math.PI) * 0.5 * hs;
      });
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      owned.forEach((o) => o.dispose()); renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={host} className="c3d" role="img" aria-label="A 3D coffee. Drag to turn it, double click to scatter the beans." />;
}
