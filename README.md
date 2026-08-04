# Deepfake Detection Research Study — Setup Guide

## Files

| File | Purpose |
|---|---|
| `index.html` | The six screens: landing, consent, participant info, instructions, experiment, thank-you |
| `style.css` | Mobile-first, academic styling |
| `script.js` | App logic: participant ID, randomization, video flow, saving to Sheets |
| `Code.gs` | Google Apps Script backend that writes rows to a Google Sheet |

Put `index.html`, `style.css`, and `script.js` in the same folder, plus a `videos/` subfolder for your video files.

```
project/
  index.html
  style.css
  script.js
  videos/
    video1.mp4
    video2.mp4
    ...
  images/
    image1.jpg
    image2.jpg
    ...
```

The study now runs two stimulus types back-to-back in one randomized sequence: 10 videos + 5 pictures = 15 items total (adjust either count as you like — see below). Pictures use the exact same real/fake + confidence flow, just with an `<img>` in place of the `<video>` player, and share one results log.

---

## 1. Google Sheets + Apps Script setup

1. Go to [sheets.google.com](https://sheets.google.com) and create a new blank spreadsheet. Name it something like "Deepfake Study Responses".
2. In the sheet, click **Extensions > Apps Script**.
3. Delete the placeholder `Code.gs` content and paste in the `Code.gs` file provided here.
4. In the function dropdown at the top of the Apps Script editor, select `setupSheet`, then click **Run** (▶). The first time, Google will ask you to authorize the script — click through the consent screens (you'll need to click "Advanced" > "Go to (project name) (unsafe)" since this is your own unpublished script).
5. This creates a `Responses` sheet with the header row already in place.

## 2. Deploy the Web App

1. Still in the Apps Script editor, click **Deploy > New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Set:
   - **Execute as:** Me
   - **Who has access:** Anyone
4. Click **Deploy**, authorize again if prompted, and copy the **Web app URL** it gives you (looks like `https://script.google.com/macros/s/AKfycb.../exec`).

> If you later edit `Code.gs`, you must create a **new deployment version** (Deploy > Manage deployments > edit > New version) for changes to take effect on the same URL.

## 3. Connect the frontend to the backend

Open `script.js` and paste your Web App URL into:

```js
const GOOGLE_SCRIPT_URL = "PASTE_YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE";
```

---

## 4. Replacing the placeholder videos

In `script.js`, find the `videos` array:

```js
const videos = [
  { id: 1, videoUrl: "videos/video1.mp4", groundTruth: "real" },
  { id: 2, videoUrl: "videos/video2.mp4", groundTruth: "fake" },
  ...
];
```

- `id` — any unique number, used to identify the video in your results.
- `videoUrl` — path (or full URL, e.g. hosted on Google Drive/Cloud Storage) to the video file.
- `groundTruth` — `"real"` or `"fake"`. This is written to the Sheet for analysis but is **never shown to participants** — it does not appear anywhere in the UI.

Replace the placeholder entries with your actual videos, keeping the file names/paths matching what's in your `videos/` folder.

## 5. Changing the number of videos or pictures

In `script.js`, `videos` and `pictures` are two separate arrays that get merged into one `stimuli` list the app actually runs on. Add or remove entries from either array — the progress indicator ("Item X of N"), the progress bar, and the randomization all read the combined length automatically, nothing else needs to change. Keep the count of `"real"` and `"fake"` entries roughly equal within each array if you want a balanced design.

### The picture slot

```js
const pictures = [
  { id: 11, imageUrl: "images/image1.jpg", groundTruth: "real" },
  { id: 12, imageUrl: "images/image2.jpg", groundTruth: "fake" },
  ...
];
```

- `id` — must be unique across **both** `videos` and `pictures` (the placeholder set starts pictures at `11` since videos use `1`–`10`; adjust if you change the video count).
- `imageUrl` — path or full URL to the image file (`.jpg`/`.png`/`.webp` all work).
- `groundTruth` — `"real"` or `"fake"`, same rules as videos: written to the Sheet, never shown in the UI.

Each response row now also includes a `Media_Type` column (`video` or `image`) so you can filter or compare accuracy/confidence by stimulus type during analysis.

## 6. Testing the complete experiment

1. Set `DEBUG_SKIP_NETWORK = true` at the top of `script.js` while testing locally — this logs each submission to the browser console instead of sending it to Sheets, so you can test the flow without deploying anything yet.
2. Serve the folder with any static server (opening `index.html` directly via `file://` can block video loading in some browsers). For example, from the project folder:
   ```
   python3 -m http.server 8000
   ```
   then visit `http://localhost:8000` in your browser (and on your phone, via your computer's local IP, to test the mobile layout).
3. Click through: Start Study → check the consent checkbox → Continue → confirm your participant ID appears → Continue → Begin Experiment → answer each video → confirm you reach the Thank You screen with no score shown anywhere.
4. Once the flow works, set `DEBUG_SKIP_NETWORK = false` and make sure `GOOGLE_SCRIPT_URL` is filled in. Do one full run-through and check your Google Sheet — a new row should appear after each "Submit Answer" tap, with the correct `Ground_Truth` value for that video (visible only to you in the Sheet, never in the browser).
5. Try submitting with a slow/offline connection (e.g. toggle airplane mode mid-study, or throttle network in browser dev tools) to confirm the "Your response could not be saved" message and Retry button appear instead of silently advancing.

---

## Notes on the ground-truth / privacy tradeoff

As written, `groundTruth` lives in the `videos` array in `script.js`, which is downloaded to the participant's browser — a technically sophisticated participant could open dev tools and read it, even though nothing in the UI ever displays it. For most classroom/thesis-level studies this is an acceptable tradeoff for simplicity.

If you want ground truth to never touch the browser at all, you can extend `Code.gs` with a `doGet` handler that returns the video list *without* `groundTruth`, and have `script.js` fetch that list instead of using a local array; `Code.gs` would then look up the ground truth server-side (by `videoId`) when it logs each submitted response. This is a bit more setup — let me know if you'd like that version built out.

## Notes on duplicate protection

Duplicate protection happens twice: the browser tracks which video IDs it has already successfully submitted, and `Code.gs` independently checks the sheet for an existing `Participant_ID` + `Video_ID` row before appending. Either one alone would be enough for normal use; having both makes it robust to page reloads or double-taps.