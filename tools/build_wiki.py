#!/usr/bin/env python3
"""Builds The Last Fleet wiki (wiki/ in this repo) from the Runners asset board and the ship decisions.

    python3 tools/build_wiki.py --dry-run     # read everything, say what would be written; write nothing
    python3 tools/build_wiki.py               # write wiki/ in this repo (and nothing else)

Reads, never writes:
  --board      the Runners asset board (board.json, 2-ships/*/STORY_CARD.md, npc/dress/bounty specs, pictures)
  --decisions  ship-guide-site/decisions/ship-decisions.json: Kyle's final-model decisions from final.html
  --guide      ship-guide-site (thumbs/ and game-photos.json)
  --atlas      the World Atlas note "Runners 2055 - Ships.md" (quoted on each player ship page)
  --lore-from  another checkout of this site whose runners/wiki/ pages (the atlas lore wiki) may be linked
Writes only inside <site>/wiki/. It never commits or pushes. See tools/WIKI_README.md.

Rules (Kyle, 17 Nov 2026): the wiki is pictures only. No model files (GLB, glTF, Draco or meshopt copies),
no 3D viewer and no download links to models, textures or source files. Assets stay inside the games.
"""
import argparse, datetime, hashlib, html, json, os, re, shutil, subprocess, sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNNERS = '/Volumes/SANDISK SSD/Games/The Last Fleet Runners'
DEFAULTS = dict(
    board=os.environ.get('LASTFLEET_ASSET_BOARD', RUNNERS + '/asset-board'),
    decisions=os.environ.get('LASTFLEET_DECISIONS', '/Volumes/Runners Dev/Games/The Last Fleet Runners/ship-guide-site/decisions/ship-decisions.json'),
    decisions_fallback=RUNNERS + '/ship-guide-site/decisions/ship-decisions.json',
    guide=os.environ.get('LASTFLEET_SHIP_GUIDE', RUNNERS + '/ship-guide-site'),
    atlas=os.path.expanduser('~/Documents/Obsidian Vault/Games/Naval Survival RTS/World Atlas/Runners 2055 - Ships.md'),
    lore_from=os.path.expanduser('~/Projects/thelastfleet-site-world'),
    game=os.environ.get('LASTFLEET_RUNNERS_GAME', RUNNERS + '/project'),
)
STATUS_FILE = os.path.join(REPO, 'tools', 'wiki-status.json')
CACHE = os.path.expanduser('~/Library/Caches/thelastfleet-wiki/stamps.json')

# Words that must never reach the public site; a sentence holding one is dropped and named in the build log.
# Empty for now: Kyle, 17 Nov 2026, made the drone ships and Dex public ("we approved the drone ships already").
# Add a word here if Kyle marks something private again.
PRIVATE_WORDS = []
PRIVATE = re.compile(r"\b(%s)\b" % '|'.join(PRIVATE_WORDS), re.I) if PRIVATE_WORDS else re.compile(r'(?!)')
# Internal working material: file paths, model files, maker hand-backs, prompts, modeller instructions.
INTERNAL = re.compile(r"\.glb\b|\.gltf\b|/Volumes|asset-board|from-(chatgpt|claude)|HANDBACK|prompt|modeller|"
                      r"repairs only|do not redesign|rebuild|current-model|parts-kit|check_asset|motion port|\bMP_|"
                      r"triangles|\bclip\b|sha-?256|see Balance|gun points", re.I)

STATUS = {  # key: (label, css class, sort order)
    'final': ('Final', 'st-final', 0), 'approved': ('Approved', 'st-approved', 1),
    'review': ('In review', 'st-review', 2), 'doing': ('In work', 'st-doing', 3), 'redo': ('Redo', 'st-doing', 3),
    'todo': ('Planned', 'st-todo', 4), 'notused': ('Not used', 'st-notused', 5)}
STATUS_HELP = [
    ('final', 'The final model: the one that goes into the game.'),
    ('approved', 'The design is approved. The final model is not signed off yet.'),
    ('review', 'Built, waiting for review.'),
    ('doing', 'Being built or repaired.'),
    ('todo', 'Planned, not built yet.'),
    ('notused', 'Not used in the game. It stays here so the number is not reused.')]
MAKERS = {'chatgpt': 'ChatGPT', 'claude': 'Claude', 'claude-opus': 'Claude Opus', 'claude-fable': 'Claude Fable',
          'grok': 'Grok', 'gemini': 'Gemini', 'combined': 'ChatGPT and Claude'}
CLASSES = [('scavenger', 'Scavenger', 'Salvage boats and tugs. Only Scavengers tow.'),
           ('smuggler', 'Smuggler', 'Only Smugglers smuggle: a hidden hold under honest cargo.'),
           ('hunter', 'Hunter', 'Warships and fast armed boats: bounties, escorts and fights.'),
           ('hauler', 'Hauler', "Container ships, delivery boats and tankers: the ships that carry the world's cargo."),
           ('fishing', 'Fishing', 'Only Fishing ships fish. The gear grows with the boat.')]
FACTIONS = [  # key, name, hull colour, accent (World Atlas, "Faction colours and logos")
    ('tollmen', 'The Tollmen', '#1C2230', '#C62828'), ('driftmark', 'The Driftmark', '#B8A27A', '#F2C230'),
    ('saltrot', 'Saltrot', '#7A3B1E', '#E3B505'), ('longliners', 'The Longliners', '#12355B', '#F28C28'),
    ('flotilla', 'The Flotilla', '#A79E8B', '#1A1A1A'), ('deadweight', 'Deadweight', '#121212', '#B71C1C')]
FACTION = {k: (n, h, a) for k, n, h, a in FACTIONS}
SECTIONS = [  # key, title, blurb
    ('ships', 'Player ships', 'The 38 ships a runner can buy, in five classes.'),
    ('npc', 'NPC ships', 'The boats that make the sea feel alive: traders, raiders, cutters, ferries and hulks.'),
    ('dressed', 'Faction-dressed ships', 'Player hulls dressed by the people who sail them: pirates, navies, ARI, the Federation and others.'),
    ('pirates', 'Pirate ships', 'Four refits for each of the six pirate factions: plate, spikes and welded-on guns.'),
    ('bounties', 'Bounty ships', 'The sixty wanted ships, ten for each pirate faction.'),
    ('drones', 'Drone ships', "Crewless boats left over from the war in Dex's Wake, and the craft that serve them."),
    ('equipment', 'Equipment', 'Guns, cargo, deck gear and fishing gear fitted to the ships.')]

a_show_makers = [False]   # set from --show-makers in main()
LOG = {'redacted': [], 'withheld': [], 'warnings': [], 'lore_links': 0, 'lore_missing': []}


# ---------------------------------------------------------------- small helpers
def esc(s): return html.escape(str(s if s is not None else ''), quote=True)


def slug(s):
    s = s.replace('ı', 'i')
    import unicodedata
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def md_inline(s):
    """Markdown bold/italics/code to plain HTML, escaped."""
    s = esc(s)
    s = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', s)
    s = re.sub(r'(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])', r'<i>\1</i>', s)
    s = re.sub(r'`([^`]+)`', r'\1', s)
    return s


ATTRIB = re.compile(r'\s*\((?:Kyle|Claude|ChatGPT|Codex)\b[^)]*\)|^(?:Kyle|Claude|ChatGPT)\s*\([^)]*\):\s*')
MAKER_WORDS = re.compile(r'\b(Kyle|Claude|ChatGPT|Codex|Opus|Fable|Gemini|Grok)\b')


def clean(text, where):
    """Drop sentences that hold private or internal words; log what went. Who-decided-what notes are cut
    ("(Kyle, 13 Nov 2026)"): public pages show the status and the date only (Kyle, 17 Nov 2026)."""
    if not text: return ''
    text = ATTRIB.sub('', text.strip())
    text = re.sub(r'(?m)^(?:Kyle|Claude|ChatGPT)\s*\([^)]*\):\s*', '', text)
    out = []
    for sent in re.split(r'(?<=[.!?])\s+(?=[A-Z"(*])', text.strip()):
        m = PRIVATE.search(sent) or INTERNAL.search(sent)
        if m:
            LOG['redacted'].append('%s: dropped a sentence holding "%s": %s' % (where, m.group(0), sent[:140])); continue
        out.append(sent)
    return ' '.join(out)


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''): h.update(b)
    return h.hexdigest()


def load_json(p, default=None):
    try:
        with open(p, encoding='utf-8') as f: return json.load(f)
    except FileNotFoundError:
        return default


class Images:
    """Converts pictures to web JPEGs inside wiki/. Only pictures: no model files ever."""
    def __init__(self, out, dry):
        self.out, self.dry, self.used = out, dry, set()
        self.stamps = load_json(CACHE, {}) or {}

    def _stamp(self, src, extra):
        st = os.stat(src); return '%s|%d|%d|%s' % (src, st.st_mtime, st.st_size, extra)

    def make(self, src, rel, maxpx=1600, crop=None, quality=76):
        """src picture -> wiki/<rel> JPEG, longest side at most maxpx. crop = (y, x, h, w) in source pixels."""
        if not re.search(r'\.(png|jpe?g|webp)$', src, re.I): raise ValueError('not a picture: %s' % src)
        dst = os.path.join(self.out, rel); self.used.add(os.path.normpath(rel))
        key = self._stamp(src, '%s|%s|%s' % (maxpx, crop, quality))
        if self.dry or (os.path.exists(dst) and self.stamps.get(rel) == key): return rel
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        tmp = dst + '.tmp.png'
        try:
            if crop:
                y, x, h, w = crop
                subprocess.run(['sips', '-c', str(h), str(w), '--cropOffset', str(y), str(x), src, '--out', tmp], capture_output=True, check=True, timeout=120)
                src2 = tmp
            else:
                src2 = src
            subprocess.run(['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', str(quality), '-Z', str(maxpx), src2, '--out', dst], capture_output=True, check=True, timeout=120)
        finally:
            if os.path.exists(tmp): os.remove(tmp)
        self.stamps[rel] = key
        return rel

    def save(self):
        if self.dry: return
        os.makedirs(os.path.dirname(CACHE), exist_ok=True)
        json.dump(self.stamps, open(CACHE, 'w'), indent=0)

    def prune(self, root_rel):
        """Remove pictures under wiki/<root_rel> that this build did not write."""
        root = os.path.join(self.out, root_rel); gone = []
        for b, _, fs in os.walk(root):
            for f in fs:
                rel = os.path.normpath(os.path.relpath(os.path.join(b, f), self.out))
                if rel not in self.used:
                    gone.append(rel)
                    if not self.dry: os.remove(os.path.join(b, f))
        return gone


def picture_px(path):
    r = subprocess.run(['sips', '-g', 'pixelWidth', '-g', 'pixelHeight', path], capture_output=True, text=True)
    w = re.search(r'pixelWidth: (\d+)', r.stdout); h = re.search(r'pixelHeight: (\d+)', r.stdout)
    return (int(w.group(1)), int(h.group(1))) if w and h else (0, 0)


# ---------------------------------------------------------------- picking pictures
GOOD = [(r'final_bow_quarter|three_quarter|full_load_stowed_quarter', 12), (r'bow_quarter|bow34|bow-quarter', 10),
        (r'overview|full_load_bow|full_load(?!_door)', 7), (r'(^|_)side|broadside|port_side', 7), (r'stern_quarter|back-quarter|rear_quarter', 6),
        (r'progression_0', 6), (r'play_80m|deck_20m', 5), (r'(^|_)top', 3), (r'front', 2), (r'^final_', 2)]
BAD = re.compile(r'dmg|damage(?!_progression_0)|progression_[123]|sheet|inspection|clip|frame|probe|contact|debug|diff|inside|interior|night|'
                 r'xray|section|budget|witness|audit|qa_|draft|beside|silhouette|person|scale|contrast|actual|pass|check|compare|'
                 r'wire|ortho|overlay|original|helm|bridge|cabin|joint|detail|hatch|door|anchor|engine|access|workstation|_vs_|'
                 r'test|before|parent|loads|radar|mast_|ladder(?!_bow)|roof|gun|fitted|cargo|deck_?gear|bin|horn|stair|rail|crane|net_|'
                 r'support|mount|pad|regression|after_deck|foredeck|hud|map|chart|ui_|play_200m|transparent|wireframe|uv|normal|close', re.I)


# Renders made with a working label burned into the top-left corner ("S-26 SUPPLY RUNNER v3 · exported GLB ..."): the Haulers' review renders.
LABELLED = re.compile(r'/2-ships/S-(2[5-9]|3[0-3])-[^/]+/from-chatgpt/')


def score_picture(name, version):
    base = os.path.basename(name).lower()
    if not re.search(r'\.(png|jpe?g)$', base): return None
    vs = re.findall(r'(?:^|[_-])v(\d+)(?=[_.-])', base)
    if version is not None and vs and int(vs[0]) != int(version): return None
    if BAD.search(base): return None
    s = 0
    for rx, pts in GOOD:
        if re.search(rx, base): s = max(s, pts)
    if 'final' in base: s += 2
    if vs: s += 1
    return s


def pick_pictures(cands, version, n):
    seen, scored = set(), []
    for i, p in enumerate(cands):
        if not p or p in seen or not os.path.isfile(p): continue
        seen.add(p)
        s = score_picture(p, version)
        if s is None: continue
        scored.append((-s, i, p))
    scored.sort()
    out, sizes = [], set()
    for _, _, p in scored:
        sz = os.path.getsize(p)
        if sz in sizes: continue     # the same picture under two names
        sizes.add(sz); out.append(p)
        if len(out) >= n: break
    return out


# ---------------------------------------------------------------- reading the sources
def parse_story_card(path):
    """The public part of a ship's STORY_CARD.md: her one-line purpose, look, how she works, special features,
    her sheet table and her story. Everything after '# On the asset board' is the modeller's brief, left out."""
    if not os.path.isfile(path): return {}
    t = open(path, encoding='utf-8').read()
    t = re.split(r'\n---\n\s*# On the asset board', t)[0]
    out = {}
    m = re.search(r'^> (.+)$', t, re.M); out['quote'] = m.group(1).strip() if m else ''
    m = re.search(r'## Her story\n(.*?)(?=\n## |\Z)', t, re.S)
    story = m.group(1).strip() if m else ''
    story = re.split(r'\n\*\*What the story asks of the model', story)[0]
    story = re.sub(r'\n_Source:.*?_\s*$', '', story, flags=re.S).strip()
    out['story'] = '' if (not story or story.lower().startswith('not written yet')) else story
    sheet = (re.search(r'## Her sheet\n(.*?)(?=\n## |\Z)', t, re.S) or [None, ''])[1] if re.search(r'## Her sheet', t) else ''
    m = re.search(r'\*\*Look:\*\*\s*(.+)', sheet); out['look'] = m.group(1).strip() if m else ''
    def bullets(head):
        m = re.search(r'\*\*' + head + r':\*\*\n\n((?:- .+\n?)+)', sheet)
        return [b[2:].strip() for b in m.group(1).strip().split('\n')] if m else []
    out['works'] = bullets('How she works'); out['features'] = bullets('Special features')
    rows = []
    for line in sheet.split('\n'):
        mm = re.match(r'^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$', line)
        if mm and mm.group(1).strip() not in ('', '---') and 'suggested placement' not in mm.group(1) and '&nbsp;' not in mm.group(1):
            rows.append((mm.group(1).strip(), mm.group(2).strip()))
    out['table'] = rows
    return out


def parse_atlas(path):
    """'**S-01 Scrapper.** text' paragraphs (and the indented gear line after) from the atlas Ships note."""
    res = {}
    if not os.path.isfile(path): LOG['warnings'].append('World Atlas Ships note not found; atlas quotes left out'); return res
    t = open(path, encoding='utf-8').read()
    for m in re.finditer(r'^\*\*(S-\d\d) ([^*]+?)\.\*\* (.+?)(?:\n  (.+))?$', t, re.M):
        res[m.group(1)] = (m.group(3).strip(), (m.group(4) or '').strip())
    return res


def parse_npc_lines(board, fname='CHATGPT_NPC_PROMPT.md', pre='N'):
    """One role line and the size for each NPC or drone boat (from the boat lists; the build instructions are left out)."""
    p = os.path.join(board, fname)
    roles, sizes = {}, {}
    if not os.path.isfile(p): return roles, sizes
    t = open(p, encoding='utf-8').read()
    for m in re.finditer(r'^\| \d+ \| (%s-\d\d) \|[^|]*\|[^|]*\|[^|]*\| ([^|]+) \|$' % pre, t, re.M): sizes[m.group(1)] = m.group(2).strip()
    for m in re.finditer(r'^### ((?:%s-\d\d[^\n]*?))\n(.*?)(?=\n### |\n## |\Z)' % pre, t, re.S | re.M):
        ids = re.findall(r'%s-\d\d' % pre, m.group(1))
        first = m.group(2).strip().split('\n')[0].strip()
        if first and not first.startswith('-'):
            for i in ids: roles[i] = first
    return roles, sizes


def parse_dress_lines(board):
    p = os.path.join(board, 'CHATGPT_DRESS_PROMPT.md'); res = {}
    if not os.path.isfile(p): return res
    for m in re.finditer(r'^\| \d+ \| (R-\d\d) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|$', open(p, encoding='utf-8').read(), re.M):
        res[m.group(1)] = dict(name=m.group(2).strip(), on=m.group(3).strip(), what=m.group(4).strip())
    return res


def parse_pirate_ladder(board):
    """The 24 pirate refits: faction -> [(tier, hull name, bounty ship name or None)] from 6-pirate-ships/HANDBACK.md."""
    p = os.path.join(board, '6-pirate-ships', 'HANDBACK.md'); res = {}
    if not os.path.isfile(p): return res
    t = open(p, encoding='utf-8').read()
    m = re.search(r'\*\*The ladder \(light, medium, heavy, capital\):\*\*\n((?:- .+\n)+)', t)
    if not m: return res
    tiers = ['Light', 'Medium', 'Heavy', 'Capital']
    for line in m.group(1).strip().split('\n'):
        mm = re.match(r'- (?:The )?(\w+): (.+)\.$', line.strip())
        if not mm: continue
        fac = mm.group(1).lower(); items = []
        for i, part in enumerate([x.strip() for x in mm.group(2).split(',')]):
            nm = re.search(r'\*(.+?)\*', part)
            hull = re.sub(r'\s*\*.+?\*', '', part).strip()
            items.append((tiers[i] if i < 4 else '', hull, nm.group(1) if nm else None))
        res[fac] = items
    return res


def game_files(repo, ref):
    """File names of every GLB in the Runners game repo at `ref` (read with git; nothing is checked out or changed)."""
    if not repo or not os.path.isdir(repo):
        LOG['warnings'].append('Runners game repo not found (%s): no equipment marked as in the game' % repo); return set()
    r = subprocess.run(['git', '-C', repo, 'ls-tree', '-r', '--name-only', ref], capture_output=True, text=True)
    if r.returncode:
        LOG['warnings'].append('could not read %s in the game repo: %s' % (ref, r.stderr.strip()[:200])); return set()
    return {os.path.basename(x) for x in r.stdout.split('\n') if x.endswith('.glb')}


# ---------------------------------------------------------------- page chrome (taken from the site's own Runners page)
def site_chrome(site):
    t = open(os.path.join(site, 'runners', 'index.html'), encoding='utf-8').read()
    header = re.search(r'<header class="site">.*?</header>', t, re.S).group(0)
    footer = re.search(r'<footer class="site big".*?</footer>', t, re.S).group(0)
    header = header.replace(' class="on" aria-current="page"', '')
    header = re.sub(r'(<a href="[^"]*wiki/")>Wiki</a>', r'\1 class="on" aria-current="page">Wiki</a>', header)
    return header, footer


def rebase(chunk, depth):
    """The Runners page sits one folder down; rewrite its ../ links for a page `depth` folders down."""
    pre = '../' * depth
    return re.sub(r'(href|src)="\.\./', lambda m: '%s="%s' % (m.group(1), pre), chunk)


def page(site_chrome_parts, depth, title, desc, crumbs, body, kick='The Last Fleet wiki'):
    header, footer = site_chrome_parts
    pre = '../' * depth
    cr = ' <span>›</span> '.join(('<a href="%s">%s</a>' % (esc(h), esc(t)) if h else '<b>%s</b>' % esc(t)) for t, h in crumbs)
    return '''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>%(title)s — The Last Fleet wiki</title>
<meta name="description" content="%(desc)s">
<meta name="theme-color" content="#060c14">
<meta property="og:type" content="article">
<meta property="og:title" content="%(title)s — The Last Fleet wiki">
<meta property="og:description" content="%(desc)s">
<link rel="icon" href="%(pre)sfavicon.png">
<link rel="preload" href="%(pre)sfonts/big-shoulders-stencil.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="%(pre)sstyle.css">
<link rel="stylesheet" href="%(pre)swiki/wiki.css">
<script src="%(pre)ssite.js" defer></script>
</head>
<body class="wiki-page">

%(header)s

<!-- The Last Fleet wiki. Generated by tools/build_wiki.py; do not edit by hand (see tools/WIKI_README.md). -->
<main id="main" class="wiki">
  <div class="wrap w">
    <nav class="wiki-crumbs" aria-label="You are here">%(crumbs)s</nav>
    <div class="kick">%(kick)s</div>
%(body)s
    <nav class="wiki-nav" aria-label="Wiki">%(nav)s</nav>
  </div>
</main>

%(footer)s

</body>
</html>
''' % dict(title=esc(title), desc=esc(desc), pre=pre, header=rebase(header, depth), footer=rebase(footer, depth), crumbs=cr, body=body, kick=esc(kick),
           nav=''.join('<a href="%s">%s</a>' % (pre + h, t) for t, h in [('Wiki home', 'wiki/index.html'), ('Runners', 'wiki/runners/index.html')] +
                       [(s[1], 'wiki/runners/%s/index.html' % s[0]) for s in SECTIONS]))


def pill(status):
    lab, cls, _ = STATUS[status]
    return '<span class="st %s">%s</span>' % (cls, esc(lab))


# ---------------------------------------------------------------- building the items
def build_items(a, images):
    board = a.board
    bj = load_json(os.path.join(board, 'board.json'))
    if not bj: sys.exit('No board.json in %s' % board)
    cards = {c['id']: c for c in bj['cards']}; cards.update({c['id']: c for c in bj.get('others', [])})
    decisions = load_json(a.decisions) or {}
    overrides = (load_json(STATUS_FILE, {}) or {}).get('items', {})
    atlas = parse_atlas(a.atlas)
    photos = (load_json(os.path.join(a.guide, 'game-photos.json'), {}) or {}).get('photos', [])
    npc_roles, npc_sizes = parse_npc_lines(board)
    dress = parse_dress_lines(board)
    titles = {c['title'].lower().replace('-', ' '): cid for cid, c in cards.items() if cid.startswith('S-')}
    in_game = game_files(a.game, a.game_ref)
    items = []

    def hull_card(name):
        return titles.get(name.lower().replace('-', ' '))

    def decided(cid, it):
        """Apply ship-decisions.json, then tools/wiki-status.json (newer decisions recorded here win)."""
        d = decisions.get(cid)
        if isinstance(d, dict) and d.get('decision') == 'approved':
            it.update(status='final', maker=d.get('maker'), version=d.get('version'), decided=(d.get('savedAt') or '')[:10],
                      decidedBy='Kyle, on the final review page')
            f0 = (d.get('files') or {}).get('0') or {}
            it['sha256'] = f0.get('sha256')
            src = os.path.join(board, f0.get('path', ''))
            it['_model_dir'] = os.path.dirname(src)
            if a.verify and os.path.isfile(src):
                it['fileMatchesApproval'] = sha256(src) == f0.get('sha256')
                if not it['fileMatchesApproval']: LOG['warnings'].append('%s: the approved model file has changed since approval (repair?)' % cid)
            it['_pics'] = [os.path.join(board, p) for p in d.get('pictures') or []]
        elif isinstance(d, dict) and d.get('decision') == 'rejected':
            it.update(status='notused', decided=(d.get('savedAt') or '')[:10], decidedBy='Kyle, on the final review page')
        o = overrides.get(cid)
        if o:
            for k in ('status', 'maker', 'version', 'decided', 'decidedBy', 'note'):
                if k in o: it[k] = o[k]
            if 'facts' in o: it['_fact_override'] = o['facts']
            if o.get('publishStory'): it['_publish_story'] = True

    def text_overrides(cid, it):
        """A player ship's lead line, look and how-she-works list from tools/wiki-status.json, when the story card is out of date."""
        o = overrides.get(cid) or {}
        for k in ('quote', 'look'):
            if k in o: it[k] = clean(o[k], cid)
        if 'works' in o: it['works'] = [x for x in (clean(b, cid) for b in o['works']) if x]

    def latest_pics(c, maker):
        e = ((c or {}).get('latest') or {}).get(maker) or {}
        return [os.path.join(board, p) for p in e.get('pictures', [])]

    def dir_pics(d, version=None):
        """Pictures beside the approved model, plus those in a v<version>-...evidence folder next to it."""
        if not d or not os.path.isdir(d): return []
        out = [os.path.join(d, f) for f in sorted(os.listdir(d))]
        if version is not None:
            for sub in sorted(os.listdir(d)):
                sp = os.path.join(d, sub)
                if os.path.isdir(sp) and re.match(r'v%s[-_]' % version, sub):
                    out += [os.path.join(sp, f) for f in sorted(os.listdir(sp))]
        return out

    # --- player ships
    for cid in sorted(k for k in cards if re.match(r'S-\d\d$', k)):
        c = cards[cid]
        lvl = re.search(r'Level (\d+)', c.get('sub', ''))
        it = dict(id=cid, section='ships', name=c['title'], cls=c.get('group', ''), level=int(lvl.group(1)) if lvl else None,
                  status={'approved': 'approved', 'review': 'review', 'doing': 'doing', 'redo': 'redo', 'todo': 'todo'}.get(c.get('status'), 'review'))
        decided(cid, it)
        st = c.get('stats') or {}
        card = parse_story_card(os.path.join(board, c.get('cardFile') or ''))
        it['quote'] = clean(card.get('quote') or c.get('purpose') or '', cid)
        it['look'] = clean(card.get('look', ''), cid)
        it['works'] = [x for x in (clean(b, cid) for b in card.get('works', [])) if x]
        it['features'] = [x for x in (clean(b, cid) for b in card.get('features', [])) if x]
        table = [(k, clean(v, cid)) for k, v in card.get('table', [])]
        fo = it.pop('_fact_override', {}) or {}
        table = [(k, fo.get(k, v)) for k, v in table if v]
        it['table'] = table
        if card.get('story'):
            if it.pop('_publish_story', False): it['story'] = clean(card['story'], cid)
            else:
                LOG['withheld'].append('%s %s: her story on the card is held back until the lore is confirmed (placeholder shown)' % (cid, c['title']))
        it['atlas'] = atlas.get(cid)
        if it['atlas']: it['atlas'] = (clean(it['atlas'][0], cid), clean(it['atlas'][1], cid))
        it['stats'] = dict(level=it['level'], length=st.get('length'), beam=st.get('beam'), speed=st.get('speed'), hp=st.get('hp'), price=fo.get('Price', st.get('price')))
        pics = it.pop('_pics', []) + latest_pics(c, it.get('maker')) + dir_pics(it.pop('_model_dir', None), it.get('version'))
        if (overrides.get(cid) or {}).get('pictures'):   # better renders made for the wiki (the Haulers, 25 Nov 2026)
            pics = sorted(dir_pics(os.path.join(board, overrides[cid]['pictures'])), key=lambda q: 'full_load' not in os.path.basename(q))   # loaded views first
        it['_pictures'] = pick_pictures(pics, it.get('version'), 3) if it['status'] != 'notused' else []
        it['_photos'] = [p for p in photos if p.get('cardId') == cid and p.get('reviewStatus') != 'historical']
        it['_thumb'] = os.path.join(a.guide, 'thumbs', '%s-%s-v%s.jpg' % (cid, it.get('maker'), it.get('version')))
        it['lore'] = 'runners/wiki/ships/%s.html' % slug(c['title'])
        text_overrides(cid, it)
        items.append(it)

    # --- player ships with no board card of their own: a version of a board ship, recorded in tools/wiki-status.json
    # with "versionOf" (the Rust bucket starter, built from the Scrapper; her own card, Kyle 25 Nov 2026)
    ships = {i['id']: i for i in items if i['section'] == 'ships'}
    for cid, o in sorted(overrides.items()):
        base = ships.get(o.get('versionOf'))
        if not base: continue
        it = dict(base, id=cid, name=o['name'], parent=base['id'], status='review', maker=None, version=None, decided=None, decidedBy=None,
                  sha256=None, note=None, story=None, atlas=None, lore=None, _photos=[], _thumb=None)
        decided(cid, it)
        fo = it.pop('_fact_override', {}) or {}
        it['table'] = [(k, fo.get(k, v)) for k, v in base['table']]
        it['stats'] = dict(base['stats'], price=fo.get('Price', base['stats'].get('price')))
        text_overrides(cid, it)
        if o.get('atlas'): it['atlas'] = (clean(o['atlas'], cid), '')
        skip = re.compile('|'.join(o.get('skipPictures') or ['(?!)']), re.I)   # e.g. a labelled contact sheet beside the renders
        pics = [p for p in dir_pics(os.path.join(board, o.get('pictures', ''))) if not skip.search(os.path.basename(p))]
        it['_pictures'] = pick_pictures(pics, None, 3) if it['status'] != 'notused' else []
        items.append(it)

    # --- NPC ships
    npc = {s['id']: s for s in (load_json(os.path.join(board, '3-npc-ships', 'npc_specs.json'), {}) or {}).get('ships', [])}
    for cid in sorted(k for k in set(npc) | {k for k in cards if k.startswith('N-')}):
        s, c = npc.get(cid, {}), cards.get(cid, {})
        it = dict(id=cid, section='npc', name=s.get('name') or c.get('title'), kind=s.get('kind') or c.get('kind'), parent=s.get('parentCard') or c.get('parentCard'),
                  status='review', role=clean(npc_roles.get(cid, ''), cid), size=npc_sizes.get(cid))
        decided(cid, it)
        pics = it.pop('_pics', []) + latest_pics(c, it.get('maker')) + dir_pics(it.pop('_model_dir', None), it.get('version'))
        it['_pictures'] = pick_pictures(pics, it.get('version'), 3) if it['status'] in ('final', 'approved') else []
        it['_thumb'] = os.path.join(a.guide, 'thumbs', '%s-%s-v%s.jpg' % (cid, it.get('maker'), it.get('version')))
        items.append(it)

    # --- dressed ships (R-00, the dress kit, is a box of parts, not a ship: left out)
    dspec = {s['id']: s for s in (load_json(os.path.join(board, '5-dressed-ships', 'dress_specs.json'), {}) or {}).get('ships', [])}
    for cid in sorted(k for k in dspec if k != 'R-00'):
        s, c, dl = dspec[cid], cards.get(cid, {}), dress.get(cid, {})
        name = s.get('name') or c.get('title')
        it = dict(id=cid, section='dressed', name=name, parent=s.get('parentCard'), status='review',
                  owner=re.split(r' ', name)[0] if name else '', what=clean(dl.get('what', ''), cid))
        decided(cid, it)
        pics = it.pop('_pics', []) + latest_pics(c, it.get('maker')) + dir_pics(it.pop('_model_dir', None), it.get('version'))
        it['_pictures'] = pick_pictures(pics, it.get('version'), 3) if it['status'] in ('final', 'approved') else []
        it['_thumb'] = os.path.join(a.guide, 'thumbs', '%s-%s-v%s.jpg' % (cid, it.get('maker'), it.get('version')))
        items.append(it)

    # --- drone ships (public since Kyle, 17 Nov 2026)
    droles, dsizes = parse_npc_lines(board, 'CHATGPT_DRONE_PROMPT.md', 'D')
    for cid in sorted(k for k in cards if k.startswith('D-')):
        c = cards[cid]
        it = dict(id=cid, section='drones', name=c['title'], status='review', role=clean(droles.get(cid, ''), cid),
                  size=dsizes.get(cid) or re.sub(r' long$', '', c.get('sub', '')))
        decided(cid, it)
        pics = it.pop('_pics', []) + latest_pics(c, it.get('maker')) + dir_pics(it.pop('_model_dir', None), it.get('version'))
        it['_pictures'] = pick_pictures(pics, it.get('version'), 3) if it['status'] in ('final', 'approved') else []
        it['_thumb'] = os.path.join(a.guide, 'thumbs', '%s-%s-v%s.jpg' % (cid, it.get('maker'), it.get('version')))
        items.append(it)

    # --- pirate refits (24)
    ladder = parse_pirate_ladder(board)
    pdir = os.path.join(board, '6-pirate-ships')
    for fac, _, _, _ in FACTIONS:
        for n, (tier, hull, named) in enumerate(ladder.get(fac, []), 1):
            key = '%s_%s' % (fac, re.sub(r'[^a-z0-9]+', '_', (named or hull).lower()).strip('_'))
            folder = os.path.join(pdir, key, 'from-claude')
            cid = 'P-%s-%d' % (fac[:3].upper(), n)
            hc = hull_card(hull)
            it = dict(id=cid, section='pirates', name=('%s (%s %s)' % (named, FACTION[fac][0], hull) if named else '%s %s' % (FACTION[fac][0].replace('The ', ''), hull)),
                      faction=fac, tier=tier, hull=hull, parent=hc, named=named, status='review' if os.path.isdir(folder) else 'todo', maker='claude')
            decided(cid, it)
            it['_pictures'] = pick_pictures(dir_pics(folder) + [os.path.join(folder, 'ladder_bow_quarter.png')], None, 3) if it['status'] != 'notused' else []
            items.append(it)

    # --- bounty ships (60): wanted name, ship and look only. Rewards, escorts and health stay private (Kyle, 15 Nov).
    bj7 = load_json(os.path.join(board, '7-bounty-ships', 'bounty_ships.json'), {}) or {}
    sheets = {}
    for b in bj7.get('bounties', []):
        fac = b['faction']; cid = 'B-%s' % b['id']
        it = dict(id=cid, section='bounties', name=b['ship'], person=b['name'], alias=b.get('alias'), faction=fac, number=b['number'],
                  hull=b.get('hull'), parent=b.get('hull_card'), status='review' if b.get('file') else 'todo', maker='claude',
                  addon=clean((b.get('build_on') or {}).get('text', ''), cid), mark=clean((b.get('personal_mark') or {}).get('text', ''), cid))
        decided(cid, it)
        sheet = os.path.join(board, '7-bounty-ships', 'sheet_%s.png' % fac)
        it['_crop'] = None
        if os.path.isfile(sheet) and it['status'] != 'notused':
            if sheet not in sheets: sheets[sheet] = picture_px(sheet)
            W, H = sheets[sheet]
            if W and H:   # 5 x 2 tiles under a title bar; each tile has a name strip at the bottom (layout of 16 Nov sheets)
                title = round(H * 70 / 1030); row = (H - title) // 2; col = W // 5; label = round(H * 78 / 1030)
                i = b['number'] - 1
                it['_crop'] = (sheet, (title + (i // 5) * row, (i % 5) * col + 1, row - label, col - 2))
        it['lore'] = 'runners/wiki/bounties/%s.html' % slug(b['name'])
        items.append(it)

    # --- equipment
    for cid in sorted(k for k in cards if re.match(r'E-\d\d$', k)):
        c = cards[cid]
        it = dict(id=cid, section='equipment', name=c['title'], cls=c.get('group', ''), sub=re.sub(r'\s*·\s*\d+ files?$', '', c.get('sub', '')),
                  status={'approved': 'approved', 'review': 'review', 'doing': 'doing', 'redo': 'redo', 'todo': 'todo'}.get(c.get('status'), 'review'))
        # Kyle, 17 Nov 2026: "the equipment is approved if it's in the game". In the game = its kit part is in the
        # Runners game repo (main), or tools/wiki-status.json records it as in the game under another model.
        kit = [os.path.basename(f) for f in c.get('files') or []]
        if any(k in in_game for k in kit):
            it.update(status='approved', decidedBy='In the game (its kit part is in the Runners game)')
        decided(cid, it)
        size = ((c.get('check') or {}).get('size'))
        it['size'] = size
        it['moves'] = [x for x in (clean(cl.get('what', ''), cid) for cl in c.get('clips') or []) if x]
        groups = {}
        for p in c.get('returned') or []:
            mk = re.search(r'/from-([a-z-]+)/', p)
            if mk: groups.setdefault(mk.group(1), []).append(os.path.join(board, p))
        # Approved (in the game): one render of the part. Not approved: no pictures (Kyle, 17 Nov 2026).
        it['_candidates'] = []
        if it['status'] in ('final', 'approved'):
            allp = [p for ps in groups.values() for p in ps if re.search(r'\.(png|jpe?g)$', p, re.I)]
            view = lambda p: next((k for k, rx in enumerate([r'three_quarter|front_quarter|front-quarter', r'back_quarter|back-quarter', r'front', r'side'])
                                   if re.search(rx, os.path.basename(p), re.I)), 9)
            ok = [p for p in allp if not re.search(r'clip|contact|sheet|web_|moving|drop|dmg|frame|_vs_|probe', os.path.basename(p), re.I) and os.path.isfile(p)]
            it['_pictures'] = sorted(ok, key=view)[:1]
        elif a.equipment_candidates:
            for mk, ps in sorted(groups.items()):
                got = pick_pictures(ps, None, 1)
                if got: it['_candidates'].append((mk, got[0]))
        items.append(it)
    return items, bj


# ---------------------------------------------------------------- writing pictures
def make_pictures(items, images):
    for it in items:
        sec, base = it['section'], slug('%s-%s' % (it['id'], it['name']))
        it['pictures'], it['thumb'] = [], None
        for n, p in enumerate(it.pop('_photos', []) or [], 1):
            src = os.path.join(os.path.dirname(images.guide_photos), p['src']) if p.get('src') else None
            if src and os.path.isfile(src):
                rel = images.make(src, 'runners/img/%s/%s-game-%d.jpg' % (sec, base, n))
                it['pictures'].append(dict(src=rel, caption=clean(p.get('title') or 'In the game', it['id']) + ' (a still from the game)', alt='The %s in the game' % it['name']))
        for n, p in enumerate(it.pop('_pictures', []) or [], 1):
            crop = None
            if LABELLED.search(p):   # these renders carry a working label in the top-left corner: cut the top band off
                w, h = picture_px(p); band = round(h * 0.075)
                if w and h: crop = (band, 1, h - band, w - 2)   # sips will not crop at the full width
            rel = images.make(p, 'runners/img/%s/%s-%d.jpg' % (sec, base, n), crop=crop)
            it['pictures'].append(dict(src=rel, caption='Render of the %s model%s' % ('final' if it['status'] == 'final' else 'current', ', fully loaded' if 'full_load' in os.path.basename(p) else ''), alt='The %s' % it['name']))
        for mk, p in it.pop('_candidates', []) or []:
            rel = images.make(p, 'runners/img/%s/%s-%s.jpg' % (sec, base, mk))
            it['pictures'].append(dict(src=rel, caption='Candidate by %s' % MAKERS.get(mk, mk), alt='%s, candidate by %s' % (it['name'], MAKERS.get(mk, mk))))
        crop = it.pop('_crop', None)
        if crop:
            rel = images.make(crop[0], 'runners/img/%s/%s-1.jpg' % (sec, base), maxpx=1200, crop=crop[1])
            it['pictures'].append(dict(src=rel, caption='Render of the current model', alt='The %s' % it['name']))
        # Index thumbnail: the first render (a whole-ship view); the ship guide's own thumbnail if there is none.
        th = it.pop('_thumb', None)
        if not it['pictures'] and th and os.path.isfile(th) and it['status'] in ('final', 'approved'):
            rel = images.make(th, 'runners/img/%s/%s-1.jpg' % (sec, base), maxpx=480, quality=82)
            it['pictures'].append(dict(src=rel, caption='Render of the final model', alt='The %s' % it['name']))
        renders = [p for p in it['pictures'] if 'game' not in os.path.basename(p['src'])] or it['pictures']
        if renders:
            first = renders[0]['src']
            it['thumb'] = images.make(os.path.join(images.out, first), 'runners/img/thumb/%s.jpg' % base, maxpx=480, quality=72) if not images.dry else first
        elif th and os.path.isfile(th) and it['status'] != 'notused':
            it['thumb'] = images.make(th, 'runners/img/thumb/%s.jpg' % base, maxpx=480, quality=80)


# ---------------------------------------------------------------- rendering pages
def item_url(it): return '%s.html' % slug('%s-%s' % (it['id'], it['name']))


def fmt_num(v): return format(v, ',') if isinstance(v, (int, float)) else esc(v)


def facts_html(rows):
    rows = [(k, v) for k, v in rows if v not in (None, '', [])]
    if not rows: return ''
    return '<dl class="stats">%s</dl>' % ''.join('<div><dt>%s</dt><dd>%s</dd></div>' % (esc(k), v) for k, v in rows)


def gallery(it, depth_to_wiki):
    if not it['pictures']:
        return '<div class="nocap"><p>%s</p></div>' % ('No pictures: not used' if it['status'] == 'notused' else 'Pictures to come')
    return '<div class="gal caps wiki-gal">%s</div>' % ''.join(
        '<figure><a href="%s"><img src="%s" alt="%s" loading="lazy"></a><figcaption>%s</figcaption></figure>' % (
            esc(depth_to_wiki + p['src']), esc(depth_to_wiki + p['src']), esc(p['alt']), esc(p['caption'])) for p in it['pictures'])


def status_block(it):
    lab = STATUS[it['status']][0]
    bits = [pill(it['status'])]
    if a_show_makers[0] and it.get('maker') and it['status'] in ('final', 'approved', 'review'):
        who = MAKERS.get(it['maker'], it['maker'])
        bits.append('<span class="st-who">%s%s</span>' % (esc(who), (' v%s' % esc(it['version'])) if it.get('version') else ''))
    if it.get('decided'): bits.append('<span class="st-when">%s %s</span>' % ('Decided' if it['status'] == 'notused' else 'Approved' if it['status'] in ('final', 'approved') else 'Since', esc(it['decided'])))
    note = '<p class="st-note">%s</p>' % esc(it['note']) if it.get('note') else ''
    return '<div class="st-row">%s</div>%s' % (' '.join(bits), note)


def lore_link(it, a, depth):
    rel = it.get('lore')
    if not rel: return ''
    here = os.path.isfile(os.path.join(a.site, rel)); there = a.lore_from and os.path.isfile(os.path.join(a.lore_from, rel))
    if not (here or there):
        LOG['lore_missing'].append('%s %s: no lore page %s' % (it['id'], it['name'], rel)); return ''
    LOG['lore_links'] += 1
    return '<p class="lore-link"><a class="btn ghost" href="%s%s">Lore: the %s in the Runners wiki</a></p>' % ('../' * depth, rel, esc(it['name']) if it['section'] != 'bounties' else 'wanted page')


def render_item(it, a, chrome, by_id):
    depth = 3  # wiki/runners/<section>/<page>.html
    W = '../../'  # from the page to wiki/
    sec = dict((s[0], s[1]) for s in SECTIONS)[it['section']]
    parent = by_id.get(it.get('parent'))
    plink = ('<a href="../ships/%s">%s</a> (%s)' % (item_url(parent), esc(parent['name']), esc(parent['id']))) if parent else esc(it.get('hull') or '')
    body = ['    <h1 class="h-st">%s</h1>' % esc(it['name']), '    <p class="wiki-note">Runners is in development. Details will change.</p>', status_block(it)]
    s = it['section']
    if s == 'ships':
        body.append('<p class="ship-meta">%s · Level %s · %s</p>' % (esc(it['cls']), esc(it['level']), esc(it['id'])))
        if it.get('quote'): body.append('<p class="wiki-lead">%s</p>' % md_inline(it['quote']))
        body.append(gallery(it, W))
        st = it['stats']
        rows = [(k, md_inline(v)) for k, v in it['table']] or [
            ('Size', '%s m long, %s m beam' % (st['length'], st['beam']) if st.get('length') else None), ('Speed', '%s m/s' % st['speed'] if st.get('speed') else None),
            ('Hull', '%s HP' % st['hp'] if st.get('hp') else None), ('Price', 'Free' if st.get('price') == 0 else ('%s CR' % fmt_num(st['price']) if st.get('price') else None))]
        body.append('<h2>Her sheet</h2>' + facts_html([('Class', esc(it['cls'])), ('Level', esc(it['level'])), ('Built on', plink if parent else None)] + rows))
        if it.get('look'): body.append('<h2>Her look</h2><p>%s</p>' % md_inline(it['look']))
        if it.get('works'): body.append('<h2>How she works</h2><ul class="plain">%s</ul>' % ''.join('<li>%s</li>' % md_inline(x) for x in it['works']))
        if it.get('features'): body.append('<h2>Ideas for her</h2><p class="f-draft">Proposals, not decided yet.</p><ul class="plain">%s</ul>' % ''.join('<li>%s</li>' % md_inline(x) for x in it['features']))
        body.append('<h2>Her story</h2>' + ('<p>%s</p>' % md_inline(it['story']).replace('\n\n', '</p><p>') if it.get('story') else '<p class="f-draft">Her story has not been written yet.</p>'))
        if it.get('atlas'):
            body.append('<h2>From the World Atlas</h2><blockquote class="atlas"><p>%s</p>%s<cite>World Atlas, Runners 2055: the ships</cite></blockquote>' % (
                md_inline(it['atlas'][0]), ('<p>%s</p>' % md_inline(it['atlas'][1])) if it['atlas'][1] else ''))
    elif s == 'npc':
        body.append('<p class="ship-meta">NPC ship · %s · %s</p>' % ('Built on a player hull' if it.get('kind') == 'mod' else 'Her own hull', esc(it['id'])))
        if it.get('role'): body.append('<p class="wiki-lead">%s</p>' % md_inline(it['role']))
        body.append(gallery(it, W))
        body.append('<h2>Her sheet</h2>' + facts_html([('Kind', 'Sails the sea; the player cannot buy her'), ('Built on', plink if parent else ('Her own hull' if it.get('kind') != 'mod' else '')), ('Length', esc(it.get('size')))]))
    elif s == 'drones':
        body.append('<p class="ship-meta">Drone ship · No crew · %s</p>' % esc(it['id']))
        if it.get('role'): body.append('<p class="wiki-lead">%s</p>' % md_inline(it['role']))
        body.append(gallery(it, W))
        body.append('<h2>Her sheet</h2>' + facts_html([('Kind', 'A crewless drone'), ('Size', esc(it.get('size')))]))
    elif s == 'dressed':
        body.append('<p class="ship-meta">Faction-dressed ship · %s · %s</p>' % (esc(it.get('owner')), esc(it['id'])))
        if it.get('what'): body.append('<p class="wiki-lead">%s</p>' % md_inline(it['what']))
        body.append(gallery(it, W))
        body.append('<h2>Her sheet</h2>' + facts_html([('Sailed by', esc(it.get('owner'))), ('Built on', plink)]))
    elif s == 'pirates':
        n, hc, ac = FACTION[it['faction']]
        body.append('<p class="ship-meta"><i class="fswatch" style="--h:%s;--a:%s"></i>%s · %s · Pirate refit</p>' % (hc, ac, esc(n), esc(it['tier'])))
        body.append('<p class="wiki-lead">A %s of %s, refitted the pirate way: 4-inch steel plate bolted over her sides, spikes, a welded ram, extra guns on welded mounts, and the faction\'s colours and mark.%s</p>' % (
            esc(it['hull']), esc(n), (' She is the ship of one of their bounties, <i>%s</i>.' % esc(it['named'])) if it.get('named') else ''))
        body.append(gallery(it, W))
        body.append('<h2>Her sheet</h2>' + facts_html([('Faction', '<a href="index.html#%s">%s</a>' % (it['faction'], esc(n))), ('Place in the fleet', esc(it['tier'])), ('Built on', plink)]))
    elif s == 'bounties':
        n, hc, ac = FACTION[it['faction']]
        who = '%s%s' % (esc(it['person']), (' "%s"' % esc(it['alias'])) if it.get('alias') else '')
        body.append('<p class="ship-meta"><i class="fswatch" style="--h:%s;--a:%s"></i>Wanted · %s · No. %d of 10</p>' % (hc, ac, esc(n), it['number']))
        body.append('<p class="wiki-lead">The ship of %s, number %d on the wanted list of %s.</p>' % (who, it['number'], esc(n)))
        body.append(gallery(it, W))
        body.append('<h2>Her sheet</h2>' + facts_html([('Captain', who), ('Faction', '<a href="index.html#%s">%s</a>' % (it['faction'], esc(n))), ('Built on', plink),
                                                        ('What she carries', md_inline(it.get('addon'))), ('Her mark', md_inline(it.get('mark')))]))
    elif s == 'equipment':
        body.append('<p class="ship-meta">%s · %s · %s</p>' % (esc(it['cls']), esc(it['sub']), esc(it['id'])))
        body.append(gallery(it, W))
        size = it.get('size')
        body.append('<h2>Its sheet</h2>' + facts_html([('Group', esc(it['cls'])), ('Kind', esc(it['sub'])),
                                                       ('Size', ('%.2f m across, %.2f m tall, %.2f m long' % tuple(size)) if size and len(size) == 3 else None)]))
        if it.get('moves'): body.append('<h2>What moves</h2><ul class="plain">%s</ul>' % ''.join('<li>%s</li>' % md_inline(x) for x in it['moves']))
    else:
        body.append(gallery(it, W))
    body.append(lore_link(it, a, depth))
    crumbs = [('Wiki', '../../index.html'), ('Runners', '../index.html'), (sec, 'index.html'), (it['name'], None)]
    desc = '%s: %s in Runners, The Last Fleet. Status: %s.' % (it['name'], sec.lower(), STATUS[it['status']][0])
    return page(chrome, depth, it['name'], desc, crumbs, '\n    '.join(body), kick='Runners · %s' % sec)


def card_html(it, href, sub, W):
    img = '<img src="%s" alt="" width="120" height="75" loading="lazy">' % esc(W + it['thumb']) if it.get('thumb') else '<span class="noimg"></span>'
    return '<li><a class="wcard st-card" href="%s">%s<span class="wt"><b>%s</b><small>%s</small>%s</span></a></li>' % (esc(href), img, esc(it['name']), sub, pill(it['status']))


def render_section(key, items, a, chrome, by_id):
    title, blurb = [(s[1], s[2]) for s in SECTIONS if s[0] == key][0]
    W = '../../'; groups = []
    if key == 'ships':
        for ck, cn, cb in CLASSES:
            g = sorted([i for i in items if i['cls'].lower() == ck], key=lambda i: (i['level'] or 0, i['id']))
            groups.append((ck, cn, cb, [(i, 'Level %s · %s' % (i['level'], i['id'])) for i in g]))
    elif key == 'npc':
        groups.append(('npc', 'NPC ships', 'Built on player hulls, or on hulls of their own.', [(i, i['id'] + (' · on the %s' % by_id[i['parent']]['name'] if i.get('parent') in by_id else '')) for i in items]))
    elif key == 'drones':
        groups.append(('drones', 'Drone ships', '', [(i, '%s · %s' % (i['id'], esc(i.get('size') or ''))) for i in items]))
    elif key == 'dressed':
        owners = []
        for i in items:
            if i['owner'] not in owners: owners.append(i['owner'])
        for o in owners:
            groups.append((slug(o), o, '', [(i, '%s · on the %s' % (i['id'], by_id[i['parent']]['name'] if i.get('parent') in by_id else '?')) for i in items if i['owner'] == o]))
    elif key in ('pirates', 'bounties'):
        for fk, fn, hc, ac in FACTIONS:
            g = [i for i in items if i['faction'] == fk]
            if not g: continue
            g.sort(key=lambda i: i.get('number') or i['id'])
            fmt = (lambda i: '%s · %s' % (i['tier'], i['hull'])) if key == 'pirates' else (lambda i: 'No. %d · %s%s · %s' % (i['number'], esc(i['person']), (' "%s"' % esc(i['alias'])) if i.get('alias') else '', esc(i['hull'])))
            groups.append((fk, '<i class="fswatch" style="--h:%s;--a:%s"></i>%s' % (hc, ac, esc(fn)), '', [(i, fmt(i)) for i in g]))
    elif key == 'equipment':
        gs = []
        for i in items:
            if i['cls'] not in gs: gs.append(i['cls'])
        for gname in gs:
            groups.append((slug(gname), esc(gname), '', [(i, '%s · %s' % (esc(i['sub']), i['id'])) for i in items if i['cls'] == gname]))
    counts = {}
    for i in items: counts[i['status']] = counts.get(i['status'], 0) + 1
    summary = ' · '.join('%s %d' % (STATUS[k][0], n) for k, n in sorted(counts.items(), key=lambda kv: STATUS[kv[0]][2]))
    body = ['    <h1 class="h-st">%s</h1>' % esc(title), '    <p class="wiki-lead">%s</p>' % esc(blurb), '    <p class="ship-meta">%d in all · %s</p>' % (len(items), esc(summary))]
    if len(groups) > 1:
        body.append('<nav class="cls-jump">%s</nav>' % ''.join('<a href="#%s">%s</a>' % (g[0], re.sub(r'<[^>]+>', '', g[1])) for g in groups))
    if key == 'bounties':
        body.append('<p>Each faction is broken by taking its ten bounties in order, smallest first. Their stories are in the Runners wiki.</p>')
    for gk, gn, gb, rows in groups:
        body.append('<section class="cls" id="%s"><h2>%s</h2>%s<ul class="wiki-cards">%s</ul></section>' % (
            gk, gn if '<' in gn else esc(gn), ('<p>%s</p>' % esc(gb)) if gb else '', ''.join(card_html(i, item_url(i), sub, W) for i, sub in rows)))
    crumbs = [('Wiki', '../../index.html'), ('Runners', '../index.html'), (title, None)]
    return page(chrome, 3, '%s — Runners' % title, '%s of Runners, The Last Fleet: %s' % (title, blurb), crumbs, '\n    '.join(body), kick='Runners')


def render_runners_home(items, a, chrome, built):
    counts = {}
    for i in items: counts[i['status']] = counts.get(i['status'], 0) + 1
    secs = []
    for k, t, b in SECTIONS:
        g = [i for i in items if i['section'] == k]
        if not g: continue
        fin = sum(1 for i in g if i['status'] == 'final')
        secs.append('<li><a href="%s/index.html"><b>%s</b><span>%s</span><span class="sec-c">%d %s%s</span></a></li>' % (
            k, esc(t), esc(b), len(g), 'entries' if k == 'equipment' else 'ships', (' · %d final' % fin) if fin else ''))
    legend = ''.join('<div><dt>%s</dt><dd>%s</dd></div>' % (pill(k), esc(t)) for k, t in STATUS_HELP)
    tally = ''.join('<div><dt>%s</dt><dd>%d</dd></div>' % (esc(STATUS[k][0]), counts.get(k, 0)) for k, _ in STATUS_HELP if counts.get(k))
    body = '''    <h1 class="h-st">Runners</h1>
    <p class="wiki-note">Runners is in development. Details will change.</p>
    <p class="wiki-lead">Every ship and every piece of gear in Runners, with its pictures and where it stands. When a ship's final model is signed off, it is marked Final here.</p>
    <ul class="wiki-sections">%s</ul>
    <h2>Where things stand</h2>
    <dl class="stats">%s</dl>
    <h2>What the marks mean</h2>
    <dl class="st-legend">%s</dl>
    %s
    <p class="f-draft">Updated %s. The full list is also in <a href="status.json">status.json</a>.</p>''' % (
        ''.join(secs), tally, legend,
        '<p class="lore-link"><a class="btn ghost" href="../../runners/wiki/index.html">The Runners wiki: factions, seas, ports and the world in 2055</a></p>' if (
            os.path.isfile(os.path.join(a.site, 'runners/wiki/index.html')) or (a.lore_from and os.path.isfile(os.path.join(a.lore_from, 'runners/wiki/index.html')))) else '',
        esc(built))
    return page(chrome, 2, 'Runners', 'The ships and gear of Runners, The Last Fleet: pictures, stats and where each one stands.', [('Wiki', '../index.html'), ('Runners', None)], body)


def render_wiki_home(items, chrome):
    fin = sum(1 for i in items if i['status'] == 'final')
    body = '''    <h1 class="h-st">The Last Fleet wiki</h1>
    <p class="wiki-lead">The ships, gear and places of the games of The Last Fleet, in one place. Pictures only: the models themselves stay inside the games.</p>
    <ul class="wiki-sections">
      <li><a href="runners/index.html"><b>Runners</b><span>Every ship and piece of gear: %d entries, %d with a final model.</span></a></li>
      <li><a href="runners/ships/index.html"><b>Runners: player ships</b><span>The 38 ships a runner can buy, by class.</span></a></li>
      <li><span class="soon"><b>Artemis Protocol</b><span>Coming later.</span></span></li>
      <li><span class="soon"><b>Runners Lite</b><span>Coming later.</span></span></li>
    </ul>
    <p class="f-draft">The games are in development. What is here is the plan as it stands, and it will change.</p>''' % (len(items), fin)
    return page(chrome, 1, 'The Last Fleet wiki', 'The ships, gear and places of The Last Fleet games.', [('Wiki', None)], body)


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description='Build The Last Fleet wiki (wiki/) from the Runners asset board. Reads the board; writes only wiki/.')
    ap.add_argument('--board', default=DEFAULTS['board']); ap.add_argument('--decisions', default=DEFAULTS['decisions'])
    ap.add_argument('--guide', default=DEFAULTS['guide']); ap.add_argument('--atlas', default=DEFAULTS['atlas'])
    ap.add_argument('--lore-from', default=DEFAULTS['lore_from'], help='another checkout of this site with runners/wiki/ (lore pages); "" for none')
    ap.add_argument('--site', default=REPO); ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--no-verify', dest='verify', action='store_false', help="skip checking each final model's SHA-256 against its approval")
    ap.add_argument('--game', default=DEFAULTS['game'], help='the Runners game repo (equipment in the game is approved)')
    ap.add_argument('--game-ref', default='origin/main', help='which branch of the game repo counts as "in the game"')
    ap.add_argument('--show-redactions', action='store_true', help='list every sentence left out as private or internal')
    ap.add_argument('--show-makers', action='store_true', help='name the maker and version on public pages (off: Kyle, 17 Nov 2026)')
    ap.add_argument('--equipment-candidates', action='store_true', help='show unapproved equipment candidates (off: Kyle, 17 Nov 2026)')
    a = ap.parse_args()
    a_show_makers[0] = a.show_makers
    if not os.path.isfile(a.decisions) and os.path.isfile(DEFAULTS['decisions_fallback']): a.decisions = DEFAULTS['decisions_fallback']
    a.site = os.path.realpath(a.site); a.board = os.path.realpath(a.board)
    if not os.path.isfile(os.path.join(a.site, 'style.css')): sys.exit('%s is not the site.' % a.site)
    out = os.path.join(a.site, 'wiki')
    if os.path.realpath(out).startswith(a.board + os.sep): sys.exit('Refusing to write inside the asset board.')
    hold = os.path.join(a.board, '.active-repair-preservation-hold.json')
    print('Asset board: %s (read only%s)' % (a.board, '; repair hold in place' if os.path.exists(hold) else ''))
    print('Decisions:   %s' % a.decisions)
    images = Images(out, a.dry_run); images.guide_photos = os.path.join(a.guide, 'game-photos.json')
    items, bj = build_items(a, images)
    make_pictures(items, images)
    by_id = {i['id']: i for i in items}
    chrome = site_chrome(a.site)
    built = datetime.datetime.now().astimezone().strftime('%d %b %Y %H:%M %Z')
    pages = {'index.html': render_wiki_home(items, chrome), 'runners/index.html': render_runners_home(items, a, chrome, built)}
    for k, _, _ in SECTIONS:
        g = [i for i in items if i['section'] == k]
        if not g: continue
        pages['runners/%s/index.html' % k] = render_section(k, g, a, chrome, by_id)
        for i in g: pages['runners/%s/%s' % (k, item_url(i))] = render_item(i, a, chrome, by_id)
    status = dict(title='The Last Fleet wiki: Runners status', updated=datetime.datetime.now().astimezone().isoformat(timespec='seconds'),
                  statuses={k: v[0] for k, v in STATUS.items()},
                  items=[{k: i.get(k) for k in ('id', 'section', 'name', 'cls', 'level', 'faction', 'status', 'decided', 'sha256') + (('maker', 'version') if a.show_makers else ()) if i.get(k) is not None}
                         | {'statusLabel': STATUS[i['status']][0],
                            'page': 'runners/%s/%s' % (i['section'], item_url(i))} for i in items])
    files = {p: t for p, t in pages.items()}; files['runners/status.json'] = json.dumps(status, indent=1, ensure_ascii=False) + '\n'
    # last guard: nothing private or internal in what is written
    bad = []
    for p, t in files.items():
        txt = re.sub(r'<[^>]+>', ' ', t) if p.endswith('.html') else t
        for rx in (PRIVATE, re.compile(r'/Volumes|asset-board|from-(chatgpt|claude)|\.glb\b|\.gltf\b|HANDBACK', re.I)):
            m = rx.search(txt)
            if m: bad.append('%s: "%s"' % (p, m.group(0)))
    if not a.show_makers:
        for p, t in files.items():
            m = MAKER_WORDS.search(t)   # text and attributes (alt text too)
            if m: bad.append('%s: names "%s" (public pages show status and date only)' % (p, m.group(0)))
    for p in list(files):
        if re.search(r'\.(glb|gltf|bin|drc|fbx|blend|obj)$', p, re.I): bad.append('%s: model files are not allowed on the site' % p)
    if bad: sys.exit('STOPPED: private or internal text would be published:\n  ' + '\n  '.join(bad[:30]))
    if not a.dry_run:
        for p, t in files.items():
            dst = os.path.join(out, p); os.makedirs(os.path.dirname(dst), exist_ok=True)
            if not (os.path.exists(dst) and open(dst, encoding='utf-8').read() == t): open(dst, 'w', encoding='utf-8').write(t)
        keep = set(files) | {'wiki.css'}
        for b, _, fs in os.walk(out):
            for f in fs:
                rel = os.path.relpath(os.path.join(b, f), out)
                if rel.endswith('.html') and rel not in keep: os.remove(os.path.join(b, f)); print('  removed old page %s' % rel)
    gone = images.prune('runners/img'); images.save()
    for g in gone: print('  %s old picture %s' % ('would remove' if a.dry_run else 'removed', g))
    for root, _, fs in os.walk(out):
        for f in fs:
            if re.search(r'\.(glb|gltf|bin|drc|fbx|blend|obj)$', f, re.I): sys.exit('STOPPED: a model file is inside wiki/: %s' % os.path.join(root, f))
    tot = sum(os.path.getsize(os.path.join(b, f)) for b, _, fs in os.walk(out) for f in fs) if os.path.isdir(out) else 0
    by_sec = {}
    for i in items: by_sec.setdefault(i['section'], []).append(i)
    print('%s %d pages (%s), %d pictures; wiki/ is %.1f MB.' % ('DRY RUN: would write' if a.dry_run else 'Wrote', len(pages),
          ', '.join('%s %d' % (k, len(v)) for k, v in by_sec.items()), len(images.used), tot / 1e6))
    for k in ('withheld', 'warnings'):
        for x in LOG[k]: print('  %s: %s' % (k.upper().rstrip('S'), x))
    print('  Lore links: %d; items without a lore page: %d' % (LOG['lore_links'], len(LOG['lore_missing'])))
    print('  Sentences left out as private or internal: %d (--show-redactions lists them)' % len(LOG['redacted']))
    if a.show_redactions:
        for x in LOG['redacted']: print('  REDACTED ' + x)
    print('Nothing was committed or pushed.')


if __name__ == '__main__':
    main()
