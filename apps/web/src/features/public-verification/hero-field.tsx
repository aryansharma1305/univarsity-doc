'use client';

import { useEffect, useRef } from 'react';

const GOLD = '255, 201, 40';
const BLUE = '22, 140, 255';

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  gold: boolean;
}

/**
 * Decorative "records network" behind the hero: slow drifting points joined by faint lines, in the
 * brand blue with a few gold accents. Canvas only (no DOM, no layout cost); started client-side
 * after hydration, paused when off-screen or the tab is hidden, never started for reduced motion,
 * and stopped immediately if the preference changes.
 */
export function HeroField({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!canvas || preference.matches || typeof IntersectionObserver === 'undefined') return;
    const context = canvas.getContext('2d');
    if (!context) return;

    let width = 0;
    let height = 0;
    let frame = 0;
    let visible = true;
    let nodes: Node[] = [];
    const pointer = { x: -9999, y: -9999 };
    const ratio = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const box = canvas.getBoundingClientRect();
      width = box.width;
      height = box.height;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const count = Math.round(Math.min(70, Math.max(26, (width * height) / 22000)));
      nodes = Array.from({ length: count }, (_, index) => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.22,
        r: Math.random() * 1.4 + 0.6,
        gold: index % 7 === 0,
      }));
    };

    const draw = () => {
      context.clearRect(0, 0, width, height);
      const linkDistance = Math.min(150, width / 6);
      for (const node of nodes) {
        node.x += node.vx;
        node.y += node.vy;
        if (node.x < -20) node.x = width + 20;
        if (node.x > width + 20) node.x = -20;
        if (node.y < -20) node.y = height + 20;
        if (node.y > height + 20) node.y = -20;
      }
      for (let i = 0; i < nodes.length; i += 1) {
        const a = nodes[i];
        if (!a) continue;
        for (let j = i + 1; j < nodes.length; j += 1) {
          const b = nodes[j];
          if (!b) continue;
          const distance = Math.hypot(a.x - b.x, a.y - b.y);
          if (distance > linkDistance) continue;
          context.strokeStyle = `rgba(${BLUE}, ${0.16 * (1 - distance / linkDistance)})`;
          context.lineWidth = 1;
          context.beginPath();
          context.moveTo(a.x, a.y);
          context.lineTo(b.x, b.y);
          context.stroke();
        }
        const near = Math.hypot(a.x - pointer.x, a.y - pointer.y) < 140;
        context.fillStyle = `rgba(${a.gold ? GOLD : BLUE}, ${near ? 0.95 : a.gold ? 0.7 : 0.5})`;
        context.beginPath();
        context.arc(a.x, a.y, near ? a.r + 1.2 : a.r, 0, Math.PI * 2);
        context.fill();
      }
    };

    const loop = () => {
      draw();
      frame = requestAnimationFrame(loop);
    };
    const start = () => {
      if (!frame && visible && !document.hidden && !preference.matches)
        frame = requestAnimationFrame(loop);
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };

    resize();
    start();

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;
      if (visible) start();
      else stop();
    });
    observer.observe(canvas);
    const resizeObserver = new ResizeObserver(() => {
      resize();
    });
    resizeObserver.observe(canvas);
    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };
    const onPointer = (event: PointerEvent) => {
      const box = canvas.getBoundingClientRect();
      pointer.x = event.clientX - box.left;
      pointer.y = event.clientY - box.top;
    };
    const onPreference = () => {
      if (!preference.matches) return;
      stop();
      context.clearRect(0, 0, width, height);
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pointermove', onPointer, { passive: true });
    preference.addEventListener('change', onPreference);

    return () => {
      stop();
      observer.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pointermove', onPointer);
      preference.removeEventListener('change', onPreference);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className={className} />;
}
