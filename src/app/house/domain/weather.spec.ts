import { coordinatesOf, outsideOf } from './weather';

describe('outsideOf', () => {
  it('takes the share of clouds and rounds the degrees', () => {
    expect(outsideOf({ temperature_2m: 6.6, cloud_cover: 75, weather_code: 3 })).toEqual({
      cloud: 0.75,
      falling: null,
      temperature: 7,
    });
  });

  it('lets drizzle, showers and thunder fall as rain and the snow codes as snow', () => {
    const fall = (weather_code: number) =>
      outsideOf({ temperature_2m: 0, cloud_cover: 100, weather_code }).falling;

    expect([51, 63, 81, 95].map(fall)).toEqual(['rain', 'rain', 'rain', 'rain']);
    expect([71, 77, 85, 86].map(fall)).toEqual(['snow', 'snow', 'snow', 'snow']);
    expect([0, 2, 45].map(fall)).toEqual([null, null, null]);
  });
});

describe('coordinatesOf', () => {
  it('needs both numbers of the place', () => {
    expect(coordinatesOf({ name: 'Irgendwo', latitude: 48.7, longitude: 9.4 })).toEqual({
      latitude: 48.7,
      longitude: 9.4,
    });
    expect(coordinatesOf({ name: 'Irgendwo' })).toBeUndefined();
    expect(coordinatesOf(null)).toBeUndefined();
  });
});
