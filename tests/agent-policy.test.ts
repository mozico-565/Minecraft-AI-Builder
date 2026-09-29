import test from "node:test";
import assert from "node:assert/strict";
import { combineAssessments, MAX_AGENT_STEPS, offlineToolCall, regionVolume, riskForBlocks, validateAgentResponse } from "../src/agent/policy.js";
import Ajv2020 from "ajv/dist/2020.js";
import { AGENT_RESPONSE_SCHEMA } from "../backend/agent-schema.js";
import { SAMPLE_BLUEPRINTS } from "../src/examples/samples.js";

test("agent response accepts only registered structured tools", () => {
  const valid = validateAgentResponse({ message: "Save Home", toolCalls: [{ tool: "save_waypoint", arguments: { name: "Home", target: "player" } }] });
  assert.equal(valid.ok, true);
  const arbitrary = validateAgentResponse({ message: "run", toolCalls: [{ tool: "run_command", arguments: { command: "/op @s" } }] });
  assert.equal(arbitrary.ok, false);
  assert.match(arbitrary.errors.join(" "), /Unknown tool/);
});

test("agent response enforces the step limit", () => {
  const toolCalls = Array.from({ length: MAX_AGENT_STEPS + 1 }, () => ({ tool: "get_player_position", arguments: {} }));
  assert.equal(validateAgentResponse({ message: "too many", toolCalls }).ok, false);
});

test("region volume and mobile risks are deterministic", () => {
  assert.equal(regionVolume({ x: 20, y: 1, z: 20 }), 400);
  assert.equal(regionVolume({ x: 0, y: 1, z: 2 }), 0);
  assert.equal(riskForBlocks(64), "LOW");
  assert.equal(riskForBlocks(4_096), "MEDIUM");
  assert.equal(riskForBlocks(4_097), "HIGH");
});

test("combined assessment sums writes and keeps highest risk", () => {
  const result = combineAssessments([
    { risk: "LOW", estimatedBlocks: 1, summary: "one", worldChanging: true },
    { risk: "HIGH", estimatedBlocks: 5_000, summary: "many", worldChanging: false }
  ]);
  assert.equal(result.risk, "HIGH");
  assert.equal(result.estimatedBlocks, 5_001);
  assert.equal(result.worldChanging, true);
});

test("backend Agent Response JSON Schema resolves nested Blueprint references", () => {
  const validate = new Ajv2020({ strict: false }).compile(AGENT_RESPONSE_SCHEMA);
  assert.equal(validate({ message: "Build", toolCalls: [{ tool: "build_blueprint", arguments: { blueprint: SAMPLE_BLUEPRINTS[0], placement: "front", rotation: "facing" } }] }), true, JSON.stringify(validate.errors));
  assert.equal(validate({ message: "Unsafe", toolCalls: [{ tool: "run_command", arguments: {} }] }), false);
});

test("offline controls support Arabic waypoint navigation without pretending to be AI", () => {
  assert.deepEqual(offlineToolCall("وين البيت؟")?.toolCalls[0], { tool: "navigate_to_waypoint", arguments: { name: "البيت" } });
  assert.equal(offlineToolCall("ابنِ قلعة"), undefined);
});
