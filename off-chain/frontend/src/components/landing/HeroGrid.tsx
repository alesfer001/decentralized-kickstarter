"use client";

import { useEffect, useRef } from "react";

/** Grid spacing in CSS pixels */
const STEP = 28;
const PARTICLE_COUNT = 26;

interface Particle {
  x: number;
  y: number;
  size: number;
  speed: number;
  opacity: number;
}

function randomParticle(y = Math.random()): Particle {
  return {
    x: Math.random(),
    y,
    size: 6 + Math.random() * 10,
    speed: 0.00015 + Math.random() * 0.0003,
    opacity: 0.25 + Math.random() * 0.4,
  };
}

/**
 * Ambient hero background: a faint dot grid with a few cells drifting upward, like pledges
 * rising into a campaign. Draws a single still frame when the user prefers reduced motion.
 */
export function HeroGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const darkScheme = window.matchMedia("(prefers-color-scheme: dark)");
    const particles = Array.from({ length: PARTICLE_COUNT }, () => randomParticle());
    let colors = { dot: "", fund: "", cell: "" };
    let frame = 0;

    // Read the theme tokens once, and again only when the colour scheme flips
    const readColors = () => {
      const style = getComputedStyle(document.documentElement);
      colors = {
        dot: style.getPropertyValue("--grid-dot").trim(),
        fund: style.getPropertyValue("--fund").trim(),
        cell: style.getPropertyValue("--cell").trim(),
      };
    };

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
    };

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      const step = STEP * dpr;
      ctx.fillStyle = colors.dot;
      for (let x = step; x < width; x += step) {
        for (let y = step; y < height; y += step) ctx.fillRect(x - 1, y - 1, 2, 2);
      }

      particles.forEach((p, i) => {
        if (!reduceMotion.matches) {
          p.y -= p.speed;
          if (p.y < -0.05) Object.assign(p, randomParticle(1.05));
        }
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = i % 4 === 0 ? colors.cell : colors.fund;
        const s = p.size * dpr;
        ctx.fillRect(p.x * width - s / 2, p.y * height - s / 2, s, s);
      });
      ctx.globalAlpha = 1;

      if (!reduceMotion.matches) frame = requestAnimationFrame(draw);
    };

    const restart = () => {
      cancelAnimationFrame(frame);
      draw();
    };
    const onSchemeChange = () => {
      readColors();
      restart();
    };
    const onResize = () => {
      resize();
      if (reduceMotion.matches) draw();
    };

    readColors();
    resize();
    draw();
    window.addEventListener("resize", onResize);
    darkScheme.addEventListener("change", onSchemeChange);
    reduceMotion.addEventListener("change", restart);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      darkScheme.removeEventListener("change", onSchemeChange);
      reduceMotion.removeEventListener("change", restart);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 w-full h-full block" />;
}
