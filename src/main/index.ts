import { BrowserWindow, app, ipcMain } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { logError, logInfo } from "./logging.js";
import { registerIpcHandlers } from "./ipc-handlers.js";
import { createSuggestionService } from "./suggestion-service.js";
import { Storage } from "./storage.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const devServerUrl = process.env.VITE_DEV_SERVER_URL;


const createMainWindow = (): BrowserWindow => {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    backgroundColor: "#efe9e1",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  window.once("ready-to-show", () => {
    window.show();
  });

  if (devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return window;
};

const main = async (): Promise<void> => {
  logInfo("Main process starting");

  try {
    await app.whenReady();
    logInfo("Electron app ready");

    const storage = new Storage({ baseDir: app.getPath("userData") });
    const suggestionService = createSuggestionService({ storage });

    app.on("will-quit", () => {
      suggestionService.stopOnQuit();
      storage.close();
      logInfo("App will quit");
    });

    registerIpcHandlers(ipcMain, { storage, suggestionService });

    createMainWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });

    app.on("window-all-closed", () => {
      logInfo("All windows closed");
      app.quit();
    });
  } catch (error) {
    logError("Main process failed to start", {
      error: error instanceof Error ? error.message : String(error)
    });
    app.exit(1);
  }
};

void main();
