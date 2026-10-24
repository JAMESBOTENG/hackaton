/**
 * The demo protocol shape, mirroring backend/protocols/demo_assay.yaml exactly.
 *
 * This is the ProtocolView the replay engine and dashboard components consume,
 * so the browser-only demo needs no backend parse of the YAML. The values here
 * are copied verbatim from demo_assay.yaml (name, reagents, target_zone, and
 * the five steps with their types, reagents, descriptions, and the incubate
 * step's duration_s / warn_at_s).
 */
import type { ProtocolView } from "../types";

export const demoProtocol: ProtocolView = {
  name: "Demo colorimetric assay",
  target_zone: 4,
  reagents: {
    buffer_a: { key: "buffer_a", label: "Buffer A", cap_color: "blue", zone: 1 },
    reagent_b: { key: "reagent_b", label: "Reagent B", cap_color: "yellow", zone: 2 },
    stop: { key: "stop", label: "Stop Solution", cap_color: "red", zone: 3 },
  },
  steps: [
    {
      id: 1,
      type: "add",
      description: "Add Buffer A to the sample",
      reagent: "buffer_a",
      duration_s: null,
      warn_at_s: null,
    },
    {
      id: 2,
      type: "mix",
      description: "Swirl to mix",
      reagent: null,
      duration_s: null,
      warn_at_s: null,
    },
    {
      id: 3,
      type: "add",
      description: "Add Reagent B",
      reagent: "reagent_b",
      duration_s: null,
      warn_at_s: null,
    },
    {
      id: 4,
      type: "incubate",
      description: "Incubate",
      reagent: null,
      duration_s: 60,
      warn_at_s: 50,
    },
    {
      id: 5,
      type: "add",
      description: "Add Stop Solution",
      reagent: "stop",
      duration_s: null,
      warn_at_s: null,
    },
  ],
};
