// C4 currency pills: cash (with income and rebirth chips) and pearls.
import { formatBalance, formatIncome, formatPearls } from '../../game/economy';
import { el, gradText, replay, setText } from '../dom';
import { icon } from '../icons';

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/** A number that rolls toward its target: count-ups on discrete gains, count-downs on spends. */
class RollingValue {
  shown = 0;
  private from = 0;
  private to = 0;
  private t = 1;
  private dur = 0.45;
  private passiveAcc = 0;
  private init = false;

  constructor(
    private readonly fmt: (n: number) => string,
    private readonly valEl: HTMLElement,
    private readonly pill: HTMLElement,
    private readonly minW: number,
  ) {}

  /** Returns true when the text changed. */
  update(dt: number, target: number, passivePerSec: number, reduce: boolean): void {
    if (!this.init) {
      this.init = true;
      this.shown = this.to = this.from = target;
      this.write();
      return;
    }
    if (target !== this.to) {
      const diff = target - this.to;
      const passive = diff > 0 && diff <= Math.max(1, passivePerSec * 0.6);
      if (passive) {
        // Passive income: no pop, the text refreshes every 100 ms.
        this.to = target;
        if (this.t >= 1) this.shown = this.from = target;
      } else if (diff > 0) {
        const pop = diff >= 1 && diff >= this.to * 0.005;
        this.from = this.shown;
        this.to = target;
        this.t = 0;
        this.dur = 0.45;
        if (pop && !reduce) replay(this.pill, 'pop');
      } else {
        this.from = this.shown;
        this.to = target;
        this.t = 0;
        this.dur = 0.25;
        this.pill.classList.add('spend');
        window.setTimeout(() => this.pill.classList.remove('spend'), 150);
      }
    }
    if (this.t < 1) {
      this.t = Math.min(1, this.t + dt / this.dur);
      this.shown = this.from + (this.to - this.from) * easeOutCubic(this.t);
      if (this.t >= 1) this.shown = this.to;
      this.write();
    } else {
      this.passiveAcc += dt;
      if (this.passiveAcc >= 0.1) {
        this.passiveAcc = 0;
        this.shown = this.to;
        this.write();
      }
    }
  }

  private lastLen = 0;
  private write(): void {
    const txt = this.fmt(this.shown);
    setText(this.valEl, txt);
    if (txt.length > this.lastLen) {
      this.lastLen = txt.length;
      this.pill.style.minWidth = `max(${this.minW}px, calc(${txt.length}ch + 76px))`;
    }
  }
}

export class CashPart {
  readonly el: HTMLElement;
  readonly cashPill: HTMLElement;
  readonly pearlPill: HTMLElement;
  readonly cashIcon: HTMLElement;
  readonly pearlIcon: HTMLElement;
  private readonly cash: RollingValue;
  private readonly pearls: RollingValue;
  private readonly incomeTxt: HTMLElement;
  private readonly multChip: HTMLElement;
  private readonly incomeRow: HTMLElement;
  private last = { income: -1, mult: -1, pearlsShown: false, rebirths: -1 };
  /** Amount still "in flight" from coin flies; shown values exclude it until coins land. */
  heldCash = 0;
  heldPearls = 0;

  constructor() {
    this.el = el('div', 'tl');
    this.cashPill = el('div', 'pill pill--cash', `${icon('cash', 58)}${gradText('$0', 't-num num-cash val')}`);
    this.incomeRow = el('div', 'income-chip hud-hide', `<span class="chip">${icon('arrow-up', 14)}<span class="inc">+$0/s</span></span><span class="chip chip--gold mult">×1</span>`);
    this.pearlPill = el('div', 'pill pill--pearl hud-hide', `${icon('pearl', 42)}${gradText('0', 't-num num-pearl val')}`);
    this.el.append(this.cashPill, this.incomeRow, this.pearlPill);
    this.cashIcon = this.cashPill.querySelector('.ic') as HTMLElement;
    this.pearlIcon = this.pearlPill.querySelector('.ic') as HTMLElement;
    this.incomeTxt = this.incomeRow.querySelector('.inc') as HTMLElement;
    this.multChip = this.incomeRow.querySelector('.mult') as HTMLElement;
    this.cash = new RollingValue(formatBalance, this.cashPill.querySelector('.val') as HTMLElement, this.cashPill, 196);
    this.pearls = new RollingValue(formatPearls, this.pearlPill.querySelector('.val') as HTMLElement, this.pearlPill, 112);
  }

  update(dt: number, cash: number, income: number, multiplier: number, rebirths: number, pearls: number, reduce: boolean): void {
    this.cash.update(dt, Math.max(0, cash - this.heldCash), income, reduce);
    this.pearls.update(dt, Math.max(0, pearls - this.heldPearls), 0, reduce);
    if (income !== this.last.income) {
      this.last.income = income;
      setText(this.incomeTxt, `+${formatIncome(income)}`);
      // The income chip pops in with the first pedestal income (FTUE step earn, §7.2).
      const show = income > 0;
      if (show === this.incomeRow.classList.contains('hud-hide')) {
        this.incomeRow.classList.toggle('hud-hide', !show);
        if (show && !reduce) replay(this.incomeRow, 'fx-pop');
      }
    }
    if (rebirths !== this.last.rebirths || multiplier !== this.last.mult) {
      this.last.rebirths = rebirths;
      this.last.mult = multiplier;
      this.multChip.style.display = rebirths > 0 ? '' : 'none';
      setText(this.multChip, `×${+multiplier.toFixed(2)}`);
    }
    const showPearls = pearls > 0;
    if (showPearls !== this.last.pearlsShown) {
      this.last.pearlsShown = showPearls;
      this.pearlPill.classList.toggle('hud-hide', !showPearls);
      if (showPearls) replay(this.pearlPill, 'fx-pop');
    }
  }

  /** A coin landed: release part of the held amount (the roll continues from here). */
  release(currency: 'cash' | 'pearl', amount: number): void {
    if (currency === 'cash') this.heldCash = Math.max(0, this.heldCash - amount);
    else this.heldPearls = Math.max(0, this.heldPearls - amount);
  }
}
