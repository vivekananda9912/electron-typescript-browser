"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const firebase_1 = require("./src/firebase");
// Ignore certificate date errors (essential for educational webview and client clock skew)
electron_1.app.commandLine.appendSwitch("ignore-certificate-errors");
electron_1.app.commandLine.appendSwitch("allow-insecure-localhost", "true");
let mainWindow;
electron_1.app.whenReady().then(async () => {
    console.log("Creating main window...");
    // Handle certificate errors gracefully for all webContents
    electron_1.app.on("certificate-error", (event, webContents, url, error, certificate, callback) => {
        event.preventDefault();
        callback(true);
    });
    electron_1.session.defaultSession.setCertificateVerifyProc((request, callback) => {
        callback(0); // 0 = valid certificate
    });
    // Auto-initialize Firebase if credentials exist in .env
    const firebaseInitResult = (0, firebase_1.initializeFirebase)();
    if (firebaseInitResult.success) {
        console.log("🔥 Firebase initialized on startup:", firebaseInitResult.message);
        await (0, firebase_1.ensureDefaultFirebaseClasses)();
    }
    else {
        console.log("ℹ️ Firebase status on startup:", firebaseInitResult.message);
    }
    // Resolve the preload script path
    const preloadPath = path.join(__dirname, "../build/preload.js");
    console.log("Preload path:", preloadPath);
    // Create the main window
    mainWindow = new electron_1.BrowserWindow({
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
    electron_1.session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        console.log("Permission requested:", permission);
        if (permission === "media" || permission === "display-capture") {
            callback(true);
        }
        else {
            callback(false);
        }
    });
    // Intercept all created webContents (including webviews) to prevent unmonitored popups
    electron_1.app.on("web-contents-created", (event, contents) => {
        contents.setWindowOpenHandler(({ url }) => {
            // Prevent popups from escaping sandbox/whitelist into rogue windows
            // By denying here, the <webview> handles approved navigation in preload.ts
            console.log("Blocked window open popup to:", url);
            return { action: "deny" };
        });
    });
    // Set application menu
    const menu = require("./src/menu");
    const template = menu.createTemplate(electron_1.app.name);
    const builtMenu = electron_1.Menu.buildFromTemplate(template);
    electron_1.Menu.setApplicationMenu(builtMenu);
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
    electron_1.ipcMain.handle("save-recording", async (event, { buffer, downloadPath }) => {
        console.log("Saving recording...", downloadPath);
        const fileName = `recording_${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
        const defaultPath = electron_1.app.getPath("downloads");
        const tempPath = electron_1.app.getPath("temp");
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
        }
        catch (err) {
            console.error("❌ Failed to save to original path, trying temp path...", err);
            try {
                finalPath = path.join(tempPath, fileName);
                fs.writeFileSync(finalPath, buffer);
                console.log(`✅ Saved to fallback temp path: ${finalPath}`);
            }
            catch (fallbackErr) {
                console.error("❌ Fallback save also failed:", fallbackErr);
                throw fallbackErr;
            }
        }
    });
    // Handle open folder dialog
    electron_1.ipcMain.handle("open-directory-dialog", async () => {
        console.log("Opening directory dialog...");
        const result = await electron_1.dialog.showOpenDialog(mainWindow, {
            properties: ["openDirectory"],
        });
        return result;
    });
    // Get default downloads path
    electron_1.ipcMain.handle("get-default-downloads-path", async () => {
        return electron_1.app.getPath("downloads");
    });
    // Clear browser session data
    electron_1.ipcMain.handle("clear-browser-session-data", async () => {
        try {
            await electron_1.session.defaultSession.clearCache();
            await electron_1.session.defaultSession.clearStorageData({
                storages: ["cookies", "filesystem", "indexdb", "localstorage", "shadercache", "websql", "serviceworkers", "cachestorage"]
            });
            return { success: true, message: "Browsing cache and session data cleared successfully." };
        }
        catch (err) {
            console.error("Failed to clear session data:", err);
            return { success: false, message: err.message || "Failed to clear data" };
        }
    });
    // Get screen sources for screen recording
    electron_1.ipcMain.handle("get-screen-sources", async () => {
        console.log("Fetching screen sources...");
        const sources = await electron_1.desktopCapturer.getSources({ types: ["screen"] });
        return sources;
    });
    // Firebase Firestore IPC Handlers
    electron_1.ipcMain.handle("firebase-init", async (event, config) => {
        console.log("Initializing Firebase from IPC...");
        return (0, firebase_1.initializeFirebase)(config);
    });
    electron_1.ipcMain.handle("firebase-get-status", async () => {
        return (0, firebase_1.getFirebaseConfigStatus)();
    });
    electron_1.ipcMain.handle("firebase-test-connection", async () => {
        console.log("Testing Firestore connection...");
        return await (0, firebase_1.testFirestoreConnection)();
    });
    electron_1.ipcMain.handle("firebase-add-document", async (event, { collectionName, data }) => {
        console.log(`Adding document to Firestore collection '${collectionName}'...`);
        return await (0, firebase_1.addFirestoreDocument)(collectionName, data);
    });
    electron_1.ipcMain.handle("firebase-get-documents", async (event, { collectionName, maxItems }) => {
        console.log(`Fetching documents from Firestore collection '${collectionName}'...`);
        return await (0, firebase_1.getFirestoreDocuments)(collectionName, maxItems);
    });
    electron_1.ipcMain.handle("firebase-verify-class-code", async (event, { classCode }) => {
        console.log(`Verifying class code '${classCode}' in Firestore...`);
        return await (0, firebase_1.verifyClassCode)(classCode);
    });
    // Close application IPC handler
    electron_1.ipcMain.handle("close-app", async () => {
        console.log("Closing application from renderer request...");
        try {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.close();
            }
        }
        catch (err) {
            console.error("Error closing mainWindow:", err);
        }
        electron_1.app.quit();
    });
    // Minimize window IPC handler
    electron_1.ipcMain.handle("minimize-app", async () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.minimize();
        }
    });
    // Toggle fullscreen IPC handler
    electron_1.ipcMain.handle("toggle-fullscreen", async () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.setFullScreen(!mainWindow.isFullScreen());
        }
    });
});
electron_1.app.on("window-all-closed", () => {
    electron_1.app.quit();
});
