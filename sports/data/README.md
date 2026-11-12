# Sports data files

The phone reads **live scores from ESPN** when it can. This folder is the backup copy, and it is the shape another assistant should update.

File: `sports/data/snapshot.json`

There is one file. Do not split teams into extra files unless you also change the app.

## When this file is what people see

- The phone is offline, ESPN is down, or the browser blocked the request.
- Someone opens the saved copy in the repo to check a score without a phone.

When the phone **can** reach ESPN, live scores replace this file on screen. A hand edit does not override a live game.

The GitHub Action **Refresh sports snapshot** rebuilds this file from ESPN once a day (11:15 UTC) and whenever someone runs it by hand. A successful run replaces hand edits with ESPN’s numbers. That is intentional.

## How to rebuild it from ESPN

From the repository root, with network, and no API key:

```bash
node scripts/build-snapshot.mjs
```

The script does nothing if the games and scores are already the same. It only rewrites the file when something changed.

Check the parser with:

```bash
node --test scripts/normalize.test.mjs
```

## How to edit it by hand

Keep `schemaVersion` at `1`. Times stay UTC ISO-8601 strings (`2026-11-08T18:00:00.000Z`). The app converts them to US Eastern (`America/New_York`). JSON does not allow comments.

A hand edit may omit `seasonState`, `availability`, `phase`, `ufc.seasonState`, and `note`. When one of those keys is present, the value has to match the lists below.

`source.mode` for a hand edit or a script rebuild should stay `"snapshot"`. The app sets `"live"` only in memory.

### Teams

`teams` is an array. Keep these `id` values: `colts`, `pacers`, `reds`.

| id | League | ESPN team id |
| --- | --- | --- |
| colts | NFL | 11 |
| pacers | NBA | 11 |
| reds | MLB | 17 |

Each team:

| Field | Meaning |
| --- | --- |
| `name`, `shortName`, `abbr` | Shown on screen |
| `record` | Text such as `2-5`. Use `4-2-1` only when there is a tie. |
| `wins`, `losses`, `ties` | Numbers matching `record` |
| `streak` | ESPN short streak such as `L3`, or `null` |
| `seed` | Conference seed as text, or `null` |
| `standingName` | Division name, such as `AFC South` or `Central` |
| `conference` | Full conference name |
| `standings` | That division only, ESPN order. Mark Todd’s row with `"ours": true` |
| `byeWeek` | NFL bye week number, or `null` |
| `seasonState` | One label for that team. Colts: `Preseason`, `Regular season`, `Bye`, `Playoffs`, `Offseason`. Pacers: `Preseason`, `Regular season`, `NBA Cup`, `Play-in`, `Playoffs`, `Offseason`. Reds: `Offseason`, `Spring training`, `Regular season`, `Postseason`. Not `null`. |
| `availability` | Array of `{ name, position, status, reason }`. `status` is `Out`, `Doubtful`, `Questionable`, `Day-to-day`, `IR`, `IL`, `Suspended`, or `Active`. `reason` is a string of 1 to 40 characters, or `null`. `Active` rows use `reason: null`. |
| `logo` | `https://` image, or `null` |
| `nextGame` | The live game if one is in progress. Otherwise today's scheduled game, then today's postponed game, then today's final. Otherwise the next scheduled or postponed game, or `null`. |
| `recent` | Up to 5 final games, newest first |
| `schedule` | Every game, oldest first |

`Active` is legal only for these pinned players. Other `Active` injury rows are news blurbs and stay off the list.

- Colts: Daniel Jones, Jonathan Taylor, Alec Pierce, Tyler Warren
- Pacers: Tyrese Haliburton, Pascal Siakam, Bennedict Mathurin, T.J. McConnell, Andrew Nembhard
- Reds: Elly De La Cruz, Hunter Greene

`nextGame` must be the same object (same `id`) as the matching row in `schedule`. `recent` rows too.

### A game

```json
{
  "id": "401873040",
  "start": "2026-11-08T18:00:00.000Z",
  "status": "scheduled",
  "detail": "11/8 - 1:00 PM EST",
  "timeValid": true,
  "venue": "Lucas Oil Stadium",
  "broadcast": "CBS",
  "neutralSite": false,
  "ours": "home",
  "away": {
    "id": "6",
    "abbr": "DAL",
    "name": "Dallas Cowboys",
    "shortName": "Cowboys",
    "score": null,
    "winner": false,
    "logo": null
  },
  "home": {
    "id": "11",
    "abbr": "IND",
    "name": "Indianapolis Colts",
    "shortName": "Colts",
    "score": null,
    "winner": false,
    "logo": null
  }
}
```

`status` is one of: `scheduled`, `in`, `final`, `postponed`, `canceled`. Do not put `Delayed` or `Halftime` in `status`.

`phase` is `null`, or `Pregame`, `In progress`, `Halftime`, `End of period`, `Overtime`, `Delayed`, or `Final`. `phase` is `null` when the game is not today in US Eastern, and when `status` is `postponed` or `canceled`. `Pregame` pairs with `scheduled`. `Delayed` pairs with `scheduled` or `in`. `In progress`, `Halftime`, `End of period`, and `Overtime` pair with `in`. `Final` pairs with `final`.

`ours` is `home`, `away`, or `null`.

`timeValid: false` means show the date and **Time TBD**. The Reds’ following opening day is often like this in the winter.

`score` is a string (`"0"`, `"27"`) or `null`. Do not use a number. Zero is a real score. Leave `winner` false unless the game is final.

A final score edit is `score` plus `winner: true` on the winner only.

### Standings row

```json
{
  "abbr": "IND",
  "name": "Colts",
  "fullName": "Indianapolis Colts",
  "wins": 2,
  "losses": 5,
  "ties": 0,
  "pct": ".286",
  "streak": "L3",
  "diff": "-26",
  "seed": "12",
  "logo": null,
  "ours": true
}
```

### UFC

`ufc.schedule` is every numbered UFC event and UFC Fight Night in the window, oldest first. Skip Dana White’s Contender Series.

`ufc.nextEvent` is the live card, or the next scheduled card. `ufc.recent` is up to 4 finished cards, newest first. Those objects are the same ones as in `schedule`.

`ufc.seasonState` is `Fight week` or `null`. `null` is the gap between cards. Any other string fails validation.

`note` on a fight is `null`, or a string of 1 to 80 characters when the bout is canceled or a fighter is pulled. `""` fails. `No Contest` stays in `method`, not `note`.

`fights` lists the **main event first**. ESPN sends prelims first and the main event last. The script reverses that. The last five bouts ESPN sent are `"card": "main"`. Earlier bouts are `"card": "prelim"`. Exactly one fight has `"mainEvent": true`.

```json
{
  "id": "401921310",
  "weightClass": "Heavyweight",
  "status": "final",
  "detail": "Final",
  "method": "KO/TKO",
  "finish": "R1 3:35",
  "mainEvent": true,
  "card": "main",
  "fighters": [
    { "name": "Johnny Walker", "record": "23-10-0", "winner": false, "flag": null, "country": "Brazil" },
    { "name": "Mick Parkin", "record": "10-0-0", "winner": true, "flag": null, "country": null }
  ]
}
```

`method` is `Decision`, `Submission`, `KO/TKO`, `Draw`, `No Contest`, or `null`.

ESPN’s feed writes KO/TKO as the text `Unofficial Winner Kotko`. The script maps that phrase to `KO/TKO`. If you are editing by hand, write `KO/TKO`, not Kotko.

## ESPN URLs the script calls

No key. Each of these responded with `access-control-allow-origin: *` when this app was built, so the phone calls them itself.

- Colts schedule: `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/11/schedule`
- Pacers schedule: `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/11/schedule`
- Reds schedule: `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/teams/17/schedule`
- NFL scoreboard (live scores for the current week): `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard`
- NBA scoreboard: `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard`
- MLB scoreboard: `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard`
- NFL standings by division: `https://site.api.espn.com/apis/v2/sports/football/nfl/standings?level=3`
- NBA standings by division: `https://site.api.espn.com/apis/v2/sports/basketball/nba/standings?level=3`
- MLB standings by division: `https://site.api.espn.com/apis/v2/sports/baseball/mlb/standings?level=3`
- NFL injuries: `https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries`
- NBA injuries: `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries`
- MLB injuries: `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/injuries`

Each injury URL is the whole league. The script keeps the block whose `id` is that team's ESPN team id. Colts and Pacers both use `11`, on different league URLs. A failed injury request leaves `availability` as `[]` and does not fail the snapshot.

During the MLB offseason the plain Reds schedule returns no games, because ESPN is on the postseason and the Reds are not in it. The loader then requests `?season=YYYY&seasontype=2` for that year’s regular season and, if every game is already final, `?season=YYYY+1&seasontype=2` for the next opening day. A hand edit can store the same merged list. `nextGame` stays `null` when the next season is not posted yet. Last results and standings still fill in from whatever those feeds returned.
- UFC cards in a date window: `https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard?dates=YYYYMMDD-YYYYMMDD`

The schedule feed often has no score while a game is in progress. The scoreboard feed has the live number. The script copies the live number onto the schedule game with the same `id`.
