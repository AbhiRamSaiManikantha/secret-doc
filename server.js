const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const sharp = require('sharp');
const PDFDocument = require('pdfkit');
const archiver = require('archiver');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'db.json');
const PROTECTED_DIR = path.join(__dirname, 'protected_files');
const SOURCE_IMAGE = path.join(PROTECTED_DIR, 'kk.png');

const TOKEN_TTL_MS = 10 * 1000; // 10 seconds
const VALID_FORMATS = ['png', 'jpg', 'pdf', 'zip'];

function initProtectedFiles() {
  if (!fs.existsSync(PROTECTED_DIR)) fs.mkdirSync(PROTECTED_DIR, { recursive: true });
  if (!fs.existsSync(SOURCE_IMAGE)) {
    const minimalPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDQAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    fs.writeFileSync(SOURCE_IMAGE, minimalPng);
  }
}

initProtectedFiles();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function readDb() {
  const data = fs.readFileSync(DB_PATH, 'utf8');
  return JSON.parse(data);
}

function writeDb(obj) {
  fs.writeFileSync(DB_PATH, JSON.stringify(obj, null, 2), 'utf8');
}

const DEFAULT_QUESTIONS = [
  'HOW DO YOU SAY SORRY (answer in small letters)',
  'FILL THIS BLANK ARRAY____ (answer in capital letters)',
  'ARE YOU INTRESTED IN READING THIS QUESTION'
];
const DEFAULT_Q3_DESCRIPTION = 'click yes if no, click no if yes';
const DEFAULT_ANSWERS = ['kurkure', 'YOU', null];

function initDb() {
  if (!fs.existsSync(DB_PATH)) {
    writeDb({
      claimed: false,
      passed: false,
      downloadIssued: false,
      questions: DEFAULT_QUESTIONS,
      q3Description: DEFAULT_Q3_DESCRIPTION,
      answers: DEFAULT_ANSWERS,
      token: null,
      tokenExpiry: 0,
      tokenUsed: false,
      tokenFormat: null
    });
    return;
  }
  const db = readDb();
  if (db.passed === undefined) db.passed = false;
  if (db.q3Description === undefined) db.q3Description = DEFAULT_Q3_DESCRIPTION;
  if (!Array.isArray(db.questions) || db.questions.length !== 3) {
    db.questions = DEFAULT_QUESTIONS;
    db.answers = DEFAULT_ANSWERS;
  }
  writeDb(db);
}

initDb();

function isClaimed() {
  const db = readDb();
  return db.claimed === true;
}

function setClaimed() {
  const db = readDb();
  db.claimed = true;
  writeDb(db);
}

function isPassed() {
  const db = readDb();
  return db.passed === true;
}

function setPassed() {
  const db = readDb();
  db.passed = true;
  writeDb(db);
}

function getQuestions() {
  const db = readDb();
  return db.questions || [];
}

function getQ3Description() {
  const db = readDb();
  return db.q3Description || '';
}

function getAnswers() {
  const db = readDb();
  return db.answers || [];
}

function checkAnswers(provided) {
  const answers = getAnswers();
  if (!Array.isArray(provided) || provided.length < 3) return false;
  const a1 = String(provided[0]).trim().toLowerCase();
  const a2 = String(provided[1]).trim().toUpperCase();
  if (a1 !== String(answers[0]).trim().toLowerCase()) return false;
  if (a2 !== String(answers[1]).trim().toUpperCase()) return false;
  return true;
}

function createDownloadToken(format) {
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  const db = readDb();
  db.token = token;
  db.tokenExpiry = expiresAt;
  db.tokenUsed = false;
  db.tokenFormat = format;
  writeDb(db);
  return token;
}

function consumeToken(token) {
  const db = readDb();
  if (db.token !== token || db.tokenUsed || db.tokenExpiry <= Date.now()) {
    return null;
  }
  const format = db.tokenFormat;
  db.tokenUsed = true;
  writeDb(db);
  return format;
}

function isDownloadIssued() {
  const db = readDb();
  return db.downloadIssued === true;
}

function setDownloadIssued() {
  const db = readDb();
  db.downloadIssued = true;
  writeDb(db);
}

app.get('/api/status', (req, res) => {
  if (isClaimed()) {
    return res.json({ claimed: true });
  }
  if (isPassed()) {
    return res.json({ passed: true });
  }
  res.json({
    claimed: false,
    questions: getQuestions(),
    q3Description: getQ3Description()
  });
});

app.post('/api/verify', (req, res) => {
  if (isClaimed()) {
    return res.status(403).json({ error: 'already_claimed' });
  }
  const answers = req.body.answers;
  if (!checkAnswers(answers)) {
    return res.status(400).json({ success: false, message: 'Incorrect answers.' });
  }
  setPassed();
  res.json({ success: true });
});

app.post('/api/request-download', (req, res) => {
  if (isClaimed()) {
    return res.status(403).json({ error: 'already_claimed' });
  }
  if (!isPassed()) {
    return res.status(403).json({ error: 'not_claimed' });
  }
  if (isDownloadIssued()) {
    return res.status(403).json({ error: 'download_already_used' });
  }
  const format = (req.body.format || '').toLowerCase();
  if (!VALID_FORMATS.includes(format)) {
    return res.status(400).json({ error: 'Invalid format. Use png, jpg, pdf, or zip.' });
  }
  setDownloadIssued();
  const token = createDownloadToken(format);
  res.json({ token, ttlSeconds: 10 });
});

app.get('/api/download', (req, res) => {
  const token = req.query.token;
  if (!token) {
    return res.status(400).send('Missing token');
  }
  const format = consumeToken(token);
  if (!format) {
    return res.status(403).send('Invalid or expired token');
  }
  if (!fs.existsSync(SOURCE_IMAGE)) {
    return res.status(404).send('File not found');
  }
  setClaimed();

  const sendPng = () => {
    res.download(SOURCE_IMAGE, 'kk.png');
  };

  const sendJpg = () => {
    sharp(SOURCE_IMAGE)
      .jpeg({ quality: 90 })
      .toBuffer()
      .then((buf) => {
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Content-Disposition', 'attachment; filename="kk.jpg"');
        res.send(buf);
      })
      .catch((err) => {
        console.error(err);
        res.status(500).send('Conversion failed');
      });
  };

  const sendPdf = () => {
    const doc = new PDFDocument({ size: 'A4', margin: 72 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="kk.pdf"');
    doc.pipe(res);
    doc.image(SOURCE_IMAGE, {
      fit: [468, 648],
      align: 'center',
      valign: 'center'
    });
    doc.end();
  };

  const sendZip = () => {
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="kk.zip"');
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);
    archive.file(SOURCE_IMAGE, { name: 'kk.png' });
    archive.finalize();
  };

  if (format === 'png') sendPng();
  else if (format === 'jpg') sendJpg();
  else if (format === 'pdf') sendPdf();
  else if (format === 'zip') sendZip();
  else res.status(400).send('Invalid format');
});

app.get('/verify', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'verify.html'));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log('Verify page: http://localhost:3000/verify');
});
