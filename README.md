# Sports Hub

Phone scoreboard for Todd Ward in Indianapolis. It follows the Indianapolis Colts, the Indiana Pacers, the Cincinnati Reds, and UFC cards. Every time is US Eastern.

The scoreboard is a Progressive Web App in the `sports/` folder. You can put it on an iPhone or Android home screen and it opens full screen, with its own icon. This repository can hold other small apps later. The page at the root is only a door into `/sports`.

There is no build step and no API key.

## Open it on a computer

From this folder:

```bash
python3 -m http.server 8080
```

Then open [http://localhost:8080/](http://localhost:8080/) and tap **Open the scoreboard**.

Directly: [http://localhost:8080/sports/](http://localhost:8080/sports/)

Do not double-click `index.html`. A `file://` address will not load the scores or install the app.

## Put it on your phone

Use the **sports** address, the one that ends in `/sports/`. Add that page, not the short hub page.

### iPhone

1. Open the sports page in **Safari**. Chrome on iPhone cannot add a full-screen app.
2. Tap the **Share** button (the square with the arrow).
3. Tap **Add to Home Screen**.
4. Tap **Add**.

The icon says **Ward Sports**. It opens without the Safari toolbar. The first time, keep the phone online so it can save a copy for later.

### Android

1. Open the sports page in **Chrome**.
2. Tap the **menu** (three dots).
3. Tap **Install app** or **Add to Home screen**.
4. Confirm.

## Where the scores come from

The phone asks ESPN’s public scoreboard directly. No account and no paid key. Those URLs send `access-control-allow-origin: *`, which means a web page is allowed to read them.

Checked feeds:

- NFL, NBA, and MLB team schedules, current scoreboard, and division standings (`?level=3`)
- UFC scoreboard for a range of dates, which includes Fight Nights and numbered cards

In the MLB offseason the Reds’ default schedule is empty. The app then uses the regular-season slate and, when ESPN has posted it, next year’s opening day. Standings stay on the screen when the standings feed still has them.

The exact links are in [sports/data/README.md](sports/data/README.md).

If ESPN does not answer, the app shows the last copy it saved on the phone. If the phone has never saved one, it reads `sports/data/snapshot.json` from this site.

Tap **Commune** (the red seal) any time. If a game or fight is live, the page also refreshes about every 30 seconds while it is on screen.

A service worker stores the app shell (pages, fonts, icons, and the snapshot) so a later visit still opens when the network is gone. Scores from the last successful refresh stay in the phone’s local storage.

## The saved JSON file

`sports/data/snapshot.json` is a simple backup. Another assistant can rebuild it or edit it. The format, the ESPN urls, and the rules are in [sports/data/README.md](sports/data/README.md).

Rebuild from a computer that is online:

```bash
node scripts/build-snapshot.mjs
```

GitHub Action **Refresh sports snapshot** does that every day at 11:15 UTC (early morning Eastern) and can be run by hand:

1. Open the repository on GitHub.
2. Click **Actions**.
3. Click **Refresh sports snapshot**.
4. Click **Run workflow**, then **Run workflow** again.

The action only commits when a score, a date, or a card actually changed. The phone does **not** wait for that action. Online, it talks to ESPN itself. The action keeps the backup file in the repo from going stale, and the published backup updates the next time the site is deployed.

If the action fails with a permissions error, the phone app still works. The failure only means GitHub did not write a new `snapshot.json`.

## Put it on the internet for free

This repository is **private**. The site is not live until you do one of the paths below.

**There is no public URL yet.** After GitHub Pages is turned on, the addresses are:

- Hub: `https://toddw291.github.io/Sports-Hub/`
- Scoreboard (the one to add to the home screen): `https://toddw291.github.io/Sports-Hub/sports/`

### What to know before you click

GitHub Free only offers Pages for a **public** repository. This one is private, so if the account is on the free plan, Pages will not publish it.

A paid personal plan (GitHub Pro) can publish Pages from a private repository, but that website is still **public on the internet**. A truly private Pages site is an organization feature on GitHub Enterprise Cloud. A home-screen app needs an address the phone can open without logging into GitHub, so a public site is the right outcome either way.

There are no passwords or private keys in this repository. The scores are public. Making the repository public is the simple path.

The account plan could not be read from this environment, so the Pages screen is the place that will say yes or no.

### Path A — GitHub Pages

1. Open [github.com/toddw291/Sports-Hub](https://github.com/toddw291/Sports-Hub).
2. If the repository should be public: **Settings** → **General** → scroll to **Danger Zone** → **Change repository visibility** → **Change to public**.
3. Still in **Settings**, click **Pages** in the left sidebar. Direct link: [github.com/toddw291/Sports-Hub/settings/pages](https://github.com/toddw291/Sports-Hub/settings/pages).
4. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
5. Set **Branch** to `main` and the folder to **`/ (root)`**.
6. Click **Save**.
7. Wait a minute and refresh that Pages screen. GitHub shows the site address when it is ready. Give it a couple of minutes on the first publish.
8. On the phone, open the address that ends in `/sports/` and follow **Put it on your phone** above.

A file named `.nojekyll` is already in the repo so Pages serves the app as plain files.

If the Pages screen says Pages is not available for this repository, the plan does not allow it while the repo is private. Make the repo public (step 2), or use Path B.

### Path B — Vercel, if the GitHub repo should stay private

Vercel’s free Hobby plan can publish a private GitHub repo. The website address is still public. You do not pay, and you do not put a credit card down for a personal static site.

1. Go to [vercel.com](https://vercel.com) and sign up with **Continue with GitHub**.
2. Approve Vercel’s GitHub access. When it asks which repositories, choose **Sports-Hub** only.
3. Click **Add New…** → **Project**.
4. Find **Sports-Hub** and click **Import**.
5. Leave **Framework Preset** on **Other**.
6. Open **Build and Output Settings**:
   - **Build Command**: turn on Override and leave the box **empty**.
   - **Output Directory**: turn on Override and type `.`
   - **Install Command**: turn on Override and leave it **empty**.
7. Click **Deploy**.
8. When it finishes, Vercel shows an address like `https://sports-hub-something.vercel.app`.
9. Open that address, then open the `/sports` path (add `/sports` at the end). That is the page to put on the home screen.

Later pushes to `main` publish themselves.

### Path C — Netlify, same idea

1. Go to [app.netlify.com](https://app.netlify.com) and sign up with GitHub.
2. Click **Add new site** → **Import an existing project** → **GitHub**.
3. Choose **Sports-Hub**.
4. Branch: `main`. The repo already contains `netlify.toml`, which sets the publish folder to the repository root and sets no build command. Leave those fields as Netlify fills them. If the publish directory is blank, type `.`
5. Click **Deploy**.
6. Open the `*.netlify.app` address Netlify gives you, then add `/sports` at the end for the home-screen page.

## Credits

Cinzel and Source Sans 3 are used under the SIL Open Font License. Scores and logos are requested from ESPN’s public feed. This is an unofficial fan scoreboard.
