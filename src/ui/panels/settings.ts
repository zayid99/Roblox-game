// Settings panel (§9.6): AUDIO, GRAPHICS, CONTROLS, HELP sections as cream cards.
import type { QualitySetting, Settings } from '../../contracts';
import { el, pressable, uiSound } from '../dom';
import { icon } from '../icons';
import { logoSvg } from '../logo';
import { controlsCardHtml } from '../parts/coach';
import type { PanelEnv } from './env';
import type { PanelContent, PanelShell } from './panel';

type View = Settings & { platformMuted: boolean; autoTier: string };

export class SettingsPanel implements PanelContent {
  readonly tab = null;

  constructor(private readonly shell: PanelShell, private readonly env: PanelEnv) {
    this.refresh();
  }

  private set(patch: Partial<Settings>): void {
    this.env.deps.actions.setSettings(patch);
  }

  refresh(): void {
    const s = this.env.deps.data.settings() as View;
    this.shell.head.innerHTML = '';
    this.shell.body.innerHTML = '';
    const well = el('div', 'well st-well');
    const col = el('div', 'st-col stagger');

    const audio = this.section('AUDIO', 'sound-on');
    if (s.platformMuted) audio.querySelector('.st-h')?.insertAdjacentHTML('beforeend', '<span class="chip chip--coral st-pm"><span class="t-stroke">Muted by CrazyGames</span></span>');
    audio.append(
      this.slider('Music', s.music, 0, 100, (v) => this.set({ music: v }), (v) => `${v}`, s.platformMuted),
      this.slider('Sound', s.sound, 0, 100, (v) => this.set({ sound: v }), (v) => `${v}`, s.platformMuted),
      this.toggle('Mute all', s.muted, (on) => this.set({ muted: on }), s.platformMuted),
    );
    const gfx = this.section('GRAPHICS', 'sparkle');
    const tierName = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
    gfx.append(
      this.segmented('Quality', ['auto', 'low', 'medium', 'high'], s.quality, (q) => this.set({ quality: q as QualitySetting }), s.quality === 'auto' ? `Auto (${tierName(s.autoTier)})` : ''),
      this.toggle('Reduce motion', s.reduceMotion, (on) => this.set({ reduceMotion: on })),
    );
    const ctl = this.section('CONTROLS', 'hand');
    ctl.append(
      this.slider('Camera speed', Math.round(s.camSens * 100), 50, 200, (v) => this.set({ camSens: v / 100 }), (v) => `${v}%`),
      ...(this.env.touch() ? [] : [this.toggle('Mouse look (click to lock cursor)', s.mouseLook, (on) => this.set({ mouseLook: on }))]),
      this.toggle('Invert camera Y', s.invertY, (on) => this.set({ invertY: on })),
      this.toggle('Swing assist', s.swingAssist, (on) => this.set({ swingAssist: on })),
    );
    const help = this.section('HELP', 'play');
    const replay = el('button', 'btn btn--sky st-replay', `${icon('play', 28)}<span class="label">REPLAY TUTORIAL</span>`);
    pressable(replay, () => {
      this.env.deps.actions.replayTutorial();
      this.env.closePanel();
    });
    help.append(replay, el('div', 'st-controls', controlsCardHtml(this.env.touch())));
    col.append(audio, gfx, ctl, help);
    const foot = el('div', 'st-foot', `${logoSvg(220)}<span class="st-ver">v2.0.0</span>`);
    col.appendChild(foot);
    well.appendChild(col);
    this.shell.body.appendChild(well);
  }

  private section(title: string, ic: Parameters<typeof icon>[0]): HTMLElement {
    const c = el('div', 'card st-sec');
    c.innerHTML = `<div class="st-h">${icon(ic, 30)}<span class="t-d">${title}</span></div>`;
    return c;
  }

  private rowEl(label: string, disabled = false): HTMLElement {
    const r = el('div', `st-row${disabled ? ' disabled' : ''}`);
    r.innerHTML = `<span class="st-l">${label}</span>`;
    return r;
  }

  private toggle(label: string, on: boolean, set: (on: boolean) => void, disabled = false): HTMLElement {
    const r = this.rowEl(label, disabled);
    const t = el('button', `toggle${on ? ' on' : ''}`);
    t.setAttribute('aria-label', label);
    pressable(t, () => {
      if (disabled) return;
      on = !on;
      t.classList.toggle('on', on);
      set(on);
    }, { sound: 'ui.tab' });
    r.appendChild(t);
    return r;
  }

  private slider(label: string, value: number, min: number, max: number, set: (v: number) => void, fmt: (v: number) => string, disabled = false): HTMLElement {
    const r = this.rowEl(label, disabled);
    const s = el('div', 'slider', `<div class="bar bar--sky"><div class="fill"></div></div><span class="thumb"></span>`);
    const val = el('span', 'sval', fmt(value));
    const fill = s.querySelector('.fill') as HTMLElement;
    const thumb = s.querySelector('.thumb') as HTMLElement;
    const apply = (v: number) => {
      const f = (v - min) / (max - min);
      fill.style.transform = `scaleX(${f})`;
      thumb.style.transform = `translateX(${(f * (s.clientWidth || 200)).toFixed(1)}px)`;
      val.textContent = fmt(v);
    };
    let dragging = false;
    let lastSent = value;
    const fromX = (x: number) => {
      const rect = s.getBoundingClientRect();
      const f = Math.max(0, Math.min(1, (x - rect.left) / rect.width));
      const v = Math.round(min + f * (max - min));
      apply(v);
      if (v !== lastSent) {
        lastSent = v;
        set(v);
      }
    };
    s.addEventListener('pointerdown', (e) => {
      if (disabled) return;
      e.stopPropagation();
      dragging = true;
      s.setPointerCapture(e.pointerId);
      uiSound('ui.click');
      fromX(e.clientX);
    });
    s.addEventListener('pointermove', (e) => dragging && fromX(e.clientX));
    s.addEventListener('pointerup', () => (dragging = false));
    s.addEventListener('pointercancel', () => (dragging = false));
    requestAnimationFrame(() => apply(value));
    r.append(s, val);
    return r;
  }

  private segmented(label: string, opts: string[], value: string, set: (v: string) => void, note: string): HTMLElement {
    const r = this.rowEl(label);
    if (note) r.querySelector('.st-l')?.insertAdjacentHTML('beforeend', `<small>${note}</small>`);
    const seg = el('div', 'seg');
    for (const o of opts) {
      const b = el('button', o === value ? 'on' : '', o.toUpperCase());
      pressable(b, () => {
        seg.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
        set(o);
      }, { sound: 'ui.tab' });
      seg.appendChild(b);
    }
    r.appendChild(seg);
    return r;
  }
}
