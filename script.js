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
    saveErrorMessage.hidden = false;
    btnSubmitAnswer.hidden = true;
    btnRetry.hidden = false;
  } finally {
    state.isSubmitting = false;
    btnSubmitAnswer.disabled = false;
    btnSubmitAnswer.textContent = "Submit Answer";
  }
}

function advanceToNext() {
  if (state.currentIndex < state.stimulusOrder.length - 1) {
    state.currentIndex += 1;
    loadCurrentStimulus();
  } else {
    videoPlayer.pause();
    showScreen("screen-thankyou");
  }
}

/* ----------------------------------------------------------
   10. NETWORK — save one response to Google Sheets via Apps Script
   ---------------------------------------------------------- */

function saveResponse(payload) {
  if (DEBUG_SKIP_NETWORK) {
    console.log("[DEBUG] Response payload:", payload);
    return Promise.resolve("ok");
  }

  // Using a plain string body (default Content-Type: text/plain) avoids
  // triggering a CORS preflight request, which Google Apps Script does
  // not handle. Code.gs reads e.postData.contents and parses it as JSON.
  return fetch(GOOGLE_SCRIPT_URL, {
    method: "POST",
    body: JSON.stringify(payload),
  })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then((data) => data.status || "ok")
    .catch((err) => {
      throw err;
    });
}