import type { RequestTimeScale } from '../contracts';

type Id = Parameters<RequestTimeScale>[0];

/**
 * The one place that decides sim speed. Modules ask for a scale; the lowest live request wins.
 * Eases toward the target (in over 80 ms, out over 100 ms) so slow-mo never snaps.
 */
export class TimeScale {
  private readonly live = new Map<Id, { scale: number; left: number }>();
  private current = 1;

  readonly request: RequestTimeScale = (id, scale, ms) => {
    if (ms <= 0) this.live.delete(id);
    else this.live.set(id, { scale: Math.max(0, Math.min(1, scale)), left: ms / 1000 });
  };

  get value(): number {
    return this.current;
  }

  update(realDt: number): number {
    let target = 1;
    for (const [id, r] of this.live) {
      r.left -= realDt;
      if (r.left <= 0) this.live.delete(id);
      else target = Math.min(target, r.scale);
    }
    const tau = target < this.current ? 0.08 : 0.1;
    const k = 1 - Math.exp(-realDt / (tau / 3));
    this.current += (target - this.current) * k;
    if (Math.abs(this.current - target) < 0.002) this.current = target;
    return this.current;
  }

  clear(): void {
    this.live.clear();
    this.current = 1;
  }
}
