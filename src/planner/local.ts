import type { Planner } from "./types.js";
import type { AssistantPlanner } from "../agent/types.js";

export const localPlanner: Planner = {
  available: false,
  unavailableReason: "Minecraft Bedrock clients and Realms cannot make HTTP requests. AI generation is available in the Dedicated Server package; this Android pack supports sample and pasted validated blueprints.",
  async generate() {
    throw new Error(this.unavailableReason);
  }
};

export const localAssistantPlanner: AssistantPlanner = {
  available: false,
  unavailableReason: "Minecraft Bedrock clients on Android do not expose outbound HTTP to Script API. Connect this pack through the supported Dedicated Server pack and secure backend for open-ended AI; Undo, status, cancel, and saved-waypoint navigation remain available offline.",
  async plan(): Promise<never> { throw new Error(this.unavailableReason); }
};
