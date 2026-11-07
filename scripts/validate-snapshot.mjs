/**
 * Post-fetch gate for sports/data/snapshot.json.
 * Readable errors; nonzero exit on failure. No dependencies.
 *
 * Domain statuses come from sports/js/normalize.js readStatus / sports/data/README.md:
 * scheduled | in | final | postponed | canceled
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const REQUIRED_TEAM_IDS = ["colts", "pacers", "reds"];
export const KNOWN_GAME_STATUSES = Object.freeze([
  "scheduled",
  "in",
  "final",
  "postponed",
  "canceled",
]);

/** Exact shape of Date.prototype.toISOString() (how buildLiveSnapshot writes updatedAt). */
const ISO_UTC_MS = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * Parse a strict UTC ISO-8601 timestamp with milliseconds.
 * Rejects non-ISO forms (e.g. "November 6, 2026") and impossible calendar dates
 * that Date.parse would normalize (e.g. 2026-02-30).
 * @returns {number|null} epoch ms, or null when invalid
 */
export function parseStrictIsoUtc(value) {
  if (typeof value !== "string") return null;
  const match = ISO_UTC_MS.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const ms = Number(match[7]);
  if (hour > 23 || minute > 59 || second > 59) return null;
  const time = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  const date = new Date(time);
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() + 1 !== month
    || date.getUTCDate() !== day
    || date.getUTCHours() !== hour
    || date.getUTCMinutes() !== minute
    || date.getUTCSeconds() !== second
    || date.getUTCMilliseconds() !== ms
  ) {
    return null;
  }
  return time;
}

function teamCoverage(team) {
  if (!team || typeof team !== "object") return false;
  if (team.nextGame) return true;
  return asArray(team.recent).length > 0;
}

export function isNumericScore(value) {
  if (value == null) return true;
  if (value === "") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return true;
    return /^-?\d+(\.\d+)?$/.test(trimmed);
  }
  return false;
}

function validateSide(errors, label, side) {
  if (!side || typeof side !== "object") {
    errors.push(`${label} must be an object with abbr`);
    return;
  }
  if (typeof side.abbr !== "string" || side.abbr.trim() === "") {
    errors.push(`${label}.abbr must be a non-empty string`);
  }
  if (!isNumericScore(side.score)) {
    errors.push(`${label}.score must be numeric, blank, or null (got ${JSON.stringify(side.score)})`);
  }
}

function validateGame(errors, label, game) {
  if (!game || typeof game !== "object") {
    errors.push(`${label} must be an object`);
    return;
  }
  if (!KNOWN_GAME_STATUSES.includes(game.status)) {
    errors.push(
      `${label}.status must be one of ${KNOWN_GAME_STATUSES.join(", ")} (got ${JSON.stringify(game.status)})`,
    );
  }
  validateSide(errors, `${label}.home`, game.home);
  validateSide(errors, `${label}.away`, game.away);
}

/**
 * @param {unknown} snapshot
 * @param {{ previous?: unknown, now?: Date }} [options]
 * @returns {string[]}
 */
export function validateSnapshot(snapshot, options = {}) {
  const errors = [];
  const now = options.now instanceof Date ? options.now : new Date();

  if (snapshot == null || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    errors.push("snapshot must be a JSON object");
    return errors;
  }

  if (typeof snapshot.updatedAt !== "string" || snapshot.updatedAt.trim() === "") {
    errors.push("updatedAt must be a non-empty ISO date string");
  } else {
    const parsed = parseStrictIsoUtc(snapshot.updatedAt);
    if (parsed == null) {
      errors.push(`updatedAt is not a valid ISO date (got ${JSON.stringify(snapshot.updatedAt)})`);
    } else if (parsed > now.getTime()) {
      errors.push(`updatedAt must not be in the future (got ${snapshot.updatedAt})`);
    }
  }

  if (!Array.isArray(snapshot.teams)) {
    errors.push("teams must be an array");
  } else {
    const ids = snapshot.teams.map((team) => team?.id);
    const expected = REQUIRED_TEAM_IDS.join(",");
    const actual = ids.join(",");
    if (actual !== expected) {
      errors.push(`teams must be exactly [${REQUIRED_TEAM_IDS.join(", ")}] in order (got [${ids.map(String).join(", ")}])`);
    }

    for (const id of REQUIRED_TEAM_IDS) {
      const team = snapshot.teams.find((item) => item?.id === id);
      if (!team) continue;
      if (typeof team.name !== "string" || team.name.trim() === "") {
        errors.push(`${id}.name must be a non-empty string`);
      }
      if (typeof team.record !== "string") {
        errors.push(`${id}.record must be a string (got ${JSON.stringify(team.record)})`);
      }
      // Generator always sets nextGame (null or object); missing is not the same as null.
      if (!Object.hasOwn(team, "nextGame")) {
        errors.push(`${id}.nextGame must be present (null or a game object)`);
      } else if (team.nextGame !== null) {
        validateGame(errors, `${id}.nextGame`, team.nextGame);
      }
      // Generator always sets recent to an array (possibly empty).
      if (!Object.hasOwn(team, "recent") || !Array.isArray(team.recent)) {
        errors.push(`${id}.recent must be an array`);
      } else {
        for (const [index, game] of team.recent.entries()) {
          validateGame(errors, `${id}.recent[${index}]`, game);
        }
      }
    }
  }

  if (snapshot.ufc == null || typeof snapshot.ufc !== "object" || Array.isArray(snapshot.ufc)) {
    errors.push("ufc block is required");
  }

  const previous = options.previous;
  if (previous && typeof previous === "object" && !Array.isArray(previous) && Array.isArray(snapshot.teams)) {
    const previousHadCoverage = asArray(previous.teams).some(teamCoverage);
    const currentAllEmpty = REQUIRED_TEAM_IDS.every((id) => {
      const team = snapshot.teams.find((item) => item?.id === id);
      return !teamCoverage(team);
    });
    if (previousHadCoverage && currentAllEmpty) {
      errors.push(
        "outage guard: all three teams lack nextGame and recent results, but the previous snapshot had coverage",
      );
    }
  }

  return errors;
}

export async function loadJsonFile(path) {
  const text = await readFile(path, "utf8");
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return { ok: false, error: `invalid JSON in ${path}: ${error.message}` };
  }
}

function parseArgs(argv) {
  const args = { path: null, previous: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--previous") {
      args.previous = argv[++i];
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`unknown option ${arg}`);
    }
    if (args.path) throw new Error("only one snapshot path is allowed");
    args.path = arg;
  }
  return args;
}

async function main(argv) {
  const args = parseArgs(argv);
  const snapshotPath = resolve(args.path || "sports/data/snapshot.json");
  const loaded = await loadJsonFile(snapshotPath);
  if (!loaded.ok) {
    console.error(loaded.error);
    process.exitCode = 1;
    return;
  }

  let previous;
  if (args.previous) {
    const prev = await loadJsonFile(resolve(args.previous));
    if (!prev.ok) {
      console.error(prev.error);
      process.exitCode = 1;
      return;
    }
    previous = prev.value;
  }

  const errors = validateSnapshot(loaded.value, { previous });
  if (errors.length) {
    console.error(`Snapshot validation failed (${errors.length} error${errors.length === 1 ? "" : "s"}):`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Snapshot OK: ${snapshotPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}
