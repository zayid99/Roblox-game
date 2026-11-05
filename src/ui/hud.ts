import { HOME_FRONT_Z } from '../game/config';
import type { Course } from '../game/course';
import { MUTATIONS, RARITIES, SPECIES, creatureIncome, creatureLabel, getSpecies, type CreatureRef } from '../game/creatures';
import { UPGRADES, UPGRADE_ORDER, formatCash, rebirthMultiplier, type UpgradeKey } from '../game/economy';
import type { GameState } from '../game/state';
import type { WavePhase } from '../game/wave';
import type { IconFactory } from '../render/icons';

export interface HudView {
  cash: number;
  income: number;
  rebirths: number;
  wavePhase: WavePhase;
  waveTimer: number;
  golden: boolean;
  frontZ: number;
  playerZ: number;
  carried: CreatureRef[];
  capacity: number;
  canAffordSomething: boolean;
}

export interface HudActions {
  buy(key: UpgradeKey): void;
  rebirth(): void;
  toggleSound(): void;
  panelChanged(open: boolean): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (html) e.innerHTML = html;
  return e;
}

function fmtTime(s: number): string {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

export class Hud {
  readonly jumpButton: HTMLButtonElement;
  readonly joyBase: HTMLElement;
  readonly joyKnob: HTMLElement;

  private readonly cashValue: HTMLElement;
  private readonly income: HTMLElement;
  private readonly rebirthTag: HTMLElement;
  private readonly waveChip: HTMLElement;
  private readonly waveText: HTMLElement;
  private readonly waveBar: HTMLElement;
  private readonly upgradeBadge: HTMLElement;
  private readonly soundBtn: HTMLButtonElement;
  private readonly carry: HTMLElement;
  private readonly hintEl: HTMLElement;
  private readonly toasts: HTMLElement;
  private readonly bannerEl: HTMLElement;
  private readonly flashEl: HTMLElement;
  private readonly mmPlayer: HTMLElement;
  private readonly mmWave: HTMLElement;
  private readonly backdrop: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly touch: HTMLElement;

  private panelKind: 'upgrades' | 'index' | 'welcome' | null = null;
  private last: Record<string, string | number | boolean> = {};
  private bannerTimer = 0;
  private flashTimer = 0;
  private readonly zMin: number;
  private readonly zMax: number;

  constructor(
    private readonly root: HTMLElement,
    course: Course,
    private readonly icons: IconFactory,
    private readonly state: GameState,
    private readonly actions: HudActions,
  ) {
    root.innerHTML = '';

    const tl = el('div', 'hud-top-left');
    const cash = el('div', 'cash', '<span class="cash-icon">💰</span>');
    this.cashValue = el('span', 'cash-value', '$0');
    cash.append(this.cashValue);
    this.income = el('div', 'income', '+$0/s');
    this.rebirthTag = el('div', 'rebirth-tag hidden');
    tl.append(cash, this.income, this.rebirthTag);

    const tc = el('div', 'hud-top-center');
    this.waveChip = el('div', 'wave-chip');
    this.waveText = el('span', 'wave-text', 'Next wave');
    const bar = el('div', 'wave-bar');
    this.waveBar = el('i');
    bar.append(this.waveBar);
    this.waveChip.append(el('span', 'wave-icon', '🌊'), this.waveText, bar);
    this.toasts = el('div', 'toasts');
    tc.append(this.waveChip, this.toasts);

    const tr = el('div', 'hud-top-right');
    const upBtn = el('button', 'btn btn-upgrades', '🛒 <span>Upgrades</span>');
    this.upgradeBadge = el('b', 'badge hidden', '!');
    upBtn.append(this.upgradeBadge);
    upBtn.title = 'Upgrades (U)';
    upBtn.addEventListener('click', () => this.openUpgrades());
    const idxBtn = el('button', 'btn btn-index', '📖 <span>Index</span>');
    idxBtn.title = 'Creature Index (I)';
    idxBtn.addEventListener('click', () => this.openIndex());
    this.soundBtn = el('button', 'btn btn-sound', '🔊');
    this.soundBtn.title = 'Sound (M)';
    this.soundBtn.addEventListener('click', () => actions.toggleSound());
    tr.append(upBtn, idxBtn, this.soundBtn);

    // Minimap: the course as a vertical strip, home at the bottom.
    const mm = el('div', 'minimap');
    const track = el('div', 'mm-track');
    this.zMax = course.home.max.z;
    this.zMin = course.endZ - 10;
    for (const zone of course.zones) {
      const seg = el('div', 'mm-zone');
      seg.style.bottom = `${this.pct(zone.startZ)}%`;
      seg.style.height = `${this.pct(zone.endZ) - this.pct(zone.startZ)}%`;
      seg.style.background = RARITIES[zone.def.rarity].color;
      seg.title = zone.def.name;
      track.append(seg);
    }
    const homeSeg = el('div', 'mm-home');
    homeSeg.style.height = `${this.pct(HOME_FRONT_Z)}%`;
    track.append(homeSeg);
    for (const lh of course.lighthouses) {
      const dot = el('div', 'mm-lighthouse', '🗼');
      dot.style.bottom = `${this.pct((lh.tower.min.z + lh.tower.max.z) / 2)}%`;
      track.append(dot);
    }
    this.mmWave = el('div', 'mm-wave hidden');
    this.mmPlayer = el('div', 'mm-player');
    track.append(this.mmWave, this.mmPlayer);
    mm.append(track);

    this.hintEl = el('div', 'hint hidden');
    this.carry = el('div', 'carry');
    this.bannerEl = el('div', 'banner hidden');
    this.flashEl = el('div', 'flash');

    this.touch = el('div', 'touch-controls hidden');
    this.joyBase = el('div', 'joy-base');
    this.joyKnob = el('div', 'joy-knob');
    this.joyBase.append(this.joyKnob);
    this.jumpButton = el('button', 'jump-btn', 'JUMP<small>hold to swing</small>');
    this.touch.append(this.joyBase, this.jumpButton);

    this.backdrop = el('div', 'panel-backdrop hidden');
    this.panel = el('div', 'panel');
    this.backdrop.append(this.panel);
    this.backdrop.addEventListener('pointerdown', (e) => {
      if (e.target === this.backdrop && this.panelKind !== 'welcome') this.closePanel();
    });

    root.append(this.flashEl, tl, tc, tr, mm, this.hintEl, this.carry, this.bannerEl, this.touch, this.backdrop);
  }

  private pct(z: number): number {
    return ((this.zMax - z) / (this.zMax - this.zMin)) * 100;
  }

  get panelOpen(): boolean {
    return this.panelKind !== null;
  }

  setTouchMode(on: boolean): void {
    this.touch.classList.toggle('hidden', !on);
    this.root.classList.toggle('touch', on);
  }

  setSound(on: boolean): void {
    this.soundBtn.textContent = on ? '🔊' : '🔇';
  }

  private changed(key: string, value: string | number | boolean): boolean {
    if (this.last[key] === value) return false;
    this.last[key] = value;
    return true;
  }

  update(dt: number, v: HudView): void {
    const cash = formatCash(v.cash);
    if (this.changed('cash', cash)) this.cashValue.textContent = cash;
    const income = `+${formatCash(v.income)}/s`;
    if (this.changed('income', income)) this.income.textContent = income;
    if (this.changed('rebirths', v.rebirths)) {
      this.rebirthTag.classList.toggle('hidden', v.rebirths === 0);
      this.rebirthTag.textContent = `⭐ Rebirth ${v.rebirths} · ×${rebirthMultiplier(v.rebirths).toFixed(1)} cash`;
    }

    let text: string;
    let cls: string;
    let fill: number;
    if (v.wavePhase === 'surge') {
      text = v.golden ? 'GOLDEN WAVE! Get home or up high!' : 'WAVE! Get home or up high!';
      cls = 'surge';
      fill = 1;
    } else if (v.wavePhase === 'warning') {
      text = `${v.golden ? 'Golden wave' : 'Wave'} in ${fmtTime(v.waveTimer)}!`;
      cls = 'warning';
      fill = 1 - v.waveTimer / 70;
    } else {
      text = `${v.golden ? '✨ Golden wave' : 'Next wave'} in ${fmtTime(v.waveTimer)}`;
      cls = v.golden ? 'calm golden' : 'calm';
      fill = 1 - v.waveTimer / 90;
    }
    if (this.changed('waveText', text)) this.waveText.textContent = text;
    if (this.changed('waveCls', cls)) this.waveChip.className = `wave-chip ${cls}`;
    const fillPct = `${Math.round(Math.max(0, Math.min(1, fill)) * 100)}%`;
    if (this.changed('waveFill', fillPct)) this.waveBar.style.width = fillPct;

    this.mmPlayer.style.bottom = `${Math.max(0, Math.min(100, this.pct(v.playerZ)))}%`;
    const surge = v.wavePhase === 'surge';
    if (this.changed('mmWaveOn', surge)) this.mmWave.classList.toggle('hidden', !surge);
    if (surge) this.mmWave.style.bottom = `${Math.max(0, Math.min(100, this.pct(v.frontZ)))}%`;

    const carryKey = `${v.capacity}|${v.carried.map((c) => `${c.speciesId}:${c.mutation}`).join(',')}`;
    if (this.changed('carry', carryKey)) this.renderCarry(v.carried, v.capacity);

    if (this.changed('badge', v.canAffordSomething)) this.upgradeBadge.classList.toggle('hidden', !v.canAffordSomething);

    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.bannerEl.classList.add('hidden');
    }
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.flashEl.classList.remove('on');
    }
  }

  private renderCarry(carried: CreatureRef[], capacity: number): void {
    this.carry.innerHTML = '';
    for (let i = 0; i < capacity; i++) {
      const c = carried[i];
      const slot = el('div', 'carry-slot');
      if (c) {
        const s = getSpecies(c.speciesId);
        slot.style.borderColor = RARITIES[s.rarity].color;
        slot.classList.add('full');
        const img = el('img');
        img.src = this.icons.get(c);
        img.alt = creatureLabel(c);
        slot.title = `${creatureLabel(c)} (${RARITIES[s.rarity].name}) ${formatCash(creatureIncome(c))}/s`;
        slot.append(img);
        if (c.mutation > 0) slot.append(el('span', `mut mut-${c.mutation}`, MUTATIONS[c.mutation].name[0]));
      }
      this.carry.append(slot);
    }
  }

  toast(text: string, color = '#ffffff'): void {
    const t = el('div', 'toast');
    t.textContent = text;
    t.style.color = color;
    this.toasts.prepend(t);
    while (this.toasts.children.length > 4) this.toasts.lastChild?.remove();
    setTimeout(() => t.classList.add('out'), 2200);
    setTimeout(() => t.remove(), 2700);
  }

  banner(title: string, sub = '', color = '#ffffff', seconds = 2.6): void {
    this.bannerEl.innerHTML = '';
    const tEl = el('div', 'banner-title');
    tEl.textContent = title;
    tEl.style.color = color;
    const sEl = el('div', 'banner-sub');
    sEl.textContent = sub;
    this.bannerEl.append(tEl, sEl);
    this.bannerEl.classList.remove('hidden');
    // Restart the pop animation.
    void this.bannerEl.offsetWidth;
    this.bannerEl.classList.add('pop');
    this.bannerTimer = seconds;
  }

  hint(text: string | null): void {
    if (!this.changed('hint', text ?? '')) return;
    this.hintEl.classList.toggle('hidden', !text);
    if (text) this.hintEl.textContent = text;
  }

  flash(color: string, seconds = 0.5): void {
    this.flashEl.style.background = color;
    this.flashEl.classList.add('on');
    this.flashTimer = seconds;
  }

  // ---------- Panels ----------

  togglePanel(kind: 'upgrades' | 'index'): void {
    if (this.panelKind === kind) this.closePanel();
    else if (kind === 'upgrades') this.openUpgrades();
    else this.openIndex();
  }

  private showPanel(kind: 'upgrades' | 'index' | 'welcome'): void {
    const wasOpen = this.panelKind !== null;
    this.panelKind = kind;
    this.backdrop.classList.remove('hidden');
    if (!wasOpen) this.actions.panelChanged(true);
  }

  closePanel(): void {
    if (!this.panelKind) return;
    this.panelKind = null;
    this.backdrop.classList.add('hidden');
    this.panel.innerHTML = '';
    this.actions.panelChanged(false);
  }

  private header(title: string): HTMLElement {
    const h = el('div', 'panel-head');
    h.append(el('h2', '', title));
    const close = el('button', 'btn close', '✕');
    close.addEventListener('click', () => this.closePanel());
    h.append(close);
    return h;
  }

  openUpgrades(): void {
    this.showPanel('upgrades');
    this.renderUpgrades();
  }

  renderUpgrades(): void {
    if (this.panelKind !== 'upgrades') return;
    const s = this.state;
    this.panel.innerHTML = '';
    this.panel.className = 'panel upgrades';
    this.panel.append(this.header('🛒 Upgrades'));
    this.panel.append(el('div', 'panel-cash', `You have <b>${formatCash(s.cash)}</b> · earning <b>${formatCash(s.incomePerSec())}/s</b>`));
    const list = el('div', 'upgrade-list');
    for (const key of UPGRADE_ORDER) {
      const def = UPGRADES[key];
      const level = s.levels[key];
      const maxed = level >= def.maxLevel;
      const row = el('div', 'upgrade-row');
      const now = def.format(def.value(level));
      const next = maxed ? 'MAX' : def.format(def.value(level + 1));
      row.innerHTML = `
        <div class="up-icon">${def.iconId}</div>
        <div class="up-info">
          <div class="up-name">${def.name} <span class="up-level">Lv ${level}/${def.maxLevel}</span></div>
          <div class="up-desc">${def.desc}</div>
          <div class="up-stat">${now} ${maxed ? '' : `→ <b>${next}</b>`}</div>
        </div>`;
      const btn = el('button', 'btn buy');
      if (maxed) {
        btn.textContent = 'MAXED';
        btn.disabled = true;
      } else {
        const cost = s.upgradeCost(key);
        btn.textContent = formatCash(cost);
        btn.classList.toggle('cant', s.cash < cost);
        btn.addEventListener('click', () => this.actions.buy(key));
      }
      row.append(btn);
      list.append(row);
    }
    this.panel.append(list);

    const rb = el('div', 'rebirth-box');
    const cost = s.rebirthCost();
    rb.innerHTML = `
      <div class="rb-title">⭐ Rebirth</div>
      <div class="rb-desc">Earn <b>×${rebirthMultiplier(s.rebirths + 1).toFixed(1)}</b> cash forever (now ×${rebirthMultiplier(s.rebirths).toFixed(1)}).
      Resets your cash and upgrades. You keep your creatures and Index.</div>`;
    const rbBtn = el('button', 'btn rebirth', `Rebirth · ${formatCash(cost)}`);
    rbBtn.classList.toggle('cant', !s.canRebirth());
    // Two taps to confirm (no browser popups: they can be blocked inside game-portal iframes).
    let armedUntil = 0;
    rbBtn.addEventListener('click', () => {
      if (!s.canRebirth() || performance.now() < armedUntil) {
        this.actions.rebirth();
        return;
      }
      armedUntil = performance.now() + 3000;
      rbBtn.textContent = 'Tap again to rebirth!';
      setTimeout(() => {
        if (rbBtn.isConnected) rbBtn.textContent = `Rebirth · ${formatCash(cost)}`;
      }, 3000);
    });
    rb.append(rbBtn);
    this.panel.append(rb);
  }

  openIndex(): void {
    this.showPanel('index');
    const s = this.state;
    this.panel.innerHTML = '';
    this.panel.className = 'panel index';
    const found = SPECIES.filter((sp) => (s.index[sp.id] ?? 0) > 0).length;
    this.panel.append(this.header(`📖 Creature Index · ${found}/${SPECIES.length}`));
    this.panel.append(el('div', 'panel-cash', 'Grab every creature in every mutation: Normal, Gold, Diamond, Rainbow.'));
    const grid = el('div', 'index-grid');
    for (const sp of SPECIES) {
      const mask = s.index[sp.id] ?? 0;
      const card = el('div', `index-card${mask ? '' : ' unknown'}`);
      const rarity = RARITIES[sp.rarity];
      card.style.borderColor = rarity.color;
      if (mask) {
        const img = el('img');
        img.src = this.icons.get({ speciesId: sp.id, mutation: 0 });
        img.alt = sp.name;
        card.append(img);
      } else {
        card.append(el('div', 'unknown-icon', '?'));
      }
      card.append(el('div', 'ic-name', mask ? sp.name : '???'));
      const meta = el('div', 'ic-meta');
      meta.innerHTML = `<span style="color:${rarity.color}">${rarity.name}</span>`;
      card.append(meta);
      const dots = el('div', 'ic-dots');
      MUTATIONS.forEach((m, i) => {
        const d = el('i', mask & (1 << i) ? 'on' : '');
        d.style.background = mask & (1 << i) ? m.color : '';
        d.title = m.name;
        dots.append(d);
      });
      card.append(dots);
      grid.append(card);
    }
    this.panel.append(grid);
  }

  showWelcome(earned: number, onCollect: () => void): void {
    this.showPanel('welcome');
    this.panel.innerHTML = '';
    this.panel.className = 'panel welcome';
    this.panel.append(el('h2', '', '👋 Welcome back!'));
    this.panel.append(el('p', '', `Your creatures earned <b>${formatCash(earned)}</b> while you were away.`));
    const btn = el('button', 'btn buy big', 'Collect');
    btn.addEventListener('click', () => {
      onCollect();
      this.closePanel();
    });
    this.panel.append(btn);
  }
}
