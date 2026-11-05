// Confetti (spec §5.1): one full-screen 2D canvas, created on demand and removed when idle.
import type { ScreenPt } from '../contracts';
import { isReducedMotion } from './dom';

interface Piece {
  x: number; y: number; vx: number; vy: number; a: number; va: number; life: number; color: string; round: boolean;
}

const CAP = 120;
const DEFAULT_COLORS = ['#FFC92E', '#3FCB4B', '#34AFFF'];

export class Confetti {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private pieces: Piece[] = [];
  private raf = 0;
  private last = 0;

  constructor(private readonly host: HTMLElement) {}

  burst(at: ScreenPt | 'center', count: number, hue = '#FF4D5E'): void {
    if (isReducedMotion()) count = Math.round(count * 0.3);
    const w = window.innerWidth;
    const h = window.innerHeight;
    const p = at === 'center' ? { x: w / 2, y: h * 0.42 } : at;
    const colors = [hue, ...DEFAULT_COLORS];
    for (let i = 0; i < count; i++) {
      if (this.pieces.length >= CAP) this.pieces.shift();
      const ang = Math.random() * Math.PI * 2;
      const sp = 300 + Math.random() * 400;
      this.pieces.push({
        x: p.x, y: p.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 250,
        a: Math.random() * 6.28, va: (Math.random() * 2 - 1) * 8, life: 1.2,
        color: colors[i % colors.length], round: Math.random() < 0.35,
      });
    }
    this.ensure();
  }

  private ensure(): void {
    if (!this.canvas) {
      const c = document.createElement('canvas');
      c.className = 'confetti';
      this.host.appendChild(c);
      this.canvas = c;
      this.ctx = c.getContext('2d');
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.tick);
    }
  }

  private tick = (now: number): void => {
    this.raf = 0;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const ctx = this.ctx;
    if (!ctx || !this.canvas) return;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (const p of this.pieces) {
      p.life -= dt;
      p.vy += 1400 * dt;
      p.vx *= 1 - 0.8 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.a += p.va * dt;
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 0.3));
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.a);
      ctx.fillStyle = p.color;
      ctx.strokeStyle = '#1B1736';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (p.round) ctx.arc(0, 0, 4, 0, Math.PI * 2);
      else ctx.rect(-4, -6, 8, 12);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    this.pieces = this.pieces.filter((p) => p.life > 0);
    if (this.pieces.length) this.raf = requestAnimationFrame(this.tick);
    else {
      this.canvas.remove();
      this.canvas = null;
      this.ctx = null;
    }
  };
}
