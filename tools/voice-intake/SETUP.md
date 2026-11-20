# Fleet Voices intake: setup

The Fleet Voices page (`runners/voices.html`) sends recordings to a small Google Apps Script that runs in
the studio's Google account. The script saves each submission to a Google Drive folder and adds one row to
a Google Sheet. It costs nothing and no outside service holds the recordings.

Do this once, signed in to the Google account that should own the recordings (kyleecosper@gmail.com,
not a work account). It takes about five minutes.

## 1. Create the script

1. Open https://script.google.com and press **New project**.
2. Click "Untitled project" at the top and rename it **Fleet Voices intake**.
3. Delete everything in `Code.gs`, paste in all of [`Code.gs`](Code.gs) from this folder and press **Save**.

## 2. Create the Drive folder and the Sheet

1. In the toolbar, choose the function **setup** and press **Run**.
2. Google asks for permission. Press **Review permissions**, pick your account, then **Advanced** →
   **Go to Fleet Voices intake (unsafe)** → **Allow**. It says "unsafe" only because you wrote the script
   yourself and Google hasn't reviewed it.
3. The log at the bottom shows two links: the **Fleet Voices submissions** folder in Drive and the
   **Fleet Voices submissions log** sheet inside it.

## 3. Put it online

1. Press **Deploy** → **New deployment**.
2. Click the gear next to "Select type" and choose **Web app**.
3. Set **Execute as: Me** and **Who has access: Anyone**. "Anyone" lets fans send recordings without a Google
   sign-in. They can only send recordings; they cannot see the folder or the sheet.
4. Press **Deploy** and copy the **Web app URL** (it ends in `/exec`).

## 4. Connect the page

Put the URL in `runners/voices.html`, on the form line:

```html
<form class="vform" id="record" data-endpoint="PASTE THE /exec URL HERE" data-release="v1-2026-11-19" novalidate>
```

Until this is filled in, the page shows "Submissions open soon" and the send button is off.

The Discord invite is in two places on the same page, both marked `data-link="DISCORD_URL"`. If the invite
changes, update both.

## Day to day

- **New recordings** arrive as a folder per person (`FV-...  Name`), holding the audio files, numbered and named
  by line ID, and an `agreement.txt` with exactly what they ticked. You also get an email for each one.
- **The sheet** has a **Status** column, set to `New`. Change it to `Used`, `Not used` or `Removed` as you go.
  Names marked `Used` with credit wanted are the ones for the game credits.
- **Keep voices anonymous.** When a line goes into the game, give the person a voice number (v001, v002, …)
  and write that number in the sheet's Notes column. That sheet is the only place a voice number and a
  person are linked. Nothing with a name, email or FV- ID goes into the game repo. The game's
  `tools/fleet_voices_ingest.py` strips file metadata and uses only the voice number.
- **Credits** are one alphabetical list of names (people who wanted credit, Status `Used`). They never sit
  next to a line or a voice.
- **Delete unused recordings after two years** (release section 8): every few months, delete folders older
  than two years whose Status isn't `Used`, and clear their sheet rows.
- **Recordings come in different formats.** Phone browsers send m4a or webm and uploads can be mp3 or wav.
  Convert to the game's format when a line is picked.
- **To pause submissions**, open **Project Settings** → **Script Properties** and add `CLOSED` = `yes`. The page
  then shows "Submissions open soon". Delete the property to reopen.
- **To turn off the emails**, add the script property `NOTIFY` = `no`.
- **The daily limit** is 300 submissions, to stop a flood. Raise `MAX_PER_DAY` in `Code.gs` if a post goes big.
- **To change the script**, edit it, then **Deploy** → **Manage deployments** → pencil → **Version: New version**
  → **Deploy**. This keeps the same URL, so the page needs no change.
- **If someone asks to be removed**, find them by submission ID or email in the sheet, set Status to `Removed`
  and leave their line out of anything new (release section 7). Delete their email and Discord name from the
  sheet if they ask, but keep the agreement file while their line is still in a shipped build.

## Changing the release text

People agree to a fixed version of `runners/voice-release.html`. If you change its wording, do not overwrite
the old meaning silently: give it a new version and update all three places together:

1. The version line on `runners/voice-release.html`.
2. `data-release` on the form in `runners/voices.html`.
3. `RELEASE_VERSION` in `Code.gs`, then redeploy as a new version.

The script refuses submissions from a page with an old version, so nobody agrees to text that has since changed.
