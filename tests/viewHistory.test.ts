// Viewership Growth Graph series builder.
import "./helpers/setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildViewGrowth } from "@/lib/viewHistory";

const at = (s: string) => new Date(s);

test("growth graph carries each deliverable's latest count forward, per format", () => {
  const { formats, points } = buildViewGrowth(
    [
      { deliverableId: "a", platform: "YOUTUBE_LONG", views: 100, capturedAt: at("2026-11-01T05:00:00Z") },
      { deliverableId: "b", platform: "INSTAGRAM_REEL", views: 50, capturedAt: at("2026-11-01T06:00:00Z") },
      { deliverableId: "a", platform: "YOUTUBE_LONG", views: 300, capturedAt: at("2026-11-03T05:00:00Z") },
      { deliverableId: "a", platform: "YOUTUBE_LONG", views: 350, capturedAt: at("2026-11-03T20:00:00Z") },
    ],
    at("2026-11-04T10:00:00Z")
  );
  assert.deepEqual(formats.map((f) => f.key), ["YOUTUBE_LONG", "INSTAGRAM_REEL"]);
  assert.deepEqual(
    points.map((p) => [p.day, p.YOUTUBE_LONG, p.INSTAGRAM_REEL]),
    [
      ["2026-11-01", 100, 50],
      ["2026-11-02", 100, 50],
      ["2026-11-03", 350, 50],
      ["2026-11-04", 350, 50],
    ]
  );
});

test("formats are never merged and empty history gives no points", () => {
  assert.deepEqual(buildViewGrowth([]), { formats: [], points: [] });
  const { points } = buildViewGrowth(
    [
      { deliverableId: "a", platform: "YOUTUBE_LONG", views: 10, capturedAt: at("2026-11-01T00:00:00Z") },
      { deliverableId: "b", platform: "YOUTUBE_SHORTS", views: 20, capturedAt: at("2026-11-01T00:00:00Z") },
    ],
    at("2026-11-01T12:00:00Z")
  );
  assert.equal(points[0].YOUTUBE_LONG, 10);
  assert.equal(points[0].YOUTUBE_SHORTS, 20);
});
