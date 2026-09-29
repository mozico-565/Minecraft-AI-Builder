import { Player, system, type Vector3 } from "@minecraft/server";
import { ActionFormData, MessageFormData, ModalFormData } from "@minecraft/server-ui";
import type { Blueprint, Vec3Tuple } from "../blueprint/types.js";
import { MOBILE_LIMITS } from "../blueprint/types.js";
import { validateBlueprint } from "../blueprint/validator.js";
import { playerFacingRotation, rotatedSize, type Rotation } from "../blueprint/transform.js";
import { calculateBounds } from "../builder/world-transform.js";
import type { BuildingEngine } from "../builder/engine.js";
import { SAMPLE_BLUEPRINTS } from "../examples/samples.js";
import type { Planner } from "../planner/types.js";
import { showPreview } from "./preview.js";
import type { AgentRuntime } from "../agent/runtime.js";
import type { AssistantPlanner } from "../agent/types.js";
import { openAssistantMenu } from "./assistant.js";

type Locale = "ar" | "en";
interface Placement { origin: Vec3Tuple; rotation: Rotation }

function locale(player: Player): Locale { return player.getDynamicProperty("aibuilder:locale") === "en" ? "en" : "ar"; }
function tr(player: Player, ar: string, en: string): string { return locale(player) === "ar" ? ar : en; }
function floorVector(value: Vector3): Vec3Tuple { return [Math.floor(value.x), Math.floor(value.y), Math.floor(value.z)]; }

function placement(player: Player, blueprint: Blueprint, location: number, rotationIndex: number, dx: number, dy: number, dz: number): Placement {
  const facing = playerFacingRotation(player.getViewDirection());
  const rotations: Rotation[] = [facing, 0, 90, 180, 270];
  const rotation = rotations[rotationIndex] ?? facing;
  const playerPos = floorVector(player.location);
  let origin: Vec3Tuple = [playerPos[0], playerPos[1] - 1, playerPos[2]];
  if (location === 1) {
    const size = rotatedSize(blueprint.size, rotation);
    const view = player.getViewDirection();
    const distance = Math.ceil(Math.max(size.x, size.z) / 2) + 4;
    const centerX = playerPos[0] + Math.round(view.x * distance);
    const centerZ = playerPos[2] + Math.round(view.z * distance);
    origin = [centerX - Math.floor(size.x / 2), playerPos[1] - 1, centerZ - Math.floor(size.z / 2)];
  }
  return { origin: [origin[0] + dx, origin[1] + dy, origin[2] + dz], rotation };
}

async function choosePlacement(player: Player, blueprint: Blueprint): Promise<Placement | undefined> {
  const form = new ModalFormData()
    .title(tr(player, "موضع البناء", "Build placement"))
    .dropdown(tr(player, "الموقع", "Location"), [tr(player, "هنا", "Here"), tr(player, "أمامي", "In front of me")], { defaultValueIndex: 1 })
    .dropdown(tr(player, "الدوران", "Rotation"), [tr(player, "حسب اتجاه نظري", "Face my direction"), "0°", "90°", "180°", "270°"], { defaultValueIndex: 0 })
    .slider("Move X", -32, 32, { defaultValue: 0, valueStep: 1 })
    .slider(tr(player, "رفع/خفض", "Raise / lower"), -16, 32, { defaultValue: 0, valueStep: 1 })
    .slider("Move Z", -32, 32, { defaultValue: 0, valueStep: 1 })
    .submitButton(tr(player, "متابعة", "Continue"));
  const response = await form.show(player);
  if (response.canceled || !response.formValues) return undefined;
  const [location = 1, rotation = 0, dx = 0, dy = 0, dz = 0] = response.formValues.map(value => Number(value));
  return placement(player, blueprint, location, rotation, dx, dy, dz);
}

async function confirmBlueprint(player: Player, blueprint: Blueprint, engine: BuildingEngine): Promise<void> {
  const validation = validateBlueprint(blueprint);
  if (!validation.ok) { player.sendMessage(`§cBlueprint invalid: ${validation.errors.join("; ")}`); return; }
  const selected = await choosePlacement(player, blueprint);
  if (!selected) return;
  const bounds = calculateBounds(blueprint, { x: selected.origin[0], y: selected.origin[1], z: selected.origin[2] }, selected.rotation);
  const form = new ActionFormData()
    .title(blueprint.name)
    .body(`${tr(player, "الحجم", "Size")}: ${blueprint.size.x} × ${blueprint.size.y} × ${blueprint.size.z}\n${tr(player, "عدد البلوكات التقريبي", "Estimated block writes")}: ${validation.estimatedBlocks}\n${tr(player, "الفئة", "Tier")}: ${validation.tier}`)
    .button(tr(player, "👁 معاينة 10 ثوانٍ", "👁 Preview for 10 seconds"))
    .button(tr(player, "✓ ابدأ البناء", "✓ Build now"))
    .button(tr(player, "إلغاء", "Cancel"));
  const response = await form.show(player);
  if (response.canceled || response.selection === 2 || response.selection === undefined) return;
  if (response.selection === 0) {
    showPreview(player.dimension, bounds.from, bounds.to);
    player.sendMessage(tr(player, "§bالمعاينة مؤقتة ولا تغيّر العالم.", "§bPreview is temporary and does not change the world."));
    system.runTimeout(() => void confirmBlueprint(player, blueprint, engine), 40);
    return;
  }
  try { engine.start(player, blueprint, selected); } catch (error) { player.sendMessage(`§c${error instanceof Error ? error.message : String(error)}`); }
}

async function generate(player: Player, engine: BuildingEngine, planner: Planner): Promise<void> {
  if (!planner.available) {
    await new MessageFormData().title("AI unavailable in local world").body(planner.unavailableReason ?? "AI planner unavailable").button1(tr(player, "مفهوم", "OK")).button2(tr(player, "اختيار نموذج جاهز", "Use a sample")).show(player);
    return;
  }
  const promptForm = new ModalFormData()
    .title("Minecraft AI Builder")
    .textField(tr(player, "صف ما تريد بناءه", "Describe what to build"), tr(player, "ابنِ بيتًا مودرن...", "Build a modern house..."))
    .submitButton(tr(player, "توليد المخطط", "Generate blueprint"));
  const response = await promptForm.show(player);
  const prompt = String(response.formValues?.[0] ?? "").trim();
  if (response.canceled || !prompt) return;
  player.onScreenDisplay.setActionBar(tr(player, "§bجارٍ توليد المخطط...", "§bGenerating blueprint..."));
  try {
    const blueprint = await planner.generate(prompt, { locale: locale(player), maxBlocks: MOBILE_LIMITS.maxEstimatedBlocks, maxSize: { x: 128, y: 128, z: 128 } });
    await confirmBlueprint(player, blueprint, engine);
  } catch (error) { player.sendMessage(`§cAI Builder: ${error instanceof Error ? error.message : String(error)}`); }
}

async function chooseSample(player: Player, engine: BuildingEngine): Promise<void> {
  const form = new ActionFormData().title(tr(player, "مخططات اختبار", "Test blueprints"));
  SAMPLE_BLUEPRINTS.forEach(sample => form.button(`${sample.name}\n${sample.size.x}×${sample.size.y}×${sample.size.z}`));
  const response = await form.show(player);
  if (!response.canceled && response.selection !== undefined) await confirmBlueprint(player, SAMPLE_BLUEPRINTS[response.selection]!, engine);
}

async function pasteBlueprint(player: Player, engine: BuildingEngine): Promise<void> {
  const form = new ModalFormData().title("Blueprint JSON").textField(tr(player, "الصق JSON فقط", "Paste JSON only"), "{\"version\":1,...}").submitButton(tr(player, "فحص", "Validate"));
  const response = await form.show(player);
  if (response.canceled) return;
  try { await confirmBlueprint(player, JSON.parse(String(response.formValues?.[0] ?? "")) as Blueprint, engine); }
  catch (error) { player.sendMessage(`§cInvalid JSON: ${error instanceof Error ? error.message : String(error)}`); }
}

export async function openMainMenu(player: Player, engine: BuildingEngine, planner: Planner, runtime: AgentRuntime, assistantPlanner: AssistantPlanner): Promise<void> {
  try {
    const form = new ActionFormData().title("Minecraft AI Assistant").body(engine.statusText())
      .button(tr(player, "💬 افتح المساعد", "💬 Open Assistant"))
      .button(tr(player, "✨ توليد Blueprint بالذكاء الاصطناعي", "✨ Generate AI Blueprint"))
      .button(tr(player, "🏠 مخططات اختبار", "🏠 Test blueprints"))
      .button(tr(player, "📋 لصق Blueprint JSON", "📋 Paste Blueprint JSON"))
      .button(tr(player, "⏸ إيقاف مؤقت / متابعة", "⏸ Pause / resume"))
      .button(tr(player, "✕ إلغاء البناء", "✕ Cancel build"))
      .button(tr(player, "↶ تراجع عن آخر بناء", "↶ Undo last build"))
      .button(tr(player, "🌐 العربية / English", "🌐 العربية / English"));
    const response = await form.show(player);
    if (response.canceled || response.selection === undefined) return;
    switch (response.selection) {
      case 0: await openAssistantMenu(player, runtime, assistantPlanner); break;
      case 1: await generate(player, engine, planner); break;
      case 2: await chooseSample(player, engine); break;
      case 3: await pasteBlueprint(player, engine); break;
      case 4: if (!engine.pause(player)) engine.resume(player); break;
      case 5: engine.cancel(player); break;
      case 6: try { engine.undo(player); } catch (error) { player.sendMessage(`§c${error instanceof Error ? error.message : String(error)}`); } break;
      case 7: player.setDynamicProperty("aibuilder:locale", locale(player) === "ar" ? "en" : "ar"); await openMainMenu(player, engine, planner, runtime, assistantPlanner); break;
    }
  } catch (error) { player.sendMessage(`§cAI Builder UI: ${error instanceof Error ? error.message : String(error)}`); }
}

export async function offerRecovery(player: Player, engine: BuildingEngine): Promise<void> {
  const response = await new MessageFormData().title("Minecraft AI Builder").body(tr(player, "تم اكتشاف بناء غير مكتمل.", "An unfinished build was detected.")).button1(tr(player, "إلغاءه", "Discard")).button2(tr(player, "متابعة", "Resume")).show(player);
  if (response.canceled) return;
  if (response.selection === 1) { try { engine.restorePersisted(player); engine.resume(player); } catch (error) { player.sendMessage(`§c${error instanceof Error ? error.message : String(error)}`); } }
  else engine.discardPersisted();
}

export function commandPlayer(entity: unknown): Player | undefined {
  return entity instanceof Player ? entity : undefined;
}
