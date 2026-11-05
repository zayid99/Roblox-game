// LOCKER tab (§9.5): swinging rope preview in a porthole plus a grid of rope cards.
import type { LockerItemView } from '../../contracts';
import { formatPearls } from '../../game/economy';
import { porthole, ropeSwatch } from '../art';
import { el, escapeHtml, isReducedMotion, pressable, replay } from '../dom';
import { icon } from '../icons';
import { shapeCue } from '../parts/carry';
import { rarityPill } from '../reveal';
import type { PanelEnv } from './env';

const INK = '#1B1736';

function drawPreview(ctx: CanvasRenderingContext2D, size: number, item: LockerItemView | null, t: number): void {
  const s = size / 240;
  ctx.setTransform(s, 0, 0, s, 0, 0);
  ctx.clearRect(0, 0, 240, 240);
  // Sky and clouds.
  const g = ctx.createLinearGradient(0, 0, 0, 240);
  g.addColorStop(0, '#1D5583');
  g.addColorStop(1, '#0B2740');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 240, 240);
  ctx.fillStyle = 'rgba(255,255,255,.9)';
  for (const [cx, cy, k] of [[52, 70, 1], [186, 150, 0.8]] as const) {
    ctx.beginPath();
    ctx.arc(cx, cy, 14 * k, 0, Math.PI * 2);
    ctx.arc(cx + 16 * k, cy - 6 * k, 18 * k, 0, Math.PI * 2);
    ctx.arc(cx + 34 * k, cy, 13 * k, 0, Math.PI * 2);
    ctx.fill();
  }
  const ang = isReducedMotion() ? (20 * Math.PI) / 180 : Math.sin((t / 1600) * Math.PI * 2) * ((35 * Math.PI) / 180);
  const hx = 120;
  const hy = 40;
  const len = 84;
  const gx = hx + Math.sin(ang) * len;
  const gy = hy + Math.cos(ang) * len;
  // Rope: thick stripes along its length.
  const colors = item?.colors.length ? item.colors : ['#D9A35F', '#B07A3A'];
  const stripes = Math.max(2, Math.round((item?.stripesPerM ?? 6) * 1.6));
  ctx.lineCap = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 11;
  ctx.beginPath();
  ctx.moveTo(hx, hy);
  ctx.lineTo(gx, gy);
  ctx.stroke();
  for (let i = 0; i < stripes; i++) {
    const a = i / stripes;
    const b = (i + 1) / stripes;
    ctx.strokeStyle = colors[i % colors.length];
    ctx.lineWidth = 6;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(hx + (gx - hx) * a, hy + (gy - hy) * a);
    ctx.lineTo(hx + (gx - hx) * b, hy + (gy - hy) * b);
    ctx.stroke();
  }
  if (item?.id === 'rope_neon' || item?.id === 'rope_lightning') {
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(hx - 1, hy);
    ctx.lineTo(gx - 1, gy);
    ctx.stroke();
  }
  // Gold hook.
  ctx.lineWidth = 9;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.arc(hx, hy - 6, 9, Math.PI * 0.1, Math.PI * 1.25);
  ctx.stroke();
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#FFC92E';
  ctx.stroke();
  // Blocky figure hanging from the grip, rotated with the rope.
  ctx.save();
  ctx.translate(gx, gy);
  ctx.rotate(-ang);
  ctx.scale(1.3, 1.3);
  const box = (x: number, y: number, w: number, h: number, fill: string) => {
    ctx.fillStyle = fill;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 4);
    ctx.fill();
    ctx.stroke();
  };
  box(-18, -6, 10, 26, '#F28C38'); // arms raised to the rope
  box(8, -6, 10, 26, '#F28C38');
  box(-15, 44, 12, 26, '#2B4C9B'); // legs
  box(3, 44, 12, 26, '#2B4C9B');
  box(-15, 14, 30, 32, '#F28C38'); // torso
  box(-13, -14, 26, 26, '#FFD2A6'); // head
  // Smirk face.
  ctx.fillStyle = INK;
  ctx.fillRect(-7, -6, 4, 5);
  ctx.fillRect(4, -6, 4, 5);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-5, 4);
  ctx.quadraticCurveTo(1, 8, 7, 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,154,182,.8)';
  ctx.fillRect(-11, 1, 4, 3);
  ctx.fillRect(7, 1, 4, 3);
  ctx.restore();
}

export class LockerTab {
  private readonly grid: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly prevName: HTMLElement;
  private selected: string | null = null;
  private raf = 0;
  private confirmId: string | null = null;
  private confirmTimer = 0;

  constructor(private readonly env: PanelEnv, well: HTMLElement, _head: HTMLElement) {
    const wrap = el('div', 'locker');
    const prev = el('div', 'lk-prev');
    const size = env.layout() === 'desktop' ? 240 : 170;
    prev.innerHTML = porthole('<canvas></canvas>', size, 'lk-ph') + `<div class="lk-name t-stroke"></div>`;
    this.canvas = prev.querySelector('canvas') as HTMLCanvasElement;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = this.canvas.height = Math.round(size * 0.86 * dpr);
    this.prevName = prev.querySelector('.lk-name') as HTMLElement;
    this.grid = el('div', 'lk-grid stagger');
    wrap.append(prev, this.grid);
    well.appendChild(wrap);
    this.refresh();
    const loop = (t: number) => {
      const ctx = this.canvas.getContext('2d');
      const v = this.env.deps.data.locker();
      const item = v.items.find((i) => i.id === this.selected) ?? v.items.find((i) => i.equipped) ?? null;
      if (ctx) drawPreview(ctx, this.canvas.width, item, t);
      if (!isReducedMotion()) this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    window.clearTimeout(this.confirmTimer);
  }

  refresh(): void {
    const v = this.env.deps.data.locker();
    if (!this.selected) this.selected = v.items.find((i) => i.equipped)?.id ?? null;
    const sel = v.items.find((i) => i.id === this.selected);
    this.prevName.textContent = sel ? sel.name.toUpperCase() : '';
    this.grid.innerHTML = '';
    for (const it of v.items) this.grid.appendChild(this.card(it, v.pearls));
    if (isReducedMotion()) {
      const ctx = this.canvas.getContext('2d');
      if (ctx) drawPreview(ctx, this.canvas.width, sel ?? null, 0);
    }
  }

  private card(it: LockerItemView, pearls: number): HTMLElement {
    const r = it.rarity;
    const wrap = el('div', 'lk-cell');
    const card = el('div', `card-item lk-card${r >= 3 ? ' notch' : ''}${it.id === this.selected ? ' sel' : ''}`);
    card.dataset.r = String(r);
    card.innerHTML =
      (r >= 4 ? '<span class="sunburst"></span><span class="shine-sweep"></span>' : '') +
      shapeCue(r) +
      porthole(`<div class="lk-coil">${ropeSwatch(it.colors, it.stripesPerM, 70, 18)}${ropeSwatch(it.colors, it.stripesPerM, 70, 18)}</div>`, 84) +
      `<span class="ci-name t-stroke">${escapeHtml(it.name)}</span>` +
      rarityPill(r) +
      (it.isNew ? '<span class="new-st bob">NEW</span>' : '');
    pressable(card, () => {
      this.selected = it.id;
      this.refresh();
    }, { sound: 'ui.tab' });
    wrap.appendChild(card);
    // Footer
    let foot: HTMLElement;
    if (it.equipped) foot = el('span', 'chip chip--grass lk-eq', `${icon('check', 18)}<span class="t-stroke">EQUIPPED</span>`);
    else if (it.owned) {
      foot = el('button', 'btn btn--sky btn--s lk-btn', '<span class="label">EQUIP</span>');
      pressable(foot, () => {
        this.env.deps.actions.equipCosmetic(it.id);
        this.selected = it.id;
        this.refresh();
      });
    } else if (it.price !== null) {
      const can = pearls >= it.price;
      const confirming = this.confirmId === it.id;
      foot = el('button', `btn btn--s lk-btn ${can ? 'btn--grass' : 'btn--cant'}`, `${icon('pearl', 24)}<span class="label">${confirming ? 'BUY?' : formatPearls(it.price)}</span>`);
      pressable(foot, () => {
        if (!can) {
          replay(foot, 'fx-shake');
          return;
        }
        if (this.confirmId === it.id) {
          this.confirmId = null;
          this.env.deps.actions.buyCosmetic(it.id);
          this.selected = it.id;
          this.env.confetti(this.env.centerOf(foot), 20, '#2EE6C9');
          this.refresh();
        } else {
          this.confirmId = it.id;
          window.clearTimeout(this.confirmTimer);
          this.confirmTimer = window.setTimeout(() => {
            this.confirmId = null;
            this.refresh();
          }, 2000);
          this.selected = it.id;
          this.refresh();
        }
      });
    } else foot = el('span', 'chip lk-src', `${icon('lock', 16)}<span>${escapeHtml(it.source ?? 'Locked')}</span>`);
    wrap.appendChild(foot);
    return wrap;
  }
}
