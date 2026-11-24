import { editedAt, lineAt, memberFrom } from './ide';
import { COMMAND_KEYS } from './keys';
import { LESSONS, type IdeLesson } from './lessons';
import { declarationOf, fileText, isProjectFile, membersOf, search, testOf, wordAt } from './project';

const IDE_LESSONS = LESSONS.filter((lesson): lesson is IdeLesson => lesson.kind === 'ide');

describe('dojo lessons', () => {
  it('are two hundred, two of vim to one of IntelliJ', () => {
    expect(LESSONS.length).toBe(200);
    expect(IDE_LESSONS.length).toBe(66);
  });

  it('have ids of their own', () => {
    expect(new Set(LESSONS.map((lesson) => lesson.id)).size).toBe(LESSONS.length);
  });

  it('give one shortcut one action, however often it comes', () => {
    const actions = new Map<string, Set<string>>();
    for (const lesson of IDE_LESSONS)
      actions.set(lesson.chord, (actions.get(lesson.chord) ?? new Set()).add(lesson.action));
    for (const [chord, names] of actions) expect([...names], chord).toHaveLength(1);
  });

  it('leave the keys of the dojo itself alone', () => {
    for (const lesson of IDE_LESSONS) expect(COMMAND_KEYS[lesson.chord], lesson.id).toBeUndefined();
  });

  for (const lesson of IDE_LESSONS.filter((each) => each.start || each.does)) {
    it(`${lesson.id} can be done in the project`, () => {
      const start = lesson.start;
      const does = lesson.does;
      const text = start ? (start.lines?.join('\n') ?? fileText(start.file)) : '';
      const head = start?.at ? wordAt(text, start.at) : 0;
      if (start) {
        expect(isProjectFile(start.file), 'start file').toBe(true);
        expect(head, `${start.at} in the start`).toBeGreaterThanOrEqual(0);
        if (start.lines) expect(text, 'a rewrite changes something').not.toBe(fileText(start.file));
      }
      switch (does?.kind) {
        case 'find':
          expect(search(does.query).some((hit) => hit.file === does.file)).toBe(true);
          break;
        case 'structure':
          expect(membersOf(start!.file).map((member) => member.text)).toContain(does.member);
          break;
        case 'declaration':
          expect(declarationOf(start!.at!)).not.toBeNull();
          break;
        case 'test':
          expect(testOf(start!.file)).not.toBeNull();
          break;
        case 'rename':
        case 'usages':
          expect(start?.at).toBeTruthy();
          break;
        case 'rewrite':
          expect(start?.lines).toBeDefined();
          break;
        case 'line':
          expect(does.line).toBeLessThanOrEqual(text.split('\n').length);
          break;
        case 'method':
          expect(memberFrom(start!.file, lineAt(text, head), does.step)).not.toBeNull();
          break;
        case 'caret':
          expect(start).toBeDefined();
          break;
        case 'edit':
          expect(start?.at).toBeTruthy();
          if (start?.lines)
            expect(editedAt(text, head, does.edit).text, 'back to the file').toBe(fileText(start.file));
          break;
      }
    });
  }
});
