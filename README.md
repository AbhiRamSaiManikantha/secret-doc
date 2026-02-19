# Secret Doc — Secure one-time document delivery

A minimal Node.js Express app that delivers a document only once: visitors must answer three server-stored questions; the first correct submission gets a one-time download, then the system is permanently locked.

## Behavior

- **Public page:** `/verify`
- **Flow:** Answer 3 custom questions (answers are stored on the server only). Unlimited attempts until the first correct attempt.
- **After first correct:** User can choose format (PDF, ZIP, or image) and download the file. The system is then permanently locked.
- **After lock:** All visitors see: *"This document has already been claimed."*

## Security

- Answers are checked only on the backend.
- JSON file database (`db.json`) with a `claimed` flag.
- One-time download token, valid for 10 seconds; after use the token is invalidated.
- Document files live in `protected_files/` (not in `public/`), so they are not directly accessible by URL.

## Project structure

```
secret-doc/
├── server.js           # Express server, DB, API, protected download
├── package.json
├── db.json             # JSON database (auto-created if missing)
├── public/             # Static frontend
│   ├── verify.html
│   ├── style.css
│   └── app.js
├── protected_files/    # Documents (not web-accessible)
│   ├── document.pdf
│   ├── document.zip
│   └── document.png
└── README.md
```

## Run instructions

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Start the server**

   ```bash
   npm start
   ```

3. **Open in browser**

   - Verification page: **http://localhost:3000/verify**

4. **Default questions and answers** (change in `db.json` or `server.js` init if needed)

   - *What is the name of the project?* → `secret-doc`
   - *What port does the server use?* → `3000`
   - *How many questions are there?* → `3`

5. **Replace documents (optional)**  
   Put your real files in `protected_files/` as:

   - `document.pdf`
   - `document.zip`
   - `document.png`

   If they are missing, the server creates minimal placeholder files on first run so the app still runs.

## Dependencies

- **express** — web server

All are listed in `package.json`. No native build tools required; `npm install` works on Windows without compilation.

## Port

Runs on **port 3000** by default.
