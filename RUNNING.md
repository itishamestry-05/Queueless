# Running QueueLess Locally

This guide walks you through running every part of the stack on your own machine.

**Prerequisites:** Node.js 22 LTS, npm, a Firebase project with Realtime Database enabled. Python 3.11+ only if you run the analytics pipeline.

**Short on time?** Do sections 1-3, then follow [section 7](#7-hospital-walkthrough-test-every-role) to test every role.

---

## Table of Contents

1. [Firebase Setup](#1-firebase-setup)
2. [Backend](#2-backend)
3. [Frontend](#3-frontend)
4. [Analytics Pipeline](#4-analytics-pipeline)
5. [Cloud Functions (optional)](#5-cloud-functions-optional)
6. [Running Everything Together](#6-running-everything-together)
7. [Hospital walkthrough: test every role](#7-hospital-walkthrough-test-every-role)
8. [Common Problems](#8-common-problems)

---

## 1. Firebase Setup

You need a Firebase project before anything else will work.

### Create a project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → **Add project**
2. Give it a name (e.g. `queueless-dev`) — disable Google Analytics if prompted
3. Once created, go to **Build → Realtime Database → Create database**
4. Choose **Start in test mode** for local dev (you can tighten rules later)
5. Pick the region closest to India: Singapore (`asia-southeast1`)

### Get the backend service account key

1. Firebase Console → **Project Settings** (gear icon) → **Service accounts**
2. Click **Generate new private key** → **Generate key** → downloads a JSON file
3. You'll copy values from this JSON into your backend `.env` (see step 2 below)

> **Security:** Never commit this JSON file or paste its private key anywhere public.

### Get the frontend web config

1. Firebase Console → **Project Settings** → **General** → scroll to **Your apps**
2. Click **Add app** → Web (`</>`) → give it a nickname → **Register app**
3. Copy the `firebaseConfig` object — you'll paste its values into `frontend/.env.local`

---

## 2. Backend

### Environment setup

```bash
cd backend
cp .env.example .env        # Windows Command Prompt: copy .env.example .env
```

Open `.env` and fill in these values:

| Variable | Where to get it |
|---|---|
| `JWT_SECRET` | Generate: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `ADMIN_USERNAME` | Choose any username (e.g. `admin`). This account is the **super admin**. |
| `ADMIN_PASSWORD` | Choose a strong password |
| `FIREBASE_PROJECT_ID` | From service account JSON: `project_id` |
| `FIREBASE_CLIENT_EMAIL` | From service account JSON: `client_email` |
| `FIREBASE_PRIVATE_KEY` | From service account JSON: `private_key` — keep the `\n` escape sequences, wrap in double quotes |
| `FIREBASE_DATABASE_URL` | Firebase Console → Realtime Database → copy the URL (ends in `.firebasedatabase.app`) |
| `APP_TIMEZONE` | Keep `Asia/Kolkata` (IST) for Indian hospitals. Drives booking dates, the daily reset, analytics and email times. |
| `CORS_ORIGIN` | `http://localhost:5173` for local dev (comma-separate several origins) |

Leave `ANALYTICS_SINK=csv` for local dev — events will be written to `analytics/data/queue_events.csv`.

### Install and run

```bash
npm install

# Run tests first (no Firebase connection needed — tests use mocks)
npm test

# Start the dev server with auto-reload
npm run dev
```

The API is now live at **http://localhost:4000**

To verify it's running:
```
GET http://localhost:4000/api/v1/health
→ { "status": "ok" }
```

---

## 3. Frontend

### Environment setup

```bash
cd frontend
cp .env.example .env.local  # Windows Command Prompt: copy .env.example .env.local
```

Open `.env.local` and fill in:

| Variable | Value |
|---|---|
| `VITE_API_BASE_URL` | `http://localhost:4000/api/v1` |
| `VITE_FIREBASE_API_KEY` | From the web config `firebaseConfig.apiKey` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `firebaseConfig.authDomain` |
| `VITE_FIREBASE_PROJECT_ID` | `firebaseConfig.projectId` |
| `VITE_FIREBASE_DATABASE_URL` | `firebaseConfig.databaseURL` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `firebaseConfig.storageBucket` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `firebaseConfig.messagingSenderId` |
| `VITE_FIREBASE_APP_ID` | `firebaseConfig.appId` |

### Install and run

```bash
npm install
npm run dev
```

The UI is now live at **http://localhost:5173**

### Other commands

```bash
npm run build      # production build → dist/
npm run preview    # serve the production build locally (port 4173)
npm run dev:lan    # dev server reachable from other devices on your LAN
```

### LAN access (kiosk / display board on another device)

1. `npm run dev:lan` (binds Vite to all interfaces).
2. In `frontend/.env.local` set `VITE_API_BASE_URL=http://<your-LAN-IP>:4000/api/v1`
   (a kiosk pointing at `localhost` would call itself).
3. Add `http://<your-LAN-IP>:5173` to `CORS_ORIGIN` in `backend/.env`.
4. Open `http://<your-LAN-IP>:5173/display` (or `/kiosk`) on the LAN device.

> **Windows path warning:** if the repo lives in a folder whose path contains
> `&` or parentheses, npm's `.cmd` shims can fail
> (`Cannot find module 'D:\...vite.js'`). Keep the repo in a plain path, or
> invoke tools directly: `node node_modules/vite/bin/vite.js`.

---

## 4. Analytics Pipeline

The pipeline is fully self-contained — it does **not** need the backend running.

### Install dependencies

```bash
cd analytics
pip install -r requirements.txt
```

### Run with synthetic data (no backend needed)

```bash
# Generate realistic synthetic queue events
python data_collection/data_simulator.py

# Run the full pipeline: preprocess → analyse → charts → train model → build notebook
python run_pipeline.py
```

### Run with real backend data

If the backend has been running with `ANALYTICS_SINK=csv`, events are written to `analytics/data/queue_events.csv` (now including the serving counter `staff_username` and `org_name` columns). Skip the simulator step and run:

```bash
python run_pipeline.py
```

### Train the prediction artefact (consumed by the backend)

The backend's predictive insights load a compact `predictions.json` artefact. Regenerate it from the latest events with:

```bash
python models/train_predictor.py
# Trains GradientBoosting (service time) + IsolationForest (anomalies) + seasonal arrivals
# → analytics/models/predictions.json  (backend falls back to heuristics if absent)
```

### What gets generated

| Output | Path |
|---|---|
| Processed data | `analytics/data/` |
| 6 charts (PNG) | `analytics/data/*.png` |
| Trained regression model | `analytics/models/linreg_wait_predictor.joblib` |
| Prediction artefact (consumed by the backend) | `analytics/models/predictions.json` |
| Jupyter notebook | `analytics/notebooks/QueueLess_Analysis.ipynb` |

### Open the notebook

```bash
jupyter notebook analytics/notebooks/QueueLess_Analysis.ipynb
```

Or use VS Code with the Jupyter extension — open the `.ipynb` file directly.

---

## 5. Database rules (required) and Cloud Functions (optional)

**Deploy the database rules.** They keep patient names, notes, accounts and bookings private, and they let screens get instant updates. Without them the app still works, but screens fall back to refreshing every 5 seconds.

The Cloud Function expires stale tokens every 5 minutes. The backend has its own expiry sweeper, so the function is optional. It runs on Node 22.

```bash
npm install -g firebase-tools

cd firebase
firebase login
firebase use <your-project-id>

# Install function dependencies
cd functions
npm install
cd ..

# Rules only (works on the free plan)
firebase deploy --only database

# Rules + functions
firebase deploy --only database,functions
```

> Requires the Firebase Blaze (pay-as-you-go) plan for Cloud Functions. The function is lightweight and stays within the free invocation quota.

---

## 6. Running Everything Together

Open three terminal windows:

**Terminal 1 — Backend**
```bash
cd backend
npm run dev
# Running on http://localhost:4000
```

**Terminal 2 — Frontend**
```bash
cd frontend
npm run dev
# Running on http://localhost:5173
```

**Terminal 3 — Analytics (one-off, not a server)**
```bash
cd analytics
python run_pipeline.py
# Generates charts + notebook, then exits
```

### Access points

| URL | What it is |
|---|---|
| `http://localhost:5173` | Customer-facing home page |
| `http://localhost:5173/take` | Take a token |
| `http://localhost:5173/display` | TV display board (fullscreen) |
| `http://localhost:5173/book` | Book a doctor (patients sign in first) |
| `http://localhost:5173/patient/register` | Patient sign-up |
| `http://localhost:5173/patient` | Patient: my appointments |
| `http://localhost:5173/doctor/login` | Doctor login |
| `http://localhost:5173/admin/login` | Admin login (super admin and hospital admins) |
| `http://localhost:5173/staff/login` | Staff login |
| `http://localhost:5173/kiosk` | PIN kiosk (fullscreen) |
| `http://localhost:4000/api/v1/health` | Backend health check |

---

## 7. Hospital walkthrough: test every role

Run this after sections 1-3, with the backend and frontend both running. It takes about 15 minutes and touches every feature. Use two browser windows (one normal, one private) when you need two people signed in at once.

### Automated checks first

```bash
cd backend && npm test          # 65 API tests, no Firebase needed
cd ../frontend && npm run build # the UI compiles
```

### Step 1. Super admin sets up the hospital

Sign in at `/admin/login` with `ADMIN_USERNAME` / `ADMIN_PASSWORD` from `backend/.env`.

1. **Settings**: choose **Medical / Hospital**, enter the hospital name, pick the city, **Save**.
   - Check: the home page now says "Book your doctor. Skip the waiting room."
2. **Admins**: add a hospital admin (role **Admin**).
3. **Doctors**: add at least two doctors in the same department (e.g. ENT) and one in another (e.g. Ophthalmology).
   - Give each a sign-in username (letters, digits, `-` or `_`) and a password of 8+ characters.
   - Check: a mobile typed as `09820022222` is shown as `+91 98200 22222`.
   - Check: using an existing username (e.g. `admin`) is refused with "already taken".
4. **Staff**: add a reception staff member on the **OPD / General Medicine** queue.

### Step 2. Hospital admin

Sign out, then sign in as the hospital admin.

- Check: **Doctors** and **Appointments** are available.
- Check: on **Admins** you can only create **Managers**, not Admins. Only the super admin appoints admins.

### Step 3. Patient books

In a private window, open `/book`. You are sent to sign in.

1. Choose **Create an account**. Enter name, email, mobile and password.
   - Check: `12345` as the mobile is refused ("Enter a 10-digit Indian mobile number").
   - Check: `98765 43210`, `+91-98765-43210` and `098765 43210` are all accepted.
2. Book **ENT**, pick a named doctor, tomorrow's date and a time, add a reason, **Confirm booking**.
   - Check: you get a booking number like **BK-260929-001**, and times read like **10:30 am**.
3. Book again: **ENT**, "Any available doctor", same date and time.
   - Check: the other ENT doctor is assigned automatically.
4. Book a third time: ENT, the first doctor, same date.
   - Check: that time is struck through (taken).
   - Check: times already past today are also struck through. Only departments that have doctors are listed.
5. Open **My appointments**. Cancel one booking.
   - Check: it moves to **History** as **Cancelled**, and its time becomes free again.

### Step 4. Hospital admin handles the booking

Back in the admin window, open **Appointments**.

- Check: the booking shows the number, patient, phone, reason and a 12-hour time.
- **Confirm** it. Check: status becomes **Confirmed**.
- Change the doctor in the dropdown. Check: it only lists doctors of that department who are free at that time.

### Step 5. Doctor

Sign in at `/doctor/login` with a doctor's username and password.

- Use the arrows or date picker to reach the booking's day.
  - Check: patient name, phone, reason and booking number are shown.
- Check: **Mark seen / Missed** appear only on or after the appointment day.
  - To test today, book a slot later today in step 3.
- As super admin, **Switch off** this doctor on the Doctors page.
  - Check: the doctor's next click signs them out, and they disappear from booking.

### Step 6. Walk-in token, staff and live screens

Keep these open side by side: home page `/`, the display board `/display` and the admin **Dashboard**.

1. In another window, open `/take`, choose **OPD / General Medicine**, enter a name, **Issue my token**.
   - Check: within a few seconds the waiting count rises on the home page, display board and dashboard **without refreshing**.
2. Sign in as the reception staff at `/staff/login` and press **Call Next**.
   - Check: the patient's name shows on the staff screen and the display board shows the token number.
   - The name is **not** on the display board or any public page.
3. Look at the badge next to the queue status:
   - **Live** means instant updates from Firebase (rules deployed, settings correct).
   - **Updating every 5s** means Firebase isn't reachable, so the screen refreshes from the server. Everything still works, just up to 5 seconds behind.
   - **Offline** means the backend can't be reached.

### Step 7. India settings

- All dates read day-first (e.g. "Tue, 29 Sept, 2026") and times are 12-hour, on hospital time (IST), even if the computer's clock is set to another zone.
- Token emails, if SMTP is set up, show the time with "(IST)".

---

## 8. Common Problems

### Backend won't start — `FIREBASE_PRIVATE_KEY` error
The private key must be wrapped in double quotes in `.env` and the literal `\n` characters must stay as `\n` (not real newlines):
```
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"
```

### Frontend shows "Network Error" on API calls
Make sure the backend is running on port 4000 and `VITE_API_BASE_URL=http://localhost:4000/api/v1` is set in `frontend/.env.local`. Restart `npm run dev` after editing `.env.local`.

### Badge says "Updating every 5s" instead of "Live"
Screens still update, just every 5 seconds from the server. For instant updates:
1. Check that every `VITE_FIREBASE_*` value in `frontend/.env.local` is set. `VITE_FIREBASE_DATABASE_URL` must match Firebase Console → Realtime Database, including the region suffix (e.g. `.asia-southeast1.firebasedatabase.app`).
2. Deploy the rules: `cd firebase && firebase deploy --only database`.
3. Restart `npm run dev` after editing `.env.local`.

### Badge says "Offline"
The browser can't reach the backend. Check it is running and that `VITE_API_BASE_URL` points to it.

### Patient mobile number refused
Patients need a 10-digit Indian mobile starting with 6-9. Spaces, dashes, `+91` or a leading `0` are fine.

### A booking time is greyed out
It is already booked for that doctor, or it has already passed today (hospital time). When every doctor in a department is busy at a time, that time is greyed out for "Any available doctor" too.

### A hospital admin can't create admins
By design: only the super admin (`ADMIN_USERNAME`) creates or removes admins. Hospital admins can add managers, doctors and staff.

### Times are 5½ hours off
Set `APP_TIMEZONE=Asia/Kolkata` in `backend/.env` and restart the backend.

### Backend test failures
Tests mock Firebase — they do not need a real connection. If tests fail, ensure no `.env` values are malformed. Run `npm test -- --verbose` to see which test is failing.

### Analytics `ModuleNotFoundError`
Make sure you're in the `analytics/` directory and installed with `pip install -r requirements.txt`. If using a virtual environment, activate it first:
```bash
python -m venv venv
venv\Scripts\activate      # Windows
source venv/bin/activate   # macOS / Linux
pip install -r requirements.txt
```

### Port already in use
- Backend: change `PORT=4000` in `backend/.env` to another port, and update `VITE_API_BASE_URL` in `frontend/.env.local` to match
- Frontend: Vite will auto-pick the next available port (5174, 5175, …) and print the actual URL in the terminal
