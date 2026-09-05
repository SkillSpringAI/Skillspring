import { startEvaluationServer } from "./http-server.js";

startEvaluationServer().then(server => {
  console.log("SkillSpring evaluation server: http://127.0.0.1:8787/v1/evaluate");
  const stop = () => { server.close(); server.closeAllConnections(); };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}).catch(() => {
  console.error("Could not start the local evaluation server.");
  process.exitCode = 1;
});
