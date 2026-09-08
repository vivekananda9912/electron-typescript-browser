import { app, Menu, BrowserWindow, ipcMain, dialog, session, desktopCapturer } from "electron";
import * as fs from "fs";
import * as path from "path";
import { 
  initializeFirebase, 
  getFirebaseConfigStatus, 
  testFirestoreConnection, 
  addFirestoreDocument, 
  getFirestoreDocuments, 
  verifyClassCode,
  createSampleClassCode,
  ensureDefaultFirebaseClasses,
  FirebaseConfig 
} from "./src/firebase";

// Ignore certificate date errors (essential for educational webview and client clock skew)
app.commandLine.appendSwitch("ignore-certificate-errors");
app.commandLine.appendSwitch("allow-insecure-localhost", "true");

let mainWindow: BrowserWindow;

app.whenReady().then(async () => {
  console.log("Creating main window...");

  // Handle certificate errors gracefully for all webContents
  app.on("certificate-error", (event, webContents, url, error, certificate, callback) => {
    event.preventDefault();
    callback(true);
  });

  session.defaultSession.setCertificateVerifyProc((request, callback) => {
    callback(0); // 0 = valid certificate
  });

  // Auto-initialize Firebase if credentials exist in .env
  const firebaseInitResult = initializeFirebase();
  if (firebaseInitResult.success) {
    console.log("🔥 Firebase initialized on startup:", firebaseInitResult.message);
    await ensureDefaultFirebaseClasses();
  } else {
    console.log("ℹ️ Firebase status on startup:", firebaseInitResult.message);
  }

  // Resolve the preload script path
  const preloadPath = path.join(__dirname, "../build/preload.js");
  console.log("Preload path:", preloadPath);

  // Create the main window
  mainWindow = new BrowserWindow({
    fullscreen: true,
    show: false, // show later after ready-to-show
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
    },
  });

  console.log("WebPreferences configured:", {
    preload: preloadPath,
    nodeIntegration: false,
    contextIsolation: true,
    webviewTag: true,
  });

  // Load HTML
  mainWindow.loadFile("index.html").then(() => {
    console.log("Main window HTML loaded");
  }).catch((err) => {
    console.error("Failed to load HTML:", err);
  });

  // Handle preload failure
  mainWindow.webContents.on("did-fail-load", () => {
    console.error("Failed to load preload script at:", preloadPath);
  });

  // Enable screen/media permissions
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    console.log("Permission requested:", permission);
    if (permission === "media" || permission === "display-capture") {
      callback(true);
    } else {
      callback(false);
    }
  });

  // Intercept all created webContents (including webviews) to prevent unmonitored popups
  app.on("web-contents-created", (event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      // Prevent popups from escaping sandbox/whitelist into rogue windows
      // By denying here, the <webview> handles approved navigation in preload.ts
      console.log("Blocked window open popup to:", url);
      return { action: "deny" };
    });
  });

  // Set application menu
  const menu = require("./src/menu");
  const template = menu.createTemplate(app.name);
  const builtMenu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(builtMenu);

  // Load print support
  require("./src/print");

  // Show window once ready
  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
    mainWindow.webContents.executeJavaScript(`
      window.addEventListener('load', () => {
        const controls = document.getElementById('controls');
        const tabs = document.getElementById('tabs');
        const webviewContainer = document.getElementById('webview-container');
        if (controls && tabs && webviewContainer) {
          controls.style.display = 'flex';
          tabs.style.display = 'flex';
          const controlsHeight = controls.offsetHeight || 0;
          const tabsHeight = tabs.offsetHeight || 0;
          webviewContainer.style.height = \`calc(100vh - \${controlsHeight + tabsHeight}px)\`;
          console.log('Window size:', window.innerWidth, window.innerHeight);
        } else {
          console.error('DOM elements not found during initial setup');
        }
      });
    `).then(() => {
      console.log("Initial UI setup completed");
    }).catch((err) => {
      console.error("Initial UI setup failed:", err.message);
    });
  });

  // F11 for full-screen toggle
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.key === "F11" && input.type === "keyDown") {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
      console.log("Full-screen toggled:", mainWindow.isFullScreen(), "Size:", mainWindow.getSize());
      mainWindow.webContents.executeJavaScript(`
        window.addEventListener('load', () => {
          const controls = document.getElementById('controls');
          const tabs = document.getElementById('tabs');
          const webviewContainer = document.getElementById('webview-container');
          if (controls && tabs && webviewContainer) {
            const controlsHeight = controls.offsetHeight || 0;
            const tabsHeight = tabs.offsetHeight || 0;
            webviewContainer.style.height = \`calc(100vh - \${controlsHeight + tabsHeight}px)\`;
            window.dispatchEvent(new Event('resize'));
          } else {
            console.error('DOM elements not found during F11 toggle');
          }
        }, { once: true });
      `).catch((err) => {
        console.error("F11 toggle script failed:", err.message);
      });
      event.preventDefault();
    }
  });

  // Resize handler to adjust webview height
  mainWindow.on("resize", () => {
    console.log("Window resized:", mainWindow.getSize());
    mainWindow.webContents.executeJavaScript(`
      window.addEventListener('load', () => {
        const controls = document.getElementById('controls');
        const tabs = document.getElementById('tabs');
        const webviewContainer = document.getElementById('webview-container');
        if (controls && tabs && webviewContainer) {
          const controlsHeight = controls.offsetHeight || 0;
          const tabsHeight = tabs.offsetHeight || 0;
          webviewContainer.style.height = \`calc(100vh - \${controlsHeight + tabsHeight}px)\`;
          window.dispatchEvent(new Event('resize'));
        } else {
          console.error('DOM elements not found during resize');
        }
      }, { once: true });
    `).catch((err) => {
      console.error("Resize script failed:", err.message);
    });
  });

  // Handle recording save
  ipcMain.handle("save-recording", async (event, { buffer, downloadPath }) => {
    console.log("Saving recording...", downloadPath);
    const fileName = `recording_${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
    const defaultPath = app.getPath("downloads");
    const tempPath = app.getPath("temp");

    let finalPath = path.join(downloadPath || defaultPath, fileName);
    const dir = path.dirname(finalPath);

    console.log("Checking directory:", dir);
    try {
      if (!fs.existsSync(dir)) {
        console.warn(`Directory ${dir} does not exist. Creating...`);
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(finalPath, buffer);
      console.log(`✅ Recording saved to: ${finalPath}`);
    } catch (err) {
      console.error("❌ Failed to save to original path, trying temp path...", err);
      try {
        finalPath = path.join(tempPath, fileName);
        fs.writeFileSync(finalPath, buffer);
        console.log(`✅ Saved to fallback temp path: ${finalPath}`);
      } catch (fallbackErr) {
        console.error("❌ Fallback save also failed:", fallbackErr);
        throw fallbackErr;
      }
    }
  });

  // Handle open folder dialog
  ipcMain.handle("open-directory-dialog", async () => {
    console.log("Opening directory dialog...");
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
    });
    return result;
  });

  // Get default downloads path
  ipcMain.handle("get-default-downloads-path", async () => {
    return app.getPath("downloads");
  });

  // Clear browser session data
  ipcMain.handle("clear-browser-session-data", async () => {
    try {
      await session.defaultSession.clearCache();
      await session.defaultSession.clearStorageData({
        storages: ["cookies", "filesystem", "indexdb", "localstorage", "shadercache", "websql", "serviceworkers", "cachestorage"]
      });
      return { success: true, message: "Browsing cache and session data cleared successfully." };
    } catch (err: any) {
      console.error("Failed to clear session data:", err);
      return { success: false, message: err.message || "Failed to clear data" };
    }
  });

  // Get screen sources for screen recording
  ipcMain.handle("get-screen-sources", async () => {
    console.log("Fetching screen sources...");
    const sources = await desktopCapturer.getSources({ types: ["screen"] });
    return sources;
  });

  // Firebase Firestore IPC Handlers
  ipcMain.handle("firebase-init", async (event, config: FirebaseConfig) => {
    console.log("Initializing Firebase from IPC...");
    return initializeFirebase(config);
  });

  ipcMain.handle("firebase-get-status", async () => {
    return getFirebaseConfigStatus();
  });

  ipcMain.handle("firebase-test-connection", async () => {
    console.log("Testing Firestore connection...");
    return await testFirestoreConnection();
  });

  ipcMain.handle("firebase-add-document", async (event, { collectionName, data }) => {
    console.log(`Adding document to Firestore collection '${collectionName}'...`);
    return await addFirestoreDocument(collectionName, data);
  });

  ipcMain.handle("firebase-get-documents", async (event, { collectionName, maxItems }) => {
    console.log(`Fetching documents from Firestore collection '${collectionName}'...`);
    return await getFirestoreDocuments(collectionName, maxItems);
  });

  ipcMain.handle("firebase-verify-class-code", async (event, { classCode }) => {
    console.log(`Verifying class code '${classCode}' in Firestore...`);
    return await verifyClassCode(classCode);
  });

  // Close application IPC handler
  ipcMain.handle("close-app", async () => {
    console.log("Closing application from renderer request...");
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.close();
      }
    } catch (err) {
      console.error("Error closing mainWindow:", err);
    }
    app.quit();
  });

  // Minimize window IPC handler
  ipcMain.handle("minimize-app", async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.minimize();
    }
  });

  // Toggle fullscreen IPC handler
  ipcMain.handle("toggle-fullscreen", async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    }
  });
});

app.on("window-all-closed", () => {
  app.quit();
});