import { burst, CALM, chunk, fadeOf, fixedSteps, impact, popup, settle, SHAKE, shakeOf } from './juice';

describe('juice', () => {
  it('lets a hit die away by itself', () => {
    const hit = impact(CALM, { freeze: 0.08, trauma: 1, flash: 1, squash: 1 });
    const later = settle(hit, 0.3);

    expect(later).toMatchObject({ freeze: 0, trauma: 0, flash: 0, squash: 0 });
    expect(settle(hit, 0.04).freeze).toBeCloseTo(0.04);
  });

  it('comes back to CALM itself once everything has faded, so a still screen stays unchanged', () => {
    const hit = burst(impact(CALM, { trauma: 1, flash: 1 }), 0, 0, '#fff');

    expect(settle(hit, 0.1)).not.toBe(CALM);
    expect(settle(hit, 5)).toBe(CALM);
  });

  it('keeps the stronger of two hits instead of adding them up', () => {
    const twice = impact(impact(CALM, { trauma: 0.4, freeze: 0.05 }), { trauma: 0.9, freeze: 0.02 });

    expect(twice).toMatchObject({ trauma: 0.9, freeze: 0.05 });
    expect(impact(twice, { trauma: 5 }).trauma).toBe(1);
  });

  it('never moves the field further than three pixels, and not at all without a hit', () => {
    expect(shakeOf(CALM)).toEqual([0, 0]);
    for (let clock = 0; clock < 1; clock += 0.013) {
      const [x, y] = shakeOf({ ...CALM, trauma: 1, clock });

      expect(Math.hypot(x, 0)).toBeLessThanOrEqual(SHAKE);
      expect(Math.hypot(y, 0)).toBeLessThanOrEqual(SHAKE);
    }
    expect(Math.abs(shakeOf({ ...CALM, trauma: 0.5, clock: 0.1 })[0])).toBeLessThanOrEqual(SHAKE / 4);
  });

  it('throws specks up from a point and lets them fall and fade', () => {
    const fresh = burst(CALM, 10, -20, '#f8cd3f', 6);
    const later = settle(fresh, 0.1);

    expect(fresh.particles).toHaveLength(6);
    expect(fresh.particles.every((speck) => speck.vy < 0)).toBe(true);
    expect(later.particles[0].y).toBeLessThan(-20);
    expect(later.particles[0].vy).toBeGreaterThan(fresh.particles[0].vy);
    expect(settle(fresh, 1).particles).toHaveLength(0);
  });

  it('keeps a pool: more specks than fit push the oldest out', () => {
    const many = Array.from({ length: 6 }).reduce<typeof CALM>(
      (juice) => burst(juice, 0, 0, '#fff', 8),
      CALM,
    );

    expect(many.particles).toHaveLength(28);
  });

  it('drops a piece that was cut off', () => {
    const cut = chunk(CALM, { x: 5, y: -30, w: 20, h: 12, color: '#5b8def', vx: 30 });
    const later = Array.from({ length: 50 }).reduce<typeof CALM>((juice) => settle(juice, 0.01), cut);

    expect(later.particles[0].x).toBeCloseTo(20);
    expect(later.particles[0].y).toBeGreaterThan(-30);
  });

  it('lets a number rise and fades it over the last third of its time', () => {
    const shown = popup(CALM, 0, -40, '+5', 'gold');
    const later = settle(shown, 0.5);

    expect(later.popups[0].y).toBeLessThan(-40);
    expect(fadeOf(shown.popups[0])).toBe(1);
    expect(fadeOf(later.popups[0])).toBeLessThan(1);
    expect(settle(shown, 0.8).popups).toHaveLength(0);
  });

  it('cuts a frame into steps of one length and carries the rest over', () => {
    const first = fixedSteps(0, 0.0167, 1 / 120);
    const second = fixedSteps(first.carry, 0.0167, 1 / 120);

    expect(first.count).toBe(2);
    expect(first.carry).toBeCloseTo(0.0167 - 2 / 120);
    expect(first.count + second.count).toBe(4);
    expect(fixedSteps(0, 0.05, 1 / 120).count).toBe(6);
  });
});
