// PROTOTYPE — throwaway. Verifies the pure logic lifted out of index.html.
// Extracted by regex from the <script> block so it cannot drift from the demo.
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const src = html.match(/const Config = \{[\s\S]*?function resolveRefusal[\s\S]*?\n\}/)[0];
const mod = await import("data:text/javascript," + encodeURIComponent(src + "\nexport { Config, entryState, personHasWon, remaining, resolveRefusal };"));

const { entryState, personHasWon, remaining, resolveRefusal } = mod;
const Config = mod.Config;

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : (fail++, console.log(`  FAIL ${name}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`));
  if (ok) console.log(`  ok   ${name}`);
};

const L = () => ({ awards: {}, entries: {} });

console.log("\n1. a fresh claim is pending");
{
  const l = L(); l.entries.e1 = { id: "e1", personId: "alex", event: "Hackathon" };
  check("pending", entryState(l, l.entries.e1), "pending");
  check("alex has not won", personHasWon(l, "alex"), false);
}

console.log("\n2. after an award, that claim is awarded");
{
  const l = L();
  l.entries.e1 = { id: "e1", personId: "alex", event: "Hackathon" };
  l.awards.alex = { personId: "alex", prizeId: "keyboard", entryId: "e1" };
  check("awarded", entryState(l, l.entries.e1), "awarded");
  check("alex has won", personHasWon(l, "alex"), true);
  check("1 keyboard left", remaining(l, "keyboard"), 1);
}

console.log("\n3. a SECOND claim by the same person is superseded, not rejected");
{
  const l = L();
  l.entries.e1 = { id: "e1", personId: "alex", event: "Hackathon" };
  l.entries.e2 = { id: "e2", personId: "alex", event: "Quiz" };
  l.awards.alex = { personId: "alex", prizeId: "keyboard", entryId: "e1" };
  check("winning claim is awarded", entryState(l, l.entries.e1), "awarded");
  check("other claim is superseded", entryState(l, l.entries.e2), "superseded");
  check("still only one award", Object.keys(l.awards).length, 1);
  check("keyboard count unaffected by the loser", remaining(l, "keyboard"), 1);
}

console.log("\n4. rejection is about the claim, not the person");
{
  const l = L();
  l.entries.e1 = { id: "e1", personId: "alex", event: "Quiz", stored: "rejected" };
  check("rejected", entryState(l, l.entries.e1), "rejected");
  check("alex still eligible for a new claim", personHasWon(l, "alex"), false);
  l.entries.e2 = { id: "e2", personId: "alex", event: "Quiz" };
  check("new claim is pending, not blocked", entryState(l, l.entries.e2), "pending");
}

console.log("\n5. the one-prize-per-person cap");
{
  const l = L();
  l.entries.e1 = { id: "e1", personId: "alex", event: "H" };
  l.awards.alex = { personId: "alex", prizeId: "keyboard", entryId: "e1" };
  l.awards.sam = { personId: "sam", prizeId: "keyboard", entryId: "e2" };
  check("two people, two awards", Object.keys(l.awards).length, 2);
  check("stock exhausted", remaining(l, "keyboard"), 0);
  l.awards.robin = { personId: "robin", prizeId: "keyboard", entryId: "e3" };
  check("a third would go negative -> the app refuses", remaining(l, "keyboard"), -1);
}

console.log("\n6. the refusal rule, which is the load-bearing one");
{
  const won = resolveRefusal(409, true);
  check("409 + file exists -> already-won", won.outcome, "already-won");
  check("already-won is never retried", won.retry, false);
  const late = resolveRefusal(422, true);
  check("422 + file exists -> also already-won", late.outcome, "already-won");
  check("422 is also not retried", late.retry, false);
  const gone = resolveRefusal(409, false);
  check("409 + no file -> retryable", gone.outcome, "retryable");
  check("retryable is retried", gone.retry, true);
  check("403 is blocked, not retried", resolveRefusal(403, false).outcome, "blocked");
}

console.log("\n7. one Award per Person is structural (keyed by personId)");
{
  const l = L();
  l.awards.alex = { personId: "alex", entryId: "e1" };
  l.awards.alex = { personId: "alex", entryId: "e9" }; // overwrite attempt
  check("keyed by personId, so a second cannot coexist", Object.keys(l.awards), ["alex"]);
}

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
