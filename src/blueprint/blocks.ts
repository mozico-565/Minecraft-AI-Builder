export const SAFE_BLOCK_IDS = [
  "minecraft:air", "minecraft:stone", "minecraft:cobblestone", "minecraft:stone_bricks",
  "minecraft:deepslate_bricks", "minecraft:bricks", "minecraft:sandstone", "minecraft:smooth_sandstone",
  "minecraft:quartz_block", "minecraft:smooth_quartz", "minecraft:white_concrete", "minecraft:gray_concrete",
  "minecraft:black_concrete", "minecraft:red_concrete", "minecraft:blue_concrete", "minecraft:green_concrete",
  "minecraft:glass", "minecraft:glass_pane", "minecraft:tinted_glass", "minecraft:oak_planks",
  "minecraft:spruce_planks", "minecraft:dark_oak_planks", "minecraft:birch_planks", "minecraft:mangrove_planks",
  "minecraft:oak_log", "minecraft:spruce_log", "minecraft:dark_oak_log", "minecraft:stripped_oak_log",
  "minecraft:stripped_dark_oak_log", "minecraft:oak_door", "minecraft:spruce_door", "minecraft:dark_oak_door",
  "minecraft:iron_door", "minecraft:oak_stairs", "minecraft:stone_brick_stairs", "minecraft:quartz_stairs",
  "minecraft:stone_slab", "minecraft:quartz_slab", "minecraft:grass_block", "minecraft:dirt",
  "minecraft:water", "minecraft:sea_lantern", "minecraft:glowstone", "minecraft:lantern",
  "minecraft:gold_block", "minecraft:oak_leaves", "minecraft:spruce_leaves", "minecraft:birch_leaves",
  "minecraft:iron_bars", "minecraft:oak_fence", "minecraft:stone_brick_wall", "minecraft:red_wool",
  "minecraft:white_wool", "minecraft:green_wool", "minecraft:yellow_wool", "minecraft:bookshelf",
  "minecraft:chiseled_stone_bricks", "minecraft:polished_andesite", "minecraft:polished_diorite",
  "minecraft:terracotta", "minecraft:white_terracotta", "minecraft:orange_terracotta", "minecraft:packed_mud",
  "minecraft:mud_bricks", "minecraft:copper_block", "minecraft:cut_copper", "minecraft:oxidized_copper",
  "minecraft:prismarine", "minecraft:dark_prismarine", "minecraft:obsidian", "minecraft:bedrock"
] as const;

export const SAFE_BLOCK_SET = new Set<string>(SAFE_BLOCK_IDS);

export function isBlockIdentifier(value: string): boolean {
  return /^minecraft:[a-z0-9_]+$/.test(value);
}
