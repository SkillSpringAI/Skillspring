import { startWorkbenchServer } from "./workbench-server.js";

startWorkbenchServer().then(server => {
  console.log("SkillSpring review workbench: http://127.0.0.1:8788");
  console.log("Synthetic session only. Test signers and a fixed simulation clock; restart starts a new session.");
  const stop = () => { server.close(); server.closeAllConnections(); };
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
}).catch(() => { console.error("Could not start the local review workbench."); process.exitCode = 1; });
