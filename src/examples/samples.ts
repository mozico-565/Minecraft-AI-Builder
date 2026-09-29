import type { Blueprint } from "../blueprint/types.js";

export const SAMPLE_BLUEPRINTS: Blueprint[] = [
  {
    version: 1, name: "Small Modern House", description: "A compact one-floor house with glass front and flat roof.",
    size: { x: 11, y: 6, z: 9 }, palette: { wall: "minecraft:white_concrete", trim: "minecraft:dark_oak_planks", glass: "minecraft:glass", air: "minecraft:air" },
    operations: [
      { type: "floor", from: [0, 0, 0], to: [10, 0, 8], block: "$trim" },
      { type: "walls", from: [0, 1, 0], to: [10, 4, 8], block: "$wall" },
      { type: "roof", from: [0, 5, 0], to: [10, 5, 8], block: "$trim", style: "flat" },
      { type: "door", at: [5, 1, 0], width: 1, height: 2, axis: "x", block: "$air" },
      { type: "window", at: [1, 2, 0], width: 3, height: 2, axis: "x", block: "$glass" },
      { type: "window", at: [7, 2, 0], width: 3, height: 2, axis: "x", block: "$glass" }
    ]
  },
  {
    version: 1, name: "Stone Watchtower", size: { x: 9, y: 18, z: 9 },
    operations: [
      { type: "hollow_box", from: [1, 0, 1], to: [7, 14, 7], block: "minecraft:stone_bricks" },
      { type: "floor", from: [0, 15, 0], to: [8, 15, 8], block: "minecraft:stone_bricks" },
      { type: "repeat", count: 4, step: [2, 0, 0], operation: { type: "column", at: [0, 16, 0], height: 2, block: "minecraft:stone_bricks" } },
      { type: "repeat", count: 4, step: [2, 0, 0], operation: { type: "column", at: [0, 16, 8], height: 2, block: "minecraft:stone_bricks" } },
      { type: "door", at: [4, 1, 1], width: 1, height: 2, axis: "x", block: "minecraft:air" }
    ]
  },
  {
    version: 1, name: "Defensive Wall", size: { x: 25, y: 7, z: 3 },
    operations: [
      { type: "fill", from: [0, 0, 0], to: [24, 4, 2], block: "minecraft:stone_bricks" },
      { type: "repeat", count: 13, step: [2, 0, 0], operation: { type: "column", at: [0, 5, 0], height: 2, block: "minecraft:stone_bricks" } },
      { type: "repeat", count: 13, step: [2, 0, 0], operation: { type: "column", at: [0, 5, 2], height: 2, block: "minecraft:stone_bricks" } }
    ]
  },
  {
    version: 1, name: "Garden Pool", size: { x: 14, y: 3, z: 10 },
    operations: [
      { type: "fill", from: [0, 0, 0], to: [13, 0, 9], block: "minecraft:smooth_quartz" },
      { type: "hollow_box", from: [2, 0, 2], to: [11, 1, 7], block: "minecraft:blue_concrete" },
      { type: "fill", from: [3, 1, 3], to: [10, 1, 6], block: "minecraft:water" },
      { type: "repeat", count: 4, step: [4, 0, 0], operation: { type: "set_block", at: [1, 1, 1], block: "minecraft:sea_lantern" } }
    ]
  }
];
