"use client";

// Agentation — a visual feedback overlay (click an element, leave a note,
// copy a structured selector/context snippet to hand to an AI coding agent).
// Dev-only: never rendered in production builds.
// https://github.com/benjitaylor/agentation
import { Agentation } from "agentation";

export default function DevFeedback() {
  if (process.env.NODE_ENV !== "development") return null;
  return <Agentation />;
}
