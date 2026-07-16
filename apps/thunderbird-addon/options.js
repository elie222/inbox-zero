const DEFAULTS = {
  baseUrl: "http://localhost:3000",
  secret: "",
  enabled: true,
  pollSeconds: 15,
};

async function load() {
  const stored = await browser.storage.local.get(DEFAULTS);
  document.getElementById("baseUrl").value = stored.baseUrl;
  document.getElementById("secret").value = stored.secret;
  document.getElementById("enabled").checked = stored.enabled;
  document.getElementById("pollSeconds").value = stored.pollSeconds;
}

async function save() {
  const settings = {
    baseUrl: document.getElementById("baseUrl").value.replace(/\/$/, ""),
    secret: document.getElementById("secret").value.trim(),
    enabled: document.getElementById("enabled").checked,
    pollSeconds: Number(document.getElementById("pollSeconds").value) || 15,
  };
  await browser.storage.local.set(settings);
  setStatus("Saved.");
  browser.runtime.sendMessage({ type: "settings-updated" });
}

function setStatus(text) {
  document.getElementById("status").textContent = text;
}

document.getElementById("save").addEventListener("click", () => {
  save().catch((error) => setStatus(String(error)));
});

document.getElementById("test").addEventListener("click", () => {
  browser.runtime
    .sendMessage({ type: "test-connection" })
    .then((result) => setStatus(JSON.stringify(result, null, 2)))
    .catch((error) => setStatus(String(error)));
});

document.getElementById("register").addEventListener("click", () => {
  browser.runtime
    .sendMessage({ type: "register-accounts" })
    .then((result) => setStatus(JSON.stringify(result, null, 2)))
    .catch((error) => setStatus(String(error)));
});

document.getElementById("processUnread").addEventListener("click", () => {
  browser.runtime
    .sendMessage({ type: "process-unread" })
    .then((result) => setStatus(JSON.stringify(result, null, 2)))
    .catch((error) => setStatus(String(error)));
});

document.getElementById("processRecent").addEventListener("click", () => {
  browser.runtime
    .sendMessage({ type: "process-recent", limit: 25 })
    .then((result) => setStatus(JSON.stringify(result, null, 2)))
    .catch((error) => setStatus(String(error)));
});

document.getElementById("processRecent50").addEventListener("click", () => {
  browser.runtime
    .sendMessage({ type: "process-recent", limit: 50 })
    .then((result) => setStatus(JSON.stringify(result, null, 2)))
    .catch((error) => setStatus(String(error)));
});

load().catch((error) => setStatus(String(error)));
