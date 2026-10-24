// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scenariosById } from "../data/scenarios";
import { resolveEvidence } from "../engine/evidence";
import { buildInvestigationPlan } from "../engine/investigationPlan";
import { scoreConditions } from "../engine/score";
import InvestigationPlan from "./InvestigationPlan";
import PatientProfile from "./PatientProfile";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | null;

beforeEach(() => {
  document.body.style.overflow = "visible";
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  container.remove();
  document.body.style.overflow = "";
  root = null;
});

function expectLabelledDialog(): HTMLElement {
  const dialog = container.querySelector<HTMLElement>('[role="dialog"]');
  expect(dialog).not.toBeNull();
  const titleId = dialog?.getAttribute("aria-labelledby");
  const descriptionId = dialog?.getAttribute("aria-describedby");
  expect(titleId).toBeTruthy();
  expect(descriptionId).toBeTruthy();
  expect(document.getElementById(titleId ?? "")).not.toBeNull();
  expect(document.getElementById(descriptionId ?? "")).not.toBeNull();
  return dialog!;
}

describe("TAO dialogs", () => {
  it("labels PatientProfile, locks scrolling, renders chart basis, and closes on Escape", () => {
    const onClose = vi.fn();
    act(() => root?.render(<PatientProfile scenario={scenariosById.chest_pain} onClose={onClose} />));
    expectLabelledDialog();
    expect(document.body.style.overflow).toBe("hidden");
    expect(container.textContent).toContain("Chief complaint: pressure quality");
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(onClose).toHaveBeenCalledOnce();
    act(() => root?.unmount()); root = null;
    expect(document.body.style.overflow).toBe("visible");
  });

  it("labels InvestigationPlan, locks scrolling, closes on Escape, and exposes each reason urgency and role", () => {
    const scenario = scenariosById.chest_pain;
    const resolved = resolveEvidence([], {}, scenario.initialEvidence);
    const scored = scoreConditions(resolved.state, scenario.conditionPool ?? []);
    const plan = buildInvestigationPlan(scored, scenario.conditionPool ?? [], { leaderCount: scored.length });
    const onClose = vi.fn();
    act(() => root?.render(<InvestigationPlan plan={plan} onClose={onClose} onCondition={vi.fn()} />));
    expectLabelledDialog();
    expect(document.body.style.overflow).toBe("hidden");

    const ecgHeading = [...container.querySelectorAll("h3")].find((node) => node.textContent === "12-lead ECG");
    const ecgCard = ecgHeading?.closest("article");
    expect(ecgCard?.textContent).toContain("Immediate review");
    expect(ecgCard?.textContent).toContain("Urgent consideration");
    expect(ecgCard?.textContent).toContain("leading · safety watch");

    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(onClose).toHaveBeenCalledOnce();
    act(() => root?.unmount()); root = null;
    expect(document.body.style.overflow).toBe("visible");
  });
});
