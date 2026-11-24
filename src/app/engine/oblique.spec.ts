import { box, disc, moved, project, shapesOf, tone } from './oblique';

describe('project', () => {
  it('keeps the front plane as it is and moves the depth up and to the right', () => {
    expect(project(10, 0, 20)).toEqual([10, -20]);
    expect(project(10, 20, 0)).toEqual([20, -8]);
  });
});

describe('tone', () => {
  it('turns warm towards the light and blue towards the shadow, never plain white or black', () => {
    expect(tone('#808080', 1)).toBe('#fff3d1');
    expect(tone('#808080', -1)).toBe('#15102e');
    expect(tone('#808080', 0.5)).toBe('#c0baa9');
    expect(tone('#123456', 0)).toBe('#123456');
  });
});

const faces = (part: Parameters<typeof shapesOf>[0]) => shapesOf(part).filter((shape) => 'points' in shape);

describe('shapesOf', () => {
  it('shows front, top and right side of a box, each in its own tone', () => {
    const shapes = faces(box(0, 0, 0, 10, 10, 10, '#808080'));

    expect(shapes.map((shape) => 'fill' in shape && shape.fill)).toEqual([
      '#808080',
      tone('#808080', 0.22),
      tone('#808080', -0.3),
    ]);
    expect(shapes[0]).toMatchObject({ points: '0,0 10,0 10,-10 0,-10' });
    expect(shapes[2]).toMatchObject({ points: '10,0 15,-4 15,-14 10,-10' });
  });

  it('lights the edge between front and top, and stands a front that is tall enough in a line of shadow', () => {
    const lines = shapesOf(box(0, 0, 0, 10, 10, 10, '#808080')).filter((shape) => 'd' in shape);

    expect(lines).toEqual([
      { d: 'M0.7 -0.7L9.3 -0.7', stroke: tone('#808080', -0.2) },
      { d: 'M0 -10L10 -10', stroke: tone('#808080', 0.55) },
    ]);
    expect(shapesOf(box(0, 0, 0, 3, 3, 3, '#808080')).filter((shape) => 'd' in shape)).toEqual([]);
  });

  it('draws the lit edge of a flat piece inside its face', () => {
    const lines = shapesOf(box(0, 44, 0, 6, 0, 6, '#808080')).filter((shape) => 'd' in shape);

    expect(lines).toEqual([{ d: 'M22.7 -22.9L27.3 -22.9', stroke: tone('#808080', 0.55) }]);
  });

  it('gives a speck no outline', () => {
    const [speck] = shapesOf(box(0, 0, 0, 1, 0, 1, '#808080'));

    expect(speck).toMatchObject({ fill: '#808080', stroke: '#808080' });
  });

  it('leaves a flat piece on the one face it lies in', () => {
    expect(faces(box(0, 44, 0, 10, 0, 10, '#808080'))).toHaveLength(1);
    expect(faces(box(0, 0, 0, 10, 10, 0, '#808080')).map((shape) => 'fill' in shape && shape.fill)).toEqual([
      tone('#808080', 0.22),
    ]);
    expect(faces(box(0, 0, 0, 0, 10, 10, '#808080')).map((shape) => 'fill' in shape && shape.fill)).toEqual([
      tone('#808080', -0.3),
    ]);
  });

  it('draws a wheel as a circle where its hub is', () => {
    expect(shapesOf(disc(10, 20, 5, 4, '#000000'))).toEqual([
      { cx: 20, cy: -13, r: 4, fill: '#000000', stroke: tone('#000000', -0.58) },
    ]);
    expect(shapesOf(disc(0, 0, 0, 4, '#ffffff', true))[0]).toMatchObject({ fill: 'none', stroke: '#ffffff' });
  });
});

describe('moved', () => {
  it('shifts every part and leaves size and colour alone', () => {
    expect(moved([box(1, 2, 3, 4, 5, 6, '#808080')], 10, 20, 30)).toEqual([
      box(11, 22, 33, 4, 5, 6, '#808080'),
    ]);
  });
});
