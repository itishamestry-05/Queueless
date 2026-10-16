# QueueLess: complete test guide

How to test every part of the system by hand, role by role. Follow the sections
in order the first time. Section 4 lists the test accounts, which are already set up.

---

## 1. Before you start

| What | Where |
|---|---|
| Website (frontend) | http://localhost:5173 |
| API (backend) | http://localhost:4000/api/v1 |
| API health check | http://localhost:4000/api/v1/health |

**Both servers must be running.**

- Backend: `cd backend && npm run dev`. It reloads by itself when code changes.
- Frontend: `cd frontend && npm run dev`.

**The first admin comes from `backend/.env`.** Its username and password are in `ADMIN_USERNAME` and `ADMIN_PASSWORD`. That account is created as **super admin** the first time the backend starts. Changing `ADMIN_PASSWORD` later has **no effect**; change the password inside the app instead.

**Test accounts are already created.** Section 4 lists them. All of them were signed in and checked on 29 Sep 2026.

**Use one browser profile per role, or private windows.** Admin, staff, doctor and patient each keep their own sign-in. Several roles can be signed in at once in the same browser. Separate windows still make it easier to watch each role react live.

**Testing from a phone on the same Wi-Fi:**

- Start the frontend with `npm run dev:lan`.
- Add the laptop's address to `CORS_ORIGIN` in `backend/.env`.
- Set `VITE_API_BASE_URL` to `http://<laptop-ip>:4000/api/v1`.
- The QR camera scanner does **not** work over plain `http://<ip>`. It only works on `localhost` or `https`. On a phone, type the booking number instead.

**Times follow India time (IST).** "Today", booking slots and the daily reset all use the hospital's clock, whatever the computer's time zone.

---

## 2. Every page at a glance

### Sign-in pages

| Who | Sign in | Create account |
|---|---|---|
| Super admin / Admin / Manager | http://localhost:5173/admin/login | Already created, see section 4 |
| Staff (counter) | http://localhost:5173/staff/login | Created by an admin |
| Staff by PIN (shared kiosk) | http://localhost:5173/kiosk | PIN set by an admin |
| Doctor | http://localhost:5173/doctor/login | Created by an admin |
| Patient | http://localhost:5173/patient/login | http://localhost:5173/patient/register |

### Public pages (no sign-in)

| Page | URL | What it is for |
|---|---|---|
| Home | `/` | Live "now serving" and waiting counts, announcement, QR to take a token |
| Take a token | `/take` | Walk-in patient gets a queue number |
| My token | `/token/<id>` | Live position, wait estimate, alert when called |
| Find my token | `/lookup` | Reopen a token by its ID |
| Token history | `/history` | Tokens taken on this device |
| Feedback | `/feedback/<tokenId>` | Rate the visit after being served |
| TV display board | `/display` | Full-screen board for the waiting hall |
| Shared link | `/share/<id>` | Read-only view an admin shared |

### Patient pages

| Page | URL |
|---|---|
| My appointments | `/patient` |
| Book appointment (find a specialist) | `/book` |
| Printable prescription | `/patient/prescription/<appointment id>` (opened from My appointments) |

### Doctor page

| Page | URL |
|---|---|
| My appointments by day | `/doctor` |

### Staff pages

| Page | URL |
|---|---|
| My counter | `/staff` |
| Profile | `/staff/profile` |
| Change password | `/staff/change-password` |

### Admin pages (super admin, admin, manager)

| Page | URL |
|---|---|
| Dashboard (live queue control) | `/admin` |
| Queues (counters) | `/admin/queues` |
| Analytics | `/admin/analytics` |
| Printable report | `/admin/report` |
| Feedback | `/admin/feedback` |
| Staff | `/admin/staff` |
| Doctors | `/admin/doctors` |
| Appointments | `/admin/appointments` |
| Scan booking QR (reception) | `/admin/scan` |
| Admin accounts | `/admin/manage` |
| Activity log | `/admin/audit` |
| Settings | `/admin/setup` |
| Profile / change password | `/admin/profile`, `/admin/change-password` |

### Shared by admins and staff

| Page | URL |
|---|---|
| AI assistant | `/assistant` |
| Shared files | `/files` |
| Notifications | `/notifications` |

Messaging is the chat tray at the bottom right of every page once an admin or staff member is signed in.

---

## 3. Roles: who can do what

| Can they... | Super admin | Admin | Manager | Staff | Doctor | Patient |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Run the live queue (call, pause, reset, auto mode) | Yes | Yes | Yes | Own counter only | - | - |
| Change settings, counters, announcements | Yes | Yes | Yes | - | - | - |
| Add or remove staff | Yes | Yes | Yes | - | - | - |
| Add, edit, switch off or remove doctors | Yes | Yes | **View only** | - | - | - |
| Create admin accounts | Yes | - | - | - | - | - |
| Create manager accounts | Yes | Yes | - | - | - | - |
| Remove admin accounts | Any other | Managers only | - | - | - | - |
| Change an admin's role | Yes | - | - | - | - | - |
| Confirm, cancel, reassign appointments; scan QR | Yes | Yes | Yes | - | - | - |
| Mark an appointment seen or missed | - | - | - | - | Own only | - |
| Write or edit a prescription | - | - | - | - | Own patients only | - |
| Read and print a prescription | - | - | - | - | Own patients | Own only |
| Book and cancel appointments | - | - | - | - | - | Own only |
| Messaging, files, AI assistant, notifications | Yes | Yes | Yes | Yes | - | - |

**What each role is for, in one line:**

- **Super admin:** owner. Everything, including creating admins and changing roles.
- **Admin:** runs the hospital. Everything except creating admins and changing roles.
- **Manager:** runs the floor. Everything operational, but cannot touch doctor accounts or admin accounts.
- **Staff:** works one counter. Calls the next patient, skips, refers, adds notes.
- **Doctor:** sees their own appointments, writes prescriptions, and closes visits as seen or missed.
- **Patient:** registers, books a specialist, shows the QR code at reception, reads and prints prescriptions, cancels.

**Accounts are checked on every action.** A removed staff member, a switched-off doctor or a changed admin role takes effect immediately, even if they are already signed in.

---

## 4. Test accounts (already set up)

Everything below exists in the connected database. On **29 Sep 2026** every account was signed in through the API and through its real login page, and the role limits were checked: **51 of 51 API checks passed, and every login page worked.** There are **no patient accounts**; testers register their own (test P1).

**These are test passwords.** Change them, and the super admin's `change_me_on_first_deploy`, before the system goes live. Anyone who reads this file can sign in with them.

### 4.1 Settings already applied (`/admin/setup`)

| Setting | Value |
|---|---|
| Organisation | QueueLess Hospital |
| City | Mumbai |
| Industry | Medical / Hospital |
| Display board message | Welcome to QueueLess Hospital. Please wait for your number to be called. |
| SLA | 15 minutes |
| Daily auto-reset | 23:30 (India time) |

### 4.2 Admin portal: http://localhost:5173/admin/login

| Role | Username | Password | Can do |
|---|---|---|---|
| Super admin | `admin` | `change_me_on_first_deploy` | Everything, including admins and roles |
| Admin | `hospital_admin` | `Admin@1234` | Everything except creating admins and changing roles |
| Manager | `floor_manager` | `Manager@1234` | Daily operations. Doctors are view-only; no admin accounts |

### 4.3 Doctors: http://localhost:5173/doctor/login

All doctors use the password **`Doctor@1234`**.

| Username | Name | Speciality | Qualification |
|---|---|---|---|
| `dr_singh` | Dr. Harpreet Singh | General Medicine | MBBS, MD (General Medicine) |
| `dr_iyer` | Dr. Lakshmi Iyer | General Medicine | MBBS, MD (General Medicine) |
| `dr_mehta` | Dr. Anil Mehta | Cardiology | MBBS, MD, DM (Cardiology) |
| `dr_rao` | Dr. Priya Rao | Cardiology | MBBS, DNB (Cardiology) |
| `dr_khan` | Dr. Sameer Khan | Orthopaedics | MBBS, MS (Orthopaedics) |
| `dr_joshi` | Dr. Neha Joshi | Paediatrics | MBBS, MD (Paediatrics) |
| `dr_kulkarni` | Dr. Sunita Kulkarni | Obstetrics & Gynaecology | MBBS, MS (Obstetrics & Gynaecology) |
| `dr_verma` | Dr. Rohit Verma | Dermatology | MBBS, MD (Dermatology) |
| `dr_nair` | Dr. Arjun Nair | ENT | MBBS, MS (ENT) |
| `dr_gupta` | Dr. Kavita Gupta | Ophthalmology | MBBS, MS (Ophthalmology) |
| `dr_shah` | Dr. Rahul Shah | Dental | BDS, MDS |
| `dr_reddy` | Dr. Venkat Reddy | Neurology | MBBS, MD, DM (Neurology) |

General Medicine and Cardiology have **two doctors each**. Use them to test "Any available doctor" and two patients racing for the same time.

### 4.4 Staff counters: http://localhost:5173/staff/login or PIN at http://localhost:5173/kiosk

All staff use the password **`Staff@1234`**.

| Username | Name | Counter | Kiosk PIN |
|---|---|---|---|
| `counter_opd` | Ramesh Patil | OPD / General Medicine | `1111` |
| `counter_cardio` | Anjali Desai | Cardiology | `2222` |
| `counter_lab` | Suresh Kumar | Laboratory | `3333` |
| `counter_pharmacy` | Meena Sharma | Pharmacy | `4444` |
| `counter_radiology` | Vikram Rao | Radiology | `5555` |
| `counter_emergency` | Pooja Nair | Emergency / Casualty | `6666` |

On the kiosk, a 4-digit PIN needs the **Enter** button.

### 4.5 Patients: http://localhost:5173/patient/register

None are created. Each tester registers with their own email and mobile (test P1).

### 4.6 What was checked

| Check | Result |
|---|---|
| Super admin, admin and manager sign in (API and login page) | Pass, all land on the admin dashboard |
| All 12 doctors sign in and open their own appointments | Pass |
| All 6 staff sign in by password **and** by PIN | Pass; each PIN signs in the right person |
| Wrong password | Refused, "Invalid username or password." |
| Manager adds a doctor or an admin account | Refused |
| Manager's Doctors page | List only, no add or remove buttons |
| Admin changes someone's role | Refused |
| Admin pages without signing in | Refused |
| Booking page lists doctors | Pass, 12 doctors |
| Dotted usernames: `Dr.Singh`, `counter.opd`, `hospital.admin` | Pass, each signs in to its underscore account |
| Full prescription flow with a temporary patient: book, reception confirms, doctor writes, patient reads, doctor edits and marks seen | Pass, 21 of 21 checks. The temporary patient and booking were then deleted |

**Sign-in lockout:** 20 wrong attempts from one device within 15 minutes locks that login page for 15 minutes. If testers suddenly get "Too many attempts", wait it out.

### 4.7 Adding more accounts

**Username rules:**

- 3 to 30 characters: letters, numbers, dots, `_` and `-`.
- **A dot is saved as an underscore**, and either spelling signs in. `dr.mehta` becomes `dr_mehta`, so typing `dr.mehta` or `dr_mehta` at sign-in both work. The form shows "Saved as …" as you type. The database cannot store dots in usernames, which is why they are converted.
- **Doctor usernames must be lowercase.**
- A username must be unique across admins, staff and doctors together.

**Other rules:**

- Passwords are at least 8 characters.
- Staff PINs are 4 to 6 digits and must be unique.
- There can be at most 10 admin-tier accounts. Three are used.

---

## 5. Test scripts

Each test has steps and the expected result. Tick them off as you go.

### Patient

**P1. Register**

1. Open `/patient/register`.
2. Fill in name, email and mobile. Try the mobile as `98765 43210`, `+91 9876543210` and `09876543210`; all are accepted.
3. Try a mobile starting with 1 to 5. **Expected:** it is refused.
4. Date of birth: try **tomorrow**. **Expected:** the date picker will not allow it, and a typed future date shows "Date of birth cannot be in the future."
5. Try a year before 1900. **Expected:** "Date of birth must be after 1900."
6. Enter two different passwords. **Expected:** "The two passwords do not match."
7. Register properly. **Expected:** you land on My appointments.
8. Register again with the same email. **Expected:** "already exists".

**P2. Book a specialist**

1. Open `/book`, or click **Book appointment**.
2. **Expected:** specialities with doctors show first, each with a doctor count. **Show all 18 specialities** reveals the rest, greyed out ("No doctor yet").
3. Type `mehta` in the search box. **Expected:** Dr. Mehta's card appears. Click it; the speciality and doctor fill in.
4. Pick **Cardiology** and **Any available doctor**. **Expected:** times show as free if any cardiologist is free.
5. Pick one doctor. **Expected:** only that doctor's free times show. Taken or past times are struck through.
6. Pick a day chip, then a time, and type a reason.
7. **Expected:** the right-hand panel shows the speciality, doctor, date and time. **Confirm booking** becomes active.
8. Confirm. **Expected:**
   - A QR code, a booking number like `BK-260930-001`, and the status "Waiting for reception to scan".
   - Leave this screen open for test R1.

**P3. Booking rules**

| Try | Expected |
|---|---|
| Book the same doctor and time twice from two patient accounts | The second gets "already booked at …", and the times refresh |
| Book yourself twice at the same time | "You already have a booking at this time" |
| Pick a date more than 60 days ahead | Not allowed |
| Today after 5:00 pm | The page opens on tomorrow |

**P4. My appointments**

1. Open `/patient`. **Expected:** the booking is under **Upcoming**.
2. Click **Show QR code**. **Expected:** the same QR appears, and **Hide QR code** closes it.
3. Click **Cancel booking**. **Expected:** an in-app popup (not a browser box). **Keep it** leaves the booking alone; **Cancel booking** moves it to History as Cancelled, and that time becomes free again.

**P5. Read the prescription** (after the doctor writes one in D2)

1. Open `/patient`. **Expected:** the visit shows "Prescription from Dr. … · N medicines · follow-up <date>" in green.
2. Click **View prescription**. **Expected:** the full prescription shows:
   - hospital name, doctor with qualification, speciality, date, booking number
   - patient name and reason for visit
   - diagnosis
   - each medicine with dose, when to take it in plain words, food timing and duration. For example "Morning, night (1-0-1) · After food · for 5 days".
   - tests advised, advice, follow-up date
3. Click **Open printable copy**, then **Print or save as PDF**. **Expected:** one clean page, black on white even in dark mode, with no site menu.
4. If the doctor edits the prescription later, **Expected:** the patient sees the new version, with "updated <date>" in the footer.
5. A visit with no prescription shows no prescription button.

### Reception (admin or manager)

**R1. Scan and confirm a booking**

1. Sign in as admin in another window. Open `/admin/scan`, or **Scan QR** in the menu.
2. Click **Start camera** and allow it. Hold the patient's QR from P2 up to the camera.
   - No camera? Type the booking number and press **Find**.
3. **Expected:** the booking card shows the patient, speciality, doctor, date, time, phone and reason.
4. Click **Confirm booking**. **Expected:** "Booking confirmed. The patient can go to Dr. …".
5. On the patient's screen from P2: **Expected:** within about 5 seconds the status changes to "Confirmed by reception".
6. Scan the same QR again. **Expected:** "Already confirmed at <time>", with no Confirm button.

**R2. Scan edge cases**

| Try | Expected |
|---|---|
| A booking for another day | Yellow warning: "This booking is for <date>, not today." |
| Type `BK-999999-001` | "No booking found with number BK-999999-001." |
| Type `hello` | "That code is not a QueueLess booking." |
| Scan a cancelled booking | Status shows Cancelled, with no Confirm button |
| Scan the QR with a phone camera app while signed out | Admin sign-in opens, then returns to the scan page with the booking loaded |

**R3. Appointments list** (`/admin/appointments`)

1. **Expected:** filter tabs All, Booked, Confirmed, Seen, Missed and Cancelled, each with a count.
2. **Confirm** a Booked row, then **Cancel** another. **Expected:** in-app popups, and the lists update.
3. Change a booking's doctor with the dropdown. The dropdown only lists doctors in the same speciality.
4. **Expected:** a doctor who is already booked at that time is refused with a message.

### Doctor

**D1. Sign in and daily list**

1. Open `/doctor/login` and sign in as `dr_mehta` / `Doctor@1234`.
2. **Expected:** today's appointments, with arrows to move between days and a **Today** link.
3. On an empty day, **Expected:** a link to jump to the next day that has appointments.

**D2. Write a prescription**

1. On today's appointment, click **Write prescription**. **Expected:** a form with the patient's name, booking number and reason.
2. Fill in:
   - diagnosis, for example "Acute viral fever"
   - medicines, using **Add medicine** for more rows. Each row has name, dose, when (for example `1-0-1`, with suggestions), food timing, duration and an optional note.
   - tests advised, advice, and an optional follow-up date
3. **Expected:** under each medicine, "Patient sees: Morning, night (1-0-1)" shows exactly what the patient will read.
4. **Save prescription** keeps the visit open. **Save and mark seen** also closes it as Seen.
5. **Expected:** the row shows "Prescription written: <diagnosis> · N medicines", and the button changes to **Edit prescription**.
6. Edit it, change a duration, and save. **Expected:** the patient sees the change (P5).

**These must be refused:**

| Try | Expected |
|---|---|
| Save with nothing filled in | "Add a diagnosis, a medicine, a test or advice before saving." |
| A medicine row with a dose but no name | "Every medicine needs a name." |
| Follow-up on the same day or earlier | "The follow-up date must be after this visit." (the date picker also blocks it) |
| A future appointment | No prescription button |
| A cancelled or missed appointment | No prescription button |
| Another doctor's patient | Not visible at all; the server refuses it too |

**D3. Close an appointment without a prescription**

1. On today's appointment, click **Mark seen**. **Expected:** the status becomes Seen.
2. On another, click **Missed**. **Expected:** an in-app confirm popup, then the status becomes Missed.
3. **Expected:**
   - Future appointments have no Seen or Missed buttons.
   - A closed appointment's status cannot change again, but a Seen visit's prescription can still be written or corrected.
4. **Expected:** while a day loads, the summary line reads "loading appointments…", never "0 appointments".

**D4. Switched-off doctor**

1. As admin, click **Switch off** on `dr_rao`.
2. **Expected:** `dr_rao` is signed out on their next action and cannot sign in ("switched off"). They also disappear from `/book`.
3. Switch them back on.

### Walk-in tokens and the waiting hall

**T1. Take a token**

1. Open `/take` in a private window.
2. Pick **General Medicine**, type a name, and optionally an email. Click **Issue my token**.
3. **Expected:** `/token/<id>` shows the number, position, estimated wait, QR, Print, Copy link and WhatsApp.
4. Allow browser notifications when asked.

**T2. Display board**

1. Open `/display` on a second screen.
2. **Expected:**
   - A clock and a card per department with its "now serving" number and waiting count.
   - The **Live** badge (Firebase connected) or "Updating every 5s".
   - Patient names never appear.

**T3. Priority**

1. Take a token with **Request priority service** ticked.
2. **Expected:** it jumps ahead of normal tokens in its department. The admin dashboard shows it under Priority Queue.

**T4. Feedback**

1. After a token is served, its page shows **Leave feedback**.
2. Give 1 to 5 stars and a comment. **Expected:** it appears in `/admin/feedback`.
3. Try the same token again. **Expected:** refused, one feedback per token.

**T5. Expired token**

1. Skip a token as staff (S3).
2. **Expected:** the patient's page shows **Request re-queue**, which gives a **new number** at the back. This is allowed within 2 hours of the original token.

### Staff (counter)

**S1. Sign in two ways**

1. `/staff/login` with `counter_opd` / `Staff@1234`. **Expected:** lands on `/staff` as Ramesh Patil, "Assigned: OPD / General Medicine".
2. Sign out, then open `/kiosk` and type PIN `2222`, then press **Enter**. **Expected:** lands on `/staff` as Anjali Desai, Cardiology. A 6-digit PIN signs in by itself once the last digit is typed.

**S2. Serve patients**

1. With two General Medicine tokens waiting, click **Call Next — 2 waiting**.
2. **Expected:**
   - The first token shows under **Now serving**, with a timer.
   - The patient's token page flashes and plays a sound.
   - The display board flashes the number.
3. Click **Call Next** again. **Expected:** the first token becomes **served** and the second is called.
4. With nobody left waiting, the button reads **Finish serving**. Click it. **Expected:** the last patient is marked served, and the button reads "No one waiting".

**S3. Skip, refer, note**

1. **No-show / Skip**. **Expected:** in-app confirm popup, then the token leaves the queue.
2. **Refer to another counter**, for example Laboratory, with a reason.
   - **Expected:** the token keeps its number and joins the Laboratory queue ahead of normal tokens.
   - **Expected:** admins get a notification.
3. **Add a note**. **Expected:** saved privately; never shown on the display board.

**S4. Pause and announcement seen by staff**

1. As admin, pause the queue. **Expected:** staff see "Queue is paused" and cannot call.
2. As admin, broadcast an announcement. **Expected:** it shows on staff, home, take-a-token and display pages.

### Admin dashboard (`/admin`)

**A1. Live control**

- **Call Next** per department, and **Call Next Priority** across departments.
- **Finish serving** appears when a department has someone called and nobody waiting.
- **Pause / Resume** the whole queue. **Expected:** walk-ins can still take priority tokens while paused; normal tokens are refused.
- **Pause** one department only. **Expected:** it is greyed out on `/take`.
- **Reset queue**. **Expected:** an in-app red confirm popup. All tokens are cleared and numbering restarts; appointments are kept.

**A2. Auto mode**

1. Click **Enable Auto Mode** with tokens waiting. **Expected:** tokens are called on their own, at least 20 seconds apart.
2. Disable it again.

**A3. SLA and lookup**

1. With SLA set to 1 minute in Settings, leave a token waiting for more than a minute. **Expected:** the dashboard flags it.
2. Use **Token lookup** by number or note.

**A4. Queues** (`/admin/queues`)

1. Create a queue, for example "Physiotherapy" with prefix `PT`.
2. **Expected:** it replaces the default departments on `/take` and the dashboard. Reorder it, disable it, archive it.
3. Delete an empty queue. **Expected:** in-app confirm popup. A queue with people waiting cannot be deleted.

### Admin accounts and permissions

**M1. Manager limits.** Sign in as `floor_manager` / `Manager@1234`.

| Try | Expected |
|---|---|
| `/admin/doctors` | The list only, no add, edit or remove buttons |
| Create an admin in `/admin/manage` | Refused |
| Add and remove staff | Allowed |
| Confirm appointments, scan QR, change settings | Allowed |

**M2. Admin limits.** Sign in as `hospital_admin` / `Admin@1234`.

| Try | Expected |
|---|---|
| Create a manager | Allowed |
| Create an admin | Not offered |
| Remove a manager | Allowed |
| Remove an admin | Not offered |
| Change roles | Not offered |

**M3. Super admin.**

- Sign in as `admin` / `change_me_on_first_deploy`. Change `floor_manager` to admin and back. **Expected:** it takes effect at once, even while they are signed in.
- **Expected:** you cannot change your own role or remove yourself.

**M4. Doctor management** (admin or super admin)

- **Reset password** opens an in-app popup that asks for at least 8 characters.
- Changing a doctor's speciality, or removing them, is **blocked while they have upcoming appointments**. Cancel or reassign those first.

### Appointment becomes a queue token

**Q1.**

1. Book a slot **today** in General Medicine, for example the next half hour.
2. Confirm it at reception (R1). Only confirmed bookings count.
3. Wait until the slot time. Within about a minute of it, **Expected:** a **priority** token with the patient's name joins the General Medicine queue.
4. **Expected:** the appointment itself stays "Confirmed".

**Watch out:** the join only happens between the slot time and 5 minutes after. A booking that is still "Booked" (not confirmed) never joins.

### Team tools (admins and staff)

| Test | Expected |
|---|---|
| **Messaging:** open the chat tray, start a chat with a staff member, send text and a small image | Arrives live, with a notification bell count |
| Attach a file over 256 KB or a .docx | In-app popup: "File too large" / "File type not supported" |
| **Files** (`/files`): upload, download, delete your own file | The delete asks with an in-app popup |
| **AI assistant** (✦ button or `/assistant`): ask "How many people are waiting?" | An answer from live data. New, rename, pin, delete chats |
| **Share:** Queues → a queue → **Share snapshot** | A link and a QR. It opens without sign-in and expires after 7 days |
| **Notifications** (`/notifications`) | Refers, new queues and new messages listed. **Mark all read** clears the count |

### Reports and records

| Test | Expected |
|---|---|
| `/admin/analytics` | Tiles, trend, peak hours, staff performance, predictions. **Export CSV** downloads, or shows an in-app popup "no data to export yet" |
| `/admin/report` | A printable report. **Print** opens the print dialog |
| `/admin/feedback` | Average rating and list. **Record verbal feedback** works for a served token |
| `/admin/audit` | Recent actions: appointment confirmed, doctor created, admin removed and so on |

### Popups

Every "are you sure" and every error now uses the app's own popup, never the browser's grey box.

**Check on:**

- Cancel booking (patient and admin)
- Missed (doctor)
- Skip (staff and admin)
- Reset queue
- Remove staff, doctor or admin
- Delete queue, file or AI chat
- Clear token history
- Reset doctor password

**Expected in each:**

- **Escape** or clicking outside closes it without doing anything.
- **Enter** confirms.
- Dangerous actions have a red button.

---

## 6. Rules and limits cheat sheet

| Rule | Value |
|---|---|
| Password length (all accounts) | 8 to 200 characters |
| Wrong sign-in attempts | 20 per 15 minutes per device, then locked for 15 minutes |
| Tokens per device | 10 per minute |
| Session length | 8 hours (PIN kiosk: 12 hours) |
| Appointment times | Every 30 minutes, 9:00 am to 5:00 pm |
| Booking window | Today up to 60 days ahead |
| Token expiry if never called | 1 hour |
| Re-queue window after a skip | 2 hours from when the token was taken |
| Date of birth | 1 Jan 1900 up to today |
| Mobile | Indian, 10 digits, starting 6 to 9 |
| Chat attachment | 256 KB; PNG, JPEG, GIF, WebP or PDF |

---

## 7. Known behaviour that may look like a bug

These are how the system works today. Report them if you want them changed.

1. **Anyone taking a token can tick "priority"**; nothing checks it.
2. **The live position on a patient's token page ignores priority tokens**, so it can be off by the number of priority patients ahead.
3. **Auto mode stops if the backend restarts**, even though the dashboard may still show it as on. Switch it off and on again.
4. **The daily auto-reset does not switch off auto mode.**
5. **Queue capacity and opening hours are for information only.** Tokens are still issued outside them.
6. **Calls made by an admin are not credited to a person** in staff performance analytics.
7. **The display board's priority count leaves out referred patients**, even though they are served first.
8. **No page yet for** patients or doctors to edit their profile or change their password, or for admins to edit a staff member or reset a staff password or PIN.
9. **An appointment stays "Confirmed" after it joins the queue**; the doctor closes it as Seen or Missed.10. **The QR camera needs `localhost` or `https`.**
11. **`backend/.env.example` is deleted** in the working copy, so the "copy .env.example" step in RUNNING.md fails. Restore it with `git checkout backend/.env.example`.
12. **Prescriptions are not sent by email or SMS.** The patient sees them only after signing in. Reception and admins cannot view them in the admin portal.

---

## 8. Reporting a problem

For each problem note:

- **Role and account** used, for example "staff counter_opd".
- **Page URL**.
- **Steps**, numbered.
- **What you expected** and **what happened**.
- **A screenshot.** For booking problems, include the booking number (`BK-…`); for token problems, the token number.
