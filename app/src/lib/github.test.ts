import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { issueAward, WriteRefused } from './github';
import { resolveRefusal } from './ledger';

/**
 * These tests pin the CONTRACT of the write path, not the network. The
 * prototype established the real behaviour against the live API; these assert
 * that this code sends the request that provokes it and interprets what comes
 * back the way the prototype showed it should.
 */

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const jsonRes = (status: number, body: unknown = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  headers: new Headers(),
});

const TOKEN = 'github_pat_test';

describe('issueAward — the write the cap rests on', () => {
  it('sends NO sha, which is what makes it an atomic create-if-absent', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(201, { content: { sha: 'abc' } }));

    await issueAward(TOKEN, { personId: 'alex', prizeId: 'keyboard', eventId: 'e', entryId: 'x', issuedBy: 'd', issuedAt: 't' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('data/awards/alex.json');
    const body = JSON.parse(init.body);
    expect(body).not.toHaveProperty('sha');
  });

  it('keys the path by Person, so one Award per Person is structural', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(201));
    await issueAward(TOKEN, { personId: 'sam', prizeId: 'keyboard', eventId: 'e', entryId: 'y', issuedBy: 'd', issuedAt: 't' });
    expect(fetchMock.mock.calls[0][0]).toContain('data/awards/sam.json');
  });

  it('carries the Person\'s own token, and never a client secret', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(201));
    await issueAward(TOKEN, { personId: 'alex', prizeId: 'keyboard', eventId: 'e', entryId: 'x', issuedBy: 'd', issuedAt: 't' });
    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(headers).not.toHaveProperty('client_secret');
  });
});

describe('refusals are resolved by LOOKING, not by the status code', () => {
  it('409 then the file exists -> Already Won, not retried', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes(409, { message: 'does not match' }))
      .mockResolvedValueOnce(jsonRes(200, { content: btoa('{}') }));

    await expect(issueAward(TOKEN, { personId: 'alex', prizeId: 'keyboard', eventId: 'e', entryId: 'x', issuedBy: 'd', issuedAt: 't' }))
      .rejects.toMatchObject({ status: 409, awardFileExists: true });

    expect(resolveRefusal(409, true)).toMatchObject({
      outcome: 'already-won',
      retry: false,
    });
  });

  it('422 then the file exists -> ALSO Already Won (the double-click case)', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes(422, { message: '"sha" wasn\'t supplied.' }))
      .mockResolvedValueOnce(jsonRes(200, { content: btoa('{}') }));

    const err = await issueAward(TOKEN, { personId: 'alex', prizeId: 'keyboard', eventId: 'e', entryId: 'x', issuedBy: 'd', issuedAt: 't' })
      .catch((e) => e as WriteRefused);

    expect(err).toBeInstanceOf(WriteRefused);
    expect((err as WriteRefused).status).toBe(422);
    expect((err as WriteRefused).awardFileExists).toBe(true);
    // The common case must NOT be reported as retryable.
    expect(resolveRefusal(422, true).retry).toBe(false);
  });

  it('409 then the file is ABSENT -> genuinely retryable', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes(409))
      .mockResolvedValueOnce(jsonRes(404, { message: 'Not Found' }));

    await expect(issueAward(TOKEN, { personId: 'alex', prizeId: 'keyboard', eventId: 'e', entryId: 'x', issuedBy: 'd', issuedAt: 't' }))
      .rejects.toMatchObject({ status: 409, awardFileExists: false });

    expect(resolveRefusal(409, false).retry).toBe(true);
  });

  it('checks the file after EVERY refusal, never trusting the code alone', async () => {
    for (const status of [409, 422, 403, 500]) {
      fetchMock.mockReset();
      fetchMock
        .mockResolvedValueOnce(jsonRes(status))
        .mockResolvedValueOnce(jsonRes(404, { message: 'Not Found' }));
      await issueAward(TOKEN, { personId: 'alex', prizeId: 'k', eventId: 'e', entryId: 'x', issuedBy: 'd', issuedAt: 't' }).catch(() => {});
      // two calls: the write, then the check
      expect(fetchMock).toHaveBeenCalledTimes(2);
    }
  });

  it('403 is blocked, and never invites a retry', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes(403))
      .mockResolvedValueOnce(jsonRes(404, { message: 'Not Found' }));

    await issueAward(TOKEN, { personId: 'alex', prizeId: 'k', eventId: 'e', entryId: 'x', issuedBy: 'd', issuedAt: 't' }).catch(() => {});
    expect(resolveRefusal(403, false)).toMatchObject({ retry: false, outcome: 'blocked' });
  });
});
