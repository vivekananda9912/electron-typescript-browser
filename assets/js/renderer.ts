window.addEventListener("DOMContentLoaded", () => {
  const controls = document.getElementById("controls")!;
  const addressBar = document.getElementById("address-bar") as HTMLInputElement;
  const goButton = document.getElementById("go")!;
  const backButton = document.getElementById("back")!;
  const forwardButton = document.getElementById("forward")!;
  const refreshButton = document.getElementById("refresh")!;
  const homeButton = document.getElementById("home")!;
  const newTabButton = document.getElementById("new-tab")!;
  const tabsContainer = document.getElementById("tabs")!;
  const webviewContainer = document.getElementById("webview-container")!;

  let tabCount = 0;
  let activeTabId: string | null = null;

  interface Tab {
    id: string;
    webview: any;
    tabElement: HTMLButtonElement;
  }

  const tabs: { [key: string]: Tab } = {};

  function createTab(url: string) {
    const tabId = `tab-${++tabCount}`;

    const webview = document.createElement("webview");
    webview.setAttribute("src", url);
    webview.setAttribute("id", tabId);
    webview.setAttribute("autosize", "on");
    webview.style.width = "100%";
    webview.style.height = `calc(100vh - ${controls.offsetHeight + 30}px)`;
    webview.style.display = "none";
    webviewContainer.appendChild(webview);

    const tabButton = document.createElement("button");
    tabButton.innerText = `Tab ${tabCount}`;
    tabButton.onclick = () => switchToTab(tabId);
    tabsContainer.appendChild(tabButton);

    tabs[tabId] = {
      id: tabId,
      webview,
      tabElement: tabButton,
    };

    switchToTab(tabId);
  }

  function switchToTab(tabId: string) {
    if (activeTabId && tabs[activeTabId]) {
      tabs[activeTabId].webview.style.display = "none";
      tabs[activeTabId].tabElement.style.fontWeight = "normal";
    }

    activeTabId = tabId;
    const currentTab = tabs[tabId];
    currentTab.webview.style.display = "block";
    currentTab.tabElement.style.fontWeight = "bold";
    addressBar.value = currentTab.webview.getURL() || "";
  }

  backButton.onclick = () => {
    const webview = tabs[activeTabId!]?.webview;
    if (webview?.canGoBack()) webview.goBack();
  };

  forwardButton.onclick = () => {
    const webview = tabs[activeTabId!]?.webview;
    if (webview?.canGoForward()) webview.goForward();
  };

  refreshButton.onclick = () => {
    const webview = tabs[activeTabId!]?.webview;
    webview?.reload();
  };

  homeButton.onclick = () => {
    const webview = tabs[activeTabId!]?.webview;
    webview?.loadURL("home.html");
  };

  goButton.onclick = () => {
    let url = addressBar.value.trim();
    if (!/^https?:\/\//i.test(url)) {
      url = "https://" + url;
    }
    const webview = tabs[activeTabId!]?.webview;
    webview?.loadURL(url);
  };

  newTabButton.onclick = () => {
    console.log("➕ Add Tab Clicked");
    createTab("https://www.w3schools.com");
  };

  window.addEventListener("resize", () => {
    Object.values(tabs).forEach((tab) => {
      tab.webview.style.height = `calc(100vh - ${controls.offsetHeight + 30}px)`;
    });
  });

  // Open the first tab
  createTab("home.html");
});
