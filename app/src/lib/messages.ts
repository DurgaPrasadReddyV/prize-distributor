/**
 * What a refusal says to a Person.
 *
 * The system has two grades of refusal and they must never read the same way.
 *
 *   ENFORCED — the repository refused. The Award file exists. No client can
 *   write around it, including a hostile one. This is a fact about the Ledger.
 *
 *   ADVISORY — the application declined. A determined user could write around
 *   it. This is a judgement, and should not be dressed up as a rule.
 *
 * A Person who can tell which bends and which does not will trust both,
 * including the one that is unbypassable. Two identical "something went wrong"
 * messages would discredit the guarantee along with the ordinary error.
 */

import type { Refusal } from './ledger';
import { resolveRefusal } from './ledger';

export interface Message {
  tone: 'good' | 'warn' | 'bad' | 'idle';
  headline: string;
  /** What the Person reads. Says what happened and what to do next. */
  detail: string;
  /**
   * How strong the refusal is. This is what a *maintainer* needs, not a
   * Distributor: 'enforced' means the repository refused and nothing can write
   * around it, 'advisory' means the app declined. It is deliberately not
   * surfaced in `detail`, because explaining the architecture to someone who
   * just lost a race helps nobody.
   */
  strength?: 'enforced' | 'advisory';
}

const name = (login: string) => login.charAt(0).toUpperCase() + login.slice(1);

/**
 * Already Won — ENFORCED by the repository.
 *
 * Tone is 'good' deliberately. The rule held, which is the system working, and
 * amber would say the opposite of what the words say. A Person who loses this
 * race has done nothing wrong and there is nothing to fix.
 */
export function alreadyWon(personLogin: string): Message {
  return {
    tone: 'good',
    strength: 'enforced',
    headline: `${name(personLogin)} already has a prize`,
    detail: 'Someone got there first. Their prize is the only one they will ever get.',
  };
}

/** Stock exhausted — ADVISORY. The app is declining, and says what to do. */
export function prizeExhausted(prizeName: string, left: number): Message {
  const prize = prizeName.toLowerCase();
  return {
    tone: 'warn',
    strength: 'advisory',
    headline: `No ${prize} left to give`,
    detail:
      left === 0
        ? `Every ${prize} in the allocation has been given out. If that is wrong, raise the ` +
          'allocation in config/config.json — it takes effect immediately.'
        : `Only ${left} ${prize}${left === 1 ? '' : 's'} remain, so there is none spare. Raise ` +
          'the allocation in config/config.json if that is wrong.',
  };
}

/** Self-issuance — ADVISORY, and a route forward rather than a dead end. */
export function selfIssuance(distributorLogin: string): Message {
  return {
    tone: 'warn',
    strength: 'advisory',
    headline: 'You cannot issue this one',
    detail:
      `You are the distributor, and ${name(distributorLogin)} would be the recipient. ` +
      'Ask the deputy named in config/distributors.json to issue it instead.',
  };
}

/**
 * A refused Award, resolved by looking rather than by trusting a status code.
 * `refusal.strength` — set when the refusal was resolved — is carried through
 * for maintainers but never shown to a Person.
 */
export function awardRefused(
  refusal: Refusal,
  personLogin: string,
  prizeName: string,
): Message {
  if (refusal.outcome === 'already-won') return alreadyWon(personLogin);

  if (refusal.outcome === 'blocked') {
    return {
      tone: 'bad',
      strength: refusal.strength,
      headline: 'You cannot write to this repository',
      detail:
        'The token needs "Contents: read and write" on this repository, and it lasts 90 days. ' +
        'It may have expired — check, or paste a fresh one.',
    };
  }

  if (refusal.outcome === 'retryable') {
    return {
      tone: 'warn',
      strength: refusal.strength,
      headline: 'That did not save',
      detail:
        `${name(personLogin)} has not been given the ${prizeName.toLowerCase()} — ` +
        'nothing was written, so it is safe to try again.',
    };
  }

  return {
    tone: 'bad',
    strength: refusal.strength,
    headline: 'Something went wrong',
    detail:
      `This app does not recognise what happened, but no ${prizeName.toLowerCase()} was given out. ` +
      'Nothing was written, so it is safe to try again.',
  };
}

/** A refused Entry edit: 409 here means a Person, not a rule. */
export function entryEditLost(): Message {
  return {
    tone: 'warn',
    headline: 'Someone else changed this claim',
    detail:
      'Their version is still here — nothing was overwritten. Reload to see it, then decide ' +
      'whether your change is still needed.',
  };
}

/** Token problems, said plainly at paste time. */
export function tokenProblem(message: string): Message {
  return { tone: 'bad', headline: 'That token did not work', detail: message };
}

export function overScopedToken(scopes: string[]): Message {
  return {
    tone: 'warn',
    headline: 'This token can do more than it needs to',
    detail:
      `It carries: ${scopes.join(', ') || 'broad repository access'}. ` +
      'A fine-grained token limited to this one repository, with only "Contents: read and ' +
      'write", is enough. Consider replacing it — this app never needs more.',
  };
}

export { resolveRefusal };
