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
import {
  AVAILABILITY_STATUSES,
  PHASE_STATUS,
  PHASES,
  PINS,
  SEASON_LABELS,
  UFC_SEASON_LABEL,
  pinKey,
} from "../sports/js/normalize.js";

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
  validatePhase(errors, label, game);
}

function validatePhase(errors, label, game) {
  if (!Object.hasOwn(game, "phase")) return;
  if (game.phase === null) return;
  if (!PHASES.includes(game.phase)) {
    errors.push(`${label}.phase must be null or one of ${PHASES.join(", ")} (got ${JSON.stringify(game.phase)})`);
    return;
  }
  const allowed = PHASE_STATUS[game.phase] || [];
  if (!allowed.includes(game.status)) {
    errors.push(`${label}.phase ${JSON.stringify(game.phase)} is not legal with status ${JSON.stringify(game.status)}`);
  }
}

function validateSeasonState(errors, id, team) {
  if (!Object.hasOwn(team, "seasonState")) return;
  const labels = SEASON_LABELS[id] || [];
  if (typeof team.seasonState !== "string" || !labels.includes(team.seasonState)) {
    errors.push(`${id}.seasonState must be one of ${labels.join(", ")} (got ${JSON.stringify(team.seasonState)})`);
  }
}

function validateAvailability(errors, id, team) {
  if (!Object.hasOwn(team, "availability")) return;
  if (!Array.isArray(team.availability)) {
    errors.push(`${id}.availability must be an array`);
    return;
  }
  const seen = new Set();
  const pins = PINS[id] || [];
  team.availability.forEach((row, index) => {
    const label = `${id}.availability[${index}]`;
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      errors.push(`${label} must be an object`);
      return;
    }
    if (typeof row.name !== "string" || row.name.length < 1 || row.name.length > 80) {
      errors.push(`${label}.name must be a string of length 1 to 80`);
    }
    if (typeof row.position !== "string" || row.position.length > 8) {
      errors.push(`${label}.position must be a string of length 0 to 8`);
    }
    if (!AVAILABILITY_STATUSES.includes(row.status)) {
      errors.push(`${label}.status must be one of ${AVAILABILITY_STATUSES.join(", ")} (got ${JSON.stringify(row.status)})`);
    } else if (row.status === "Active" && !pins.some((pin) => pinKey(pin.name) === pinKey(row.name))) {
      errors.push(`${label}.status Active is only legal for a pinned player (got ${JSON.stringify(row.name)})`);
    }
    if (!(row.reason === null || (typeof row.reason === "string" && row.reason.length >= 1 && row.reason.length <= 40))) {
      errors.push(`${label}.reason must be null or a string of length 1 to 40`);
    }
    if (typeof row.name === "string") {
      const key = pinKey(row.name);
      if (seen.has(key)) errors.push(`${label} duplicates pinKey ${key}`);
      seen.add(key);
    }
  });
}

function validateFightNote(errors, label, fight) {
  if (!fight || typeof fight !== "object" || !Object.hasOwn(fight, "note")) return;
  const note = fight.note;
  if (note === null) return;
  if (typeof note !== "string" || note.length < 1 || note.length > 80) {
    errors.push(`${label}.note must be null or a string of length 1 to 80`);
  }
}

function validateFightList(errors, label, event) {
  if (!event || typeof event !== "object" || !Array.isArray(event.fights)) return;
  event.fights.forEach((fight, index) => validateFightNote(errors, `${label}.fights[${index}]`, fight));
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

  if (snapshot.schemaVersion !== 1) errors.push("schemaVersion must be 1");

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
      validateSeasonState(errors, id, team);
      validateAvailability(errors, id, team);
    }
  }

  if (snapshot.ufc == null || typeof snapshot.ufc !== "object" || Array.isArray(snapshot.ufc)) {
    errors.push("ufc block is required");
  } else {
    if (Object.hasOwn(snapshot.ufc, "seasonState") && snapshot.ufc.seasonState !== null && snapshot.ufc.seasonState !== UFC_SEASON_LABEL) {
      errors.push(`ufc.seasonState must be null or ${JSON.stringify(UFC_SEASON_LABEL)} (got ${JSON.stringify(snapshot.ufc.seasonState)})`);
    }
    asArray(snapshot.ufc.schedule).forEach((event, index) => validateFightList(errors, `ufc.schedule[${index}]`, event));
    validateFightList(errors, "ufc.nextEvent", snapshot.ufc.nextEvent);
    asArray(snapshot.ufc.recent).forEach((event, index) => validateFightList(errors, `ufc.recent[${index}]`, event));
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
