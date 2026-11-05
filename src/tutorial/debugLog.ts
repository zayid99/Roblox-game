// FTUE measurement (§7.5): per-step elapsed time, sea falls per step, timed hints fired, swing count.
// FtueLog is pure data (runs in node); mountFtueDebug() draws it for `?debug`.
import type { FtueStepId } from '../contracts';

export const FTUE_LOG_KEY = 'sos-ftue-log';
export const FTUE_LOG_MAX = 20;

export interface FtueStepRecord {
  step: FtueStepId;
  /** Real seconds from the FTUE start to the step start. */
  at: number;
  /** Real seconds spent in the step (null while it runs). */
  dur: number | null;
  /** Sim seconds spent in the step. */
  simDur: number | null;
  seaFalls: number;
  hints: string[];
}

export interface FtueSession {
  startedAt: number;          // Date.now() at start
  replay: boolean;
  steps: FtueStepRecord[];
  swings: number;
  seaFalls: number;
  outcome: 'running' | 'done' | 'skipped';
  /** Real seconds from start to done/skip. */
  total: number | null;
}

export type LogStorage = Pick<Storage, 'getItem' | 'setItem'>;

export class FtueLog {
  session: FtueSession | null = null;
  private real = 0;
  private sim = 0;
  private stepRealStart = 0;
  private stepSimStart = 0;

  constructor(private readonly storage: LogStorage | null = null, private readonly now: () => number = () => Date.now()) {}

  /** Starts a session; the first step is recorded by enter(). */
  begin(replay: boolean): void {
    this.real = 0;
    this.sim = 0;
    this.session = { startedAt: this.now(), replay, steps: [], swings: 0, seaFalls: 0, outcome: 'running', total: null };
  }

  tick(realDt: number, simDt: number): void {
    this.real += realDt;
    this.sim += simDt;
  }

  private get cur(): FtueStepRecord | null {
    const s = this.session;
    return s && s.steps.length ? s.steps[s.steps.length - 1] : null;
  }

  enter(step: FtueStepId): void {
    if (!this.session) return;
    this.close();
    this.stepRealStart = this.real;
    this.stepSimStart = this.sim;
    this.session.steps.push({ step, at: round(this.real), dur: null, simDur: null, seaFalls: 0, hints: [] });
  }

  private close(): void {
    const c = this.cur;
    if (c && c.dur === null) {
      c.dur = round(this.real - this.stepRealStart);
      c.simDur = round(this.sim - this.stepSimStart);
    }
  }

  swing(): void {
    if (this.session) this.session.swings++;
  }

  seaFall(): void {
    if (!this.session) return;
    this.session.seaFalls++;
    const c = this.cur;
    if (c) c.seaFalls++;
  }

  hint(id: string): void {
    const c = this.cur;
    if (c && !c.hints.includes(id)) c.hints.push(id);
  }

  finish(outcome: 'done' | 'skipped'): void {
    if (!this.session || this.session.outcome !== 'running') return;
    this.close();
    this.session.outcome = outcome;
    this.session.total = round(this.real);
    this.persist();
  }

  /** Mirrors the session into localStorage['sos-ftue-log'] (last 20 sessions). */
  persist(): void {
    if (!this.storage || !this.session) return;
    try {
      const raw = this.storage.getItem(FTUE_LOG_KEY);
      let list: FtueSession[] = raw ? (JSON.parse(raw) as FtueSession[]) : [];
      if (!Array.isArray(list)) list = [];
      const i = list.findIndex((s) => s.startedAt === this.session!.startedAt);
      if (i >= 0) list[i] = this.session;
      else list.push(this.session);
      this.storage.setItem(FTUE_LOG_KEY, JSON.stringify(list.slice(-FTUE_LOG_MAX)));
    } catch {
      // storage full or blocked: the log is best effort
    }
  }

  /** Plain-text timeline (one line per step). */
  lines(): string[] {
    const s = this.session;
    if (!s) return ['FTUE: not running'];
    const out = [`FTUE ${s.outcome}${s.replay ? ' (replay)' : ''}  t=${s.total ?? round(this.real)}s  swings=${s.swings}  sea=${s.seaFalls}`];
    for (const r of s.steps) {
      const dur = r.dur ?? round(this.real - this.stepRealStart);
      out.push(`${r.step.padEnd(8)} @${r.at.toFixed(1)}s  ${dur.toFixed(1)}s  sea ${r.seaFalls}${r.hints.length ? '  hints ' + r.hints.join(',') : ''}`);
    }
    return out;
  }
}

const round = (v: number) => Math.round(v * 10) / 10;

/** `?debug` overlay: a small fixed text panel refreshed twice a second. Returns a disposer. */
export function mountFtueDebug(root: HTMLElement, log: FtueLog): () => void {
  const el = document.createElement('pre');
  el.className = 'tut-debug';
  el.style.cssText =
    'position:fixed;left:8px;bottom:8px;margin:0;padding:6px 8px;background:rgba(10,8,32,.75);color:#fff;' +
    'font:12px/1.35 ui-monospace,monospace;border-radius:8px;pointer-events:none;z-index:100;white-space:pre';
  root.appendChild(el);
  const draw = () => {
    el.textContent = log.lines().join('\n');
  };
  draw();
  const id = setInterval(draw, 500);
  return () => {
    clearInterval(id);
    el.remove();
  };
}
