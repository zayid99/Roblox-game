// C5 panel shell: navy hull, rope border, scallop, ribbon title, life-ring close, tabs, motion.
import type { IconId } from '../../contracts';
import { ribbonSvg } from '../art';
import { el, pressable, setText, uiSound } from '../dom';
import { icon } from '../icons';

export type Hue = 'grass' | 'sun' | 'coral' | 'sky' | 'grape' | 'teal' | 'gold';

export interface TabDef {
  id: string;
  label: string;
  icon?: IconId;
  hue: Hue;
  dot?: boolean;
  locked?: boolean;
  hidden?: boolean;
}

export interface ShellOpts {
  kind: string;
  title: string;
  hue: Hue;
  backdropClose: boolean;
  onClose: () => void;
}

export class PanelShell {
  readonly layer: HTMLElement;
  readonly backdrop: HTMLElement;
  readonly el: HTMLElement;
  readonly head: HTMLElement;
  readonly body: HTMLElement;
  readonly tabsEl: HTMLElement;
  private readonly title: HTMLElement;
  private hue: Hue;
  private closing = false;

  constructor(host: HTMLElement, private readonly opts: ShellOpts) {
    this.hue = opts.hue;
    this.backdrop = el('div', 'backdrop');
    this.layer = el('div', 'panel-layer');
    this.el = el('div', `panel panel--${opts.kind} hue-${opts.hue}`);
    this.el.dataset.anchor = `panel:${opts.kind}`;
    const ribbon = el('div', 'ribbon', `${ribbonSvg()}<span class="title t-stroke"></span>`);
    this.title = ribbon.querySelector('.title') as HTMLElement;
    setText(this.title, opts.title);
    const close = el('button', 'btn-close', icon('close', 18));
    close.setAttribute('aria-label', 'Close');
    close.dataset.anchor = 'panel:close';
    pressable(close, () => this.opts.onClose(), { sound: null });
    this.tabsEl = el('div', 'tabs');
    this.head = el('div', 'panel-head');
    this.body = el('div', 'panel-body');
    this.el.append(ribbon, close, this.tabsEl, this.head, this.body);
    this.layer.appendChild(this.el);
    if (opts.backdropClose) this.backdrop.addEventListener('pointerdown', () => this.opts.onClose());
    // Clicks inside the panel never reach the canvas.
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    host.append(this.backdrop, this.layer);
    uiSound('ui.open');
  }

  setTitle(title: string, hue: Hue): void {
    setText(this.title, title);
    if (hue !== this.hue) {
      this.el.classList.remove(`hue-${this.hue}`);
      this.hue = hue;
      this.el.classList.add(`hue-${hue}`);
    }
  }

  setTabs(tabs: TabDef[], active: string, onTab: (id: string) => void): void {
    this.tabsEl.innerHTML = '';
    const shown = tabs.filter((t) => !t.hidden);
    this.tabsEl.style.display = shown.length > 1 ? '' : 'none';
    for (const t of shown) {
      const b = el('button', `tab hue-${t.hue}${t.id === active ? ' on' : ''}${t.locked ? ' locked' : ''}`);
      b.innerHTML = `${t.icon ? icon(t.locked ? 'lock' : t.icon, 26) : ''}<span class="tl">${t.label}</span>${t.dot ? '<i class="dot"></i>' : ''}`;
      b.dataset.anchor = `tab:${t.id}`;
      pressable(b, () => {
        if (t.id !== active) {
          uiSound('ui.tab');
          onTab(t.id);
        }
      }, { sound: null });
      this.tabsEl.appendChild(b);
    }
  }

  /** Swap content with the tab-switch motion (old fades 80 ms, new cards stagger). */
  swapBody(fill: (body: HTMLElement) => void, animate = true): void {
    if (!animate) {
      this.body.innerHTML = '';
      fill(this.body);
      return;
    }
    this.body.classList.add('fading');
    window.setTimeout(() => {
      this.body.classList.remove('fading');
      this.body.innerHTML = '';
      fill(this.body);
    }, 80);
  }

  close(): Promise<void> {
    if (this.closing) return Promise.resolve();
    this.closing = true;
    uiSound('ui.close');
    this.el.classList.add('out');
    this.backdrop.classList.add('out');
    return new Promise((r) =>
      window.setTimeout(() => {
        this.layer.remove();
        this.backdrop.remove();
        r();
      }, 140),
    );
  }

  /** Remove immediately (switching panels). */
  destroy(): void {
    this.layer.remove();
    this.backdrop.remove();
  }
}

/** A panel's content module. */
export interface PanelContent {
  readonly tab: string | null;
  setTab?(tab: string): void;
  refresh(): void;
  anchor?(id: string): HTMLElement | null;
  setFocus?(f: import('../../contracts').HudFocus | null): void;
  destroy?(): void;
}
