import test from "node:test";
import assert from "node:assert/strict";
import {
  TEAMS,
  easternDayDiff,
  endpointFor,
  fightMethod,
  findStandingGroup,
  mergeScheduleFeeds,
  normalizeAvailability,
  normalizeGame,
  normalizeTeam,
  normalizeUfc,
  pickNext,
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

test("keeps the Colts in the regular season until their bye week is the scoreboard week", () => {
  const now = new Date("2026-11-10T17:00:00.000Z");
  const regular = normalizeTeam({
    team: colts,
    now,
    standings: null,
    schedule: {
      byeWeek: 13,
      team: { abbreviation: "IND", displayName: "Indianapolis Colts" },
      events: [scheduledClub("11", "2026-11-22T18:00:00.000Z", 11, 2, "Regular Season", 2026)],
    },
    scoreboard: { season: { type: 2, year: 2026 }, week: { number: 10 } },
  });
  assert.equal(regular.seasonState, "Regular season");

  const bye = normalizeTeam({
    team: colts,
    now,
    standings: null,
    schedule: {
      byeWeek: 13,
      team: { abbreviation: "IND", displayName: "Indianapolis Colts" },
      events: [scheduledClub("14", "2026-11-29T18:00:00.000Z", 14, 2, "Regular Season", 2026)],
    },
    scoreboard: { season: { type: 2, year: 2026 }, week: { number: 13 } },
  });
  assert.equal(bye.seasonState, "Bye");
});

test("labels the next Pacers game, not a later cup date", () => {
  const pacers = TEAMS[1];
  const now = new Date("2026-11-12T17:00:00.000Z");
  const scoreboard = { season: { type: 2, year: 2027 } };
  const regularThenCup = normalizeTeam({
    team: pacers,
    now,
    scoreboard,
    standings: null,
    schedule: {
      events: [
        scheduledClub("1", "2026-11-14T00:30:00.000Z", null, 2, "Regular Season", 2027, "IND", "11", []),
        scheduledClub("2", "2026-11-15T00:30:00.000Z", null, 2, "Regular Season", 2027, "IND", "11", ["NBA Cup - Group Play"]),
      ],
    },
  });
  assert.equal(regularThenCup.seasonState, "Regular season");
  assert.equal(regularThenCup.nextGame.id, "1");

  const cupNext = normalizeTeam({
    team: pacers,
    now,
    scoreboard,
    standings: null,
    schedule: {
      events: [
        scheduledClub("2", "2026-11-14T00:30:00.000Z", null, 2, "Regular Season", 2027, "IND", "11", ["NBA Cup - Group Play"]),
        scheduledClub("3", "2026-11-21T00:30:00.000Z", null, 2, "Regular Season", 2027, "IND", "11", []),
      ],
    },
  });
  assert.equal(cupNext.seasonState, "NBA Cup");
  assert.equal(cupNext.nextGame.id, "2");
});

test("play-in note wins over the playoffs type", () => {
  const team = normalizeTeam({
    team: TEAMS[1],
    now: new Date("2026-04-10T16:00:00.000Z"),
    scoreboard: { season: { type: 3, year: 2026 } },
    standings: null,
    schedule: {
      events: [
        scheduledClub("9", "2026-04-15T23:00:00.000Z", null, 3, "Playoffs", 2026, "IND", "11", ["Play-In Tournament"]),
      ],
    },
  });
  assert.equal(team.seasonState, "Play-in");
});

test("a next-year Reds opener stays nextGame and the badge stays Offseason", () => {
  const reds = TEAMS[2];
  const now = new Date("2027-02-20T17:00:00.000Z");
  const finished = {
    season: { year: 2026, type: 3 },
    team: { abbreviation: "CIN", displayName: "Cincinnati Reds" },
    events: [finalEvent("100", "2026-09-27T19:07Z", "CIN", "17", "1", "TOR", "5", "14")],
  };
  finished.events[0].season = { year: 2026 };
  finished.events[0].seasonType = { type: 2, name: "Regular Season" };
  const opener = {
    events: [scheduledClub("200", "2027-03-25T04:00:00.000Z", null, 2, "Regular Season", 2027, "CIN", "17")],
  };
  opener.events[0].competitions[0].timeValid = false;
  opener.events[0].competitions[0].status.type.shortDetail = "TBD";
  const team = normalizeTeam({
    team: reds,
    now,
    standings: null,
    schedule: mergeScheduleFeeds(finished, opener),
    scoreboard: { season: { type: 3, year: 2026 } },
  });
  assert.equal(team.seasonState, "Offseason");
  assert.equal(team.nextGame.id, "200");
  assert.equal(team.nextGame.timeValid, false);
});

test("spring training follows the event name, not the merged root type", () => {
  const team = normalizeTeam({
    team: TEAMS[2],
    now: new Date("2027-02-20T17:00:00.000Z"),
    scoreboard: { season: { type: 3, year: 2027 } },
    standings: null,
    schedule: {
      season: { year: 2026, type: 3 },
      events: [scheduledClub("300", "2027-02-27T18:00:00.000Z", null, 3, "Spring Training", 2027, "CIN", "17")],
    },
  });
  assert.equal(team.seasonState, "Spring training");
});

test("phase refines today's game and leaves coarse status alone", () => {
  const thursdayNight = new Date("2026-11-13T03:00:00.000Z");
  const fridayEarly = "2026-11-13T06:00:00.000Z";
  assert.equal(easternDayDiff(fridayEarly, thursdayNight), 1);

  const laterToday = new Date("2026-11-12T15:00:00.000Z");
  const pregame = phaseGame({
    now: laterToday,
    start: "2026-11-12T23:00:00.000Z",
    name: "STATUS_SCHEDULED",
    state: "pre",
    detail: "11/12 - 6:00 PM EST",
  });
  assert.equal(pregame.status, "scheduled");
  assert.equal(pregame.phase, "Pregame");

  const otherDay = phaseGame({
    now: thursdayNight,
    start: fridayEarly,
    name: "STATUS_SCHEDULED",
    state: "pre",
    detail: "11/13 - 1:00 AM EST",
  });
  assert.equal(otherDay.phase, null);

  const halftime = phaseGame({
    now: laterToday,
    start: "2026-11-12T18:00:00.000Z",
    name: "STATUS_HALFTIME",
    state: "in",
    detail: "Halftime",
  });
  assert.equal(halftime.status, "in");
  assert.equal(halftime.phase, "Halftime");

  const endPeriod = phaseGame({
    now: laterToday,
    start: "2026-11-12T18:00:00.000Z",
    name: "STATUS_END_PERIOD",
    state: "in",
    detail: "End of 1st",
  });
  assert.equal(endPeriod.status, "in");
  assert.equal(endPeriod.phase, "End of period");

  const overtime = phaseGame({
    now: laterToday,
    start: "2026-11-12T18:00:00.000Z",
    name: "STATUS_IN_PROGRESS",
    state: "in",
    detail: "2:00 - 5th",
    period: 5,
  });
  assert.equal(overtime.status, "in");
  assert.equal(overtime.phase, "Overtime");

  const delayed = phaseGame({
    now: laterToday,
    start: "2026-11-12T18:00:00.000Z",
    name: "STATUS_DELAYED",
    state: "pre",
    detail: "Delayed",
  });
  assert.equal(delayed.status, "scheduled");
  assert.equal(delayed.phase, "Delayed");

  const finalOt = phaseGame({
    now: new Date("2026-11-15T18:00:00.000Z"),
    start: "2026-11-15T18:00:00.000Z",
    name: "STATUS_FINAL",
    state: "post",
    detail: "Final/OT",
    completed: true,
  });
  assert.equal(finalOt.status, "final");
  assert.equal(finalOt.phase, "Final");
});

test("pickNext keeps today's final until the Eastern date changes, and prefers a live game", () => {
  const now = new Date("2026-11-15T20:00:00.000Z");
  const games = [
    { id: "final", status: "final", start: "2026-11-15T18:00:00.000Z" },
    { id: "later", status: "scheduled", start: "2026-11-22T18:00:00.000Z" },
  ];
  assert.equal(pickNext(games, now).id, "final");
  assert.equal(pickNext([
    { id: "live", status: "in", start: "2026-11-15T18:00:00.000Z" },
    ...games,
  ], now).id, "live");
  assert.equal(pickNext([
    { id: "done", status: "final", start: "2026-11-15T18:00:00.000Z" },
    { id: "still", status: "scheduled", start: "2026-11-15T21:00:00.000Z" },
  ], now).id, "still");
});

test("availability keeps pins, drops other Active rows, and sorts outs first", () => {
  assert.deepEqual(normalizeAvailability("colts", null, "11"), []);
  const rows = normalizeAvailability("colts", {
    injuries: [{
      id: "11",
      injuries: [
        { athlete: { displayName: "Ashton Dulin", position: { abbreviation: "WR" } }, status: "Active" },
        {
          athlete: { displayName: "Daniel Jones", position: { abbreviation: "QB" } },
          status: "Active",
          details: { type: "Not Specified" },
        },
        {
          athlete: { displayName: "Alec Pierce", position: { abbreviation: "WR" } },
          status: "Injured Reserve",
          details: { type: "Heel" },
        },
        {
          athlete: { displayName: "Zaire Franklin", position: { abbreviation: "LB" } },
          status: "suspension",
          details: { type: "Conduct" },
        },
        {
          athlete: { displayName: "Tyler Warren", position: { abbreviation: "TE" } },
          status: "Day-To-Day",
          details: { type: "Ankle" },
        },
      ],
    }],
  }, "11");
  assert.deepEqual(rows, [
    { name: "Alec Pierce", position: "WR", status: "IR", reason: "Heel" },
    { name: "Zaire Franklin", position: "LB", status: "Suspended", reason: "Conduct" },
    { name: "Tyler Warren", position: "TE", status: "Day-to-day", reason: "Ankle" },
    { name: "Daniel Jones", position: "QB", status: "Active", reason: null },
    { name: "Jonathan Taylor", position: "RB", status: "Active", reason: null },
  ]);
});

test("injury urls are the public league feeds", () => {
  assert.equal(endpointFor("injuries", TEAMS[0]), "https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries");
  assert.equal(endpointFor("injuries", TEAMS[1]), "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries");
  assert.equal(endpointFor("injuries", TEAMS[2]), "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/injuries");
});

test("fight week covers seven Eastern days and the day of a finished card", () => {
  const now = new Date("2026-11-12T16:00:00.000Z");
  const inSeven = normalizeUfc({
    events: [ufcCard("1", "2026-11-19T16:00:00.000Z", "STATUS_SCHEDULED")],
  }, now);
  assert.equal(inSeven.seasonState, "Fight week");

  const inEight = normalizeUfc({
    events: [ufcCard("2", "2026-11-20T16:00:00.000Z", "STATUS_SCHEDULED")],
  }, now);
  assert.equal(inEight.seasonState, null);

  const finalToday = normalizeUfc({
    events: [
      ufcCard("3", "2026-11-13T02:00:00.000Z", "STATUS_FINAL"),
      ufcCard("4", "2026-12-19T16:00:00.000Z", "STATUS_SCHEDULED"),
    ],
  }, now);
  assert.equal(finalToday.seasonState, "Fight week");
  assert.equal(finalToday.nextEvent.id, "4");
});

test("a canceled fight notes the cancellation and a scheduled fight does not", () => {
  const ufc = normalizeUfc({
    events: [{
      id: "5",
      name: "UFC Fight Night: Alpha vs. Beta",
      date: "2026-11-19T16:00:00.000Z",
      status: { type: { name: "STATUS_SCHEDULED", state: "pre", shortDetail: "Scheduled" } },
      competitions: [
        fight("Alpha", "Beta", false),
        {
          id: "canceled-bout",
          type: { abbreviation: "Welterweight" },
          status: { type: { name: "STATUS_CANCELED", state: "pre", shortDetail: "Canceled" } },
          competitors: [
            { athlete: { displayName: "Gamma" } },
            { athlete: { displayName: "Delta" } },
          ],
        },
      ],
    }],
  }, new Date("2026-11-12T16:00:00.000Z"));
  const fights = ufc.nextEvent.fights;
  assert.equal(fights.find((bout) => bout.fighters[0].name === "Alpha").note, null);
  assert.equal(fights.find((bout) => bout.status === "canceled").note, "Canceled");
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

function scheduledClub(id, date, week, type, seasonName, year, abbr = "IND", teamId = "11", headlines = []) {
  const event = {
    id,
    date,
    season: { year },
    seasonType: { type, name: seasonName },
    competitions: [{
      timeValid: true,
      notes: headlines.map((headline) => ({ headline })),
      status: { type: { name: "STATUS_SCHEDULED", state: "pre", shortDetail: "Scheduled" } },
      competitors: [
        { homeAway: "home", team: { id: teamId, abbreviation: abbr, displayName: abbr } },
        { homeAway: "away", team: { id: "99", abbreviation: "OPP", displayName: "Opponent" } },
      ],
    }],
  };
  if (week != null) event.week = { number: week };
  return event;
}

function phaseGame({ now, start, name, state, detail, period, completed }) {
  return normalizeGame({
    id: "g",
    date: start,
    competitions: [{
      timeValid: true,
      status: {
        period,
        type: { name, state, shortDetail: detail, completed: Boolean(completed) },
      },
      competitors: [
        { homeAway: "home", team: { id: "11", abbreviation: "IND", displayName: "Indianapolis Colts" } },
        { homeAway: "away", team: { id: "6", abbreviation: "DAL", displayName: "Dallas Cowboys" } },
      ],
    }],
  }, "NFL", "11", null, now);
}

function ufcCard(id, date, name) {
  const finished = name === "STATUS_FINAL";
  return {
    id,
    name: `UFC Fight Night: Card ${id}`,
    date,
    status: {
      type: finished
        ? { name, state: "post", completed: true, shortDetail: "Final" }
        : { name, state: "pre", shortDetail: "Scheduled" },
    },
    competitions: [fight("Alpha", "Beta", finished)],
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
