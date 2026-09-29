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
  detail: string;
}

const name = (login: string) => login.charAt(0).toUpperCase() + login.slice(1);

/** Already Won: enforced by the repository, and a good outcome, not a failure. */
export function alreadyWon(personLogin: string): Message {
  return {
    tone: 'warn',
    headline: `${name(personLogin)} already has a prize`,
    detail:
      'Someone got there first, so nothing was written. This is the one-prize rule working, not a problem — there is nothing to retry and nothing to fix.',
  };
}

/** Stock exhausted: the app declining, named specifically so it reads as such. */
export function prizeExhausted(prizeName: string, left: number): Message {
  return {
    tone: 'warn',
    headline: `No ${prizeName.toLowerCase()} left to give`,
    detail:
      `All ${prizeName.toLowerCase()}s in the allocation have been given out (${left} remaining). ` +
      'This is the app checking, rather than a rule it cannot get around — if stock was ' +
      'miscounted, add to the allocation in config and it takes effect straight away.',
  };
}

/** Self-issuance: a conflict of interest, refused by the app. */
export function selfIssuance(distributorLogin: string): Message {
  return {
    tone: 'warn',
    headline: 'A distributor cannot issue to themselves',
    detail:
      `You are the distributor, so you cannot award ${name(distributorLogin)}. ` +
      'The deputy named in config can issue this instead. This is a judgement the app makes, ' +
      'not a rule stored in the repository.',
  };
}

/** A refused Award, resolved by looking. `refusal.strength` picks the wording. */
export function awardRefused(
  refusal: Refusal,
  personLogin: string,
  prizeName: string,
): Message {
  void prizeName; // named in the retryable branch below, if stock is relevant
  if (refusal.outcome === 'already-won') return alreadyWon(personLogin);
  if (refusal.outcome === 'blocked') {
    return {
      tone: 'bad',
      headline: 'This account cannot write to the repository',
      detail:
        'A fine-grained token with "Contents: read and write" on this repository is needed. ' +
        'Check the token has not expired — they last 90 days.',
    };
  }
  if (refusal.outcome === 'retryable') {
    return {
      tone: 'warn',
      headline: 'That did not save',
      detail:
        `No ${prizeName.toLowerCase()} was given to ${name(personLogin)}, so it is safe to try again. ` +
        'Nothing has been handed out at this point.',
    };
  }
  return {
    tone: 'bad',
    headline: 'Something went wrong',
    detail: 'The write failed in a way this app does not recognise. Nothing was written.',
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
