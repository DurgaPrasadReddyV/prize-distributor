/**
 * Talking to GitHub as the storage layer.
 *
 * Two rules shape everything here:
 *
 * 1. Reads need no token at all. A public repository's files are fetchable
 *    anonymously, so the app is fully browsable before anyone signs in.
 * 2. Writes go through the git data API using the Person's own token, and the
 *    repository — not this code — decides whether they are allowed. A refusal
 *    here is information, not a verdict; `resolveRefusal` settles what it means.
 */

const API = 'https://api.github.com';
const RAW = 'https://raw.githubusercontent.com';
const REPO = 'DurgaPrasadReddyV/prize-distributor';

import type { Award, Entry } from './ledger';

export interface TokenInfo {
  login: string;
  name: string | null;
  /** True when the token carries more permission than this app needs. */
  overScoped: boolean;
  scopes: string[];
}

export class WriteRefused extends Error {
  status: number;
  /** Whether the Award file was found afterwards. Settles the meaning. */
  awardFileExists: boolean;

  constructor(status: number, awardFileExists: boolean) {
    super(`write refused: ${status}`);
    this.name = 'WriteRefused';
    this.status = status;
    this.awardFileExists = awardFileExists;
  }
}

const authHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
});

// ---------------------------------------------------------------- identity

/**
 * Identify the Person holding a token, and warn if it is more powerful than
 * this app needs. A fine-grained token scoped to this one repository is the
 * expectation; a classic `repo` token can write to every other repository the
 * Person can reach, which is worth saying out loud at paste time.
 */
export async function identify(token: string): Promise<TokenInfo> {
  const res = await fetch(`${API}/user`, { headers: authHeaders(token) });
  if (!res.ok) {
    throw new Error(
      res.status === 401
        ? 'That token was not accepted. It may have expired, or been revoked.'
        : `Could not check the token (${res.status}).`,
    );
  }
  const me = await res.json();
  const scopes = (res.headers.get('x-oauth-scopes') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // A fine-grained token reports no OAuth scopes at all; its reach is the
  // repository list, which we check separately. A `repo` scope here means a
  // classic token, which is broader than this app needs.
  const overScoped = scopes.includes('repo') || scopes.includes('write:org');
  return { login: me.login, name: me.name, overScoped, scopes };
}

/**
 * Whether the Person may write. GitHub answers "read" rather than refusing for
 * anyone at all, so this compares the permission rather than trusting that the
 * call succeeded — a check phrased as "did GitHub let me ask?" would call
 * every GitHub user a Contributor.
 */
export async function permission(token: string): Promise<string> {
  const res = await fetch(
    `${API}/repos/${REPO}/collaborators/${encodeURIComponent(
      await identify(token).then((i) => i.login),
    )}/permission`,
    { headers: authHeaders(token) },
  );
  if (!res.ok) return 'none';
  const body = await res.json();
  return body.role_name ?? body.permission ?? 'none';
}

export const canWrite = (perm: string) =>
  perm === 'admin' || perm === 'write' || perm === 'maintain';

// ------------------------------------------------------------------ config

export interface Prize {
  id: string;
  name: string;
  allocation: number;
}
export interface PersonRow {
  login: string;
  name: string;
}
export interface EventRow {
  id: string;
  name: string;
  year: number;
}
export interface AppConfig {
  events: EventRow[];
  prizes: Record<string, Prize>;
  people: Record<string, PersonRow>;
  /** The office, from its own file. Empty means nobody may issue a prize. */
  distributors: string[];
}
export interface DistributorConfig {
  distributors: string[];
}

/** Config is read at runtime, so a change takes effect on edit, not on build. */
export async function loadConfig(): Promise<AppConfig> {
  const [cfg, dist] = await Promise.all([
    fetchJson(`${RAW}/${REPO}/main/config/config.json`),
    fetchJson(`${RAW}/${REPO}/main/config/distributors.json`),
  ]);
  return {
    events: cfg.events ?? [],
    prizes: Object.fromEntries((cfg.prizes ?? []).map((p: Prize) => [p.id, p])),
    people: Object.fromEntries((cfg.people ?? []).map((p: PersonRow) => [p.login, p])),
    distributors: dist.distributors ?? [],
  };
}

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status}).`);
  return res.json();
}

// ------------------------------------------------------------------ ledger

const contentsUrl = (path: string) => `${API}/repos/${REPO}/contents/${path}`;

export async function readFile<T>(path: string): Promise<T | null> {
  const res = await fetch(contentsUrl(path));
  if (res.status === 404) return null; // absence is meaning, not failure
  if (!res.ok) throw new Error(`Could not read ${path} (${res.status}).`);
  const body = await res.json();
  return JSON.parse(fromBase64(body.content)) as T;
}

/** List the file names in a directory, or [] when it does not exist yet. */
export async function listDir(path: string): Promise<string[]> {
  const res = await fetch(contentsUrl(path));
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Could not list ${path} (${res.status}).`);
  const body = await res.json();
  return Array.isArray(body) ? body.filter((f) => f.type === 'file').map((f) => f.name) : [];
}

/**
 * The single write the whole cap rests on.
 *
 * No `sha` is sent, which makes this an atomic create-if-absent: two writers
 * racing produce one `201` and one refusal, and neither can overwrite the other.
 * The `Person` is also the idempotency key, so a double-click or a retried
 * request simply lands here again and is refused — which is the correct answer,
 * not an error to be retried forever.
 *
 * On refusal we go and LOOK, because 409 (a genuine race) and 422 (a late
 * create, i.e. a double-click) both mean the same thing and only the file can
 * tell us which happened.
 */
export async function issueAward(
  token: string,
  award: Award,
): Promise<void> {
  const path = `data/awards/${award.personId as string}.json`;
  const res = await fetch(contentsUrl(path), {
    method: 'PUT',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `award: ${award.personId} wins ${award.prizeId}`,
      content: toBase64(JSON.stringify(award, null, 2)),
      // no `sha` — this IS the create-if-absent guard
    }),
  });
  if (res.ok) return;

  const exists = (await readFile(path)) !== null;
  throw new WriteRefused(res.status, exists);
}

/** Create an Entry. Each Entry has its own id, so creations never collide. */
export async function createEntry(
  token: string,
  entry: Entry,
): Promise<void> {
  const path = `data/entries/${entry.id as string}.json`;
  const res = await fetch(contentsUrl(path), {
    method: 'PUT',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `entry: claim ${entry.personId} won ${entry.eventId}`,
      content: toBase64(JSON.stringify(entry, null, 2)),
    }),
  });
  if (!res.ok) throw new Error(`Could not record the claim (${res.status}).`);
}

/** Update a pending Entry. A stale `sha` yields 409, which means a person won. */
export async function updateEntry(
  token: string,
  path: string,
  sha: string,
  entry: Entry,
  message: string,
): Promise<void> {
  const res = await fetch(contentsUrl(path), {
    method: 'PUT',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, content: toBase64(JSON.stringify(entry, null, 2)), sha }),
  });
  if (!res.ok) throw new WriteRefused(res.status, false);
}

// Base64 for the content API. Implemented with TextEncoder so the module works
// unchanged in a browser and under Node, with no dependency on either's globals.
const toBase64 = (s: string): string => {
  const bytes = new TextEncoder().encode(s);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
};

const fromBase64 = (s: string): string => {
  const binary = atob(s);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};
