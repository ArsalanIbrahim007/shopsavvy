// site.js — runs on the ShopSavvy website only, and only marks the page: the site's "add the extension" invitation
// (frontend components/ExtensionPrompt.jsx) is then not shown to someone who already has it (2026-11-27). It reads nothing and
// sends nothing.
document.documentElement.dataset.shopsavvyExtension = chrome.runtime.getManifest().version;
