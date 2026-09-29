import { describe, it, expect } from 'vitest';
import {
  alreadyWon,
  awardRefused,
  entryEditLost,
  overScopedToken,
  prizeExhausted,
  selfIssuance,
} from './messages';
import { resolveRefusal } from './ledger';

const texts = (m: { headline: string; detail: string }) =>
  `${m.headline} ${m.detail}`.toLowerCase();

/**
 * The point of these tests is not that the strings exist, but that the two
 * grades of refusal are distinguishable — and that nothing invites a retry of
 * an Award that was refused because the Person already won.
 */
describe('the two grades of refusal must not read the same', () => {
  it('Already Won sounds like a rule holding, not a failure', () => {
    const t = texts(alreadyWon('alex'));
    expect(t).toContain('one-prize rule');
    expect(t).toMatch(/nothing to retry|nothing to fix/);
    // must not read as an error
    expect(t).not.toMatch(/went wrong|failed|try again/);
  });

  it('exhausted stock names the specific obstacle', () => {
    const m = prizeExhausted('Keyboard', 0);
    expect(m.headline).toContain('keyboard');
    expect(m.detail).toMatch(/allocation/);
  });

  it('the advisory refusals admit they are the app checking', () => {
    expect(prizeExhausted('Keyboard', 0).detail).toMatch(
      /app checking|rather than a rule/,
    );
    expect(selfIssuance('durga').detail).toMatch(
      /judgement the app makes|not a rule/,
    );
  });

  it('Already Won is NOT phrased as advisory, and the others are', () => {
    expect(alreadyWon('alex').detail).not.toMatch(/app checking/);
    expect(prizeExhausted('Keyboard', 0).detail).toMatch(/app checking/);
  });

  it('the two grades produce different text', () => {
    expect(texts(alreadyWon('alex'))).not.toBe(
      texts(prizeExhausted('Keyboard', 0)),
    );
    expect(texts(alreadyWon('alex'))).not.toBe(texts(selfIssuance('durga')));
  });
});

describe('nothing ever invites a retry that must not happen', () => {
  it('Already Won is distinguishable from a retryable failure by its text', () => {
    const won = texts(alreadyWon('alex'));
    const retryable = texts(
      awardRefused(resolveRefusal(409, false), 'alex', 'Keyboard'),
    );
    expect(retryable).toMatch(/safe to try again/);
    expect(won).not.toMatch(/safe to try again/);
  });

  it('both 409 and 422 with the file present produce the same text', () => {
    const via409 = awardRefused(resolveRefusal(409, true), 'alex', 'Keyboard');
    const via422 = awardRefused(resolveRefusal(422, true), 'alex', 'Keyboard');
    expect(texts(via409)).toBe(texts(via422));
  });

  it('a blocked write points at the token, not at a retry', () => {
    const m = awardRefused(resolveRefusal(403, false), 'alex', 'Keyboard');
    expect(texts(m)).toMatch(/fine-grained token|expired/);
    expect(m.detail).not.toMatch(/try again/);
  });
});

describe('a 409 means different things on different paths', () => {
  it('on a pending Entry it names the other Person, not a rule', () => {
    const m = entryEditLost();
    expect(texts(m)).toMatch(/someone else/);
    expect(texts(m)).toMatch(/nothing was overwritten/);
    expect(texts(m)).not.toMatch(/one-prize rule/);
  });
});

describe('token problems are said plainly at paste time', () => {
  it('an over-scoped token is flagged without alarming', () => {
    const m = overScopedToken(['repo', 'gist']);
    expect(m.headline).toMatch(/more than it needs/);
    expect(m.detail).toMatch(/fine-grained/);
  });
});
