## A Google Apps Script automation that triggers when a Google Form is submitted.
It reads the response data into Google Sheets and instantly sends a WhatsApp
message to the customer using a pre-approved WappConnect / Meta template.

function onFormSubmit(e) {
  if (!e || !e.values) {
    Logger.log("ERROR: No event data received");
    return;
  }

  // ── 1. Get the active sheet & current row ────────────────────────────────
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var row   = e.range.getRow();   // the row that was just written by the form

  // ── 2. Pull values from form submission ──────────────────────────────────
  var rawMobile = (e.values[1] || "").toString().trim();
  var invoiceNo  = (e.values[2] || "").toString().trim();
  var date       = (e.values[3] || "").toString().trim();

  Logger.log("Raw values → mobile: %s | invoice: %s | date: %s",
             rawMobile, invoiceNo, date);

  // ── 3. Find or create the "Status" column ────────────────────────────────
  var headers     = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var statusCol   = headers.indexOf("Status") + 1;   // 1-based

  if (statusCol === 0) {
    // Column doesn't exist yet — create it at the end
    statusCol = sheet.getLastColumn() + 1;
    sheet.getRange(1, statusCol).setValue("Status");
  }

  // Helper to write status into the current row
  function setStatus(text) {
    sheet.getRange(row, statusCol).setValue(text);
    SpreadsheetApp.flush();   // write immediately, don't wait
  }

  // ── 4. Validate required fields ─────────────────────────────────────────
  if (!rawMobile || !invoiceNo || !date) {
    Logger.log("ERROR: One or more required fields are empty. Aborting.");
    setStatus("❌ Missing Fields");
    return;
  }

  // ── 5. Sanitise & normalise mobile number ────────────────────────────────
  var mobile = rawMobile.replace(/\D/g, "");
  if (mobile.length === 10) mobile = "91" + mobile;
  if (!mobile.startsWith("91")) mobile = "91" + mobile;

  if (mobile.length !== 12) {
    Logger.log("ERROR: Invalid mobile after sanitising → " + mobile);
    setStatus("❌ Invalid Mobile");
    return;
  }

  // ── 6. Config ────────────────────────────────────────────────────────────
  var TOKEN    = "D1FPHoXd16UwSeYo9wZ9QY9510NFdJREFTSA5iCnbr4ooFkop4FhREFTSAVU5ERVJTQ09SRQbyReS5iuZREFTSAP5OSGoVU5ERVJTQ09SRQekKtMyVagDAy10ucnuRTnugDXi3szoI2KYxqbwacHgeSD6B59RMOgYESY";
  var PHONE_ID = "1023892414136481";
  var API_URL  = "https://crmapi.1automations.com/api/meta/v19.0/"
                 + PHONE_ID + "/messages";

  // ── 7. Build WhatsApp template payload ──────────────────────────────────
  var payload = {
    messaging_product: "whatsapp",
    to: mobile,
    type: "template",
    template: {
      name: "invoice_document_message",
      language: { code: "en" },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: invoiceNo },
            { type: "text", text: date }
          ]
        }
      ]
    }
  };

  // ── 8. HTTP request ──────────────────────────────────────────────────────
  var options = {
    method            : "post",
    contentType       : "application/json",
    headers           : { "Authorization": "Bearer " + TOKEN },
    payload           : JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    var response   = UrlFetchApp.fetch(API_URL, options);
    var statusCode = response.getResponseCode();
    var result     = response.getContentText();

    Logger.log("HTTP Status : " + statusCode);
    Logger.log("API Response: " + result);

    if (statusCode === 200 || statusCode === 201) {
      Logger.log("✅ WhatsApp message sent successfully to " + mobile);
      setStatus("✅ Sent");                          // ← writes "Sent" to sheet
    } else {
      Logger.log("⚠️ Message not sent. Status " + statusCode + " → " + result);
      setStatus("⚠️ Failed (" + statusCode + ")");  // ← writes failure code
    }

  } catch (err) {
    Logger.log("ERROR during API call: " + err.message);
    setStatus("❌ Error: " + err.message);           // ← writes error message
  }
}
