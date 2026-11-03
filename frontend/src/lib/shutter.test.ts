import { test, describe } from "node:test";
import assert from "node:assert";
import {
  SHUTTER_CONTROLS,
  SHUTTER_TYPES,
  normalizeShutterControl,
  normalizeShutterType,
  shutterUnit,
} from "./shutter.ts";

describe("normalizeShutterType", () => {
  test("every label maps to itself", () => {
    for (const label of SHUTTER_TYPES) assert.equal(normalizeShutterType(label), label);
  });

  test("the imported spellings fold into the vocabulary", () => {
    assert.equal(normalizeShutterType("Focal-plane"), "Focal-plane");
    assert.equal(normalizeShutterType("focal plane shutter"), "Focal-plane");
    assert.equal(normalizeShutterType("In-lens leaf shutter"), "In-lens leaf");
    assert.equal(normalizeShutterType("Leaf shutter"), "Leaf");
    assert.equal(normalizeShutterType("Copal blade shutter"), "Leaf");
    assert.equal(normalizeShutterType("between-the-lens"), "Leaf");
    assert.equal(normalizeShutterType("rotary"), "Rotary");
    assert.equal(normalizeShutterType("guillotine shutter"), "Guillotine");
  });

  test("a Copal Square is focal-plane, whatever its blades are called", () => {
    assert.equal(normalizeShutterType("Copal Square"), "Focal-plane");
    assert.equal(normalizeShutterType("Copal Square metal blade shutter"), "Focal-plane");
  });

  test("only a shutter in each lens is an in-lens leaf", () => {
    assert.equal(normalizeShutterType("leaf shutter in each lens"), "In-lens leaf");
    assert.equal(normalizeShutterType("leaf shutter in the lens"), "Leaf");
  });

  test("a mechanism wins over the word electronic", () => {
    assert.equal(normalizeShutterType("Electronically controlled focal-plane shutter"), "Focal-plane");
    assert.equal(normalizeShutterType("Electronic"), "Electronic (sensor)");
  });

  test("speeds, controls and blanks are not shutter types", () => {
    assert.equal(normalizeShutterType("1/500 sec"), null);
    assert.equal(normalizeShutterType("Hybrid"), null);
    assert.equal(normalizeShutterType("Electronically controlled"), null);
    assert.equal(normalizeShutterType("  "), null);
    assert.equal(normalizeShutterType(null), null);
    assert.equal(normalizeShutterType(5), null);
  });
});

describe("normalizeShutterControl", () => {
  test("every label maps to itself", () => {
    for (const label of SHUTTER_CONTROLS) assert.equal(normalizeShutterControl(label), label);
  });

  test("the imported Model spec reads as its control", () => {
    assert.equal(normalizeShutterControl("Mechanical Copal Square"), "Mechanical");
    assert.equal(normalizeShutterControl("Electronically controlled Seiko MFC"), "Electronically controlled");
    assert.equal(normalizeShutterControl("electronic"), "Electronically controlled");
    assert.equal(normalizeShutterControl("hybrid (mechanical fast speeds)"), "Hybrid");
  });

  test("anything else is refused", () => {
    assert.equal(normalizeShutterControl("Focal-plane"), null);
    assert.equal(normalizeShutterControl(""), null);
    assert.equal(normalizeShutterControl(undefined), null);
  });
});

describe("shutterUnit", () => {
  test("the unit is whatever follows the control", () => {
    assert.equal(shutterUnit("Mechanical Copal Square"), "Copal Square");
    assert.equal(shutterUnit("Electronically controlled Seiko MFC ES-846"), "Seiko MFC ES-846");
  });

  test("a bare control names no unit", () => {
    assert.equal(shutterUnit("Mechanical"), null);
    assert.equal(shutterUnit("Electronically controlled"), null);
    assert.equal(shutterUnit(undefined), null);
  });

  test("a value with no control word is not a unit", () => {
    assert.equal(shutterUnit("Copal Square"), null);
  });
});
