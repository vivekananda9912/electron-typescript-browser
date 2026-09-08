import type { WebviewTag } from 'electron';
import { ipcRenderer } from 'electron';

interface Tab {
  id: string;
  webview: WebviewTag;
  tabElement: HTMLDivElement;
  titleSpan: HTMLSpanElement;
  iconSpan: HTMLSpanElement;
}

window.addEventListener("DOMContentLoaded", () => {
  const controls = document.getElementById("controls")!;
  const addressBar = document.getElementById("address-bar") as HTMLInputElement;
  const securityIcon = document.getElementById("security-icon");
  const loadingBar = document.getElementById("loading-bar");
  const goButton = document.getElementById("go") as HTMLButtonElement;
  const backButton = document.getElementById("back") as HTMLButtonElement;
  const forwardButton = document.getElementById("forward") as HTMLButtonElement;
  const refreshButton = document.getElementById("refresh") as HTMLButtonElement;
  const homeButton = document.getElementById("home") as HTMLButtonElement;
  const newTabButton = document.getElementById("new-tab") as HTMLButtonElement;
  const tabsBar = document.getElementById("tabs")!;
  const webviewContainer = document.getElementById("webview-container")!;
  const recordToggleButton = document.getElementById("record-toggle");
  const recText = document.getElementById("rec-text");
  const settingsModal = document.getElementById("settings-modal")!;
  const settingsClose = document.getElementById("settings-close")!;
  const timelapseIntervalInput = document.getElementById("timelapse-interval") as HTMLInputElement | null;
  const downloadPathInput = document.getElementById("download-path") as HTMLInputElement;
  const chooseDownloadPathButton = document.getElementById("choose-download-path")!;

  let activeTabId: string | null = null;
  const tabs: Tab[] = [];
  let mediaRecorder: MediaRecorder | null = null;
  let recordedChunks: Blob[] = [];
  let timelapseInterval: NodeJS.Timeout | null = null;
  let isRecording = false;

  const LOCK_HTTPS_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
  const LOCK_HOME_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`;
  const LOCK_HTTP_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;

  function updateSecurityIcon(url?: string) {
    if (!securityIcon) return;
    const safeUrl = url || "";
    if (!safeUrl || safeUrl.includes("home.html") || safeUrl.startsWith("file://") || safeUrl === "home") {
      securityIcon.innerHTML = LOCK_HOME_SVG;
      securityIcon.title = "Local Educational Portal";
    } else if (safeUrl.startsWith("https://")) {
      securityIcon.innerHTML = LOCK_HTTPS_SVG;
      securityIcon.title = "Secure Connection (HTTPS)";
    } else {
      securityIcon.innerHTML = LOCK_HTTP_SVG;
      securityIcon.title = "Insecure Connection (HTTP)";
    }
  }

  function applyWebviewContent(webview: WebviewTag) {
    if (!webview) return;
    webview.classList.add("active");
    Object.assign(webview.style, {
      visibility: "visible",
      pointerEvents: "auto",
      zIndex: "1"
    });

    if (typeof webview.executeJavaScript === "function") {
      webview.executeJavaScript(`
        document.body.style.margin = '0';
        document.body.style.padding = '0';
        document.body.style.height = '100%';
        document.documentElement.style.height = '100%';
        window.dispatchEvent(new Event('resize'));
      `).catch(() => {});
    }
  }

  function formatDisplayUrl(url: string): string {
    if (!url || url === "undefined" || url.includes("home.html") || url.startsWith("file://")) {
      return "home.html";
    }
    return url;
  }

  function getActiveTab(): Tab | undefined {
    if (activeTabId) {
      const found = tabs.find(t => t.id === activeTabId);
      if (found) return found;
    }
    if (tabs.length > 0) {
      return tabs[tabs.length - 1];
    }
    return undefined;
  }

  function getActiveWebview(): WebviewTag | null {
    const activeTab = getActiveTab();
    if (activeTab?.webview) return activeTab.webview;
    const activeWv = document.querySelector("webview.active") as WebviewTag | null;
    if (activeWv) return activeWv;
    const allWv = document.querySelectorAll("webview");
    if (allWv.length > 0) return allWv[allWv.length - 1] as WebviewTag;
    return null;
  }

  function updateNavButtonsState() {
    const wv = getActiveWebview();
    if (!wv) {
      if (backButton) backButton.disabled = true;
      if (forwardButton) forwardButton.disabled = true;
      return;
    }

    let canBack = false;
    let canFwd = false;
    try {
      canBack = typeof wv.canGoBack === "function" && wv.canGoBack();
    } catch (e) {}
    try {
      canFwd = typeof wv.canGoForward === "function" && wv.canGoForward();
    } catch (e) {}

    const currentUrl = wv.getURL?.() || wv.getAttribute("src") || "";
    const isHome = !currentUrl || currentUrl.includes("home.html") || currentUrl.startsWith("file:");

    if (backButton) {
      backButton.disabled = !canBack && isHome;
    }
    if (forwardButton) {
      forwardButton.disabled = !canFwd;
    }
  }

  function setActiveTab(tabId: string) {
    tabs.forEach(tab => {
      const isActive = tab.id === tabId;

      tab.tabElement.classList.toggle("active", isActive);

      if (isActive) {
        tab.webview.classList.add("active");
        activeTabId = tab.id;
        let currentSrc = tab.webview.getURL?.() || tab.webview.getAttribute("src") || "home.html";
        addressBar.value = formatDisplayUrl(currentSrc);
        updateSecurityIcon(currentSrc);
        applyWebviewContent(tab.webview);
        updateNavButtonsState();
      } else {
        tab.webview.classList.remove("active");
        Object.assign(tab.webview.style, {
          visibility: "hidden",
          pointerEvents: "none",
          zIndex: "0"
        });
      }
    });
  }

  function closeTab(tabId: string) {
    const index = tabs.findIndex(t => t.id === tabId);
    if (index === -1) return;

    const tabToRemove = tabs[index];
    if (tabToRemove.webview.parentNode) {
      tabToRemove.webview.parentNode.removeChild(tabToRemove.webview);
    }
    if (tabToRemove.tabElement.parentNode) {
      tabToRemove.tabElement.parentNode.removeChild(tabToRemove.tabElement);
    }

    tabs.splice(index, 1);

    if (activeTabId === tabId) {
      if (tabs.length > 0) {
        const nextIndex = Math.min(index, tabs.length - 1);
        setActiveTab(tabs[nextIndex].id);
      } else {
        addNewTab("home.html");
      }
    }
  }

  // --- Restricted Website Warning Modal ---
  const restrictedWarningModal = document.getElementById("restricted-warning-modal");
  const warningBlockedUrl = document.getElementById("warning-blocked-url");
  const warningActiveClass = document.getElementById("warning-active-class");
  const warningReturnHomeBtn = document.getElementById("warning-return-home-btn");

  function showRestrictedWarning(attemptedUrl: string) {
    const code = localStorage.getItem("active_class_code") || "NO CLASS";
    const name = localStorage.getItem("active_class_name") || "";
    const classLabel = name && name !== code ? `${name} (${code})` : code;

    if (warningBlockedUrl) warningBlockedUrl.textContent = attemptedUrl || "Unknown Address";
    if (warningActiveClass) warningActiveClass.textContent = classLabel;
    if (restrictedWarningModal) {
      restrictedWarningModal.style.display = "flex";
    } else {
      alert(`⛔ Access Denied!\n\nThe website '${attemptedUrl}' is NOT on the whitelisted websites list for your class (${classLabel}). Only teacher-approved websites are allowed.`);
    }
  }

  function navigateWebview(wv: any, targetUrl: string) {
    if (!wv || !targetUrl) return;
    try {
      if (typeof wv.loadURL === "function") {
        wv.loadURL(targetUrl).catch(() => {
          try { wv.src = targetUrl; } catch (e) {}
        });
      } else {
        wv.src = targetUrl;
      }
    } catch (err) {
      try {
        wv.src = targetUrl;
      } catch (e) {}
    }
  }

  if (warningReturnHomeBtn) {
    warningReturnHomeBtn.addEventListener("click", () => {
      if (restrictedWarningModal) restrictedWarningModal.style.display = "none";
      const wv = tabs.find(t => t.id === activeTabId)?.webview;
      navigateWebview(wv, getHomeUrl());
      addressBar.value = formatDisplayUrl(getHomeUrl());
    });
  }

  window.addEventListener("click", (e) => {
    if (e.target === restrictedWarningModal) {
      if (restrictedWarningModal) restrictedWarningModal.style.display = "none";
    }
  });

  function isUrlAllowed(targetUrl: string): boolean {
    if (!targetUrl || targetUrl === "home.html" || targetUrl.includes("home.html") || targetUrl.startsWith("file:") || targetUrl === "about:blank") {
      return true;
    }

    const stored = localStorage.getItem("active_class_whitelist");
    if (!stored) return false;

    let allowedList: string[] = [];
    try {
      allowedList = JSON.parse(stored);
    } catch (e) {
      return false;
    }

    if (!Array.isArray(allowedList) || allowedList.length === 0) {
      return false;
    }

    // Inspect redirect trampoline query parameters (e.g. google.com/url?q=...)
    try {
      const parsed = new URL(targetUrl.startsWith("http") ? targetUrl : "https://" + targetUrl);
      const redirectParam = parsed.searchParams.get("q") || parsed.searchParams.get("url") || parsed.searchParams.get("dest") || parsed.searchParams.get("target");
      if (redirectParam && /^https?:\/\//i.test(redirectParam)) {
        if (!isUrlAllowed(redirectParam)) {
          return false;
        }
      }
    } catch (e) {}

    let targetHostname = "";
    try {
      const u = new URL(targetUrl.startsWith("http") ? targetUrl : "https://" + targetUrl);
      targetHostname = u.hostname.toLowerCase();
    } catch (e) {
      return false;
    }

    const cleanTarget = targetHostname.replace(/^www\./, "");
    if (!cleanTarget) return false;

    return allowedList.some(entry => {
      if (!entry) return false;
      let entryHostname = entry.toLowerCase().trim();
      try {
        if (entryHostname.startsWith("http")) {
          entryHostname = new URL(entryHostname).hostname;
        }
      } catch (e) {}

      const cleanEntry = entryHostname.replace(/^www\./, "").replace(/\/+$/, "");
      if (!cleanEntry) return false;
      return cleanTarget === cleanEntry || cleanTarget.endsWith("." + cleanEntry);
    });
  }

  function syncHomePortalData(webview: WebviewTag) {
    if (!webview || typeof webview.executeJavaScript !== "function") return;
    const code = localStorage.getItem("active_class_code") || "";
    const name = localStorage.getItem("active_class_name") || "";
    const whitelistRaw = localStorage.getItem("active_class_whitelist") || "[]";

    webview.executeJavaScript(`
      if (typeof window.setHomePortalData === 'function') {
        window.setHomePortalData(${JSON.stringify(code)}, ${JSON.stringify(name)}, ${whitelistRaw});
      }
    `).catch(() => {});
  }

  function getCleanSiteName(url: string): string {
    try {
      if (!url || url.includes("home.html") || url.startsWith("file:")) {
        return "Class Dashboard";
      }
      const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
      let host = parsed.hostname.toLowerCase().replace(/^www\./, '');

      const friendlyMap: Record<string, string> = {
        "w3schools.com": "W3Schools",
        "wikipedia.org": "Wikipedia",
        "khanacademy.org": "Khan Academy",
        "github.com": "GitHub",
        "stackoverflow.com": "Stack Overflow",
        "geeksforgeeks.org": "GeeksforGeeks",
        "codecademy.com": "Codecademy",
        "coursera.org": "Coursera",
        "edx.org": "edX",
        "scratch.mit.edu": "Scratch",
        "google.com": "Google",
        "youtube.com": "YouTube",
        "developer.mozilla.org": "MDN Web Docs",
        "freecodecamp.org": "freeCodeCamp",
        "nationalgeographic.com": "National Geographic",
        "nasa.gov": "NASA",
        "britannica.com": "Britannica",
        "duolingo.com": "Duolingo",
        "desmos.com": "Desmos",
        "wolframalpha.com": "WolframAlpha",
        "sciencedaily.com": "Science Daily"
      };

      if (friendlyMap[host]) return friendlyMap[host];

      const parts = host.split('.');
      if (parts.length >= 2) {
        const domainName = parts[parts.length - 2];
        return domainName.charAt(0).toUpperCase() + domainName.slice(1);
      }
      return host.charAt(0).toUpperCase() + host.slice(1);
    } catch {
      return "Web Page";
    }
  }

  function getDomainHost(url: string): string {
    try {
      if (!url || url.includes("home.html") || url.startsWith("file:")) return "";
      const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
      return parsed.hostname;
    } catch {
      return "";
    }
  }

  function updateTabFavicon(
    iconSpan: HTMLSpanElement,
    faviconUrl?: string,
    currentUrl?: string
  ) {
    const host = currentUrl ? getDomainHost(currentUrl) : "";
    const s2Url = host ? `https://www.google.com/s2/favicons?domain=${host}&sz=32` : "";
    const targetUrl = (faviconUrl && faviconUrl.trim()) ? faviconUrl.trim() : s2Url;

    if (!targetUrl) {
      iconSpan.className = "tab-icon tab-icon-web";
      iconSpan.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`;
      return;
    }

    iconSpan.className = "tab-icon tab-icon-web";
    let img = iconSpan.querySelector("img.tab-favicon") as HTMLImageElement;
    if (!img) {
      iconSpan.innerHTML = "";
      img = document.createElement("img");
      img.className = "tab-favicon";
      img.alt = "";
      iconSpan.appendChild(img);
    }

    if (img.src !== targetUrl) {
      img.src = targetUrl;
    }

    img.onerror = () => {
      if (s2Url && img.src !== s2Url) {
        img.src = s2Url;
      } else {
        img.remove();
        iconSpan.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`;
      }
    };
  }

  function updateTabIdentity(
    tab: { titleSpan: HTMLSpanElement; iconSpan: HTMLSpanElement },
    url: string,
    pageTitle?: string,
    faviconUrl?: string
  ) {
    const isHome = !url || url === "home.html" || url.includes("home.html") || url.startsWith("file:");
    if (isHome) {
      tab.titleSpan.textContent = "Class Dashboard";
      tab.titleSpan.title = "Class Dashboard";
      tab.iconSpan.className = "tab-icon tab-icon-dashboard";
      tab.iconSpan.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`;
    } else {
      const siteFallbackName = getCleanSiteName(url);
      const cleanTitle = pageTitle?.trim();

      if (cleanTitle && cleanTitle !== "Home Portal" && cleanTitle !== "Class Dashboard" && cleanTitle !== "New Tab") {
        tab.titleSpan.textContent = cleanTitle;
        tab.titleSpan.title = cleanTitle;
      } else if (!tab.titleSpan.textContent || tab.titleSpan.textContent === "Class Dashboard" || tab.titleSpan.textContent === "Home Portal" || tab.titleSpan.textContent === "New Tab") {
        tab.titleSpan.textContent = siteFallbackName;
        tab.titleSpan.title = siteFallbackName;
      }

      updateTabFavicon(tab.iconSpan, faviconUrl, url);
    }
  }

  function addNewTab(url?: string) {
    const targetUrl = (!url || url === "home.html") ? getHomeUrl() : url;
    const tabId = `tab-${Date.now()}`;

    const tabItem = document.createElement("div");
    tabItem.className = "tab-item";
    tabItem.dataset.tabId = tabId;

    const iconSpan = document.createElement("span");
    iconSpan.className = "tab-icon";

    const titleSpan = document.createElement("span");
    titleSpan.className = "tab-title";

    updateTabIdentity({ titleSpan, iconSpan }, targetUrl);

    const closeBtn = document.createElement("button");
    closeBtn.className = "tab-close";
    closeBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    closeBtn.title = "Close tab";
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeTab(tabId);
    });

    tabItem.appendChild(iconSpan);
    tabItem.appendChild(titleSpan);
    tabItem.appendChild(closeBtn);

    const webview = document.createElement("webview");
    webview.setAttribute("src", targetUrl);
    webview.setAttribute("partition", `persist:${tabId}`);
    webview.classList.add("webview");
    webview.dataset.tabId = tabId;

    Object.assign(webview.style, {
      visibility: "hidden",
      pointerEvents: "none",
      zIndex: "0"
    });

    webviewContainer.appendChild(webview);

    const newTab: Tab = { id: tabId, webview, tabElement: tabItem, titleSpan, iconSpan };
    tabs.push(newTab);
    tabsBar.appendChild(tabItem);

    tabItem.addEventListener("click", () => setActiveTab(tabId));

    webview.addEventListener("dom-ready", () => {
      syncHomePortalData(webview);
      const savedZoom = parseFloat(localStorage.getItem("browser_zoom_factor") || "1.0");
      if (savedZoom !== 1.0 && typeof (webview as any).setZoomFactor === "function") {
        try { (webview as any).setZoomFactor(savedZoom); } catch (e) {}
      }
    });

    webview.addEventListener("will-navigate", (e: any) => {
      if (e.url && !isUrlAllowed(e.url)) {
        e.preventDefault();
        showRestrictedWarning(e.url);
        try {
          webview.stop();
        } catch (err) {}
        navigateWebview(webview, getHomeUrl());
      }
    });

    webview.addEventListener("new-window", (e: any) => {
      e.preventDefault();
      if (e.url) {
        if (!isUrlAllowed(e.url)) {
          showRestrictedWarning(e.url);
          try {
            webview.stop();
          } catch (err) {}
          navigateWebview(webview, getHomeUrl());
        } else {
          navigateWebview(webview, e.url);
        }
      }
    });

    webview.addEventListener("page-title-updated", (e: any) => {
      const currentUrl = webview.getURL?.() || webview.getAttribute("src") || "";
      if (currentUrl.includes("home.html") || currentUrl.startsWith("file:")) {
        updateTabIdentity({ titleSpan, iconSpan }, currentUrl);
      } else if (e.title) {
        updateTabIdentity({ titleSpan, iconSpan }, currentUrl, e.title);
      }
    });

    webview.addEventListener("page-favicon-updated", (e: any) => {
      const currentUrl = webview.getURL?.() || webview.getAttribute("src") || "";
      if (!currentUrl.includes("home.html") && !currentUrl.startsWith("file:")) {
        const favicons = e.favicons;
        if (favicons && favicons.length > 0 && favicons[0]) {
          updateTabIdentity({ titleSpan, iconSpan }, currentUrl, undefined, favicons[0]);
        }
      }
    });

    webview.addEventListener("did-start-loading", () => {
      if (loadingBar) {
        loadingBar.className = "loading";
      }
    });

    webview.addEventListener("did-stop-loading", () => {
      if (loadingBar) {
        loadingBar.className = "finish";
        setTimeout(() => {
          if (loadingBar.className === "finish") loadingBar.className = "";
        }, 400);
      }
    });

    webview.addEventListener("did-finish-load", () => {
      const currentUrl = webview.getURL?.() || webview.getAttribute("src") || "";
      const currentTitle = (webview as any).getTitle?.();
      updateTabIdentity({ titleSpan, iconSpan }, currentUrl, currentTitle);
      if (activeTabId === tabId) {
        applyWebviewContent(webview);
        addressBar.value = formatDisplayUrl(currentUrl);
        updateSecurityIcon(currentUrl);
        updateNavButtonsState();
      }
      syncHomePortalData(webview);
    });

    webview.addEventListener("did-fail-load", (e: any) => {
      console.warn("Webview load notice:", e.errorCode, e.errorDescription, e.validatedURL);
      if (loadingBar) loadingBar.className = "";
      // Ignore ERR_ABORTED (-3) on normal HTTP redirects
      if (e.errorCode === -3) return;
    });

    webview.addEventListener("did-navigate", (e: any) => {
      if (e.url && !isUrlAllowed(e.url)) {
        try {
          webview.stop();
        } catch (err) {}
        showRestrictedWarning(e.url);
        navigateWebview(webview, getHomeUrl());
        return;
      }
      const currentTitle = (webview as any).getTitle?.();
      updateTabIdentity({ titleSpan, iconSpan }, e.url, currentTitle);
      if (activeTabId === tabId) {
        addressBar.value = formatDisplayUrl(e.url);
        updateSecurityIcon(e.url);
        applyWebviewContent(webview);
        updateNavButtonsState();
      }
    });

    webview.addEventListener("did-navigate-in-page", (e: any) => {
      if (e.url && !isUrlAllowed(e.url)) {
        try {
          webview.stop();
        } catch (err) {}
        showRestrictedWarning(e.url);
        navigateWebview(webview, getHomeUrl());
        return;
      }
      const currentTitle = (webview as any).getTitle?.();
      updateTabIdentity({ titleSpan, iconSpan }, e.url, currentTitle);
      if (activeTabId === tabId) {
        addressBar.value = formatDisplayUrl(e.url);
        updateSecurityIcon(e.url);
        updateNavButtonsState();
      }
    });

    setActiveTab(tabId);
  }

  // --- Navigation & Search ---
  newTabButton.addEventListener("click", () => addNewTab("home.html"));

  function navigateAddressBar() {
    let raw = (addressBar.value || "").trim();
    if (!raw) return;

    let target = raw;
    if (raw === "home.html" || raw === "home" || raw.endsWith("home.html") || raw.startsWith("file:")) {
      target = getHomeUrl();
    } else if (/^https?:\/\//i.test(raw) || (raw.includes(".") && !raw.includes(" "))) {
      target = /^https?:\/\//i.test(raw) ? raw : "https://" + raw;
    } else {
      // Keyword search among whitelisted websites
      const stored = localStorage.getItem("active_class_whitelist");
      let allowedList: string[] = [];
      try {
        if (stored) allowedList = JSON.parse(stored);
      } catch (e) {}

      const q = raw.toLowerCase();
      const matched = allowedList.filter(site => {
        if (!site) return false;
        const clean = site.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
        return clean.includes(q) || q.includes(clean);
      });

      if (matched.length > 0) {
        target = matched[0].startsWith("http") ? matched[0] : "https://" + matched[0];
      } else {
        // Query does NOT match any approved site: strictly block without public search fallback!
        showRestrictedWarning(raw);
        addressBar.value = formatDisplayUrl(getHomeUrl());
        const wv = tabs.find(t => t.id === activeTabId)?.webview;
        navigateWebview(wv, getHomeUrl());
        return;
      }
    }

    if (!isUrlAllowed(target)) {
      showRestrictedWarning(raw);
      addressBar.value = formatDisplayUrl(getHomeUrl());
      const wv = tabs.find(t => t.id === activeTabId)?.webview;
      navigateWebview(wv, getHomeUrl());
      return;
    }

    const currentTab = tabs.find(t => t.id === activeTabId);
    if (currentTab) {
      updateTabIdentity(currentTab, target);
    }
    const wv = currentTab?.webview;
    if (wv) {
      applyWebviewContent(wv);
      navigateWebview(wv, target);
    }
  }

  goButton.onclick = navigateAddressBar;
  addressBar.addEventListener("keyup", (e) => {
    if (e.key === "Enter") navigateAddressBar();
  });

  function handleGoBack() {
    const wv = getActiveWebview();
    if (!wv) return;

    let canBack = false;
    try {
      canBack = typeof wv.canGoBack === "function" && wv.canGoBack();
    } catch (e) {}

    const currentUrl = wv.getURL?.() || wv.getAttribute("src") || "";
    const isHome = !currentUrl || currentUrl.includes("home.html") || currentUrl.startsWith("file:");

    if (canBack) {
      const prevUrl = currentUrl;
      try {
        wv.goBack();
      } catch (err) {
        console.warn("goBack error:", err);
      }

      setTimeout(() => {
        const afterUrl = wv.getURL?.() || wv.getAttribute("src") || "";
        if (afterUrl === prevUrl && !afterUrl.includes("home.html")) {
          // If wv.goBack did not move history away from external site back to home, fallback to home portal!
          handleGoHome();
        } else {
          updateNavButtonsState();
        }
      }, 350);
    } else if (!isHome) {
      handleGoHome();
    }
  }

  function handleGoForward() {
    const wv = getActiveWebview();
    if (!wv) return;

    let canFwd = false;
    try {
      canFwd = typeof wv.canGoForward === "function" && wv.canGoForward();
    } catch (e) {}

    if (canFwd) {
      try {
        wv.goForward();
      } catch (err) {
        console.warn("goForward error:", err);
      }
    }
  }

  function handleRefresh() {
    const wv = getActiveWebview();
    if (!wv) return;

    refreshButton.classList.add("spinning");
    setTimeout(() => refreshButton.classList.remove("spinning"), 600);

    if (loadingBar) {
      loadingBar.className = "loading";
      setTimeout(() => { if (loadingBar.className === "loading") loadingBar.className = "finish"; }, 400);
      setTimeout(() => { if (loadingBar.className === "finish") loadingBar.className = ""; }, 800);
    }

    const currentUrl = wv.getURL?.() || wv.getAttribute("src") || "";
    const isHome = !currentUrl || currentUrl.includes("home.html") || currentUrl.startsWith("file:");

    if (isHome) {
      syncHomePortalData(wv);
      if (typeof wv.executeJavaScript === "function") {
        wv.executeJavaScript(`window.location.reload();`).catch((err: any) => {
          const msg = (err?.message || "").toLowerCase();
          if (msg.includes("abort") || msg.includes("destroy") || err?.code === -3) {
            return; // Successful reload destroyed execution context
          }
          if (typeof wv.loadURL === "function") {
            wv.loadURL(getHomeUrl()).catch(() => {});
          } else {
            wv.setAttribute("src", getHomeUrl());
          }
        });
      } else if (typeof wv.loadURL === "function") {
        wv.loadURL(getHomeUrl()).catch(() => {});
      } else {
        wv.setAttribute("src", getHomeUrl());
      }
    } else {
      try {
        if (typeof wv.reload === "function") {
          wv.reload();
        } else if (typeof wv.executeJavaScript === "function") {
          wv.executeJavaScript(`window.location.reload();`).catch(() => {});
        }
      } catch (err) {
        console.warn("Refresh error:", err);
      }
    }
  }

  function handleGoHome() {
    const activeTab = getActiveTab();
    const wv = activeTab?.webview || getActiveWebview();
    if (!wv) return;

    const currentUrl = wv.getURL?.() || wv.getAttribute("src") || "";
    const isAlreadyHome = currentUrl && (currentUrl.includes("home.html") || currentUrl.startsWith("file:"));

    const homeUrl = getHomeUrl();
    addressBar.value = "home.html";
    updateSecurityIcon("home.html");

    if (activeTab) {
      updateTabIdentity(activeTab, homeUrl);
    }

    applyWebviewContent(wv);

    if (isAlreadyHome) {
      // If already on home portal, smoothly scroll to top and reset search
      if (typeof wv.executeJavaScript === "function") {
        wv.executeJavaScript(`
          const q = document.getElementById('query');
          if (q) { q.value = ''; q.dispatchEvent(new Event('input')); }
          window.scrollTo({ top: 0, behavior: 'smooth' });
        `).catch(() => {});
      }
      syncHomePortalData(wv);
    } else {
      try {
        wv.loadURL(homeUrl).catch(() => {
          try {
            wv.setAttribute("src", homeUrl);
          } catch (e) {}
        });
      } catch (e) {
        try {
          wv.setAttribute("src", homeUrl);
        } catch (err) {}
      }

      setTimeout(() => {
        syncHomePortalData(wv);
        updateNavButtonsState();
      }, 250);
    }
  }

  backButton.addEventListener("click", handleGoBack);
  backButton.onclick = handleGoBack;
  forwardButton.addEventListener("click", handleGoForward);
  forwardButton.onclick = handleGoForward;
  refreshButton.addEventListener("click", handleRefresh);
  refreshButton.onclick = handleRefresh;
  homeButton.addEventListener("click", handleGoHome);
  homeButton.onclick = handleGoHome;

  // --- Recording Support ---
  async function startRecording() {
    const dirPath = downloadPathInput.value.trim();
    if (!dirPath || /^[A-Z]:\\$/i.test(dirPath)) {
      alert("❌ Invalid directory. Choose a subfolder.");
      return;
    }

    const sources = await ipcRenderer.invoke("get-screen-sources");
    const source = sources[0];

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: source.id,
        },
      } as any,
    });

    mediaRecorder = new MediaRecorder(stream);
    recordedChunks = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      const blob = new Blob(recordedChunks, { type: "video/webm" });
      const buffer = Buffer.from(await blob.arrayBuffer());
      await ipcRenderer.invoke("save-recording", { buffer, downloadPath: dirPath });
      if (recText) recText.textContent = "Record";
      isRecording = false;
      clearInterval(timelapseInterval!);
    };

    mediaRecorder.start();
    if (recText) recText.textContent = "Recording...";
    isRecording = true;

    const interval = parseInt(timelapseIntervalInput?.value || "1") || 1;
    timelapseInterval = setInterval(() => {
      if (mediaRecorder?.state === "recording") {
        mediaRecorder.requestData();
      }
    }, interval * 1000);
  }

  function stopRecording() {
    if (mediaRecorder?.state === "recording") {
      mediaRecorder.stop();
    }
  }

  if (recordToggleButton) {
    recordToggleButton.onclick = () => {
      if (isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    };
  }

  // --- Settings & Classroom Center Dialog ---
  function escapeHtml(str: string): string {
    return (str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  const settingsTabButtons = document.querySelectorAll<HTMLButtonElement>(".settings-tab-btn");
  const settingsPanels = document.querySelectorAll<HTMLElement>(".settings-panel");
  const settingsClassName = document.getElementById("settings-class-name");
  const settingsClassCode = document.getElementById("settings-class-code");
  const settingsWhitelistCount = document.getElementById("settings-whitelist-count");
  const settingsWhitelistChips = document.getElementById("settings-whitelist-chips");
  const settingsSwitchClassBtn = document.getElementById("settings-switch-class-btn");
  const settingsLeaveClassBtn = document.getElementById("settings-leave-class-btn");
  const settingsTestConnBtn = document.getElementById("settings-test-connection-btn");
  const settingsConnFeedback = document.getElementById("settings-connection-feedback");
  const settingsClearCacheBtn = document.getElementById("settings-clear-cache-btn");
  const settingsCacheFeedback = document.getElementById("settings-cache-feedback");
  const settingsCurrentZoomPill = document.getElementById("settings-current-zoom-pill");
  const zoomButtons = document.querySelectorAll<HTMLButtonElement>(".zoom-btn");

  function refreshSettingsData() {
    const code = localStorage.getItem("active_class_code") || "";
    const name = localStorage.getItem("active_class_name") || "";
    let whitelist: string[] = [];
    try {
      whitelist = JSON.parse(localStorage.getItem("active_class_whitelist") || "[]");
    } catch (e) {
      whitelist = [];
    }

    if (settingsClassName) settingsClassName.textContent = name || "Not Enrolled";
    if (settingsClassCode) settingsClassCode.textContent = code || "NONE";
    if (settingsWhitelistCount) {
      settingsWhitelistCount.textContent = `${whitelist.length} Site${whitelist.length === 1 ? '' : 's'} Allowed`;
    }

    if (settingsWhitelistChips) {
      if (whitelist.length === 0) {
        settingsWhitelistChips.innerHTML = `<span style="font-size: 12px; color: #94a3b8; font-style: italic;">No approved sites yet</span>`;
      } else {
        settingsWhitelistChips.innerHTML = whitelist.map(site => 
          `<span class="settings-chip">🌐 ${escapeHtml(site)}</span>`
        ).join("");
      }
    }

    // Set saved download path or fetch default from main process
    const savedDownloadPath = localStorage.getItem("browser_download_path");
    if (downloadPathInput) {
      if (savedDownloadPath) {
        downloadPathInput.value = savedDownloadPath;
      } else {
        ipcRenderer.invoke("get-default-downloads-path").then(defPath => {
          if (defPath && !downloadPathInput.value) {
            downloadPathInput.value = defPath;
            localStorage.setItem("browser_download_path", defPath);
          }
        }).catch(() => {});
      }
    }

    // Zoom pill & active buttons
    const savedZoom = parseFloat(localStorage.getItem("browser_zoom_factor") || "1.0");
    if (settingsCurrentZoomPill) {
      settingsCurrentZoomPill.textContent = `${Math.round(savedZoom * 100)}%`;
    }
    zoomButtons.forEach(btn => {
      const bz = parseFloat(btn.dataset.zoom || "1.0");
      btn.classList.toggle("active", Math.abs(bz - savedZoom) < 0.05);
    });
  }

  // Open Settings Modal (centered with display: flex)
  document.getElementById("settings-button")!.addEventListener("click", () => {
    refreshSettingsData();
    settingsModal.style.display = "flex";
  });

  settingsClose.addEventListener("click", () => {
    settingsModal.style.display = "none";
  });

  window.addEventListener("click", (e) => {
    if (e.target === settingsModal) {
      settingsModal.style.display = "none";
    }
  });

  // Settings Tab Switching
  settingsTabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const targetTab = btn.dataset.tab;
      if (!targetTab) return;

      settingsTabButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      settingsPanels.forEach(panel => {
        panel.classList.toggle("active", panel.id === `settings-panel-${targetTab}`);
      });
    });
  });

  // Switch Class from inside Settings
  if (settingsSwitchClassBtn) {
    settingsSwitchClassBtn.addEventListener("click", () => {
      settingsModal.style.display = "none";
      const actualSwitchBtn = document.getElementById("switch-class-btn");
      if (actualSwitchBtn) {
        actualSwitchBtn.click();
      }
    });
  }

  // Leave / Reset Class Session from inside Settings
  if (settingsLeaveClassBtn) {
    settingsLeaveClassBtn.addEventListener("click", () => {
      const confirmLeave = confirm("Are you sure you want to leave the active class session? You will be prompted to enter a class code.");
      if (confirmLeave) {
        clearClassSession();
        settingsModal.style.display = "none";
        location.reload();
      }
    });
  }

  // Test Firestore Connection
  if (settingsTestConnBtn) {
    settingsTestConnBtn.addEventListener("click", async () => {
      if (settingsConnFeedback) {
        settingsConnFeedback.style.display = "block";
        settingsConnFeedback.style.background = "#eff6ff";
        settingsConnFeedback.style.color = "#2563eb";
        settingsConnFeedback.style.border = "1px solid #bfdbfe";
        settingsConnFeedback.textContent = "Testing Firestore connection...";
      }

      try {
        const startTime = Date.now();
        const result = await ipcRenderer.invoke("firebase-test-connection");
        const duration = Date.now() - startTime;

        if (settingsConnFeedback) {
          if (result.success) {
            settingsConnFeedback.style.background = "#ecfdf5";
            settingsConnFeedback.style.color = "#059669";
            settingsConnFeedback.style.border = "1px solid #a7f3d0";
            settingsConnFeedback.textContent = `✓ Firestore Connected successfully (${duration}ms latency)`;
          } else {
            settingsConnFeedback.style.background = "#fffbeb";
            settingsConnFeedback.style.color = "#d97706";
            settingsConnFeedback.style.border = "1px solid #fde68a";
            settingsConnFeedback.textContent = `⚠️ Offline / Fallback Mode: ${result.message || 'Check connection'}`;
          }
        }
      } catch (err: any) {
        if (settingsConnFeedback) {
          settingsConnFeedback.style.background = "#fffbeb";
          settingsConnFeedback.style.color = "#d97706";
          settingsConnFeedback.style.border = "1px solid #fde68a";
          settingsConnFeedback.textContent = `ℹ️ Offline Fallback active (${err.message || 'Local mode'})`;
        }
      }
    });
  }

  // Choose Download Path
  chooseDownloadPathButton.onclick = async () => {
    const result = await ipcRenderer.invoke("open-directory-dialog");
    if (result.filePaths?.length > 0) {
      const selectedPath = result.filePaths[0];
      downloadPathInput.value = selectedPath;
      localStorage.setItem("browser_download_path", selectedPath);
    }
  };

  // Clear Browsing Cache
  if (settingsClearCacheBtn) {
    settingsClearCacheBtn.addEventListener("click", async () => {
      try {
        settingsClearCacheBtn.textContent = "Clearing...";
        const res = await ipcRenderer.invoke("clear-browser-session-data");
        settingsClearCacheBtn.textContent = "🗑️ Clear Browsing Data & Cache";
        if (settingsCacheFeedback) {
          settingsCacheFeedback.style.display = "block";
          settingsCacheFeedback.style.color = "#059669";
          settingsCacheFeedback.style.background = "#ecfdf5";
          settingsCacheFeedback.style.borderColor = "#a7f3d0";
          settingsCacheFeedback.textContent = res.message || "Cache and session storage cleared.";
          setTimeout(() => {
            if (settingsCacheFeedback) settingsCacheFeedback.style.display = "none";
          }, 4000);
        }
      } catch (err: any) {
        settingsClearCacheBtn.textContent = "🗑️ Clear Browsing Data & Cache";
        if (settingsCacheFeedback) {
          settingsCacheFeedback.style.display = "block";
          settingsCacheFeedback.style.color = "#dc2626";
          settingsCacheFeedback.style.background = "#fef2f2";
          settingsCacheFeedback.style.borderColor = "#fecaca";
          settingsCacheFeedback.textContent = err.message || "Failed to clear cache.";
        }
      }
    });
  }

  // Zoom factor controller
  function applyZoomToAllWebviews(factor: number) {
    localStorage.setItem("browser_zoom_factor", factor.toString());
    if (settingsCurrentZoomPill) {
      settingsCurrentZoomPill.textContent = `${Math.round(factor * 100)}%`;
    }
    tabs.forEach(tab => {
      try {
        if (tab.webview && typeof (tab.webview as any).setZoomFactor === "function") {
          (tab.webview as any).setZoomFactor(factor);
        }
      } catch (e) {}
    });
  }

  zoomButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const factor = parseFloat(btn.dataset.zoom || "1.0");
      zoomButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      applyZoomToAllWebviews(factor);
    });
  });

  // --- Class Code Access Portal Logic ---
  const classGateModal = document.getElementById("class-gate-modal");
  const classGateStatus = document.getElementById("class-gate-status");
  const classCodeInput = document.getElementById("class-code-input") as HTMLInputElement;
  const classCodeSubmit = document.getElementById("class-code-submit");
  const classCodeDemo = document.getElementById("class-code-demo");
  const classInfoBadge = document.getElementById("class-info-badge");
  const activeClassText = document.getElementById("active-class-text");
  const switchClassBtn = document.getElementById("switch-class-btn");
  const classGateClose = document.getElementById("class-gate-close");
  const classGateCancelBtn = document.getElementById("class-gate-cancel-btn");
  const previousClassBox = document.getElementById("previous-class-box");
  const previousClassLabel = document.getElementById("previous-class-label");
  const resumePreviousClassBtn = document.getElementById("resume-previous-class-btn");

  function setGateStatus(msg: string, type: "info" | "error" | "success") {
    if (!classGateStatus) return;
    classGateStatus.style.display = "block";
    if (type === "error") {
      classGateStatus.style.background = "#f8d7da";
      classGateStatus.style.color = "#721c24";
      classGateStatus.style.border = "1px solid #f5c6cb";
    } else if (type === "success") {
      classGateStatus.style.background = "#d4edda";
      classGateStatus.style.color = "#155724";
      classGateStatus.style.border = "1px solid #c3e6cb";
    } else {
      classGateStatus.style.background = "#cce5ff";
      classGateStatus.style.color = "#004085";
      classGateStatus.style.border = "1px solid #b8daff";
    }
    classGateStatus.textContent = msg;
  }

  function getHomeUrl(): string {
    const code = localStorage.getItem("active_class_code") || "";
    const name = localStorage.getItem("active_class_name") || "";
    const whitelist = localStorage.getItem("active_class_whitelist") || "[]";
    const relUrl = !code ? "home.html" : `home.html?code=${encodeURIComponent(code)}&name=${encodeURIComponent(name)}&whitelist=${encodeURIComponent(whitelist)}`;
    try {
      return new URL(relUrl, window.location.href).href;
    } catch (e) {
      return relUrl;
    }
  }

  function activateClassSession(code: string, name: string, whitelistedWebsites?: string[]) {
    localStorage.setItem("active_class_code", code);
    localStorage.setItem("active_class_name", name);
    localStorage.setItem("previous_class_code", code);
    localStorage.setItem("previous_class_name", name);
    const listToStore = (whitelistedWebsites && Array.isArray(whitelistedWebsites)) ? whitelistedWebsites : [];
    localStorage.setItem("active_class_whitelist", JSON.stringify(listToStore));
    localStorage.setItem("previous_class_whitelist", JSON.stringify(listToStore));

    if (classGateModal) classGateModal.style.display = "none";
    if (classInfoBadge) classInfoBadge.style.display = "flex";
    if (activeClassText) activeClassText.textContent = `Class: ${name} (${code})`;

    // Close all old open tabs to completely remove past Home Portal & site webviews
    while (tabs.length > 0) {
      const tabToRemove = tabs.pop()!;
      if (tabToRemove.webview.parentNode) {
        tabToRemove.webview.parentNode.removeChild(tabToRemove.webview);
      }
      if (tabToRemove.tabElement.parentNode) {
        tabToRemove.tabElement.parentNode.removeChild(tabToRemove.tabElement);
      }
    }
    activeTabId = null;

    // Open a fresh new Home Portal tab loaded with the new class code & whitelist
    const homeUrl = getHomeUrl();
    addNewTab(homeUrl);
  }

  // --- Session Management ---
  function clearClassSession() {
    localStorage.removeItem("active_class_code");
    localStorage.removeItem("active_class_name");
    localStorage.removeItem("active_class_whitelist");
    localStorage.removeItem("previous_class_code");
    localStorage.removeItem("previous_class_name");
    localStorage.removeItem("previous_class_whitelist");
  }

  // Always require fresh class code login when browser starts up
  clearClassSession();
  updatePreviousClassBox();
  if (classGateModal) classGateModal.style.display = "flex";
  if (classGateClose) classGateClose.style.display = "none";
  if (classGateCancelBtn) classGateCancelBtn.style.display = "none";
  if (classCodeInput) {
    classCodeInput.value = "";
    setTimeout(() => classCodeInput.focus(), 150);
  }

  async function submitClassCode(codeToVerify?: string) {
    const code = (codeToVerify || classCodeInput?.value || "").trim();
    if (!code) {
      setGateStatus("Please enter a valid Class Code.", "error");
      return;
    }

    setGateStatus("🔍 Verifying Class Code in Firebase Firestore...", "info");
    try {
      const res = await ipcRenderer.invoke("firebase-verify-class-code", { classCode: code });
      if (res.success && res.found) {
        setGateStatus(res.message, "success");
        setTimeout(() => {
          activateClassSession(
            code.toUpperCase(), 
            res.classData?.name || code.toUpperCase(),
            res.classData?.whitelistedWebsites
          );
        }, 600);
      } else {
        setGateStatus(res.message || `❌ Access Denied! Class Code '${code.toUpperCase()}' is NOT present in Firebase!`, "error");
      }
    } catch (err: any) {
      setGateStatus(`❌ Error verifying class code in Firebase: ${err?.message || err}`, "error");
    }
  }

  classCodeSubmit?.addEventListener("click", () => submitClassCode());
  classCodeInput?.addEventListener("keyup", (e) => {
    if (e.key === "Enter") submitClassCode();
  });

  classCodeDemo?.addEventListener("click", (e) => {
    e.preventDefault();
    if (classCodeInput) classCodeInput.value = "EDU101";
    submitClassCode("EDU101");
  });

  function updatePreviousClassBox() {
    const prevCode = localStorage.getItem("previous_class_code") || localStorage.getItem("active_class_code");
    const prevName = localStorage.getItem("previous_class_name") || localStorage.getItem("active_class_name") || prevCode;
    if (prevCode && previousClassBox && previousClassLabel) {
      previousClassLabel.textContent = `${prevName} (${prevCode})`;
      previousClassBox.style.display = "block";
    } else if (previousClassBox) {
      previousClassBox.style.display = "none";
    }
  }

  async function resumePreviousClass() {
    const prevCode = localStorage.getItem("previous_class_code") || localStorage.getItem("active_class_code");
    const prevName = localStorage.getItem("previous_class_name") || localStorage.getItem("active_class_name") || prevCode;
    const prevWhitelist = localStorage.getItem("previous_class_whitelist") || localStorage.getItem("active_class_whitelist") || "[]";

    if (!prevCode) {
      if (classGateModal) classGateModal.style.display = "none";
      return;
    }

    // If tabs already exist (mistakenly tapped Switch), restore session instantly without losing tabs
    if (tabs.length > 0) {
      localStorage.setItem("active_class_code", prevCode);
      if (prevName) localStorage.setItem("active_class_name", prevName);
      localStorage.setItem("active_class_whitelist", prevWhitelist);

      if (classGateModal) classGateModal.style.display = "none";
      if (classInfoBadge) classInfoBadge.style.display = "flex";
      if (activeClassText) activeClassText.textContent = `Class: ${prevName} (${prevCode})`;
      return;
    }

    // If starting fresh or tabs empty, verify with Firebase and activate
    submitClassCode(prevCode);
  }

  classGateClose?.addEventListener("click", () => resumePreviousClass());
  classGateCancelBtn?.addEventListener("click", () => resumePreviousClass());
  resumePreviousClassBtn?.addEventListener("click", () => resumePreviousClass());

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && classGateModal && classGateModal.style.display === "flex") {
      const prevCode = localStorage.getItem("previous_class_code") || localStorage.getItem("active_class_code");
      if (prevCode) {
        resumePreviousClass();
      }
    }
  });

  switchClassBtn?.addEventListener("click", () => {
    const currentCode = localStorage.getItem("active_class_code");
    const currentName = localStorage.getItem("active_class_name") || currentCode;
    const currentWhitelist = localStorage.getItem("active_class_whitelist") || "[]";

    // Remember the current class so user can cancel/resume if tapped by mistake
    if (currentCode) {
      localStorage.setItem("previous_class_code", currentCode);
      if (currentName) localStorage.setItem("previous_class_name", currentName);
      localStorage.setItem("previous_class_whitelist", currentWhitelist);

      if (previousClassBox && previousClassLabel) {
        previousClassLabel.textContent = `${currentName} (${currentCode})`;
        previousClassBox.style.display = "block";
      }
      if (classGateClose) classGateClose.style.display = "flex";
      if (classGateCancelBtn) classGateCancelBtn.style.display = "block";
    } else {
      updatePreviousClassBox();
      if (classGateClose) classGateClose.style.display = "none";
      if (classGateCancelBtn) classGateCancelBtn.style.display = "none";
    }

    if (classGateModal) classGateModal.style.display = "flex";
    if (classCodeInput) {
      classCodeInput.value = "";
      classCodeInput.focus();
    }
    if (classGateStatus) classGateStatus.style.display = "none";
  });

  // --- Close Browser & Exit Handlers ---
  async function closeBrowser() {
    clearClassSession();
    try {
      await ipcRenderer.invoke("close-app");
    } catch (err) {
      console.warn("IPC close-app failed, invoking window.close() fallback:", err);
      window.close();
    }
  }

  // Clear active class code session whenever the browser window closes or unloads
  window.addEventListener("beforeunload", () => {
    clearClassSession();
  });
  window.addEventListener("unload", () => {
    clearClassSession();
  });

  const closeBrowserBtn = document.getElementById("close-browser-button");
  if (closeBrowserBtn) {
    closeBrowserBtn.addEventListener("click", () => {
      closeBrowser();
    });
  }

  const gateExitBtn = document.getElementById("gate-exit-browser-btn");
  if (gateExitBtn) {
    gateExitBtn.addEventListener("click", () => {
      closeBrowser();
    });
  }

  const settingsCloseAppBtn = document.getElementById("settings-close-app-btn");
  if (settingsCloseAppBtn) {
    settingsCloseAppBtn.addEventListener("click", () => {
      closeBrowser();
    });
  }
});
