"use client";

import { useEffect, useRef } from "react";

export function ParticleSphere() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W: number, H: number, CX: number, CY: number, dpr: number;
    let animId: number;
    let appState = 0;
    let mouseX = -9999;
    let mouseY = -9999;
    let t = 0;
    let rotY = 0;

    const N = 4000;
    const px = new Float32Array(N);
    const py = new Float32Array(N);
    const pz = new Float32Array(N);
    const vx = new Float32Array(N);
    const vy = new Float32Array(N);
    const vz = new Float32Array(N);
    const tx = new Float32Array(N);
    const ty = new Float32Array(N);
    const tz = new Float32Array(N);
    const ox = new Float32Array(N);
    const oy = new Float32Array(N);
    const oz = new Float32Array(N);
    const hue = new Float32Array(N);
    const phase = new Float32Array(N);

    const REPEL_RADIUS = 100;
    const REPEL_FORCE = 8;
    const PHI = Math.PI * (1 + Math.sqrt(5));
    const FOV = 550;
    const CAMERA_Z = 600;

    function resize() {
      dpr = window.devicePixelRatio || 1;
      W = window.innerWidth;
      H = window.innerHeight;
      CX = W / 2;
      CY = H / 2;
      canvas!.width = W * dpr;
      canvas!.height = H * dpr;
      canvas!.style.width = W + "px";
      canvas!.style.height = H + "px";
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (appState === 0) initSphereTargets();
    }

    function initSphereTargets() {
      const baseDim = Math.min(W, H);
      const R = baseDim > 1200 ? baseDim * 0.28 : baseDim * 0.42;
      for (let i = 0; i < N; i++) {
        const polar = Math.acos(1 - 2 * (i + 0.5) / N);
        const azim = PHI * i;
        ox[i] = Math.sin(polar) * Math.cos(azim) * R;
        oy[i] = Math.sin(polar) * Math.sin(azim) * R;
        oz[i] = Math.cos(polar) * R;
        tx[i] = ox[i];
        ty[i] = oy[i];
        tz[i] = oz[i];
      }
    }

    function initParticles() {
      for (let i = 0; i < N; i++) {
        px[i] = (Math.random() - 0.5) * W * 2;
        py[i] = (Math.random() - 0.5) * H * 2;
        pz[i] = (Math.random() - 0.5) * 1000;
        vx[i] = vy[i] = vz[i] = 0;
        hue[i] = (i / N) * 320 + 170;
        phase[i] = Math.random() * Math.PI * 2;
      }
    }

    function update() {
      t += 0.005;
      if (appState === 0) rotY += 0.006;
      const jitter = appState === 0 ? 1.8 : 0;

      for (let i = 0; i < N; i++) {
        const curTx = tx[i], curTy = ty[i], curTz = tz[i];
        const cosY = Math.cos(rotY), sinY = Math.sin(rotY);

        let targetX = curTx * cosY - curTz * sinY;
        let targetY = curTy;
        let targetZ = curTx * sinY + curTz * cosY;

        if (appState === 0) {
          targetX += Math.sin(t * 8 + phase[i]) * jitter;
          targetY += Math.cos(t * 9 + phase[i]) * jitter;
          targetZ += Math.sin(t * 7 + phase[i] * 2) * jitter;
        }

        const sp = appState === 0 ? 0.02 : 0.022;
        vx[i] += (targetX - px[i]) * sp;
        vy[i] += (targetY - py[i]) * sp;
        vz[i] += (targetZ - pz[i]) * sp;

        if (appState >= 1 && mouseX > 0) {
          const scale = FOV / (FOV + pz[i] + CAMERA_Z);
          const sx = px[i] * scale + CX;
          const sy = py[i] * scale + CY;
          const rdx = sx - mouseX;
          const rdy = sy - mouseY;
          const d2 = rdx * rdx + rdy * rdy;
          if (d2 < REPEL_RADIUS * REPEL_RADIUS && d2 > 1) {
            const d = Math.sqrt(d2);
            const mag = REPEL_FORCE * (1 - d / REPEL_RADIUS) * 5;
            vx[i] += (rdx / d) * mag;
            vy[i] += (rdy / d) * mag;
          }
        }

        vx[i] *= 0.82;
        vy[i] *= 0.82;
        vz[i] *= 0.82;
        px[i] += vx[i];
        py[i] += vy[i];
        pz[i] += vz[i];
      }
    }

    function draw() {
      ctx!.fillStyle = "rgba(5,5,15,0.22)";
      ctx!.fillRect(0, 0, W, H);

      for (let i = 0; i < N; i++) {
        const zPos = pz[i] + CAMERA_Z;
        if (zPos < 10) continue;
        const scale = FOV / zPos;
        const sx = px[i] * scale + CX;
        const sy = py[i] * scale + CY;
        const spd = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i] + vz[i] * vz[i]);
        let a = Math.min(1, (0.18 + spd * 0.1) * (scale * 0.65));
        let size = (0.4 + spd * 0.12) * scale;

        const h = (hue[i] + t * 25) % 360;

        ctx!.beginPath();
        ctx!.arc(sx, sy, size, 0, 6.2832);
        ctx!.fillStyle = `hsla(${h}, 80%, 70%, ${a})`;
        ctx!.fill();
      }

      if (appState >= 1 && mouseX > 0) {
        const r = REPEL_RADIUS;
        const grd = ctx!.createRadialGradient(mouseX, mouseY, 0, mouseX, mouseY, r);
        grd.addColorStop(0, "rgba(255,255,255,0.05)");
        grd.addColorStop(1, "rgba(255,255,255,0)");
        ctx!.beginPath();
        ctx!.arc(mouseX, mouseY, r, 0, 6.2832);
        ctx!.fillStyle = grd;
        ctx!.fill();
      }
    }

    function loop() {
      update();
      draw();
      animId = requestAnimationFrame(loop);
    }

    const onMove = (e: MouseEvent) => { mouseX = e.clientX; mouseY = e.clientY; };
    const onLeave = () => { mouseX = -9999; mouseY = -9999; };

    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", onLeave);

    resize();
    initParticles();
    loop();

    const onResize = () => {
      ctx!.resetTransform();
      resize();
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(animId);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full"
      style={{ background: "#05050f" }}
    />
  );
}
