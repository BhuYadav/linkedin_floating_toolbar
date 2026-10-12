/* SPDX-License-Identifier: MIT */
"use strict";
const enabled = document.querySelector("#enabled");
const offset = document.querySelector("#offset");
const output = document.querySelector("#offset-value");
const status = document.querySelector("#status");
const pick = document.querySelector("#pick");
let tabId;

async function message(type) {
  if (tabId == null) throw new Error("No active tab");
  return chrome.tabs.sendMessage(tabId, { type });
}

async function refreshStatus() {
  try {
    const state = await message("lft:status");
    status.textContent = !state.enabled ? "Turned off." : state.found
      ? "Toolbar detected. It will stay visible as you scroll."
      : "Open a LinkedIn article or newsletter draft. If its toolbar is missed, choose it manually.";
    pick.disabled = !state.enabled;
  } catch {
    status.textContent = "Open LinkedIn and refresh the page after installing this extension.";
    pick.disabled = true;
  }
}

async function save() {
  try {
    await chrome.storage.local.set({ enabled: enabled.checked, offset: Number(offset.value) });
    await refreshStatus();
  } catch { status.textContent = "Could not save settings. Reopen this popup and try again."; }
}

enabled.addEventListener("change", save);
offset.addEventListener("input", () => { output.value = `${offset.value} px`; });
offset.addEventListener("change", save);
pick.addEventListener("click", async () => {
  try { await message("lft:pick"); window.close(); }
  catch { status.textContent = "Refresh LinkedIn and try again."; }
});

(async () => {
  try {
    const settings = await chrome.storage.local.get({ enabled: true, offset: 0 });
    enabled.checked = settings.enabled;
    offset.value = settings.offset;
    output.value = `${offset.value} px`;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tabId = tab?.id;
    await refreshStatus();
  } catch { status.textContent = "Could not load settings. Reopen the popup to try again."; pick.disabled = true; }
})();
