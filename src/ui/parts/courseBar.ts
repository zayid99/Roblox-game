// C15 course bar: home at the left, rarity-coloured zone segments, lighthouse ticks,
// the player marker and the surge wave sliding home.
import type { HudView } from '../../contracts';
import { RARITIES } from '../../game/creatures';
import { ZONES } from '../../game/zones';
import { el, setText } from '../dom';
import { icon } from '../icons';

export interface CourseLayout {
  /** Zone widths as fractions of the course (sum 1). */
  zones: number[];
  /** Lighthouse positions along the course, 0..1. */
  lighthouses: number[];
}

export function defaultCourseLayout(): CourseLayout {
  const total = ZONES.reduce((s, z) => s + z.islands, 0);
  const zones = ZONES.map((z) => z.islands / total);
  let acc = 0;
  const lighthouses = ZONES.map((z, i) => {
    const t = acc + zones[i] * (Math.floor(z.islands / 2) + 0.5) / z.islands;
    acc += zones[i];
    return t;
  });
  return { zones, lighthouses };
}

export class CourseBarPart {
  readonly el: HTMLElement;
  private readonly track: HTMLElement;
  private readonly player: HTMLElement;
  private readonly wave: HTMLElement;
  private readonly zoneLabel: HTMLElement;
  private last = { p: -1, w: -2, zone: -99, visible: null as boolean | null };

  constructor() {
    this.el = el('div', 'course');
    this.el.dataset.anchor = 'course';
    this.track = el('div', 'cb-track');
    this.player = el('div', 'cb-player', '<i></i><i></i>');
    this.wave = el('div', 'cb-wave', icon('wave', 22));
    this.zoneLabel = el('div', 'cb-zone');
    const home = el('div', 'cb-home', icon('home', 24));
    const ticks = el('div', 'cb-ticks');
    this.el.append(ticks, this.track, home, this.wave, this.player, this.zoneLabel);
    this.setLayout(defaultCourseLayout());
  }

  setLayout(l: CourseLayout): void {
    this.track.innerHTML = l.zones
      .map((f, i) => {
        const r = ZONES[i]?.rarity ?? i;
        return `<span class="cb-seg" data-r="${r}" style="flex:${f}"><b>${f * 380 > 30 ? i + 1 : ''}</b></span>`;
      })
      .join('');
    const ticks = this.el.querySelector('.cb-ticks') as HTMLElement;
    ticks.innerHTML = l.lighthouses.map((t) => `<span style="left:${(t * 100).toFixed(2)}%">${icon('lighthouse', 14)}</span>`).join('');
  }

  update(c: HudView['course']): void {
    if (c.visible !== this.last.visible) {
      this.last.visible = c.visible;
      this.el.classList.toggle('hud-hide', !c.visible);
    }
    const p = Math.round(Math.max(0, Math.min(1, c.playerT)) * 1000) / 1000;
    if (p !== this.last.p) {
      this.last.p = p;
      this.player.style.transform = `translateX(calc(${p} * var(--cbw)))`;
    }
    const w = c.waveT === null ? -1 : Math.round(Math.max(0, Math.min(1, c.waveT)) * 1000) / 1000;
    if (w !== this.last.w) {
      this.last.w = w;
      this.wave.classList.toggle('on', w >= 0);
      if (w >= 0) this.wave.style.transform = `translateX(calc(${w} * var(--cbw)))`;
    }
    if (c.zone !== this.last.zone) {
      this.last.zone = c.zone;
      if (c.zone < 0) setText(this.zoneLabel, 'Home island');
      else {
        const z = ZONES[c.zone];
        const r = z ? z.rarity : 0;
        this.zoneLabel.innerHTML = `<span style="color:${RARITIES[r]?.color ?? '#fff'}">Zone ${c.zone + 1}</span> ${z?.name ?? ''}`;
      }
    }
  }
}
