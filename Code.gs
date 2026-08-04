/**
 * Deepfake Detection Research Study — Google Apps Script backend
 *
 * SETUP
 * 1. Create a new Google Sheet.
 * 2. In the sheet, go to Extensions > Apps Script.
 * 3. Delete any starter code and paste this entire file in as Code.gs.
 * 4. Run `setupSheet` once from the Apps Script editor (select it in the
 *    function dropdown, click Run) to create the header row. The first
 *    run will ask you to authorize the script — accept the prompts.
 * 5. Deploy > New deployment > select type "Web app".
 *      - Execute as: Me
 *      - Who has access: Anyone
 * 6. Copy the Web App URL and paste it into GOOGLE_SCRIPT_URL in script.js.
 *
 * SHEET COLUMNS
 * Timestamp | Participant_ID | Stimulus_ID | Media_Type | Stimulus_Order |
 * Ground_Truth | Participant_Answer | Confidence_Level | Age_Range | Education_Level
 *
 * Media_Type is "video" or "image" — videos and pictures share one
 * response log since they're scored the same way.
 */

const SHEET_NAME = "Responses";

function setupSheet() {
  const sheet = getOrCreateSheet();
  const headers = [
    "Timestamp",
    "Participant_ID",
    "Stimulus_ID",
    "Media_Type",
    "Stimulus_Order",
    "Ground_Truth",
    "Participant_Answer",
    "Confidence_Level",
    "Age_Range",
    "Education_Level",
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
}

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  return sheet;
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    const participantId = String(data.participantId || "").trim();
    const stimulusId = String(data.stimulusId || "").trim();

    if (!participantId || !stimulusId) {
      return jsonResponse({ status: "error", message: "Missing participantId or stimulusId" });
    }

    const sheet = getOrCreateSheet();

    // Server-side duplicate guard: if this participant already has a row
    // for this stimulus (video or image), do not write a second one.
    if (isDuplicate(sheet, participantId, stimulusId)) {
      return jsonResponse({ status: "duplicate" });
    }

    sheet.appendRow([
      new Date(),
      participantId,
      stimulusId,
      data.mediaType || "",
      data.stimulusOrder || "",
      data.groundTruth || "",
      data.answer || "",
      data.confidence || "",
      data.ageRange || "",
      data.educationLevel || "",
    ]);

    return jsonResponse({ status: "ok" });
  } catch (err) {
    return jsonResponse({ status: "error", message: err.message });
  }
}

function isDuplicate(sheet, participantId, stimulusId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;

  // Participant_ID is column 2, Stimulus_ID is column 3.
  const range = sheet.getRange(2, 2, lastRow - 1, 2).getValues();
  for (let i = 0; i < range.length; i++) {
    if (String(range[i][0]) === participantId && String(range[i][1]) === stimulusId) {
      return true;
    }
  }
  return false;
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Optional: simple GET endpoint, e.g. for a health check from the browser
 * console while testing (visiting the Web App URL directly).
 */
function doGet(e) {
  return jsonResponse({ status: "ok", message: "Deepfake study endpoint is running." });
}