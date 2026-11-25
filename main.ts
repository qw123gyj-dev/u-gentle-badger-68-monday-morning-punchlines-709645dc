/**
 * Monday Morning Punchlines — deterministic entry picker.
 *
 * Bounty: write one joke about Monday mornings, at most 200
 * characters, judged on laughs. A comedy judge compares entries
 * two at a time and keeps the funnier one, weighing (most
 * important first):
 *
 *   1. Is a joke about Monday mornings, not a stray line about
 *      another day or topic, and loses to any joke about Monday
 *      mornings.
 *   2. Earns a real laugh, with a turn or a punchline that lands,
 *      not just a complaint about Mondays.
 *   3. Surprises you: the twist is not the first thing anyone
 *      would think of.
 *   4. Says it in few words, with every word doing work and no
 *      setup wasted.
 *   5. Feels fresh, not a rerun of the tired Monday cliches
 *      everyone has heard.
 *
 * A joke that only lists what is wrong with Mondays is a
 * complaint, not a joke. Length for its own sake does not count.
 *
 * This program scores a hand-written field of candidate one-liners
 * against that brief, in the brief's own order, and writes the
 * winner to $MAKEFUN_OUTPUT_DIR/entry.txt (fallback
 * /output/entry.txt). It then reads the file back and verifies it
 * byte-for-byte against every gate: 1–200 characters, a single
 * line, valid UTF-8, and not only whitespace.
 *
 * Scoring is deliberately lexicographic, mirroring the judge's own
 * instruction: "Go through the criteria in order, find the first
 * one where they differ, and let that decide unless a later one
 * differs by much more." Ties break criterion by criterion in the
 * brief's order, then by shorter length — a shorter line that says
 * the same thing wastes less setup.
 *
 * Three sharpening rules sit on top of the flat rubric:
 *
 *   - A line that only lists what is wrong with Mondays — a
 *     complaint with no turn, no reframe, no punchline — is
 *     capped on funniness. Naming the misery is the setup, not
 *     the joke.
 *   - Predictable gags are docked. The alarm clock, the snooze
 *     button, the coffee, the traffic jam and "I hate Mondays"
 *     are the shopworn jokes the brief explicitly warns against;
 *     any line leaning on them loses funniness, surprise and
 *     freshness points.
 *   - The twist must land in the last few words. A punchline
 *     buried in the middle is a line that fizzles; the surprise
 *     bonus only counts when the turn sits inside the final six
 *     words, and counts double when it sits inside the final
 *     three.
 *
 * Node 22+, standard library only, no network. Deterministic: the
 * same candidates always produce the same winner.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/* ------------------------------------------------------------------ */
/* Candidates                                                          */
/* ------------------------------------------------------------------ */

/**
 * One hand-written candidate joke. `id` is stable so the report
 * and any later audit can name a line without reprinting it.
 */
interface Candidate {
  id: string;
  text: string;
}

const CANDIDATES: Candidate[] = [
  {
    id: "monday-uninvited",
    text: "Monday morning showed up uninvited, ate my weekend, and is still standing in my kitchen asking what we're doing today.",
  },
  {
    id: "monday-subscription",
    text: "Monday morning is the one subscription I never signed up for, can't cancel, and it auto-renews at 6 a.m.",
  },
  {
    id: "bed-negotiator",
    text: "This Monday morning my bed opened negotiations: five more minutes in exchange for my dignity, and I signed.",
  },
  {
    id: "monday-interview",
    text: "Monday morning walked in like it had a job interview, then sat on my chest and asked where I see myself in five days.",
  },
  {
    id: "calendar-conspiracy",
    text: "My calendar conspired against me: Monday morning arrived early, brought Tuesday along, and blamed the weekend.",
  },
  {
    id: "monday-apology",
    text: "Monday morning apologised for last week, then repeated itself, louder, in front of my boss.",
  },
  {
    id: "shower-betrayal",
    text: "My shower betrayed me this Monday morning \u2014 it ran cold, like it had already heard the news about my week.",
  },
  {
    id: "monday-doppelganger",
    text: "Monday morning is just Sunday evening wearing a tie and pretending it has a plan.",
  },
  {
    id: "toaster-verdict",
    text: "My toaster gave its verdict this Monday morning: burnt, bitter, and somehow still my fault.",
  },
  {
    id: "monday-refund",
    text: "I asked Monday morning for a refund on my weekend. It offered me Friday, store credit only, no exchanges.",
  },
  {
    id: "pillow-testimony",
    text: "My pillow testified against me this Monday morning \u2014 said I was the one hitting snooze, not the alarm.",
  },
  {
    id: "monday-intern",
    text: "Monday morning is the unpaid intern of the week: shows up first, knows nothing, and somehow runs the whole meeting.",
  },
  {
    id: "fridge-note",
    text: "Monday morning left a note on my fridge: 'Gone to ruin your plans. Back never. P.S. I ate the last of the weekend.'",
  },
  {
    id: "monday-gym",
    text: "Monday morning joined my gym, took my locker, and is now doing cardio on my will to live.",
  },
  {
    id: "monday-audition",
    text: "Monday morning auditioned for my week and got the part by being the only day willing to start before dawn.",
  },
  {
    id: "alarm-quit",
    text: "My alarm clock quit this Monday morning \u2014 it left a resignation note and took the weekend with it.",
  },
];

/* ------------------------------------------------------------------ */
/* Text features                                                       */
/* ------------------------------------------------------------------ */

/** Split a line into words on whitespace, dropping empties. */
function wordsOf(text: string): string[] {
  return text.split(/\s+/).filter((w) => w.length > 0);
}

/** Lower-cased words with surrounding punctuation stripped. */
function cleanWords(text: string): string[] {
  return wordsOf(text).map((w) =>
    w.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ""),
  );
}

/** True when any of the given needles appears in the haystack. */
function containsAny(haystack: string, needles: string[]): boolean {
  const lower = haystack.toLowerCase();
  return needles.some((n) => lower.includes(n));
}

/** The last `n` words of the line, joined back into a string. */
function tailWords(text: string, n: number): string {
  return wordsOf(text).slice(-n).join(" ").toLowerCase();
}

/**
 * Words that carry a surprise turn — the second half of the joke
 * re-framing the first half. A turn only counts when it lands
 * late: the punch must sit inside the final six words, otherwise
 * the line peaks early and then keeps talking.
 */
const TWIST_WORDS = [
  "doing today",
  "auto-renews",
  "signed",
  "five days",
  "blamed the weekend",
  "in front of my boss",
  "already heard the news",
  "has a plan",
  "my fault",
  "no exchanges",
  "store credit",
  "not the alarm",
  "runs the whole meeting",
  "ate the last",
  "back never",
  "will to live",
  "before dawn",
  "resignation note",
  "knows nothing",
  "took the weekend",
];

/** True when a twist word appears inside the last six words. */
function hasLateTwist(text: string): boolean {
  const tail = tailWords(text, 6);
  return TWIST_WORDS.some((t) => tail.includes(t));
}

/** True when a twist word appears inside the last three words. */
function hasFinalThreeTwist(text: string): boolean {
  const tail = tailWords(text, 3);
  return TWIST_WORDS.some((t) => tail.includes(t));
}

/** True when a twist word appears anywhere in the line at all. */
function hasAnyTwist(text: string): boolean {
  return containsAny(text, TWIST_WORDS);
}

/**
 * The shopworn gags the brief warns against: the alarm clock, the
 * snooze button, the coffee, the traffic jam, "I hate Mondays",
 * the Monday blues. A line built on any of these is a rerun by
 * definition, however it is dressed up.
 */
const SHOPWORN_GAGS = [
  "alarm",
  "snooze",
  "coffee",
  "traffic",
  "hate monday",
  "hate mondays",
  "weekend is over",
  "weekend's over",
  "garfield",
  "case of the mondays",
  "monday blues",
  "back to work",
  "back to the grind",
];

/** True when the line leans on a shopworn Monday gag. */
function usesShopwornGag(text: string): boolean {
  return containsAny(text, SHOPWORN_GAGS);
}

/**
 * Fresh, specific details — the concrete images that make a joke
 * feel invented rather than remembered: a subscription that
 * auto-renews, an unpaid intern running the meeting, a refund
 * paid in store credit, a pillow testifying in court. A line
 * scores freshness for each distinct detail it actually uses, not
 * for gesturing at "Monday is bad" in the abstract.
 */
const FRESH_DETAILS = [
  "uninvited",
  "kitchen",
  "subscription",
  "auto-renews",
  "negotiations",
  "dignity",
  "job interview",
  "conspired",
  "calendar",
  "apologised",
  "in front of my boss",
  "shower",
  "betrayed",
  "tie",
  "pretending",
  "toaster",
  "verdict",
  "refund",
  "store credit",
  "no exchanges",
  "testified",
  "pillow",
  "intern",
  "meeting",
  "fridge",
  "back never",
  "gym",
  "locker",
  "cardio",
  "will to live",
  "auditioned",
  "before dawn",
  "resignation note",
  "five days",
];

/** Distinct fresh details present in the line. */
function freshDetails(text: string): string[] {
  const lower = text.toLowerCase();
  return FRESH_DETAILS.filter((d) => lower.includes(d));
}

/**
 * Reframe markers: the words that show the line is turning its
 * subject into something else — Monday as a subscription, an
 * intern, a job applicant, a defendant. A reframe is the second
 * comic beat: the setup names Monday morning, the reframe makes
 * it something it was never supposed to be.
 */
const REFRAME_MARKERS = [
  "is the one",
  "is just",
  "is the unpaid",
  "walked in like",
  "opened negotiations",
  "conspired",
  "apologised",
  "betrayed",
  "gave its verdict",
  "offered me",
  "testified",
  "left a note",
  "joined my",
  "auditioned",
  "showed up uninvited",
  "quit",
];

/** True when the line reframes Monday morning as something else. */
function hasReframe(text: string): boolean {
  return containsAny(text, REFRAME_MARKERS);
}

/**
 * Complaint words: the vocabulary of a list of grievances. A line
 * that only lists what is wrong with Mondays, with no turn and no
 * reframe, is a complaint, not a joke — however vivid the list.
 */
const COMPLAINT_WORDS = [
  "hate",
  "terrible",
  "awful",
  "worst",
  "dread",
  "miserable",
  "ruin",
  "horrible",
  "suffer",
  "painful",
];

/**
 * A line that only lists what is wrong with Mondays without
 * turning it into a joke: it carries complaint language (or pure
 * grievance framing) and offers no twist and no reframe. It has a
 * mood and no punchline. Such lines are capped on funniness no
 * matter how vivid the complaint is.
 */
function onlyListsComplaints(text: string): boolean {
  const hasComplaint = containsAny(text, COMPLAINT_WORDS);
  const hasGrievanceFrame =
    containsAny(text, ["ruin your plans", "ate my weekend"]) &&
    !hasReframe(text);
  return (hasComplaint || hasGrievanceFrame) && !hasAnyTwist(text);
}

/**
 * Explicit Monday-morning anchoring. Criterion 1 is a gate in
 * spirit: a line that never names Monday morning cannot be a joke
 * about Monday mornings, however funny it is about something else.
 */
function namesMondayMorning(text: string): boolean {
  return text.toLowerCase().includes("monday morning");
}

/* ------------------------------------------------------------------ */
/* Criterion scores (0–10 each, brief order)                           */
/* ------------------------------------------------------------------ */

interface Scores {
  /** C1: a joke about Monday mornings. */
  onBrief: number;
  /** C2: earns a real laugh, with a turn that lands. */
  funniest: number;
  /** C3: surprises — the twist is not the first thing anyone thinks of. */
  surprise: number;
  /** C4: few words, every word doing work. */
  economy: number;
  /** C5: fresh, not a rerun of the tired Monday cliches. */
  freshness: number;
}

/**
 * C1 — On brief. A line earns its points by being, in its own
 * words, a joke about Monday mornings: naming Monday morning
 * outright, plus morning or week context, plus a joke structure
 * (a turn word, a reframe, a second clause that pays off the
 * first). A line that never names Monday morning fails outright
 * and can never win on later criteria.
 */
function scoreOnBrief(c: Candidate): number {
  let score = 0;
  if (namesMondayMorning(c.text)) score += 5;
  if (
    containsAny(c.text, [
      "morning",
      "week",
      "weekend",
      "friday",
      "tuesday",
      "sunday",
    ])
  ) {
    score += 3;
  }
  if (hasReframe(c.text) || hasAnyTwist(c.text)) score += 2;
  return Math.min(10, score);
}

/**
 * C2 — Funniest. A real joke needs a turn the reader does not see
 * coming, and the turn has to land late. Full marks need a late
 * twist plus a second comic beat (a reframe, or a fresh detail
 * carrying the twist). A line whose twist sits early, or which
 * only lists what is wrong with Mondays, is capped at 4: it has a
 * mood, not a joke. Shopworn gags lose 3 points — the alarm-clock
 * reflex is the opposite of a laugh that lands.
 */
function scoreFunniest(c: Candidate): number {
  let score = 2; // every on-brief line gets a base for trying
  if (hasLateTwist(c.text)) score += 4;
  else if (hasAnyTwist(c.text)) score += 1; // twist exists, lands early
  if (hasReframe(c.text)) score += 2;
  if (freshDetails(c.text).length >= 1 && hasAnyTwist(c.text)) score += 2;
  if (usesShopwornGag(c.text)) score -= 3;
  if (onlyListsComplaints(c.text)) score = Math.min(score, 4);
  return Math.max(0, Math.min(10, score));
}

/**
 * C3 — Surprise. The twist must not be the first thing anyone
 * would think of. A late twist is worth the most, a twist inside
 * the final three words more still, and a reframe plus a fresh
 * detail add the rest. A line leaning on a shopworn gag loses 3:
 * an alarm clock or a snooze button is, by definition, the first
 * thing anyone would think of.
 */
function scoreSurprise(c: Candidate): number {
  let score = 0;
  if (hasLateTwist(c.text)) score += 4;
  if (hasFinalThreeTwist(c.text)) score += 2;
  if (hasReframe(c.text)) score += 2;
  if (freshDetails(c.text).length >= 2) score += 2;
  if (usesShopwornGag(c.text)) score -= 3;
  return Math.max(0, Math.min(10, score));
}

/**
 * C4 — Economy. The gate allows 200 characters; a joke that says
 * it in few words is shorter still. Full marks under 110
 * characters, sliding down to 6 at the 200 cap — length for its
 * own sake does not count, and a line that needs a long setup is
 * a line that wastes the room's patience.
 */
function scoreEconomy(c: Candidate): number {
  const len = [...c.text].length;
  if (len <= 110) return 10;
  if (len <= 130) return 9;
  if (len <= 150) return 8;
  if (len <= 170) return 7;
  if (len <= 200) return 6;
  return 0;
}

/**
 * C5 — Freshness. Two points per distinct fresh detail, up to the
 * cap, on a base of 2. A shopworn gag costs 4 here as well as on
 * funniness and surprise: it is precisely the tired cliche the
 * brief says to avoid, and a line built on it has no fresh detail
 * at all, however it is framed.
 */
function scoreFreshness(c: Candidate): number {
  let score = Math.min(10, freshDetails(c.text).length * 2 + 2);
  if (freshDetails(c.text).length === 0) score = 2;
  if (usesShopwornGag(c.text)) score = Math.max(0, score - 4);
  return score;
}

/** Score a candidate on all five criteria, in the brief's order. */
function scoreCandidate(c: Candidate): Scores {
  return {
    onBrief: scoreOnBrief(c),
    funniest: scoreFunniest(c),
    surprise: scoreSurprise(c),
    economy: scoreEconomy(c),
    freshness: scoreFreshness(c),
  };
}

/* ------------------------------------------------------------------ */
/* Winner selection                                                    */
/* ------------------------------------------------------------------ */

/**
 * Compare two scored candidates the way the judge compares two
 * lines: criterion by criterion in the brief's order, first
 * difference decides. Only when all five criteria tie does the
 * shorter line win — it says the same thing with less setup.
 */
function compareScored(
  a: { candidate: Candidate; scores: Scores },
  b: { candidate: Candidate; scores: Scores },
): number {
  const order: (keyof Scores)[] = [
    "onBrief",
    "funniest",
    "surprise",
    "economy",
    "freshness",
  ];
  for (const key of order) {
    if (a.scores[key] !== b.scores[key]) return b.scores[key] - a.scores[key];
  }
  const lenA = [...a.candidate.text].length;
  const lenB = [...b.candidate.text].length;
  if (lenA !== lenB) return lenA - lenB;
  return a.candidate.id.localeCompare(b.candidate.id);
}

/** Score every candidate, sort best first, and return the ranking. */
function rankCandidates(): { candidate: Candidate; scores: Scores }[] {
  const scored = CANDIDATES.map((candidate) => ({
    candidate,
    scores: scoreCandidate(candidate),
  }));
  scored.sort(compareScored);
  return scored;
}

/* ------------------------------------------------------------------ */
/* Gate verification                                                   */
/* ------------------------------------------------------------------ */

interface GateResult {
  lengthChars: number;
  lengthBytes: number;
  singleLine: boolean;
  validUtf8: boolean;
  notOnlyWhitespace: boolean;
  within200: boolean;
  passed: boolean;
}

/**
 * Verify the written file byte-for-byte against every gate the
 * sealed scorer applies: UTF-8 text of 1 to 200 characters, not
 * only whitespace. A single line means no newline characters
 * inside the entry (a trailing newline written by the file writer
 * is stripped before the check, and the stored entry itself holds
 * no newline).
 */
function verifyGate(filePath: string, expectedText: string): GateResult {
  const bytes = readFileSync(filePath);
  // Strict UTF-8 decode: throws on invalid sequences, so a bad
  // file fails loudly instead of silently replacing characters.
  const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const text = decoded.replace(/\n$/, "");
  const lengthChars = [...text].length;
  const result: GateResult = {
    lengthChars,
    lengthBytes: bytes.length,
    singleLine: !text.includes("\n") && !text.includes("\r"),
    validUtf8: true,
    notOnlyWhitespace: text.trim().length > 0,
    within200: lengthChars >= 1 && lengthChars <= 200,
    passed: false,
  };
  result.passed =
    result.singleLine &&
    result.validUtf8 &&
    result.notOnlyWhitespace &&
    result.within200 &&
    text === expectedText;
  return result;
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

function main(): void {
  const ranked = rankCandidates();

  console.log("Candidate ranking (criteria in the judge's order):");
  console.log("id                 C1 C2 C3 C4 C5  chars  text");
  for (const { candidate, scores } of ranked) {
    const chars = [...candidate.text].length;
    console.log(
      `${candidate.id.padEnd(18)} ${scores.onBrief}  ${scores.funniest}  ` +
        `${scores.surprise}  ${scores.economy}  ${scores.freshness}  ` +
        `${String(chars).padStart(5)}  ${candidate.text}`,
    );
  }

  const winner = ranked[0];
  console.log("");
  console.log(`Winner: ${winner.candidate.id}`);
  console.log(`Line: ${winner.candidate.text}`);
  console.log(
    `Scores: onBrief=${winner.scores.onBrief} funniest=${winner.scores.funniest} ` +
      `surprise=${winner.scores.surprise} economy=${winner.scores.economy} ` +
      `freshness=${winner.scores.freshness}`,
  );

  // The output directory is the harness's $MAKEFUN_OUTPUT_DIR; the
  // documented fallback is /output/entry.txt.
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "entry.txt");
  writeFileSync(outPath, winner.candidate.text + "\n", "utf8");
  console.log(`Wrote ${outPath}`);

  // Read it back and verify byte-for-byte against every gate.
  const gate = verifyGate(outPath, winner.candidate.text);
  console.log(
    `Gate: chars=${gate.lengthChars} bytes=${gate.lengthBytes} ` +
      `singleLine=${gate.singleLine} validUtf8=${gate.validUtf8} ` +
      `notOnlyWhitespace=${gate.notOnlyWhitespace} within200=${gate.within200} ` +
      `passed=${gate.passed}`,
  );
  if (!gate.passed) {
    console.error("GATE FAILED: entry.txt does not satisfy every gate.");
    process.exit(1);
  }
  console.log("Gate passed: entry is valid.");
}

main();
