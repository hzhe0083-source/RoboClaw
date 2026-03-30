# Architecture Comparison: LeRobot / dimos / RoboClaw

> 2026-03-23 — comparative architecture notes and RoboClaw positioning

## 0. High-Level View

### LeRobot

LeRobot is strongest as a data-and-learning system.

Its center of gravity is:

- dataset format
- teleoperation and collection
- training and evaluation
- policy packaging

It does **not** center the architecture on an agent runtime or natural-language
interaction. In practice it is a CLI-first robotics learning toolkit.

### dimos

dimos is strongest as an agent-and-operations system.

Its center of gravity is:

- LLM-driven orchestration
- perception
- navigation
- mapping
- manipulation
- spatial memory

It does **not** provide a strong built-in data collection and policy training
loop. In practice it is an operations-oriented agent framework with robotics
connectivity.

### RoboClaw

RoboClaw should be understood as the unification target:

- an agent-centered embodied assistant
- a structured skill and policy runtime
- a learning loop that integrates data collection, training, deployment, and
  evaluation

In short:

```text
LeRobot  -> strongest data and training engine
dimos    -> strongest agent and environment orchestration engine
RoboClaw -> agent cockpit + learning engine + safety + perception
```

## 1. LeRobot

Repository:
- [huggingface/lerobot](https://github.com/huggingface/lerobot)

### What LeRobot does well

- excellent dataset format and Hub integration
- strong teleoperation and recording pipeline
- broad policy coverage
- consistent training and evaluation flow
- pragmatic hardware abstractions for low-cost robot arms

### What LeRobot does not solve

- no natural-language-first control surface
- no agent runtime as the architectural center
- no strong Web-native interaction layer
- limited built-in simulation depth
- weak end-user onboarding for hardware discovery and setup

### Why it matters for RoboClaw

RoboClaw should not try to replace LeRobot's learning engine from scratch.
It should absorb the best parts of LeRobot and build a higher-level assistant
experience around them.

## 2. dimos

Repository:
- [dimensionalOS/dimos](https://github.com/dimensionalOS/dimos)

### What dimos does well

- rich agent-driven orchestration
- strong perception stack
- strong navigation and mapping support
- spatial memory and environment reasoning
- modular composition patterns

### What dimos does not solve

- no strong built-in dataset and policy learning loop
- limited support for low-cost arms in the style RoboClaw targets
- heavy dependency footprint
- significant architectural complexity

### Why it matters for RoboClaw

RoboClaw can learn from dimos in:

- agent orchestration patterns
- perception architecture
- modular control/runtime boundaries

But it should avoid inheriting unnecessary framework weight when a simpler,
focused path is sufficient.

## 3. RoboClaw Target Architecture

The first-principles view is:

1. RoboClaw is not a robotics framework with an agent attached.
2. RoboClaw is an agent that can operate robots.
3. Safety must be architectural, not merely prompt-level.
4. Slow reasoning and fast control should remain separated.
5. Learning should be a first-class subsystem rather than an afterthought.

### Target stack

```text
Interface
  -> Agent Runtime
  -> Skill Ecosystem
  -> Embodiment / Learning / Perception
  -> Transport
  -> Real World / Simulation
```

### Learning should sit in the center

RoboClaw's learning subsystem should cover:

- data collection
- dataset management
- policy library integration
- training orchestration
- deployment and evaluation

This is the exact place where Nexla / ProSemA-style workbench functionality
fits: it is not a new top-level product, but a structured workbench for the
Learning subsystem.

## 4. What RoboClaw Should Learn from Each System

### Learn from LeRobot

- use a compatible dataset and recording model
- reuse strong training/evaluation patterns
- keep policy packaging and deployment simple
- preserve practical support for low-cost robotics setups

### Learn from dimos

- keep the architecture agent-centered
- preserve clear runtime boundaries
- treat perception, navigation, and memory as first-class capabilities
- invest in structured tooling rather than ad hoc prompt flows

## 5. Architectural Implications

### Implication 1: Chat can be the default entry point

The agent should remain the primary user-facing surface for launch, status,
guidance, and high-level commands.

### Implication 2: Workbenches still matter

Chat is not enough for:

- timeline editing
- video review
- prototype comparison
- annotation spans
- semantic propagation review

These belong in structured workbench surfaces.

### Implication 3: Learning workbench is not a separate product

Nexla-like capabilities should attach to RoboClaw's `Learning` module, not
compete with RoboClaw at the top level.

## 6. Summary

LeRobot is the strongest source of truth for data and policy learning.
dimos is the strongest source of truth for agent-driven robotics operations.

RoboClaw should combine:

- the agent-centered operating model
- a disciplined safety boundary
- a learning engine that covers collection through deployment
- a Web and workbench layer that makes the whole system usable

That leads to a clean position:

```text
RoboClaw = agent cockpit + learning engine + safety + perception + workbench
```
