import type { ImageBridge } from "../image/ui.js";
import { CommandPermissionLevel, system, world, type Player } from "@minecraft/server";
import { BuildingEngine } from "../builder/engine.js";
import type { Planner } from "../planner/types.js";
import { commandPlayer, offerRecovery, openMainMenu } from "../ui/menu.js";
import type { AssistantPlanner } from "../agent/types.js";
import { AgentRuntime } from "../agent/runtime.js";
import { ToolRegistry } from "../agent/registry.js";
import { NavigationService } from "../navigation/service.js";
import { openAssistantMenu } from "../ui/assistant.js";

export function startApp(planner: Planner, assistantPlanner: AssistantPlanner, imageBridge?: ImageBridge): BuildingEngine {
  const engine = new BuildingEngine();
  const navigation = new NavigationService();
  const runtime = new AgentRuntime(new ToolRegistry(), engine, navigation);

  system.beforeEvents.startup.subscribe(event => {
    const commands = event.customCommandRegistry;
    const register = (name: string, description: string, action: (player: Player) => void) => {
      commands.registerCommand({ name: `aibuilder:${name}`, description, permissionLevel: CommandPermissionLevel.Any, cheatsRequired: false }, origin => {
        const player = commandPlayer(origin.sourceEntity);
        if (player) system.run(() => action(player));
        return undefined;
      });
    };
    register("menu", "Open Minecraft AI Assistant", player => void openMainMenu(player, engine, planner, runtime, assistantPlanner, imageBridge));
    register("assistant", "Open the natural-language assistant", player => void openAssistantMenu(player, runtime, assistantPlanner));
    register("pause", "Pause the active build", player => { engine.pause(player); });
    register("resume", "Resume the active build", player => { engine.resume(player); });
    register("stop", "Cancel the active build", player => { engine.cancel(player); });
    register("undo", "Undo the last build", player => { try { engine.undo(player); } catch (error) { player.sendMessage(`§c${error instanceof Error ? error.message : String(error)}`); } });
    register("status", "Show build progress", player => { player.sendMessage(engine.statusText()); });
  });

  world.afterEvents.itemUse.subscribe(event => {
    if (event.source.isSneaking && event.itemStack.typeId === "minecraft:compass") void openMainMenu(event.source, engine, planner, runtime, assistantPlanner, imageBridge);
  });

  world.afterEvents.playerSpawn.subscribe(event => {
    if (!event.initialSpawn) return;
    const player = event.player;
    system.runTimeout(() => {
      if (engine.hasPersistedJob(player)) void offerRecovery(player, engine);
      else player.sendMessage("§bMinecraft AI Assistant§r — crouch/sneak and use a compass, or type §f/aibuilder:menu");
    }, 40);
  });

  return engine;
}
