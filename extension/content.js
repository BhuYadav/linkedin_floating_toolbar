/* SPDX-License-Identifier: MIT */
(() => {
  "use strict";
  const EDITORS = '[contenteditable="true"], .ProseMirror, .ql-editor';
  const CONTROLS = 'button, [role="button"], select';
  const CANDIDATES = '[role="toolbar"], .publishing-text-editor__toolbar, .publishing-editor__toolbar, .ql-toolbar, [class*="editor-toolbar"], [class*="editor__toolbar"]';
  const PROPERTIES = ["top", "left", "width", "--lft-background"];
  let settings = { enabled: true, offset: 0 };
  let current = null;
  let frame = 0;
  let scanNeeded = true;
  let picking = false;
  let highlighted = null;

  function visible(node) {
    const box = node.getBoundingClientRect();
    return node.isConnected && box.width > 0 && box.height > 0 && getComputedStyle(node).visibility !== "hidden";
  }

  function score(node) {
    const controls = [...node.querySelectorAll(CONTROLS)];
    if (controls.length < 2 || controls.length > 35 || node.matches(EDITORS) || node.querySelector(EDITORS)) return 0;
    const labels = controls.map(control => [control.getAttribute("aria-label"), control.title,
      control.getAttribute("data-tooltip-content"), control.textContent].filter(Boolean).join(" ").toLowerCase()).join(" ");
    // Read control labels only; never read the article body.
    return [ /\bbold\b/, /\bitalic\b/, /\b(ordered|unordered|numbered|bullet)\b/, /\b(link|quote|image|heading|style)\b/ ]
      .filter(pattern => pattern.test(labels)).length;
  }

  function editorFor(toolbar) {
    const toolbarBox = toolbar.getBoundingClientRect();
    let parent = toolbar.parentElement;
    for (let depth = 0; parent && parent !== document.body && depth < 8; depth++, parent = parent.parentElement) {
      const editors = [...parent.querySelectorAll(EDITORS)].filter(editor => visible(editor) && !toolbar.contains(editor));
      const below = editors.filter(editor => {
        const box = editor.getBoundingClientRect();
        return box.bottom > toolbarBox.top && box.right > toolbarBox.left && box.left < toolbarBox.right;
      });
      if (below.length) return below.sort((a, b) =>
        b.getBoundingClientRect().height - a.getBoundingClientRect().height ||
        Math.abs(a.getBoundingClientRect().top - toolbarBox.bottom) - Math.abs(b.getBoundingClientRect().top - toolbarBox.bottom))[0];
    }
    return null;
  }

  function discover() {
    const nodes = new Set(document.querySelectorAll(CANDIDATES));
    // Fallback for LinkedIn markup changes and other editor language versions.
    for (const button of document.querySelectorAll('button[aria-label], button[title], [role="button"][aria-label]')) {
      const label = `${button.getAttribute("aria-label") || ""} ${button.title || ""}`;
      if (!/\b(bold|italic)\b/i.test(label)) continue;
      let parent = button.parentElement;
      for (let depth = 0; parent && parent !== document.body && depth < 4; depth++, parent = parent.parentElement) {
        if (score(parent) >= 2) { nodes.add(parent); break; }
      }
    }
    return [...nodes].filter(node => visible(node) && (score(node) >= 2 || (node.matches(CANDIDATES) && node.querySelectorAll(CONTROLS).length >= 3)))
      .sort((a, b) => b.matches('[role="toolbar"]') - a.matches('[role="toolbar"]') || a.getBoundingClientRect().height - b.getBoundingClientRect().height)
      .map(toolbar => ({ toolbar, editor: editorFor(toolbar) })).find(pair => pair.editor);
  }

  function setCurrent(pair) {
    release();
    if (!pair) return;
    current = { ...pair, placeholder: null, saved: null };
    resizeObserver.observe(pair.toolbar);
    resizeObserver.observe(pair.editor);
  }

  function unpin() {
    if (!current?.placeholder) return;
    const { toolbar, placeholder, saved } = current;
    toolbar.removeAttribute("data-lft-pinned");
    for (const [property, value, priority] of saved) {
      if (value) toolbar.style.setProperty(property, value, priority);
      else toolbar.style.removeProperty(property);
    }
    resizeObserver.unobserve(placeholder);
    placeholder.remove();
    current.placeholder = null;
    current.saved = null;
  }

  function release() {
    if (!current) return;
    unpin();
    resizeObserver.unobserve(current.toolbar);
    resizeObserver.unobserve(current.editor);
    current = null;
  }

  function pin() {
    const { toolbar } = current;
    const box = toolbar.getBoundingClientRect();
    const computed = getComputedStyle(toolbar);
    const placeholder = document.createElement("div");
    placeholder.setAttribute("data-lft-placeholder", "");
    placeholder.setAttribute("aria-hidden", "true");
    // Preserve flex-row and normal block layout without moving editor-owned DOM.
    Object.assign(placeholder.style, {
      height: `${box.height}px`, width: `${box.width}px`, boxSizing: "border-box",
      flex: computed.flex, alignSelf: computed.alignSelf, order: computed.order,
      margin: computed.margin, minWidth: "0", maxWidth: "100%"
    });
    current.saved = PROPERTIES.map(property => [property, toolbar.style.getPropertyValue(property), toolbar.style.getPropertyPriority(property)]);
    let background = computed.backgroundColor;
    if (background === "rgba(0, 0, 0, 0)" || background === "transparent") {
      const dark = getComputedStyle(document.body).color.match(/\d+/g)?.slice(0, 3).map(Number).reduce((a, b) => a + b, 0) > 600;
      background = dark ? "#252525" : "#f3f2ef";
    }
    toolbar.style.setProperty("--lft-background", background);
    toolbar.before(placeholder);
    current.placeholder = placeholder;
    toolbar.setAttribute("data-lft-pinned", "");
    resizeObserver.observe(placeholder);
  }

  function topEdge(anchor) {
    let top = 0;
    for (const header of document.querySelectorAll('header, [role="banner"], #global-nav, .global-nav')) {
      if (!visible(header) || current.toolbar.contains(header)) continue;
      const style = getComputedStyle(header);
      const box = header.getBoundingClientRect();
      if ((style.position === "fixed" || style.position === "sticky") && box.top <= 4 && box.bottom < innerHeight / 2 && box.right > anchor.left && box.left < anchor.right) top = Math.max(top, box.bottom);
    }
    // Respect a nested scrolling editor's top boundary.
    for (let parent = current.toolbar.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (/(auto|scroll)/.test(style.overflowY) && parent.scrollHeight > parent.clientHeight) {
        top = Math.max(top, parent.getBoundingClientRect().top + parent.clientTop);
      }
    }
    return Math.max(0, top) + settings.offset;
  }

  function update() {
    frame = 0;
    if (!settings.enabled) { release(); return; }
    if (current && (!visible(current.toolbar) || !visible(current.editor))) { release(); scanNeeded = true; }
    if (scanNeeded && !current && !picking) setCurrent(discover());
    scanNeeded = false;
    if (!current) return;
    const anchor = (current.placeholder || current.toolbar).getBoundingClientRect();
    const editorBox = current.editor.getBoundingClientRect();
    const top = topEdge(anchor);
    const height = current.toolbar.getBoundingClientRect().height;
    if (anchor.top >= top || editorBox.bottom <= top + height || anchor.right <= 0 || anchor.left >= innerWidth || height >= innerHeight - top) { unpin(); return; }
    if (!current.placeholder) pin();
    const box = current.placeholder.getBoundingClientRect();
    current.toolbar.style.setProperty("top", `${top}px`, "important");
    current.toolbar.style.setProperty("left", `${box.left}px`, "important");
    current.toolbar.style.setProperty("width", `${box.width}px`, "important");
    // Wrapped controls can change height after a viewport resize.
    const actualHeight = current.toolbar.getBoundingClientRect().height;
    if (Math.abs(box.height - actualHeight) > .5) current.placeholder.style.height = `${actualHeight}px`;
  }

  function schedule(scan = false) {
    scanNeeded ||= scan;
    if (!frame) frame = requestAnimationFrame(update);
  }

  function manualCandidate(target) {
    let node = target instanceof Element ? target : null;
    for (let depth = 0; node && node !== document.body && depth < 6; depth++, node = node.parentElement) {
      const count = node.querySelectorAll(CONTROLS).length;
      if (count >= 2 && count <= 35 && !node.querySelector(EDITORS) && !node.matches(EDITORS) && editorFor(node)) return node;
    }
    return null;
  }

  function highlight(node) {
    highlighted?.removeAttribute("data-lft-highlight");
    highlighted = node;
    highlighted?.setAttribute("data-lft-highlight", "");
  }

  function cancelPick() {
    picking = false;
    highlight(null);
    document.documentElement.removeAttribute("data-lft-picking");
    document.removeEventListener("pointermove", onPickMove, true);
    document.removeEventListener("click", onPickClick, true);
    document.removeEventListener("keydown", onPickKey, true);
    schedule(true);
  }
  function onPickMove(event) { highlight(manualCandidate(event.target)); }
  function onPickKey(event) { if (event.key === "Escape") { event.preventDefault(); cancelPick(); } }
  function onPickClick(event) {
    const toolbar = manualCandidate(event.target);
    // Picker clicks never trigger a formatting, navigation, or publish action.
    event.preventDefault(); event.stopImmediatePropagation();
    if (!toolbar) return;
    const editor = editorFor(toolbar);
    cancelPick();
    setCurrent({ toolbar, editor });
    schedule();
  }
  function startPick() {
    cancelPick(); release(); picking = true;
    document.documentElement.setAttribute("data-lft-picking", "");
    document.addEventListener("pointermove", onPickMove, true);
    document.addEventListener("click", onPickClick, true);
    document.addEventListener("keydown", onPickKey, true);
  }

  const resizeObserver = new ResizeObserver(() => schedule());
  const mutationObserver = new MutationObserver(records => {
    // Ignore our own placeholder insertions/removals to avoid layout feedback loops.
    const changed = records.some(record => [...record.addedNodes, ...record.removedNodes]
      .some(node => node.nodeType === 1 && !node.hasAttribute("data-lft-placeholder")));
    if (changed || (current && (!current.toolbar.isConnected || !current.editor.isConnected))) schedule(true);
  });
  mutationObserver.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("scroll", () => schedule(), { capture: true, passive: true });
  window.addEventListener("resize", () => schedule());
  window.addEventListener("popstate", () => { cancelPick(); release(); schedule(true); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.enabled) settings.enabled = changes.enabled.newValue !== false;
    if (changes.offset) settings.offset = Math.max(0, Math.min(160, Number(changes.offset.newValue) || 0));
    if (!settings.enabled) cancelPick();
    schedule(true);
  });
  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message.type === "lft:status") { respond({ enabled: settings.enabled, found: !!current, pinned: !!current?.placeholder }); }
    if (message.type === "lft:pick" && settings.enabled) { startPick(); respond({ picking: true }); }
  });
  chrome.storage.local.get({ enabled: true, offset: 0 }).then(value => {
    settings = { enabled: value.enabled !== false, offset: Math.max(0, Math.min(160, Number(value.offset) || 0)) };
    schedule(true);
  }).catch(() => schedule(true));
})();
