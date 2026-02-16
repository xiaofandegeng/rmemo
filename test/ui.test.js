import test from "node:test";
import assert from "node:assert/strict";
import { renderUiHtml } from "../src/core/ui.js";

test("renderUiHtml returns a single-file UI html", () => {
  const html = renderUiHtml({ title: "rmemo", apiBasePath: "" });
  assert.ok(html.startsWith("<!doctype html>"));
  assert.ok(html.includes("rmemo UI"));
  assert.ok(html.includes("/status?format=json"));
  assert.ok(html.includes("/search?mode=semantic"));
  assert.ok(html.includes("/focus?q="));
  assert.ok(html.includes("/events"));
  assert.ok(html.includes("/events/export"));
  assert.ok(html.includes("/diagnostics/export"));
  assert.ok(html.includes("/refresh"));
  assert.ok(html.includes("/watch"));
  // Should not embed tokens.
  assert.ok(!html.toLowerCase().includes("rmemo_token="));
});
