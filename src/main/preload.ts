import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("beacon", {
  version: "0.1"
});
