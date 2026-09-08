import { BrowserView, BrowserWindow } from "electron";

export function createBrowserView(mainWindow: BrowserWindow): BrowserView {
  const view = new BrowserView();

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
