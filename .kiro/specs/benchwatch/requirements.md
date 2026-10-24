# Benchwatch — Requirements

A protocol-aware co-pilot that watches and listens at the lab bench, catches
mistakes as they happen, and writes the experiment record automatically.

## Problem and user

Wet-lab work is long chains of manual steps where one silent error (a skipped
wash, reagents added in the wrong order, an incubation that ran long) can ruin
days of work. The primary user is an early-career scientist running
standardized protocols repeatedly, with gloves on, a timer running and a
printed protocol taped to the bench. This is not a validated GMP environment,
so no regulatory validation is required for v1.

## Functional requirements

1. When a session starts, the system shall load the selected protocol, detect
   the mat, and confirm that every reagent is in its home zone before allowing
   the first step.
2. When the bottle expected by the current add step is lifted and then detected
   over the target zone, the system shall mark that step complete and advance.
3. When a bottle other than the expected one is lifted, the system shall speak
   and display a deviation alert within one second that names the bottle picked
   up and the step that is actually due.
4. When a deviation is ignored and the wrong reagent is added anyway, the system
   shall record it in the deviation report and continue tracking the protocol
   from the step the scientist actually performed.
5. When an add step that precedes an incubate step is completed, the system
   shall start the incubation timer automatically, warn at the configured
   warning time, and record an overrun if the next action happens after the
   duration has passed.
6. When the scientist speaks, the system shall transcribe the speech, classify
   it, and attach observations to the current step without requiring any wake
   word.
7. When the scientist verbally corrects an event, the system shall update the
   log and the checklist accordingly.
8. When the session ends, the system shall generate a methods section and a
   deviation report from the event log and allow export as Markdown.

## Event log format

Every event is appended to a session log with a timestamp, a source
(`vision`, `audio`, `engine` or `user`), a type, a related step id and a
payload. The log is the single source of truth for the UI and for report
generation, and it is saved as JSON when the session ends so a session can be
replayed.

## Protocol file format

Each protocol is a YAML file listing reagents and steps. Reagents map a name to
a cap color and a home zone. Steps have an id, a type (`add`, `mix`, `incubate`
or `manual`), the reagent for add steps, the duration for incubate steps, and a
short human description used in alerts and the report.

```yaml
name: Demo colorimetric assay
reagents:
  buffer_a:   { label: "Buffer A",      cap_color: blue,   zone: 1 }
  reagent_b:  { label: "Reagent B",     cap_color: yellow, zone: 2 }
  stop:       { label: "Stop Solution", cap_color: red,    zone: 3 }
target_zone: 4
steps:
  - { id: 1, type: add,      reagent: buffer_a, description: "Add Buffer A to the sample" }
  - { id: 2, type: mix,      description: "Swirl to mix" }
  - { id: 3, type: add,      reagent: reagent_b, description: "Add Reagent B" }
  - { id: 4, type: incubate, duration_s: 60, warn_at_s: 50, description: "Incubate" }
  - { id: 5, type: add,      reagent: stop, description: "Add Stop Solution" }
```

Mix and manual steps cannot be detected reliably by vision in v1, so they are
auto-advanced when the next detectable action happens, or completed by a spoken
remark such as "mixed."

## Non-goals (hackathon)

Recognizing arbitrary real lab tubes/bottles without colored caps, measuring
volumes, controlling instruments, integrating with commercial ELNs, multi-user
labs, and any regulatory validation (21 CFR Part 11 or GMP).
