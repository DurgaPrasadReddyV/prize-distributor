import { describe, it, expect } from 'vitest';
import {
  alreadyWon,
  awardRefused,
  entryEditLost,
  overScopedToken,
  prizeExhausted,
  selfIssuance,
  tokenProblem,
} from './messages';
import { resolveRefusal } from './ledger';

const said = (m: { headline: string; detail: string }) =>
  `${m.headline} ${m.detail}`.toLowerCase();

/**
 * The earlier version of this file asserted only that the strings *differed*.
 * They did differ, and the UI was still wrong: Already Won was painted amber,
 * the same colour as refusals that merely bend. These tests check the things
 * a person actually perceives — colour, and whether jargon leaks out.
 */
describe('Already Won is a good outcome, and is coloured like one', () => {
  it('is NOT the same tone as the refusals that merely bend', () => {
    // The bug this file exists to catch: identical tone made the one unbypassable
    // rule look like the ordinary app-declines errors.
    expect(alreadyWon('alex').tone).not.toBe(prizeExhausted('Keyboard', 0).tone);
    expect(alreadyWon('alex').tone).not.toBe(selfIssuance('durga').tone);
  });

  it('reads as success, because the rule held', () => {
    expect(alreadyWon('alex').tone).toBe('good');
  });

  it('does not use failure words', () => {
    const t = said(alreadyWon('alex'));
    expect(t).not.toMatch(/went wrong|failed|could not|problem|error/);
  });

  it('tells the Person what is true: they have their one prize', () => {
    expect(said(alreadyWon('alex'))).toMatch(/only one|already has a prize/);
  });
});

describe('architecture jargon never reaches the Person', () => {
  const jargon = /app checking|rule it cannot|not a rule stored|enforced|advisory|judgement the app|repository is|the ledger|derived|atomic/;

  it('Already Won does not explain the system', () => {
    expect(said(alreadyWon('alex'))).not.toMatch(jargon);
  });

  it('exhausted stock gives an action, not a justification', () => {
    const m = prizeExhausted('Keyboard', 0);
    expect(said(m)).not.toMatch(jargon);
    expect(m.detail).toMatch(/config\/config\.json/); // says where to fix it
  });

  it('self-issuance names a way forward', () => {
    const m = selfIssuance('durga');
    expect(said(m)).not.toMatch(jargon);
    expect(m.detail).toMatch(/deputy/); // tells them who can do it
  });

  it('the token refusal points at the fix', () => {
    expect(awardRefused(resolveRefusal(403, false), 'alex', 'Keyboard').detail)
      .toMatch(/Contents: read and write|expired/);
  });
});

describe('strength is carried for maintainers, not shown to anyone', () => {
  it('marks Already Won as enforced', () => {
    expect(alreadyWon('alex').strength).toBe('enforced');
  });

  it('marks the bending refusals as advisory', () => {
    expect(prizeExhausted('Keyboard', 0).strength).toBe('advisory');
    expect(selfIssuance('durga').strength).toBe('advisory');
  });

  it('carries the resolved strength through awardRefused', () => {
    expect(awardRefused(resolveRefusal(409, true), 'alex', 'Keyboard').strength)
      .toBe('enforced');
    expect(awardRefused(resolveRefusal(409, false), 'alex', 'Keyboard').strength)
      .toBe('advisory');
  });
});

describe('both refusals of the same race produce identical wording', () => {
  it('409 and 422 with the file present read the same to a Person', () => {
    const a = awardRefused(resolveRefusal(409, true), 'alex', 'Keyboard');
    const b = awardRefused(resolveRefusal(422, true), 'alex', 'Keyboard');
    expect(said(a)).toBe(said(b));
    expect(a.tone).toBe(b.tone);
    expect(a.strength).toBe(b.strength);
  });
});

describe('nothing invites a retry that must not happen', () => {
  it('Already Won never says try again', () => {
    expect(said(alreadyWon('alex'))).not.toMatch(/try again|safe to/);
  });

  it('a genuine failure does say it is safe', () => {
    const m = awardRefused(resolveRefusal(409, false), 'alex', 'Keyboard');
    expect(said(m)).toMatch(/safe to try again/);
    expect(m.detail).toMatch(/nothing was written/i);
  });

  it('an unknown failure is still safe to retry, and says so', () => {
    expect(said(awardRefused(resolveRefusal(500, false), 'alex', 'Keyboard')))
      .toMatch(/safe to try again/);
  });

  it('a blocked write does NOT invite a retry', () => {
    expect(awardRefused(resolveRefusal(403, false), 'alex', 'Keyboard').detail)
      .not.toMatch(/try again/);
  });
});

describe('a 409 means different things on different paths', () => {
  it('on a pending Entry it names the other Person, not a rule', () => {
    const m = entryEditLost();
    expect(said(m)).toMatch(/someone else/);
    expect(said(m)).toMatch(/nothing was overwritten/i);
    expect(said(m)).not.toMatch(/one-prize|rule held/);
  });
});

describe('token problems are said plainly at paste time', () => {
  it('an over-scoped token is flagged without alarming', () => {
    const m = overScopedToken(['repo', 'gist']);
    expect(m.headline).toMatch(/more than it needs/);
    expect(m.detail).toMatch(/fine-grained/);
  });

  it('a rejected token says what to do', () => {
    expect(said(tokenProblem('That token was not accepted.'))).toMatch(/token/);
  });
});
