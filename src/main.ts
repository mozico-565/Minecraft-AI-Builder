import { localAssistantPlanner, localPlanner } from "./planner/local.js";
import { startApp } from "./runtime/app.js";

startApp(localPlanner, localAssistantPlanner);
