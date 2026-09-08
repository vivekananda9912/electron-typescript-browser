"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBrowserView = createBrowserView;
const electron_1 = require("electron");
function createBrowserView(mainWindow) {
    const view = new electron_1.BrowserView();
    mainWindow.setBrowserView(view);
    const topBarHeight = 90; // Adjust based on #controls + #tabs
    const resizeView = () => {
        const bounds = mainWindow.getContentBounds();
        view.setBounds({
            x: 0,
            y: topBarHeight,
            width: bounds.width,
            height: bounds.height - topBarHeight,
        });
    };
    resizeView();
    view.setAutoResize({ width: true, height: true });
    view.webContents.loadURL("home.html");
    mainWindow.on("resize", resizeView);
    return view;
}
