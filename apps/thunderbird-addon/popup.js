const statusEl = document.getElementById("status");
const connEl = document.getElementById("conn");

function setStatus(text) {
  statusEl.textContent = text;
}

function setBusy(busy) {
  for (const id of [
    "testConnection",
    "processUnread",
    "processRecent",
    "processRecent50",
    "pollActions",
  ]) {
    document.getElementById(id).disabled = busy;
  }
}

async function run(type, extra = {}) {
  setBusy(true);
  setStatus("Working…");
  try {
    const result = await browser.runtime.sendMessage({ type, ...extra });
    setStatus(
      typeof result === "string"
        ? result
        : JSON.stringify(result, null, 2),
    );
    return result;
  } catch (error) {
    setStatus(String(error?.message || error));
    throw error;
  } finally {
    setBusy(false);
  }
}

document.getElementById("openSettings").addEventListener("click", () => {
  browser.runtime.openOptionsPage();
});

document.getElementById("testConnection").addEventListener("click", () => {
  run("test-connection").then((result) => {
    if (result?.ok) {
      connEl.textContent = result.message;
    }
  });
});

document.getElementById("processUnread").addEventListener("click", () => {
  run("process-unread");
});

document.getElementById("processRecent").addEventListener("click", () => {
  run("process-recent", { limit: 25 });
});

document.getElementById("processRecent50").addEventListener("click", () => {
  run("process-recent", { limit: 50 });
});

document.getElementById("pollActions").addEventListener("click", () => {
  run("poll-actions");
});

browser.runtime
  .sendMessage({ type: "get-status" })
  .then((status) => {
    const emails = (status.accountEmails || []).join(", ") || "(none)";
    connEl.textContent = status.hasSecret
      ? `Ready → ${status.baseUrl}\nAccounts: ${emails}`
      : `Secret missing. Open Settings and save the bridge secret.`;
  })
  .catch((error) => {
    connEl.textContent = `Add-on error: ${error}`;
  });
