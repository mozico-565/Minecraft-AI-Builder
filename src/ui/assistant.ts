import { system, type Player } from "@minecraft/server";
import { ActionFormData, MessageFormData, ModalFormData } from "@minecraft/server-ui";
import type { AgentRuntime, PreparedAgentAction } from "../agent/runtime.js";
import { offlineToolCall } from "../agent/policy.js";
import { previewBoundsForCall } from "../agent/registry.js";
import type { AssistantPlanner } from "../agent/types.js";
import { listRecentActions, listWaypoints } from "../memory/world-memory.js";
import { showPreview } from "./preview.js";

type Locale = "ar" | "en";
function locale(player: Player): Locale { return player.getDynamicProperty("aibuilder:locale") === "en" ? "en" : "ar"; }
function tr(player: Player, ar: string, en: string): string { return locale(player) === "ar" ? ar : en; }

async function showResults(player: Player, message: string, results: Array<{ ok: boolean; message: string }>): Promise<void> {
  const lines = [message, ...results.map(result => `${result.ok ? "§a✓" : "§c✕"} ${result.message}`)];
  await new MessageFormData().title("Minecraft AI Assistant").body(lines.join("\n")).button1(tr(player, "إغلاق", "Close")).button2(tr(player, "طلب آخر", "Another request")).show(player);
}

async function executePrepared(player: Player, runtime: AgentRuntime, prepared: PreparedAgentAction): Promise<void> {
  const results = await runtime.execute(player, prepared);
  await showResults(player, prepared.response.message, results);
}

async function confirmPrepared(player: Player, runtime: AgentRuntime, prepared: PreparedAgentAction): Promise<void> {
  const { combined } = prepared;
  if (combined.risk === "LOW") { await executePrepared(player, runtime, prepared); return; }
  if (combined.risk === "MEDIUM") {
    const response = await new MessageFormData()
      .title(tr(player, "تأكيد الإجراء", "Confirm action"))
      .body(`${prepared.response.message}\n\n${combined.summary}\n${tr(player, "تصنيف المخاطر", "Risk")}: MEDIUM`)
      .button1(tr(player, "إلغاء", "Cancel")).button2(tr(player, "متابعة", "Continue")).show(player);
    if (!response.canceled && response.selection === 1) await executePrepared(player, runtime, prepared);
    return;
  }
  const form = new ActionFormData().title(tr(player, "تأكيد إجراء كبير", "Confirm large action"))
    .body(`${prepared.response.message}\n\n${combined.summary}\n${tr(player, "الحد الأقصى للكتابة", "Maximum writes")}: ${combined.estimatedBlocks}\nRisk: HIGH`)
    .button(tr(player, "👁 معاينة الحدود", "👁 Preview bounds"))
    .button(tr(player, "✓ تأكيد", "✓ Confirm"))
    .button(tr(player, "إلغاء", "Cancel"));
  const response = await form.show(player);
  if (response.canceled || response.selection === 2 || response.selection === undefined) return;
  if (response.selection === 0) {
    const call = prepared.response.toolCalls.find(item => ["fill_region", "replace_region", "build_blueprint", "place_block"].includes(item.tool));
    const bounds = call ? previewBoundsForCall(player, call.tool, call.arguments) : undefined;
    if (bounds) showPreview(player.dimension, bounds.from, bounds.to);
    else player.sendMessage(tr(player, "§eلا تتوفر حدود مرئية لهذا الإجراء.", "§eThis action has no visual bounds."));
    system.runTimeout(() => void confirmPrepared(player, runtime, prepared), 40);
    return;
  }
  await executePrepared(player, runtime, prepared);
}

async function ask(player: Player, runtime: AgentRuntime, planner: AssistantPlanner): Promise<void> {
  const response = await new ModalFormData().title("Minecraft AI Assistant")
    .textField(tr(player, "ماذا تريد مني أن أفعل؟", "What do you want me to do?"), tr(player, "ابنِ بيتًا أمامي...", "Build a house in front of me..."))
    .submitButton(tr(player, "إرسال", "Send")).show(player);
  const prompt = String(response.formValues?.[0] ?? "").trim();
  if (response.canceled || !prompt) return;
  player.onScreenDisplay.setActionBar(tr(player, "§bجارٍ التخطيط...", "§bPlanning..."));
  try {
    const planned = planner.available ? await planner.plan(prompt, runtime.captureContext(player, locale(player))) : offlineToolCall(prompt);
    if (!planned) {
      await new MessageFormData().title(tr(player, "الاتصال بالذكاء الاصطناعي غير متاح", "AI connection unavailable"))
        .body(planner.unavailableReason ?? tr(player, "الأوامر المحلية فقط متاحة الآن.", "Only local commands are available now."))
        .button1(tr(player, "إغلاق", "Close")).button2(tr(player, "مفهوم", "OK")).show(player);
      return;
    }
    const prepared = runtime.prepare(planned);
    if (!prepared.response.toolCalls.length) { await showResults(player, prepared.response.message, []); return; }
    await confirmPrepared(player, runtime, prepared);
  } catch (error) { player.sendMessage(`§cAI Assistant: ${error instanceof Error ? error.message : String(error)}`); }
}

async function saveWaypointForm(player: Player, runtime: AgentRuntime): Promise<void> {
  const response = await new ModalFormData().title(tr(player, "حفظ مكان", "Save waypoint"))
    .textField(tr(player, "الاسم", "Name"), tr(player, "البيت", "Home"))
    .dropdown(tr(player, "الموقع", "Location"), [tr(player, "موقعي", "My position"), tr(player, "ما أشير إليه", "Crosshair target")])
    .submitButton(tr(player, "حفظ", "Save")).show(player);
  if (response.canceled) return;
  const prepared = runtime.prepare({ message: "Save waypoint", toolCalls: [{ tool: "save_waypoint", arguments: { name: String(response.formValues?.[0] ?? ""), target: Number(response.formValues?.[1] ?? 0) === 1 ? "crosshair" : "player" } }] });
  await executePrepared(player, runtime, prepared);
}

async function waypointMenu(player: Player, runtime: AgentRuntime): Promise<void> {
  const waypoints = listWaypoints();
  if (!waypoints.length) { player.sendMessage(tr(player, "§eلا توجد أماكن محفوظة.", "§eNo saved waypoints.")); return; }
  const form = new ActionFormData().title(tr(player, "الأماكن المحفوظة", "Saved waypoints"));
  waypoints.forEach(item => form.button(`${item.name}\n${item.coordinates.join(", ")}`));
  const response = await form.show(player);
  const selected = response.selection === undefined ? undefined : waypoints[response.selection];
  if (!response.canceled && selected) await executePrepared(player, runtime, runtime.prepare({ message: `Guide to ${selected.name}`, toolCalls: [{ tool: "navigate_to_waypoint", arguments: { name: selected.name } }] }));
}

export async function openAssistantMenu(player: Player, runtime: AgentRuntime, planner: AssistantPlanner): Promise<void> {
  try {
    const recent = listRecentActions().slice(-3).reverse();
    const body = [runtime.engine.statusText(), "", tr(player, "الأخيرة:", "Recent:"), ...(recent.length ? recent.map(item => `• ${item.label}`) : [tr(player, "• لا شيء بعد", "• Nothing yet")])].join("\n");
    const form = new ActionFormData().title("Minecraft AI Assistant").body(body)
      .button(tr(player, "💬 اكتب طلبًا", "💬 Ask the assistant"))
      .button(tr(player, "📍 احفظ هذا المكان", "📍 Save waypoint"))
      .button(tr(player, "🧭 الأماكن والتنقل", "🧭 Waypoints & navigation"))
      .button(tr(player, "↶ تراجع", "↶ Undo"))
      .button(tr(player, "✕ إلغاء الإجراء", "✕ Cancel action"));
    const response = await form.show(player);
    if (response.canceled || response.selection === undefined) return;
    if (response.selection === 0) await ask(player, runtime, planner);
    if (response.selection === 1) await saveWaypointForm(player, runtime);
    if (response.selection === 2) await waypointMenu(player, runtime);
    if (response.selection === 3) await executePrepared(player, runtime, runtime.prepare({ message: "Undo", toolCalls: [{ tool: "undo", arguments: {} }] }));
    if (response.selection === 4) await executePrepared(player, runtime, runtime.prepare({ message: "Cancel", toolCalls: [{ tool: "cancel_current_action", arguments: {} }] }));
  } catch (error) { player.sendMessage(`§cAI Assistant UI: ${error instanceof Error ? error.message : String(error)}`); }
}
