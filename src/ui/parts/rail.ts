// C2 left rail: Shop, FREE, Index, Rebirth sticker tiles with badges, upgrade arrow and wiggle.
import type { PanelKind, PanelTab, RailId, RailTileState } from '../../contracts';
import { el, pressable, replay, setText, uiSound } from '../dom';
import { icon } from '../icons';
import type { HudCtx } from '../types';

interface TileDef {
  id: RailId;
  icon: 'shop' | 'gift' | 'index' | 'rebirth';
  label: string;
  key: string;
  open: [PanelKind, PanelTab?];
  tip: string;
}

const TILES: TileDef[] = [
  { id: 'shop', icon: 'shop', label: 'SHOP', key: 'U', open: ['shop', 'upgrades'], tip: 'Shop (U)' },
  { id: 'free', icon: 'gift', label: 'FREE', key: 'G', open: ['free'], tip: 'Free rewards (G)' },
  { id: 'index', icon: 'index', label: 'INDEX', key: 'I', open: ['index'], tip: 'Index (I)' },
  { id: 'rebirth', icon: 'rebirth', label: 'REBIRTH', key: '', open: ['shop', 'rebirth'], tip: 'Rebirth' },
];

/** Badge priority (C2): claimable FREE > Rebirth ready > Index NEW; at most 2 at once. */
const BADGE_ORDER: RailId[] = ['free', 'rebirth', 'index', 'shop'];
/** Wiggle priority: FREE claimable > Shop affordable > Index NEW; one at a time. */
const WIGGLE_ORDER: RailId[] = ['free', 'shop', 'index', 'rebirth'];

interface TileEls {
  root: HTMLButtonElement;
  label: HTMLElement;
  badge: HTMLElement | null;
  arrow: HTMLElement | null;
  last: { visible: boolean | null; badge: string; arrow: boolean; label: string; wiggle: boolean };
}

export class RailPart {
  readonly el: HTMLElement;
  private readonly tiles = new Map<RailId, TileEls>();
  private tip: HTMLElement;
  private tipTimer = 0;

  constructor(ctx: HudCtx) {
    this.el = el('div', 'rail');
    this.tip = el('div', 'tip');
    for (const t of TILES) {
      const b = el('button', `tile tile--${t.id} hud-hide`) as HTMLButtonElement;
      b.innerHTML = `${icon(t.icon, 52)}<span class="tile-label">${t.key ? `<span class="kc">${t.key}</span>` : ''}<span class="tl">${t.label}</span></span>`;
      b.dataset.anchor = `rail:${t.id}`;
      pressable(b, () => {
        this.hideTip();
        ctx.openPanel(t.open[0], t.open[1]);
      });
      b.addEventListener('pointerenter', (e) => {
        if (e.pointerType === 'mouse') this.showTipSoon(b, t.tip, 400);
      });
      b.addEventListener('pointerleave', () => this.hideTip());
      // Touch long-press shows the same tooltip.
      b.addEventListener('pointerdown', (e) => {
        if (e.pointerType !== 'mouse') this.showTipSoon(b, t.tip, 500);
      });
      b.addEventListener('pointerup', () => this.hideTip());
      this.el.appendChild(b);
      this.tiles.set(t.id, {
        root: b,
        label: b.querySelector('.tl') as HTMLElement,
        badge: null,
        arrow: null,
        last: { visible: null, badge: '', arrow: false, label: t.label, wiggle: false },
      });
    }
    this.el.appendChild(this.tip);
  }

  anchor(id: RailId): HTMLElement | null {
    return this.tiles.get(id)?.root ?? null;
  }

  update(rail: Record<RailId, RailTileState>, reduce: boolean): void {
    let badges = 0;
    const badgeAllowed = new Set<RailId>();
    for (const id of BADGE_ORDER) {
      const s = rail[id];
      if (s && s.visible && s.badge !== null && !(id === 'shop' && s.arrow) && badges < 2) {
        badgeAllowed.add(id);
        badges++;
      }
    }
    const wiggler = reduce ? null : (WIGGLE_ORDER.find((id) => rail[id]?.visible && rail[id]?.wiggle) ?? null);

    for (const t of TILES) {
      const s = rail[t.id];
      const e = this.tiles.get(t.id) as TileEls;
      if (!s) continue;
      if (s.visible !== e.last.visible) {
        const first = e.last.visible === null;
        e.last.visible = s.visible;
        e.root.classList.toggle('hud-hide', !s.visible);
        e.root.tabIndex = s.visible ? 0 : -1;
        if (s.visible && !first) {
          replay(e.root, 'unlock');
          uiSound('ui.open');
        }
      }
      const badge = badgeAllowed.has(t.id) && s.badge !== null ? String(s.badge) : '';
      if (badge !== e.last.badge) {
        e.last.badge = badge;
        if (!badge) {
          e.badge?.remove();
          e.badge = null;
        } else {
          if (!e.badge) {
            e.badge = el('span', 'badge');
            e.root.appendChild(e.badge);
          }
          setText(e.badge, badge);
        }
      }
      const arrow = t.id === 'shop' && s.arrow;
      if (arrow !== e.last.arrow) {
        e.last.arrow = arrow;
        if (arrow) {
          e.arrow = el('span', 'up-arrow', icon('arrow-up', 30));
          e.root.appendChild(e.arrow);
        } else {
          e.arrow?.remove();
          e.arrow = null;
        }
      }
      const label = s.timer && !badge ? s.timer : (s.label ?? t.label);
      if (label !== e.last.label) {
        e.last.label = label;
        setText(e.label, label);
      }
      const wig = wiggler === t.id;
      if (wig !== e.last.wiggle) {
        e.last.wiggle = wig;
        e.root.classList.toggle('wiggle', wig);
      }
    }
  }

  private showTipSoon(b: HTMLElement, text: string, ms: number): void {
    window.clearTimeout(this.tipTimer);
    this.tipTimer = window.setTimeout(() => {
      this.tip.textContent = text;
      const r = b.getBoundingClientRect();
      const pr = this.el.getBoundingClientRect();
      const z = r.width / (b.offsetWidth || r.width) || 1;
      this.tip.style.left = `${(r.right - pr.left) / z + 14}px`;
      this.tip.style.top = `${(r.top - pr.top) / z + b.offsetHeight / 2 - 15}px`;
      this.tip.classList.add('on');
    }, ms);
  }

  private hideTip(): void {
    window.clearTimeout(this.tipTimer);
    this.tip.classList.remove('on');
  }
}
