# PSA Cavite Administrative System — Phase 1 (Core)

This phase gives you: **Login/Registration, Admin Dashboard (stats + logs), My Profile
(with photo upload to Drive), Personnel management, Department/Position CRUD, and
Time In/Out logging.**

It runs as your own backend server. Your Google Sheet is the database. Your Google Drive
folder stores profile pictures and (in later phases) shared files. No Apps Script involved —
this talks to Google directly using the official Sheets & Drive APIs.

---

## 1. One-time Google Cloud setup (~10 minutes)

1. Go to https://console.cloud.google.com/ and create a new project (or use an existing one).
2. In **APIs & Services > Library**, enable:
   - **Google Sheets API**
   - **Google Drive API**
3. Go to **APIs & Services > Credentials > Create Credentials > Service Account**.
   - Give it any name, e.g. `psa-system-service`.
   - After creating it, open the service account, go to the **Keys** tab, **Add Key > Create
     new key > JSON**. This downloads a `.json` file — this is your app's "identity."
   - Rename that file to `service-account.json` and put it inside the `backend/` folder.
4. Open that JSON file and copy the `client_email` value (looks like
   `psa-system-service@your-project.iam.gserviceaccount.com`).
5. **Share your Google Sheet** ("Editor" access) with that email address —
   exactly like sharing it with a person.
6. **Share your Google Drive folder** ("Editor" access) with that same email address.

That's it — the service account can now read/write your Sheet and Drive folder, and
nobody else needs a Google login to use the system (your own login screen handles that).

---

## 2. Configure the project

```
cd backend
cp .env.example .env
```

Open `.env` and confirm/adjust:
- `GOOGLE_SHEET_ID` — already pre-filled from the Sheet link you shared
  (`1sqF-oRgRU6A1_QtP-r8JJpEyLLuhzO7QJHUzvd6KRHg`)
- `GOOGLE_DRIVE_FOLDER_ID` — already pre-filled from your Drive folder link
  (`1VUDFzcIw3H-Tmf8bwQuTkWA-3yGU2CXn`)
- `JWT_SECRET` — replace with any long random string (this signs login sessions)

Make sure `service-account.json` sits directly inside `backend/`.

---

## 3. Install & run locally (optional — skip if going straight to Render)

Requires Node.js 18+ (https://nodejs.org).

```
cd backend
npm install
npm start
```

On first run, the server automatically creates the required tabs in your Sheet
(`Users`, `Departments`, `Positions`, `Logs`, plus a few reserved for later phases:
`Accomplishments`, `Files`, `Posts`, `Messages`, `Schedule`) with the right headers —
**it will not touch or delete anything already in your Sheet**, it just adds new tabs.

Then open: **http://localhost:4000**

---

## 4. Deploying for free (GitHub + Render)

This app has no database of its own (Sheets is the database, Drive is the file store), so
Render's **free web service tier** is enough — no paid database add-on needed.

**Push to GitHub:**
```
cd psa-system
git init
git add .
git commit -m "PSA Cavite Admin System - Phase 1"
```
Create a new repo on GitHub, then push to it. The included `.gitignore` already keeps
`.env` and `service-account.json` out of the repo — **never commit those**, since they
contain credentials.

**Deploy on Render:**
1. Go to https://render.com and sign up free (GitHub login is easiest).
2. **New > Web Service**, connect your GitHub repo.
3. Render should auto-detect `render.yaml` and pre-fill the settings (root dir `backend`,
   build command `npm install`, start command `npm start`, free plan). If it doesn't
   auto-detect, set those manually.
4. Under the **Environment** tab, add these variables:
   - `GOOGLE_SERVICE_ACCOUNT_JSON` — open your `service-account.json` file, copy its
     *entire* contents, and paste it in as one value (Render's dashboard, not your code).
   - `GOOGLE_SHEET_ID` and `GOOGLE_DRIVE_FOLDER_ID` — already pre-filled by `render.yaml`,
     double check they match your actual Sheet/folder.
   - `JWT_SECRET` — Render auto-generates a random one if you used the blueprint.
5. Click **Deploy**. Render builds and starts the app, giving you a live URL like
   `https://psa-cavite-admin-system.onrender.com` — that's your whole system, frontend
   and backend together, live on the internet for free.

**Free-tier things to know:**
- The free web service **spins down after 15 minutes of no traffic**, so the first
  request after a quiet period takes ~30–50 seconds to wake back up (then it's fast).
  This is fine for internal office use; it's just something to expect on the first
  load of the day.
- Google Sheets API has generous free quotas (100 requests/100 seconds per user by
  default) — plenty for an office of this size. If you ever hit limits, Google Cloud
  lets you request a quota increase for free.
- Everything else (Google Cloud service account, Sheets API, Drive API, GitHub, Render)
  is free at this scale — no credit card required for any of it.

---

## 5. First login

- The **first account you register becomes Admin automatically.** Register yourself first.
- As Admin, go to **Departments & Positions** and add your real PSA Cavite departments
  and positions — new registrants will then be able to pick from that list.
- Everyone who registers after the first account is a regular **User**; promote someone
  to Admin by editing their row's `Role` column directly in the `Users` tab of the Sheet
  (a proper "promote to admin" button can be added in the next phase if you'd like).

---

## 6. What's included vs. what's next

**Included now:**
- Registration with Full Name / Position / Department / Username / Date Hired
- Admin can set Date Retired/Resigned (deactivates the account)
- Login records a `TimeIn` log; logout records `TimeOut`
- Admin dashboard: active personnel count, signed-in-today, department/position totals,
  retired/resigned count, recent activity feed
- Full attendance/activity log viewer
- Admin CRUD for Departments and Positions
- Profile page with editable name and photo upload (stored in your Drive folder)
- Personnel list with per-user retire/resign date and delete

**Not built yet (next phases, since this is a big system best built in layers):**
- Own accomplishments tracking
- File sharing/approval workflow (PDF/image upload, pending → in progress → complete,
  reviewer comments, and circling errors directly on the file)
- Public posts feed
- Built-in messenger
- Dynamic training/meeting schedule

Everything above already has its Sheet tabs reserved (`Accomplishments`, `Files`, `Posts`,
`Messages`, `Schedule`) and the backend pattern (`sheetsService.js`) is built so each new
module is a small addition, not a rewrite. Tell me when you're ready and I'll build the
next one — which would you like first?

---

## Troubleshooting

- **"Failed to start server"** — almost always means `service-account.json` is missing/
  misnamed, or the Sheet/Drive folder wasn't shared with the service account's email.
- **403 errors on Drive uploads** — the Drive folder wasn't shared with the service
  account, or Drive API isn't enabled on the Cloud project.
- **Login says "Invalid username or password" right after registering** — double-check
  you're using the exact username you registered with (it's case-insensitive, but check
  for typos/extra spaces).
