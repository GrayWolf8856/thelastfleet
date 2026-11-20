/**
 * Fleet Voices intake: receives voice recordings from thelastfleet.com/runners/voices.html
 * and saves them to a Google Drive folder, with one row per submission in a Google Sheet.
 *
 * Runs as a Google Apps Script web app under the studio's own Google account.
 * Setup steps are in SETUP.md next to this file.
 */

// Must match data-release on the form in runners/voices.html and the version on voice-release.html.
// When the release text changes, bump all three together.
var RELEASE_VERSION = 'v1-2026-11-19';

// The checkbox wording on the page, saved word for word in each agreement record. Keep it in step with voices.html.
var AGREE_TEXT = 'By typing my name above and ticking this box, I sign and agree to the Fleet Voices release. ' +
  'This is my own voice. I give Crosswake Studios permission to use, edit and add effects to my recordings in ' +
  'The Last Fleet games, trailers and videos, for free and for good. My voice will never be used to train or ' +
  'make an AI voice, and the game will never say which voice is mine.';

var MAX_CLIPS = 4;                       // three script lines plus one line of their own
var MAX_CLIP_BYTES = 10 * 1024 * 1024;   // 10 MB per recording
var MAX_TOTAL_BYTES = 25 * 1024 * 1024;  // 25 MB per submission
var MAX_PER_DAY = 300;                   // flood guard; raise it if a campaign goes big

var AUDIO_TYPES = {
  'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a',
  'audio/m4a': 'm4a', 'audio/aac': 'aac', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3',
  'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'video/webm': 'webm',
  'video/mp4': 'm4a'
};

/** Run once by hand from the editor. Creates the Drive folder and the Sheet and remembers them. */
function setup() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('FOLDER_ID')) {
    props.setProperty('FOLDER_ID', DriveApp.createFolder('Fleet Voices submissions').getId());
  }
  if (!props.getProperty('SHEET_ID')) {
    var ss = SpreadsheetApp.create('Fleet Voices submissions log');
    var sh = ss.getSheets()[0];
    sh.setName('Submissions');
    sh.appendRow(['Submitted at', 'Submission ID', 'Signed name', 'Credit name', 'Credit wanted', 'Email', 'Discord',
      'Lines', 'Own line text', 'Folder', 'Release version', 'Agreed to release', 'Confirmed 18+',
      'Status', 'Notes']);
    sh.setFrozenRows(1);
    DriveApp.getFileById(ss.getId()).moveTo(DriveApp.getFolderById(props.getProperty('FOLDER_ID')));
    props.setProperty('SHEET_ID', ss.getId());
  }
  Logger.log('Folder: https://drive.google.com/drive/folders/' + props.getProperty('FOLDER_ID'));
  Logger.log('Sheet:  https://docs.google.com/spreadsheets/d/' + props.getProperty('SHEET_ID'));
}

/** The page calls this first to see whether submissions are open. */
function doGet() {
  var props = PropertiesService.getScriptProperties();
  return json_({ ok: true, open: props.getProperty('CLOSED') !== 'yes', release: RELEASE_VERSION });
}

function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    var props = PropertiesService.getScriptProperties();
    if (props.getProperty('CLOSED') === 'yes') return json_({ ok: false, error: 'Submissions are closed right now.' });
    if (d.website) return json_({ ok: true, id: 'ok' }); // honeypot field: bots fill it, people never see it

    var err = check_(d);
    if (err) return json_({ ok: false, error: err });

    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      var day = Utilities.formatDate(new Date(), 'America/Chicago', 'yyyy-MM-dd');
      var count = Number(props.getProperty('COUNT_' + day) || 0);
      if (count >= MAX_PER_DAY) return json_({ ok: false, error: 'We have had a lot of recordings today. Please try again tomorrow.' });
      props.setProperty('COUNT_' + day, String(count + 1));
    } finally {
      lock.releaseLock();
    }

    var now = new Date();
    var id = 'FV-' + Utilities.formatDate(now, 'America/Chicago', 'yyMMdd-HHmmss') + '-' +
      Math.floor(Math.random() * 1e4).toString().padStart(4, '0');
    var root = DriveApp.getFolderById(props.getProperty('FOLDER_ID'));
    var folder = root.createFolder(id + ' ' + clean_(d.creditName).slice(0, 40));

    var lines = [];
    d.clips.forEach(function (c, i) {
      var bytes = Utilities.base64Decode(c.data);
      var ext = AUDIO_TYPES[baseType_(c.mime)];
      var name = (i + 1) + '_' + c.line + '.' + ext;
      folder.createFile(Utilities.newBlob(bytes, baseType_(c.mime), name));
      lines.push(c.line);
    });

    // The exact text they agreed to, saved beside the recordings.
    folder.createFile(id + ' agreement.txt', [
      'Submission: ' + id,
      'Received: ' + now.toISOString(),
      'Signed (typed full name): ' + d.signature,
      'Credit name: ' + d.creditName,
      'Credit wanted: ' + (d.credit === 'none' ? 'No credit' : 'Credit by this name'),
      'Email: ' + d.email,
      'Discord: ' + (d.discord || ''),
      'Lines: ' + lines.join(', '),
      'Own line text: ' + (d.ownText || ''),
      'Release version: ' + d.release,
      'Ticked: "' + AGREE_TEXT + '": ' + (d.agree === true),
      'Ticked "I am 18 or older": ' + (d.adult === true),
      'Page: ' + (d.page || ''),
      'Browser: ' + (d.ua || '')
    ].join('\n'), MimeType.PLAIN_TEXT);

    SpreadsheetApp.openById(props.getProperty('SHEET_ID')).getSheetByName('Submissions').appendRow([
      now, id, cell_(d.signature), cell_(d.creditName), d.credit === 'none' ? 'No credit' : 'Credit', cell_(d.email),
      cell_(d.discord || ''), lines.join(', '), cell_(d.ownText || ''), folder.getUrl(), d.release,
      'Yes', 'Yes', 'New', ''
    ]);

    if (props.getProperty('NOTIFY') !== 'no') {
      try {
        MailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'Fleet Voices: new recording from ' + clean_(d.creditName),
          id + '\n' + lines.join(', ') + '\n' + folder.getUrl());
      } catch (mailErr) { /* a mail quota problem must not lose the submission */ }
    }

    return json_({ ok: true, id: id });
  } catch (x) {
    return json_({ ok: false, error: 'Something went wrong on our side. Please try again in a few minutes.' });
  }
}

function check_(d) {
  if (!d || typeof d !== 'object') return 'The form was empty.';
  if (d.release !== RELEASE_VERSION) return 'This page is out of date. Please reload it and try again.';
  if (d.agree !== true) return 'Please tick the box to agree to the release.';
  if (d.adult !== true) return 'Please confirm you are 18 or older.';
  if (typeof d.signature !== 'string' || d.signature.trim().length < 2 || d.signature.length > 80) return 'Please sign with your full name.';
  if (typeof d.creditName !== 'string' || !d.creditName.trim() || d.creditName.length > 40) return 'Please give a name of up to 40 characters.';
  if (typeof d.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email) || d.email.length > 120) return 'Please give a working email address.';
  if (d.discord && (typeof d.discord !== 'string' || d.discord.length > 40)) return 'The Discord name is too long.';
  if (d.ownText && (typeof d.ownText !== 'string' || d.ownText.length > 200)) return 'Your own line is too long.';
  if (!Array.isArray(d.clips) || !d.clips.length) return 'Please record at least one line.';
  if (d.clips.length > MAX_CLIPS) return 'Please send at most ' + MAX_CLIPS + ' recordings.';
  var total = 0;
  for (var i = 0; i < d.clips.length; i++) {
    var c = d.clips[i];
    if (!c || typeof c.line !== 'string' || !/^[A-Z]{3}-\d{2}$|^OWN$/.test(c.line)) return 'One recording is not matched to a line.';
    if (!AUDIO_TYPES[baseType_(c.mime)]) return 'One recording is not an audio file we can use.';
    if (typeof c.data !== 'string') return 'One recording is empty.';
    var size = Math.floor(c.data.length * 3 / 4);
    if (size > MAX_CLIP_BYTES) return 'One recording is over 10 MB.';
    total += size;
  }
  if (total > MAX_TOTAL_BYTES) return 'The recordings are over 25 MB together.';
  return '';
}

function baseType_(mime) { return String(mime || '').split(';')[0].trim().toLowerCase(); }
function clean_(s) { return String(s || '').replace(/[\\\/:*?"<>|\r\n\t]/g, ' ').trim(); }
// Stops a typed value from being read as a spreadsheet formula.
function cell_(s) { s = String(s || ''); return /^[=+\-@]/.test(s) ? "'" + s : s; }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
