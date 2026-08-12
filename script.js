/* ==========================================================
   Deepfake Detection Research Study — script.js
   ========================================================== */

/* ----------------------------------------------------------
   1. CONFIGURATION — edit these two values
   ---------------------------------------------------------- */

// Paste the Web App URL you get after deploying Code.gs (see README).
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwvJPlCX1m1uhimwU7lf__jXbH__QLIwaUq3zbm_A5MLVt5o6qat04CyjYlx1qgBWfDSg/exec";

// Set to true only while testing without a working Apps Script URL.
// When true, responses are logged to the console instead of sent to Sheets.
const DEBUG_SKIP_NETWORK = false;

/* ----------------------------------------------------------
   2. VIDEO LIST — replace with your real research videos.
   Keep the number of "real" and "fake" entries equal.
   groundTruth is never shown to the participant and is only
   read by this script to attach it to the saved response.
   Each id must be unique ACROSS both `videos` and `pictures`.
   ---------------------------------------------------------- */

const videos = [
  { id: 1,  videoUrl: "assets/videor1.mp4",  groundTruth: "real" },
  { id: 2,  videoUrl: "assets/videof11.mp4",  groundTruth: "fake" },
  { id: 3,  videoUrl: "assets/videor2.mp4",  groundTruth: "real" },
  { id: 4,  videoUrl: "assets/videof2.mp4",  groundTruth: "fake" },
  { id: 5,  videoUrl: "assets/videor3.mp4",  groundTruth: "real" },
  { id: 6,  videoUrl: "assets/videof3.mp4",  groundTruth: "fake" },
  { id: 7,  videoUrl: "assets/videor4.mp4",  groundTruth: "real" },
  { id: 8,  videoUrl: "assets/videof4.mp4",  groundTruth: "fake" },
  { id: 9,  videoUrl: "assets/videor5.mp4",  groundTruth: "real" },
  { id: 10, videoUrl: "assets/videof5.mp4",  groundTruth: "fake" },
];

/* ----------------------------------------------------------
   2b. PICTURE LIST — the image "slot". Drop your image files
   into an images/ folder and list them here the same way as
   videos. Same rules: unique ids, groundTruth never shown.
   Suggested balance for 5 pictures: 2 or 3 real / the rest fake.
   ---------------------------------------------------------- */

const pictures = [
  { id: 11, imageUrl: "assets/picturer1.png", groundTruth: "real" },
  { id: 12, imageUrl: "assets/picturef1.png", groundTruth: "fake" },
  { id: 13, imageUrl: "assets/picturer2.png", groundTruth: "real" },
  { id: 14, imageUrl: "assets/picturef2.png", groundTruth: "fake" },
  { id: 15, imageUrl: "assets/picturef3.png", groundTruth: "fake" },
];

// Combined pool the app actually runs on. Each entry gets a `type`
// ("video" or "image") so the player knows which element to use.
const stimuli = [
  ...videos.map((v) => ({ ...v, type: "video" })),
  ...pictures.map((p) => ({ ...p, type: "image" })),
];

/* ----------------------------------------------------------
   3. STATE
   ---------------------------------------------------------- */

const state = {
  participantId: null,
  ageRange: "",
  educationLevel: "",
  stimulusOrder: [],   // shuffled copy of `stimuli`, fixed for this participant
  currentIndex: 0,
  selectedAnswer: null,     // "real" | "fake"
  selectedConfidence: null, // 1-5
  submittedStimulusIds: new Set(), // guards against double-submits
  isSubmitting: false,
};

/* ----------------------------------------------------------
   4. UTILITIES
   ---------------------------------------------------------- */

function generateParticipantId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  let random = "";
  for (let i = 0; i < 6; i++) {
    random += chars[Math.floor(Math.random() * chars.length)];
  }
  return `DF-${random}`;
}

// Fisher–Yates shuffle — avoids ordering bias.
function shuffle(array) {
  const copy = array.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((el) => el.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  window.scrollTo(0, 0);
}

/* ----------------------------------------------------------
   4b. SESSION PERSISTENCE — survive an accidental page refresh
   mid-experiment without starting over as a brand-new participant.
   Without this, a refresh (e.g. after someone gets spooked by a
   transient save error) generates a fresh Participant_ID, which the
   server-side duplicate check can't catch since it's keyed on
   Participant_ID + Stimulus_ID. sessionStorage clears itself when the
   tab is actually closed, so a genuinely new visit still starts fresh.
   ---------------------------------------------------------- */

const SESSION_STORAGE_KEY = "deepfakeStudySession";

function saveSession() {
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
      participantId: state.participantId,
      ageRange: state.ageRange,
      educationLevel: state.educationLevel,
      stimulusOrder: state.stimulusOrder,
      currentIndex: state.currentIndex,
      submittedStimulusIds: Array.from(state.submittedStimulusIds),
    }));
  } catch (err) {
    // sessionStorage unavailable (e.g. private browsing) — degrade
    // silently; a refresh will behave as it did before this change.
  }
}

function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch (err) {
    // nothing to do
  }
}

function attemptResumeSession() {
  const saved = loadSession();
  if (!saved || !saved.participantId || !Array.isArray(saved.stimulusOrder) || saved.stimulusOrder.length === 0) {
    return;
  }

  state.participantId = saved.participantId;
  state.ageRange = saved.ageRange || "";
  state.educationLevel = saved.educationLevel || "";
  state.stimulusOrder = saved.stimulusOrder;
  state.currentIndex = Math.min(saved.currentIndex || 0, state.stimulusOrder.length - 1);
  state.submittedStimulusIds = new Set(saved.submittedStimulusIds || []);

  showScreen("screen-experiment");
  loadCurrentStimulus();
}

/* ----------------------------------------------------------
   5. SCREEN 1 -> 2: LANDING -> CONSENT
   ---------------------------------------------------------- */

document.getElementById("btn-start-study").addEventListener("click", () => {
  showScreen("screen-consent");
});

/* ----------------------------------------------------------
   6. SCREEN 2: CONSENT
   ---------------------------------------------------------- */

const consentCheckbox = document.getElementById("consent-checkbox");
const btnConsentContinue = document.getElementById("btn-consent-continue");

consentCheckbox.addEventListener("change", () => {
  btnConsentContinue.disabled = !consentCheckbox.checked;
});

btnConsentContinue.addEventListener("click", () => {
  if (!consentCheckbox.checked) return;

  // Generate the participant ID and the full stimulus order (videos + pictures)
  // the moment consent is given.
  state.participantId = generateParticipantId();
  state.stimulusOrder = shuffle(stimuli);
  document.getElementById("participant-id-display").textContent = state.participantId;

  showScreen("screen-participant");
});

/* ----------------------------------------------------------
   7. SCREEN 3: PARTICIPANT INFORMATION
   ---------------------------------------------------------- */

document.getElementById("btn-participant-continue").addEventListener("click", () => {
  state.ageRange = document.getElementById("age-range").value;
  state.educationLevel = document.getElementById("education-level").value;
  showScreen("screen-instructions");
});

/* ----------------------------------------------------------
   8. SCREEN 4: INSTRUCTIONS
   ---------------------------------------------------------- */

document.getElementById("btn-begin-experiment").addEventListener("click", () => {
  state.currentIndex = 0;
  showScreen("screen-experiment");
  loadCurrentStimulus();
});

/* ----------------------------------------------------------
   9. SCREEN 5: EXPERIMENT
   ---------------------------------------------------------- */

const videoPlayer = document.getElementById("video-player");
const imagePlayer = document.getElementById("image-player");
const progressLabel = document.getElementById("progress-label");
const progressBarFill = document.getElementById("progress-bar-fill");
const questionText = document.getElementById("question-text");
const btnChoiceReal = document.getElementById("btn-choice-real");
const btnChoiceFake = document.getElementById("btn-choice-fake");
const confidenceRow = document.getElementById("confidence-row");
const validationMessage = document.getElementById("validation-message");
const saveErrorMessage = document.getElementById("save-error-message");
const btnSubmitAnswer = document.getElementById("btn-submit-answer");
const btnRetry = document.getElementById("btn-retry");

function loadCurrentStimulus() {
  const total = state.stimulusOrder.length;
  const item = state.stimulusOrder[state.currentIndex];

  // Reset per-item UI state.
  state.selectedAnswer = null;
  state.selectedConfidence = null;
  validationMessage.hidden = true;
  saveErrorMessage.hidden = true;
  btnRetry.hidden = true;
  btnSubmitAnswer.hidden = false;
  btnSubmitAnswer.disabled = false;
  btnSubmitAnswer.textContent = "Submit Answer";

  [btnChoiceReal, btnChoiceFake].forEach((b) => b.classList.remove("selected"));
  confidenceRow.querySelectorAll(".confidence-btn").forEach((b) => b.classList.remove("selected"));

  progressLabel.textContent = `Item ${state.currentIndex + 1} of ${total}`;
  progressBarFill.style.width = `${((state.currentIndex + 1) / total) * 100}%`;

  if (item.type === "image") {
    videoPlayer.pause();
    videoPlayer.removeAttribute("src");
    videoPlayer.load(); // flush any previously loaded/decoded frame
    videoPlayer.hidden = true;

    imagePlayer.src = item.imageUrl;
    imagePlayer.hidden = false;

    questionText.textContent = "Is this image real or fake?";
  } else {
    imagePlayer.removeAttribute("src");
    imagePlayer.hidden = true;

    videoPlayer.hidden = false;
    videoPlayer.pause();
    videoPlayer.removeAttribute("src");
    videoPlayer.load(); // flush the previous video's frame before loading the next
    videoPlayer.src = item.videoUrl;
    videoPlayer.load();

    questionText.textContent = "Is this video real or fake?";
  }

  saveSession();
}

btnChoiceReal.addEventListener("click", () => selectAnswer("real"));
btnChoiceFake.addEventListener("click", () => selectAnswer("fake"));

function selectAnswer(choice) {
  state.selectedAnswer = choice;
  btnChoiceReal.classList.toggle("selected", choice === "real");
  btnChoiceFake.classList.toggle("selected", choice === "fake");
  validationMessage.hidden = true;
}

confidenceRow.querySelectorAll(".confidence-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.selectedConfidence = Number(btn.dataset.confidence);
    confidenceRow.querySelectorAll(".confidence-btn").forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    validationMessage.hidden = true;
  });
});

btnSubmitAnswer.addEventListener("click", handleSubmit);
btnRetry.addEventListener("click", handleSubmit);

async function handleSubmit() {
  if (state.isSubmitting) return;

  if (!state.selectedAnswer || !state.selectedConfidence) {
    validationMessage.textContent = "Please select an answer and confidence level before continuing.";
    validationMessage.hidden = false;
    return;
  }

  const item = state.stimulusOrder[state.currentIndex];

  // Guard against double submission of the same item.
  if (state.submittedStimulusIds.has(item.id)) {
    advanceToNext();
    return;
  }

  state.isSubmitting = true;
  btnSubmitAnswer.disabled = true;
  btnSubmitAnswer.textContent = "Saving...";
  saveErrorMessage.hidden = true;
  btnRetry.hidden = true;

  const payload = {
    participantId: state.participantId,
    stimulusId: item.id,
    mediaType: item.type, // "video" or "image"
    stimulusOrder: state.currentIndex + 1,
    groundTruth: item.groundTruth, // recorded for research analysis only, never shown to participant
    answer: state.selectedAnswer,
    confidence: state.selectedConfidence,
    ageRange: state.ageRange,
    educationLevel: state.educationLevel,
  };

  try {
    const result = await saveResponse(payload);

    if (result === "ok" || result === "duplicate") {
      state.submittedStimulusIds.add(item.id);
      advanceToNext();
    } else {
      throw new Error("Unexpected server response");
    }
  } catch (err) {
    console.error("[Study] Failed to save response:", err);
    saveErrorMessage.textContent = messageForSaveError(err);
    saveErrorMessage.hidden = false;
    btnSubmitAnswer.hidden = true;
    btnRetry.hidden = false;
  } finally {
    state.isSubmitting = false;
    btnSubmitAnswer.disabled = false;
    btnSubmitAnswer.textContent = "Submit Answer";
  }
}

// Picks a message based on *why* the save failed, instead of always
// blaming the connection — a missing endpoint config looks very
// different from a genuine dropped connection.
function messageForSaveError(err) {
  if (err && err.code === "CONFIG_MISSING") {
    return "This study isn't fully set up yet (missing submission endpoint). Please let the researcher know.";
  }
  if (err instanceof TypeError) {
    // fetch() only throws a bare TypeError for genuine network-level
    // failures (offline, DNS failure) — this is the one case that's
    // actually about connectivity.
    return "Your response could not be saved. Please check your connection and try again.";
  }
  return "Your response could not be saved. Please try again.";
}

function advanceToNext() {
  if (state.currentIndex < state.stimulusOrder.length - 1) {
    state.currentIndex += 1;
    loadCurrentStimulus();
  } else {
    videoPlayer.pause();
    clearSession();
    showScreen("screen-thankyou");
  }
}

/* ----------------------------------------------------------
   10. NETWORK — save one response to Google Sheets via Apps Script
   ---------------------------------------------------------- */

async function saveResponse(payload) {
  if (DEBUG_SKIP_NETWORK) {
    console.log("[DEBUG] Response payload:", payload);
    return "ok";
  }

  if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL.includes("PASTE_YOUR_GOOGLE_APPS_SCRIPT")) {
    const err = new Error("GOOGLE_SCRIPT_URL is still the placeholder value.");
    err.code = "CONFIG_MISSING";
    throw err;
  }

  // IMPORTANT: mode "no-cors" is intentional, not an oversight.
  // Google Apps Script Web Apps redirect the real response to a
  // script.googleusercontent.com URL that frequently doesn't carry CORS
  // headers. A normal fetch() then throws "Failed to fetch" on that
  // redirected response even though the POST reached the server and the
  // row was saved — which is exactly what was showing "please check your
  // connection" on a perfectly good connection. With no-cors we can't
  // read the response body or status, so we can't detect a mid-request
  // Apps Script error this way anymore — but Code.gs's own
  // Participant_ID + Stimulus_ID duplicate check makes it safe to treat
  // "the browser didn't throw while sending this" as success, and safe
  // to retry if a genuine failure did happen.
  await fetch(GOOGLE_SCRIPT_URL, {
    method: "POST",
    mode: "no-cors",
    body: JSON.stringify(payload),
  });

  return "ok";
}

/* ----------------------------------------------------------
   11. RESUME AN IN-PROGRESS SESSION ON PAGE LOAD
   If sessionStorage has an unfinished session (same tab reloaded
   mid-experiment), jump straight back to where they left off instead
   of starting over on the landing page with a new Participant_ID.
   ---------------------------------------------------------- */

attemptResumeSession();