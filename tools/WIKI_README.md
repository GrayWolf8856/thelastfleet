# The Last Fleet wiki: how to update it

The wiki at `wiki/` on thelastfleet.com is where the Runners ship status now lives. It replaces the old asset board pages
(`asset-board/BOARD.md`, `board.html` and `tools/build_asset_board.py`). Kyle, 17 Nov 2026: "We can just move the board to the
wiki. Which would be on TheLastFleet website ... it was always the goal and where the source of truth should live anyways."

Every page in `wiki/` is generated. Do not edit the HTML by hand: change the sources or `tools/wiki-status.json`, then run the
generator again. `tools/` itself is kept off the live site by `_config.yml`.

## Rules

1. **Pictures only.** Kyle, 17 Nov 2026: "The wiki can just be pictures it meant for other people to see. Not for people to
   download assets. Assets should stay inside the games."
   - No model files of any kind (GLB, glTF, Draco or meshopt copies, FBX, .blend). No 3D viewer.
   - No download links to models, textures or source files.
   - Pictures are renders and screenshots, made into web JPEGs (at most 1600 px). The generator refuses to write a model file.
2. **Status and date only** (Kyle, 17 Nov 2026). Public pages do not name the makers (ChatGPT, Claude Opus, Claude Fable
   and so on) or who approved what. The generator strips notes like "(Kyle, 13 Nov 2026)" and refuses to publish a maker
   name. Equipment is approved when it is in the game (Kyle, 17 Nov 2026: "the equipment is approved if it's in the game"); it shows no pictures until then (no candidate pictures). `--show-makers` and
   `--equipment-candidates` exist only for a local look; never publish with them.
3. **Public site.** Only game-facing content goes in: names, roles, pictures, lore and status. These stay out:
   - AI prompts, maker hand-back notes, review notes, check results;
   - file paths, model files and hashes of files that are not approved;
   - rejected or archived models;
   - anything Kyle marks private: add the word to `PRIVATE_WORDS` in the script, which then drops any sentence holding
     it. The list is empty since Kyle made the drone ships and Dex public (17 Nov 2026).
   - For bounties: rewards, escort counts and health numbers (Kyle, 15 Nov 2026).
4. **The asset board is read only.** `asset-board/` is frozen by `.active-repair-preservation-hold.json`. The generator only
   reads it. Never run `build_asset_board.py`, never touch the hold file, never write into the board.
5. **Not live until Kyle says so.** Work on a branch and open a draft PR. Kyle merges to `main` (which is the live site) only
   when he has looked at it.
6. **The World Atlas is the lore bible.** Quote it or link it; never contradict it. If the atlas does not settle a lore
   question, put a placeholder on the page and ask. Do not guess.

## Run it

```sh
python3 tools/build_wiki.py --dry-run      # read everything, write nothing, show what would change
python3 tools/build_wiki.py                # write wiki/ (only wiki/; it never commits or pushes)
python3 tools/build_wiki.py --show-redactions   # also list every sentence left out as private or internal
python3 tools/preview_wiki.py --port 8771  # look at it on the LAN: http://<the Mac mini>:8771/wiki/
```

Run it with the system `python3` (it uses `sips` for pictures). The source paths default to the Mac mini's drives. Change them
with `--board`, `--decisions`, `--guide`, `--atlas`, `--lore-from` and `--game` (the Runners game repo; run `git fetch` in it first), or the `LASTFLEET_*` environment variables at the top
of the script.

## Where the status comes from (in order; the later one wins)

1. **The asset board** (`board.json`): the card's own status.
2. **`ship-guide-site/decisions/ship-decisions.json`**, written when Kyle approves or rejects a model on the final review
   page (final.html). Approved means **Final**, with the maker, version, date and SHA-256 of the approved file. Rejected
   means **Not used**. The generator checks each final model's file against its SHA-256 and warns if it has changed.
3. **`tools/wiki-status.json`**: decisions Kyle makes anywhere else (in chat, in Notion), recorded here. This is how an
   agent changes a status from now on: add or change one entry, with Kyle's words and the date, then rebuild.

```json
"P-TOL-3": {"status": "approved", "decided": "2026-11-16", "decidedBy": "Kyle: \"I approve just keep building and merging\""}
```

The status keys are `final`, `approved`, `review`, `doing`, `todo` and `notused`. An entry can also hold `maker`,
`version`, `note` (shown on the page), `facts` (replaces a row of a ship's sheet, for example `{"Price": "26,000 CR"}`) and
`publishStory: true` (publishes the "Her story" text from the story card, once the lore is confirmed).

`wiki/runners/status.json` is the full list as the site shows it, for other tools to read.

## What each page uses

| Section | Source | Pictures |
|---|---|---|
| Player ships (S-xx) | `2-ships/*/STORY_CARD.md` (only the part above "On the asset board"), atlas "Runners 2055 - Ships.md" | the approved model's renders; game stills from `ship-guide-site/game-photos.json` |
| NPC ships (N-xx) | `3-npc-ships/npc_specs.json`, one role line from the NPC list | the approved model's renders |
| Faction-dressed ships (R-xx) | `5-dressed-ships/dress_specs.json`, one line from the dress list | the approved model's renders |
| Pirate ships | the ladder in `6-pirate-ships/HANDBACK.md` | `6-pirate-ships/<faction>_<ship>/from-claude/*.png` |
| Bounty ships | `7-bounty-ships/bounty_ships.json`: name, alias, ship, hull, look only | cut from `7-bounty-ships/sheet_<faction>.png` |
| Drone ships (D-xx) | `board.json`, one role line from the drone list | the approved model's renders |
| Equipment (E-xx) | `board.json` cards; **approved when it is in the game** (its kit part is in the Runners game repo, main, or `wiki-status.json` says it is in the game under another model) | one render when approved; none while in review |

Pictures are picked by name: whole-ship views (bow quarter, side, stern quarter) first. Close-ups, damage, check sheets,
drafts and other versions are skipped. To change a pick, change the `GOOD` and `BAD` lists in the script, not the page.

## Adding a game later

The wiki home (`wiki/index.html`) already lists Artemis Protocol and Runners Lite as "coming later". Give a game its own
folder (`wiki/artemis-protocol/`, `wiki/runners-lite/`) and its own sources in the generator. Never mix ships between games.
