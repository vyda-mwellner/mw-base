import { blend, skyAt, sunTimes } from './sky';

const at = (month: number, day: number, hour: number, minute = 0): Date =>
  new Date(2026, month - 1, day, hour, minute);

describe('sunTimes', () => {
  it('has long days in June and short ones in December', () => {
    const june = sunTimes(at(6, 21, 12));
    const december = sunTimes(at(12, 21, 12));

    expect(june.set - june.rise).toBeGreaterThan(15.5);
    expect(december.set - december.rise).toBeLessThan(8.7);
  });

  it('puts noon between sunrise and sunset', () => {
    const { rise, set } = sunTimes(at(3, 20, 12));

    expect(set - rise).toBeCloseTo(12, 0);
  });
});

describe('skyAt', () => {
  it('is dark with the moon up at midnight', () => {
    const sky = skyAt(at(11, 18, 0));

    expect(sky.light).toBe(0);
    expect(sky.sun).toBeNull();
    expect(sky.moon).toBeGreaterThan(0.3);
    expect(sky.moon).toBeLessThan(0.7);
  });

  it('is light with the sun halfway at solar noon', () => {
    const { rise, set } = sunTimes(at(6, 21, 12));
    const noon = (rise + set) / 2;
    const sky = skyAt(at(6, 21, Math.floor(noon), Math.round((noon % 1) * 60)));

    expect(sky.light).toBe(1);
    expect(sky.sun).toBeCloseTo(0.5, 1);
    expect(sky.moon).toBeNull();
  });

  it('is half light at sunrise', () => {
    const { rise } = sunTimes(at(6, 21, 12));
    const sky = skyAt(at(6, 21, Math.floor(rise), Math.round((rise % 1) * 60)));

    expect(sky.light).toBeGreaterThan(0.4);
    expect(sky.light).toBeLessThan(0.6);
  });
});

describe('blend', () => {
  it('goes from one colour to the other', () => {
    expect(blend('#000000', '#ffffff', 0)).toBe('#000000');
    expect(blend('#000000', '#ffffff', 1)).toBe('#ffffff');
    expect(blend('#102030', '#304050', 0.5)).toBe('#203040');
  });
});
