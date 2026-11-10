import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  KNOWN_GAME_STATUSES,
  parseStrictIsoUtc,
  validateSnapshot,
} from "./validate-snapshot.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const committedSnapshot = JSON.parse(
  readFileSync(join(root, "sports/data/snapshot.json"), "utf8"),
);

function game(overrides = {}) {
  return {
    id: "1",
    start: "2026-11-08T18:00:00.000Z",
    status: "scheduled",
    detail: "Scheduled",
    timeValid: true,
    home: { abbr: "IND", name: "Home", score: null, winner: false },
    away: { abbr: "DAL", name: "Away", score: null, winner: false },
    ...overrides,
  };
}

function baseSnapshot(overrides = {}) {
  return {
    schemaVersion: 1,
    updatedAt: "2026-11-06T12:00:00.000Z",
    timezone: "America/New_York",
    teams: [
      {
        id: "colts",
        name: "Indianapolis Colts",
        record: "2-6",
        nextGame: game({ home: { abbr: "IND", score: null }, away: { abbr: "DAL", score: null } }),
        recent: [game({ status: "final", home: { abbr: "IND", score: "27" }, away: { abbr: "PIT", score: "20" } })],
      },
      {
        id: "pacers",
        name: "Indiana Pacers",
        record: "3-6",
        nextGame: game({ home: { abbr: "IND", score: null }, away: { abbr: "DEN", score: null } }),
        recent: [game({ status: "final", home: { abbr: "IND", score: "110" }, away: { abbr: "BKN", score: "99" } })],
      },
      {
        id: "reds",
        name: "Cincinnati Reds",
        record: "75-87",
        nextGame: null,
        recent: [],
      },
    ],
    ufc: {
      id: "ufc",
      league: "UFC",
      name: "UFC",
      shortName: "UFC",
      nextEvent: null,
      recent: [],
      schedule: [],
    },
    ...overrides,
  };
}

test("known statuses match the normalize/README domain set", () => {
  assert.deepEqual([...KNOWN_GAME_STATUSES], [
    "scheduled",
    "in",
    "final",
    "postponed",
    "canceled",
  ]);
});

test("committed snapshot passes validation", () => {
  // Use wall-clock now (same as the CLI / CI validate step). A frozen clock
  // goes stale as soon as a refresh commits an updatedAt past that freeze,
  // which blocked the daily refresh workflow before it could fetch.
  const errors = validateSnapshot(committedSnapshot);
  assert.deepEqual(errors, []);
});

test("good synthetic snapshot passes, including single-team empty slate", () => {
  const errors = validateSnapshot(baseSnapshot(), {
    now: new Date("2026-11-07T00:00:00.000Z"),
  });
  assert.deepEqual(errors, []);
});

test("rejects bad team list, nonnumeric score, missing UFC, and bad updatedAt", () => {
  const badTeams = baseSnapshot({
    teams: [
      { id: "colts", name: "Colts", record: "1-0", nextGame: null, recent: [] },
      { id: "pacers", name: "Pacers", record: "1-0", nextGame: null, recent: [] },
    ],
  });
  assert.match(validateSnapshot(badTeams).join("\n"), /teams must be exactly/);

  const badScore = baseSnapshot();
  badScore.teams[0].nextGame.home.score = "twelve";
  assert.match(validateSnapshot(badScore).join("\n"), /score must be numeric/);

  const noUfc = baseSnapshot({ ufc: null });
  assert.match(validateSnapshot(noUfc).join("\n"), /ufc block is required/);

  const future = baseSnapshot({ updatedAt: "2099-01-01T00:00:00.000Z" });
  assert.match(
    validateSnapshot(future, { now: new Date("2026-11-07T00:00:00.000Z") }).join("\n"),
    /must not be in the future/,
  );

  const invalidDate = baseSnapshot({ updatedAt: "not-a-date" });
  assert.match(validateSnapshot(invalidDate).join("\n"), /not a valid ISO date/);
});

test("updatedAt requires strict toISOString form and a real calendar date", () => {
  assert.equal(parseStrictIsoUtc("2026-11-06T11:56:14.332Z"), Date.parse("2026-11-06T11:56:14.332Z"));
  assert.equal(parseStrictIsoUtc("November 6, 2026"), null);
  assert.equal(parseStrictIsoUtc("2026-02-30T00:00:00.000Z"), null);
  assert.equal(parseStrictIsoUtc("2026-11-06T11:56:14Z"), null);
  assert.equal(parseStrictIsoUtc("2026-13-01T00:00:00.000Z"), null);

  const now = new Date("2026-11-07T00:00:00.000Z");
  assert.match(
    validateSnapshot(baseSnapshot({ updatedAt: "November 6, 2026" }), { now }).join("\n"),
    /not a valid ISO date/,
  );
  assert.match(
    validateSnapshot(baseSnapshot({ updatedAt: "2026-02-30T00:00:00.000Z" }), { now }).join("\n"),
    /not a valid ISO date/,
  );
  assert.deepEqual(
    validateSnapshot(baseSnapshot({ updatedAt: "2026-11-06T11:56:14.332Z" }), { now }),
    [],
  );
});

test("rejects missing nextGame and malformed or missing recent", () => {
  const missingNext = baseSnapshot();
  delete missingNext.teams[0].nextGame;
  assert.match(
    validateSnapshot(missingNext, { now: new Date("2026-11-07T00:00:00.000Z") }).join("\n"),
    /colts\.nextGame must be present/,
  );

  const missingRecent = baseSnapshot();
  delete missingRecent.teams[1].recent;
  assert.match(
    validateSnapshot(missingRecent, { now: new Date("2026-11-07T00:00:00.000Z") }).join("\n"),
    /pacers\.recent must be an array/,
  );

  const badRecent = baseSnapshot();
  badRecent.teams[2].recent = { id: "not-an-array" };
  assert.match(
    validateSnapshot(badRecent, { now: new Date("2026-11-07T00:00:00.000Z") }).join("\n"),
    /reds\.recent must be an array/,
  );

  // Explicit null nextGame with empty recent remains valid for a single team.
  const nullNext = baseSnapshot();
  nullNext.teams[2].nextGame = null;
  nullNext.teams[2].recent = [];
  assert.deepEqual(
    validateSnapshot(nullNext, { now: new Date("2026-11-07T00:00:00.000Z") }),
    [],
  );
});

test("rejects bad nextGame status and missing abbrs", () => {
  const badStatus = baseSnapshot();
  badStatus.teams[0].nextGame.status = "delayed";
  assert.match(validateSnapshot(badStatus).join("\n"), /status must be one of/);

  const badAbbr = baseSnapshot();
  badAbbr.teams[0].nextGame.home.abbr = "";
  assert.match(validateSnapshot(badAbbr).join("\n"), /home\.abbr must be a non-empty string/);
});

test("outage guard fires only when all three teams lose coverage vs previous", () => {
  const previous = baseSnapshot();
  const singleGap = baseSnapshot();
  singleGap.teams[0].nextGame = null;
  singleGap.teams[0].recent = [];
  assert.deepEqual(
    validateSnapshot(singleGap, { previous, now: new Date("2026-11-07T00:00:00.000Z") }),
    [],
  );

  const totalOutage = baseSnapshot();
  for (const team of totalOutage.teams) {
    team.nextGame = null;
    team.recent = [];
  }
  assert.match(
    validateSnapshot(totalOutage, { previous, now: new Date("2026-11-07T00:00:00.000Z") }).join("\n"),
    /outage guard/,
  );

  assert.deepEqual(
    validateSnapshot(totalOutage, {
      previous: baseSnapshot({
        teams: REQUIRED_EMPTY_TEAMS(),
      }),
      now: new Date("2026-11-07T00:00:00.000Z"),
    }),
    [],
  );
});

function REQUIRED_EMPTY_TEAMS() {
  return [
    { id: "colts", name: "Indianapolis Colts", record: "0-0", nextGame: null, recent: [] },
    { id: "pacers", name: "Indiana Pacers", record: "0-0", nextGame: null, recent: [] },
    { id: "reds", name: "Cincinnati Reds", record: "0-0", nextGame: null, recent: [] },
  ];
}

test("CLI reports readable errors and nonzero exit for malformed JSON", () => {
  const dir = mkdtempSync(join(tmpdir(), "snapshot-validate-"));
  const badPath = join(dir, "bad.json");
  writeFileSync(badPath, "{ not json");
  const result = spawnSync(process.execPath, [join(root, "scripts/validate-snapshot.mjs"), badPath], {
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /invalid JSON/);
});

test("workflow guard: failed validation exits before a commit can publish", () => {
  const dir = mkdtempSync(join(tmpdir(), "snapshot-workflow-"));
  const dataDir = join(dir, "sports/data");
  mkdirSync(dataDir, { recursive: true });
  const previousPath = join(dir, "previous-snapshot.json");
  const snapshotPath = join(dataDir, "snapshot.json");

  writeFileSync(previousPath, `${JSON.stringify(baseSnapshot(), null, 2)}\n`);

  const wiped = baseSnapshot();
  for (const team of wiped.teams) {
    team.nextGame = null;
    team.recent = [];
  }
  writeFileSync(snapshotPath, `${JSON.stringify(wiped, null, 2)}\n`);

  const validate = spawnSync(
    process.execPath,
    [join(root, "scripts/validate-snapshot.mjs"), snapshotPath, "--previous", previousPath],
    { encoding: "utf8" },
  );
  assert.notEqual(validate.status, 0, "validation must fail on total outage");
  assert.match(validate.stderr, /outage guard/);

  // Mimic the refresh workflow: only commit when validation succeeded.
  let committed = false;
  if (validate.status === 0) {
    committed = true;
  }
  assert.equal(committed, false, "failed validation must prevent commit/publication");
});

test("refresh workflow runs post-fetch validation before commit", () => {
  const yaml = readFileSync(join(root, ".github/workflows/refresh-sports-data.yml"), "utf8");
  const downloadAt = yaml.indexOf("Download the latest scores");
  const validateAt = yaml.indexOf("Validate the fetched snapshot");
  const commitAt = yaml.indexOf("Commit the snapshot if scores changed");
  assert.ok(downloadAt > 0);
  assert.ok(validateAt > downloadAt, "validate must come after download");
  assert.ok(commitAt > validateAt, "commit must come after validate");
  assert.match(yaml, /validate-snapshot\.mjs/);
  assert.match(yaml, /previous-snapshot\.json/);
});
