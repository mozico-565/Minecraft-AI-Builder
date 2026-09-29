import { serverAssistantPlanner, serverPlanner } from "./planner/server.js";
import { startApp } from "./runtime/app.js";

startApp(serverPlanner, serverAssistantPlanner);
