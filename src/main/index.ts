import { BrowserWindow, app, ipcMain } from "electron";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { logError, logInfo } from "./logging.js";

const execFileAsync = promisify(execFile);

type AuthStatus = {
  authenticated: boolean;
  username?: string;
  message: string;
};

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
      preload: join(__dirname, "preload.js"),
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

    ipcMain.handle("auth:status", async (): Promise<AuthStatus> => {
      try {
        const { stdout } = await execFileAsync("gh", [
          "auth",
          "status",
          "-h",
          "github.com"
        ]);
        const match = stdout.match(/Logged in to .* as ([^\s]+)\./i);
        return {
          authenticated: true,
          username: match?.[1],
          message: "Authenticated"
        };
      } catch (error) {
        const details =
          error instanceof Error
            ? error.message
            : "Unable to check auth status.";
        return {
          authenticated: false,
          message: `Run \`gh auth login\` to authenticate. (${details})`
        };
      }
    });

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

    app.on("will-quit", () => {
      logInfo("App will quit");
    });
  } catch (error) {
    logError("Main process failed to start", {
      error: error instanceof Error ? error.message : String(error)
    });
    app.exit(1);
  }
};

void main();
