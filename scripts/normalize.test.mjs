import test from "node:test";
import assert from "node:assert/strict";
import {
  TEAMS,
  endpointFor,
  fightMethod,
  findStandingGroup,
  mergeScheduleFeeds,
  normalizeGame,
  normalizeTeam,
  normalizeUfc,
  readScore,
  readStatus,
  scheduleHasOpenGame,
} from "../sports/js/normalize.js";

const colts = TEAMS[0];

test("reads ESPN score objects and plain strings, including zero", () => {
  assert.equal(readScore({ score: { value: 0, displayValue: "0" } }), "0");
  assert.equal(readScore({ score: "14" }), "14");
  assert.equal(readScore({ score: null }), null);
  assert.equal(readScore({}), null);
});

test("marks TBD kickoffs and live games", () => {
  const tbd = readStatus({
    timeValid: false,
    status: { type: { name: "STATUS_SCHEDULED", state: "pre", shortDetail: "TBD" } },
  });
  assert.equal(tbd.status, "scheduled");
  assert.equal(tbd.timeValid, false);

  const live = readStatus({
    timeValid: true,
    status: { type: { name: "STATUS_IN_PROGRESS", state: "in", shortDetail: "3:25 - 1st" } },
  });
  assert.equal(live.status, "in");
  assert.equal(live.detail, "3:25 - 1st");
});

test("maps ESPN's Kotko result text to KO/TKO and keeps decisions", () => {
  assert.equal(fightMethod({
    details: [{ type: { text: "Unofficial Winner Kotko" } }, { type: { text: "Submission Attempt" } }],
  }), "KO/TKO");
  assert.equal(fightMethod({
    details: [{ type: { text: "Unofficial Winner Decision" } }],
  }), "Decision");
  assert.equal(fightMethod({
    details: [{ type: { text: "Unofficial Winner Submission" } }],
  }), "Submission");
});

test("prefers the live scoreboard when the schedule has no score yet", () => {
  const event = {
    id: "1",
    date: "2026-11-01T18:00Z",
    competitions: [{
      timeValid: true,
      venue: { fullName: "EverBank Stadium" },
      broadcasts: [{ media: { shortName: "CBS" } }],
      status: { type: { name: "STATUS_IN_PROGRESS", state: "in", shortDetail: "3:25 - 1st" } },
      competitors: [
        { homeAway: "home", team: { id: "30", abbreviation: "JAX", displayName: "Jacksonville Jaguars" } },
        { homeAway: "away", team: { id: "11", abbreviation: "IND", displayName: "Indianapolis Colts" } },
      ],
    }],
  };
  const live = {
    id: "1",
    competitions: [{
      status: { type: { name: "STATUS_IN_PROGRESS", state: "in", shortDetail: "8:10 - 2nd" } },
      competitors: [
        { homeAway: "home", score: "7", team: { id: "30", abbreviation: "JAX", displayName: "Jacksonville Jaguars" } },
        { homeAway: "away", score: "0", team: { id: "11", abbreviation: "IND", displayName: "Indianapolis Colts" } },
      ],
    }],
  };
  const game = normalizeGame(event, "NFL", "11", live);
  assert.equal(game.away.score, "0");
  assert.equal(game.home.score, "7");
  assert.equal(game.ours, "away");
  assert.equal(game.venue, "EverBank Stadium");
  assert.equal(game.broadcast, "CBS");
  assert.equal(game.detail, "8:10 - 2nd");
});

test("builds a team snapshot with record, next game, and division table", () => {
  const schedule = {
    byeWeek: 13,
    team: { id: "11", abbreviation: "IND", displayName: "Indianapolis Colts" },
    events: [
      finalEvent("10", "2026-10-25T17:00Z", "IND", "11", "10", "MIN", "16", "16"),
      {
        id: "11",
        date: "2026-11-08T18:00Z",
        competitions: [{
          timeValid: true,
          status: { type: { name: "STATUS_SCHEDULED", state: "pre", shortDetail: "11/8 - 1:00 PM EST" } },
          competitors: [
            { homeAway: "home", team: { id: "11", abbreviation: "IND", displayName: "Indianapolis Colts" } },
            { homeAway: "away", team: { id: "6", abbreviation: "DAL", displayName: "Dallas Cowboys" } },
          ],
        }],
      },
    ],
  };
  const standings = {
    children: [{
      name: "American Football Conference",
      children: [{
        name: "AFC South",
        standings: {
          entries: [
            row("JAX", "Jaguars", 4, 2, "4"),
            row("IND", "Colts", 2, 5, "12"),
            row("HOU", "Texans", 2, 5, "13"),
            row("TEN", "Titans", 1, 6, "15"),
          ],
        },
      }],
    }],
  };
  const team = normalizeTeam({ team: colts, schedule, scoreboard: { events: [] }, standings });
  assert.equal(team.record, "2-5");
  assert.equal(team.byeWeek, 13);
  assert.equal(team.standingName, "AFC South");
  assert.equal(team.standings.length, 4);
  assert.equal(team.nextGame.home.abbr, "IND");
  assert.equal(team.recent[0].away.score, "10");
  assert.equal(team.seed, "12");
});

test("drops Contender Series and puts the main event first", () => {
  const board = {
    events: [
      {
        id: "9",
        name: "Dana White's Contender Series: Week 9",
        date: "2026-10-06T23:00Z",
        status: { type: { name: "STATUS_FINAL", state: "post", completed: true, shortDetail: "Final" } },
        competitions: [fight("a", "b", true)],
      },
      {
        id: "10",
        name: "UFC Fight Night: Alpha vs. Beta",
        date: "2026-11-07T22:00Z",
        status: { type: { name: "STATUS_SCHEDULED", state: "pre", shortDetail: "Scheduled" } },
        venues: [{ fullName: "Meta APEX", address: { city: "Las Vegas", state: "NV" } }],
        competitions: [
          fight("Early", "Prelim", false, "Flyweight"),
          fight("Prelim One", "Prelim Two", false, "Welterweight"),
          fight("Prelim Three", "Prelim Four", false, "Bantamweight"),
          fight("Prelim Five", "Prelim Six", false, "Featherweight"),
          fight("Co", "Main", false, "Lightweight"),
          fight("Alpha", "Beta", false, "Heavyweight"),
        ],
      },
    ],
  };
  const ufc = normalizeUfc(board);
  assert.equal(ufc.schedule.length, 1);
  assert.equal(ufc.nextEvent.name, "UFC Fight Night: Alpha vs. Beta");
  assert.equal(ufc.nextEvent.fights[0].mainEvent, true);
  assert.equal(ufc.nextEvent.fights[0].fighters[0].name, "Alpha");
  assert.equal(ufc.nextEvent.fights[0].card, "main");
  assert.equal(ufc.nextEvent.fights[5].card, "prelim");
  assert.equal(ufc.nextEvent.venue, "Meta APEX, Las Vegas, NV");
});

test("findStandingGroup returns null when the table is missing", () => {
  assert.equal(findStandingGroup(null, "IND"), null);
});

test("follows the Reds, and an offseason slate still has a next game and last result", () => {
  assert.deepEqual(TEAMS.map((team) => team.id), ["colts", "pacers", "reds"]);
  const reds = TEAMS[2];
  assert.equal(reds.league, "MLB");
  assert.equal(reds.espnTeamId, "17");
  assert.equal(
    endpointFor("schedule", reds),
    "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/teams/17/schedule",
  );
  assert.equal(
    endpointFor("schedule", reds, { season: 2027, seasontype: 2 }),
    "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/teams/17/schedule?season=2027&seasontype=2",
  );

  const finished = {
    season: { year: 2026, type: 2 },
    team: { abbreviation: "CIN", displayName: "Cincinnati Reds" },
    events: [finalEvent("100", "2026-09-27T19:07Z", "CIN", "17", "1", "TOR", "5", "14")],
  };
  assert.equal(scheduleHasOpenGame(finished), false);
  const opener = {
    events: [{
      id: "200",
      date: "2027-03-25T04:00Z",
      competitions: [{
        timeValid: false,
        status: { type: { name: "STATUS_SCHEDULED", state: "pre", shortDetail: "TBD" } },
        competitors: [
          { homeAway: "home", team: { id: "17", abbreviation: "CIN", displayName: "Cincinnati Reds" } },
          { homeAway: "away", team: { id: "24", abbreviation: "STL", displayName: "St. Louis Cardinals" } },
        ],
      }],
    }],
  };
  const merged = mergeScheduleFeeds(finished, opener);
  assert.equal(scheduleHasOpenGame(merged), true);
  const team = normalizeTeam({ team: reds, schedule: merged, scoreboard: null, standings: null });
  assert.equal(team.nextGame.id, "200");
  assert.equal(team.nextGame.timeValid, false);
  assert.equal(team.nextGame.ours, "home");
  assert.equal(team.nextGame.home.score, null);
  assert.equal(team.recent[0].id, "100");
  assert.equal(team.recent[0].away.score, "1");
  assert.equal(team.record, "0-1");
});

test("hides 0-0 placeholder scores before tipoff", () => {
  const event = {
    id: "2",
    date: "2026-11-01T22:00Z",
    competitions: [{
      timeValid: true,
      status: { type: { name: "STATUS_SCHEDULED", state: "pre", shortDetail: "11/1 - 5:00 PM EST" } },
      competitors: [
        { homeAway: "home", score: "0", team: { id: "11", abbreviation: "IND", displayName: "Indiana Pacers" } },
        { homeAway: "away", score: "0", team: { id: "17", abbreviation: "BKN", displayName: "Brooklyn Nets" } },
      ],
    }],
  };
  const game = normalizeGame(event, "NBA", "11", null);
  assert.equal(game.status, "scheduled");
  assert.equal(game.home.score, null);
  assert.equal(game.away.score, null);
});

function finalEvent(id, date, awayAbbr, awayId, awayScore, homeAbbr, homeScore, homeId) {
  return {
    id,
    date,
    competitions: [{
      timeValid: true,
      status: { type: { name: "STATUS_FINAL", state: "post", completed: true, shortDetail: "Final" } },
      competitors: [
        {
          homeAway: "away",
          winner: Number(awayScore) > Number(homeScore),
          score: { displayValue: awayScore },
          team: { id: awayId, abbreviation: awayAbbr, displayName: awayAbbr },
        },
        {
          homeAway: "home",
          winner: Number(homeScore) > Number(awayScore),
          score: { displayValue: homeScore },
          team: { id: homeId, abbreviation: homeAbbr, displayName: homeAbbr },
        },
      ],
    }],
  };
}

function row(abbr, name, wins, losses, seed) {
  return {
    team: { abbreviation: abbr, shortDisplayName: name, displayName: name },
    stats: [
      { name: "wins", displayValue: String(wins) },
      { name: "losses", displayValue: String(losses) },
      { name: "ties", displayValue: "0" },
      { name: "winPercent", displayValue: ".500" },
      { name: "streak", displayValue: "L1" },
      { name: "pointDifferential", displayValue: "-3" },
      { name: "playoffSeed", displayValue: seed },
    ],
  };
}

function fight(red, blue, done, weight = "Lightweight") {
  return {
    id: `${red}-${blue}`,
    type: { abbreviation: weight },
    status: {
      type: done
        ? { name: "STATUS_FINAL", state: "post", completed: true, shortDetail: "Final" }
        : { name: "STATUS_SCHEDULED", state: "pre", shortDetail: "Scheduled" },
    },
    competitors: [
      { winner: false, athlete: { displayName: red, flag: { alt: "Brazil" } }, records: [{ type: "total", summary: "10-1-0" }] },
      { winner: done, athlete: { displayName: blue }, records: [{ type: "total", summary: "12-0-0" }] },
    ],
  };
}
