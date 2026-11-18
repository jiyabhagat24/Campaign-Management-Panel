// Role access rules added in the sandbox-audit work, checked against the
// workflow spec where it applies.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  campaignVisibilityWhere, canSeeInternalCost, canManageReportingLines, canViewTeamTurnaround,
  canViewFinanceLedger, canViewMoneyExposure, canViewCreatorBoard, canViewLeadershipHome, canViewIrManagerHome,
} from "@/lib/rbac";
import { INTERNAL_ROLES } from "@/lib/constants";

test("internal cost is hidden from Client, IR Intern and Business Development (G2, G3)", () => {
  for (const r of ["CLIENT", "IR_INTERN", "BUSINESS_DEVELOPMENT"] as const) assert.equal(canSeeInternalCost(r), false, r);
  for (const r of ["CXO", "FINANCE", "CAMPAIGN_MANAGER", "BRAND_SOLUTIONS", "IR_MANAGER", "IR_EXECUTIVE"] as const) assert.equal(canSeeInternalCost(r), true, r);
});

test("Finance and BD are assignable internal roles", () => {
  assert.ok(INTERNAL_ROLES.includes("FINANCE"));
  assert.ok(INTERNAL_ROLES.includes("BUSINESS_DEVELOPMENT"));
});

test("assignment is access: only CXO, IR Manager and Finance are unscoped (G13)", () => {
  for (const r of ["CXO", "IR_MANAGER", "FINANCE"] as const) assert.deepEqual(campaignVisibilityWhere({ id: "u", role: r }), {}, r);
  for (const r of ["CAMPAIGN_MANAGER", "IR_EXECUTIVE", "BRAND_SOLUTIONS", "BUSINESS_DEVELOPMENT"] as const)
    assert.deepEqual(campaignVisibilityWhere({ id: "u", role: r }), { teamMembers: { some: { userId: "u" } } }, r);
  assert.deepEqual(campaignVisibilityWhere({ id: "c", role: "CLIENT" }), { clientAccess: { some: { clientId: "c" } } });
});

test("only the IR Manager writes reporting lines; CXO only reads", () => {
  assert.equal(canManageReportingLines("IR_MANAGER"), true);
  assert.equal(canManageReportingLines("CXO"), false);
  assert.equal(canViewTeamTurnaround("CXO"), true);
  assert.equal(canViewTeamTurnaround("CAMPAIGN_MANAGER"), false);
});

test("new pages are closed to roles that must not see money", () => {
  for (const r of ["CLIENT", "IR_INTERN", "BUSINESS_DEVELOPMENT"] as const) {
    assert.equal(canViewFinanceLedger(r), false, r);
    assert.equal(canViewMoneyExposure(r), false, r);
  }
  assert.equal(canViewCreatorBoard("CLIENT"), false);
  assert.equal(canViewLeadershipHome("IR_MANAGER"), false);
  assert.equal(canViewIrManagerHome("CAMPAIGN_MANAGER"), false);
});
