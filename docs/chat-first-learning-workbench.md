# RoboClaw Chat-First Learning Workbench Design

## Background

RoboClaw already has three relevant facts on the ground:

- The main architecture document places `Web UI` in the `Interface` layer next
  to CLI, Discord, Telegram, and WeChat.
- The repository already contains `roboclaw-web/` with routes for `/chat`,
  `/monitor`, `/control`, `/workbench`, and `/settings`.
- The repository already contains a Web transport layer under
  `roboclaw/channels/web.py`, so the project direction already accepts Web as a
  first-class entry point.

At the same time, Nexla's role is now clear:

- Nexla is not a second top-level product.
- Nexla supports RoboClaw's `Learning` module.
- Its core chain is:

```text
Data collection
  -> ProSemA workflow
  -> Train + deploy
```

The correct Web target is therefore not:

- a second standalone Nexla application
- a prompt-only ProSemA experience
- a second runtime that bypasses `MessageBus` and `AgentLoop`

The correct target is:

```text
Chat-first Web UI
  -> chat shell and control surface
  -> ProSemA skill
  -> structured workflow tool/service
  -> Learning execution pipeline
```

## Goals

This design exists to achieve three concrete outcomes:

1. Provide a genuinely usable Web chat entry point for RoboClaw.
2. Let the chat entry point launch and guide ProSemA-oriented learning flows.
3. Preserve structured workbench surfaces for the steps that do not belong in
   plain chat.

## Non-goals

This design does not try to:

- cram the full Learning workflow into free-form chat messages
- replace workflow state with prompt state
- turn the Web UI into a second parallel runtime
- ship a full standalone Nexla product before the shared boundaries are ready

## Current State

### What already exists

- `roboclaw-web/src/App.tsx`
  - defines `/chat`, `/monitor`, `/control`, `/workbench`, and `/settings`
- `roboclaw-web/src/features/workbench/WorkbenchPage.tsx`
  - provides a placeholder workbench route
- `docs/web-ui-quickstart.md`
  - already frames chat, monitoring, control, and workbench as product
    directions

### What is still missing

The current `roboclaw/channels/web.py` should be treated as a real transport
layer, but not as a finished long-term workbench backend.

The main missing pieces are:

- a stable learning workflow service layer
- a structured ProSemA tool contract
- a real workbench surface for review, annotation, and workflow inspection

## Core Conclusion

### The Web UI is two layers, not one

RoboClaw's Web UI should be split into two logical layers:

1. `Chat Shell`
   - the default entry point
   - task launch and control
   - result explanation and status tracking

2. `Learning Workbench`
   - structured interaction surface for Learning
   - dataset review
   - prototype inspection
   - annotation editing
   - semantic propagation review

These layers can live inside the same frontend, but they should not collapse
into the same interface pattern.

### ProSemA must be `skill + tool/service`, not prompt-only

Recommended structure:

```text
User request
  -> Agent
  -> ProSemA skill
  -> learning_workbench tool
  -> workflow service
  -> Learning execution and persistence
```

Responsibility split:

- `skill`
  - natural language interpretation
  - intent routing
  - user guidance
- `tool`
  - structured action dispatch
  - stable machine interface
- `service`
  - actual workflow logic
  - persistence
  - retryability
  - auditability

If the tool/service layer is skipped, the system will eventually suffer from:

- unrecoverable state
- irreproducible results
- poor auditability around annotation and clustering
- excessive prompt coupling between frontend and backend behavior

## Architecture

Primary flow:

```text
Browser
  -> Chat Shell
  -> Web chat API / WebSocket
  -> Agent runtime
  -> ProSemA skill
  -> learning_workbench tool
  -> Learning workflow service
  -> dataset / annotation / prototype / semantic / train
```

When the workflow reaches a structured interaction step:

```text
Agent response
  -> frontend detects a structured UI intent
  -> opens a workbench panel or page
  -> user reviews video / selects prototypes / edits annotations
  -> workbench API
  -> Learning workflow service
```

## Three-Layer Design

### Layer 1: Chat Shell

Responsibilities:

- primary entry point
- send messages to the agent
- render responses, progress, and tool hints
- show sessions and history
- jump into the Learning Workbench when needed

Recommended routes:

- `/chat`
  - default entry point
- `/workbench`
  - workbench container
- `/workbench/datasets/:datasetId`
  - dataset workbench
- `/workbench/workflows/:workflowId`
  - workflow detail view

### Layer 2: ProSemA Skill + Tool

Responsibilities:

- translate natural language into structured workflow actions
- keep the user oriented inside a multi-step workflow
- explain the next useful step
- tell the frontend when structured review is required

Required rule:

- the skill must not own long-lived workflow state
- the skill must not directly implement clustering, filtering, or propagation
- it must orchestrate existing tools and services

Recommended additions:

- `roboclaw/agent/tools/learning_workbench.py`
- `roboclaw/skills/prosema/SKILL.md`

### Layer 3: Learning Workflow Service

Responsibilities:

- persist workflow state
- run quality filtering
- run prototype discovery
- persist annotations
- run semantic propagation
- assemble final results
- trigger training and deployment

Recommended package structure:

```text
roboclaw/learning/
├── workflow/
│   ├── quality.py
│   ├── prototypes.py
│   ├── annotation.py
│   ├── semantic.py
│   └── final_result.py
├── services/
├── storage/
└── schemas/
```

## What Stays in Chat vs. What Opens the Workbench

### Good chat tasks

These belong in the chat shell:

- choose a dataset
- inspect a dataset summary
- start a workflow
- adjust workflow parameters
- run quality filtering
- run prototype discovery
- check workflow status
- check training status
- ask for result explanations
- ask for the recommended next step

### Workbench-only tasks

These should not be forced into plain chat:

- frame-level video review
- prototype comparison
- annotation span editing
- timeline editing
- semantic propagation validation
- final result visual review

Rule of thumb:

- chat launches, guides, explains, and controls
- workbench edits, reviews, and validates

## Suggested Tool Contract

Group the ProSemA surface behind a single tool group instead of a loose pile of
single-purpose calls.

Suggested tool name:

- `learning_workbench`

Suggested actions:

- `open_workbench`
- `list_datasets`
- `create_workflow`
- `get_workflow_status`
- `run_quality_filter`
- `run_prototype_discovery`
- `list_prototypes`
- `get_annotation`
- `save_annotation`
- `get_annotation_suggestions`
- `run_semantic_propagation`
- `get_final_result`
- `start_train`
- `get_train_status`

Special note:

- `open_workbench` should not do business work itself; it should return a
  structured route or UI intent payload
- `save_annotation` and related actions must use persistent storage rather than
  chat session state

## Suggested Web API

### Chat API

- `GET /api/health`
- `GET /api/chat/sessions`
- `GET /api/chat/sessions/{session_id}`
- `POST /api/chat/sessions/{session_id}/messages`
- `WS /ws/chat/{session_id}`

### Learning Workbench API

- `GET /api/learning/datasets`
- `GET /api/learning/datasets/{dataset_id}`
- `POST /api/learning/workflows`
- `GET /api/learning/workflows/{workflow_id}`
- `POST /api/learning/workflows/{workflow_id}/quality-run`
- `POST /api/learning/workflows/{workflow_id}/prototype-run`
- `GET /api/learning/workflows/{workflow_id}/prototypes`
- `GET /api/learning/workflows/{workflow_id}/annotations`
- `POST /api/learning/workflows/{workflow_id}/annotations`
- `POST /api/learning/workflows/{workflow_id}/semantic-run`
- `GET /api/learning/workflows/{workflow_id}/final-result`
- `POST /api/learning/workflows/{workflow_id}/train`
- `GET /api/learning/workflows/{workflow_id}/train-status`

## Directory Recommendations

### Keep

- `roboclaw-web/`
  - frontend workspace
- `roboclaw/agent/`
  - conversation orchestration
- `roboclaw/channels/`
  - chat transport
- `roboclaw/embodied/learning/`
  - base training and deployment support

### Add

```text
roboclaw/
├── learning/
│   ├── workflow/
│   ├── services/
│   ├── storage/
│   └── schemas/
├── web/
│   ├── app.py
│   ├── routes/
│   │   ├── chat.py
│   │   └── learning.py
│   └── connection_hub.py
└── agent/
    └── tools/
        └── learning_workbench.py
```

## Delivery Phases

### Phase 1: Make Web chat truly usable

Goals:

- turn `/chat` into a stable entry point
- align the Web transport with `MessageBus`, `BaseChannel`, and
  `SessionManager`

Deliverables:

- working Web chat
- session list and history
- progress rendering
- `/new` and `/stop` support

### Phase 2: Add the Learning tool contract

Goals:

- let users start ProSemA workflows from chat
- let the agent call `learning_workbench` in a structured way

Deliverables:

- basic ProSemA tool actions
- workflow status inspection
- dataset selection and launch path

### Phase 3: Build the real workbench

Goals:

- move the least chat-friendly work into a proper workbench surface

First targets:

- video preview
- prototype selection
- annotation editing
- semantic result review

### Phase 4: Close the training/deployment loop

Goals:

- move directly from workflow output into training and deployment

Deliverables:

- training status view
- deployment trigger
- navigation from annotation results to policies

## Product Principles

### Chat-first, not chat-only

Chat is the starting point. It is not the only interface pattern.

### Tool-first, not prompt-first

Complex Learning workflows must run through tools and services, not hidden
prompt state.

### Workbench supports Learning; it does not become a second RoboClaw

Nexla should become RoboClaw's Learning Workbench, not a competing top-level
entry point.

## Final Conclusion

The right direction is:

- keep `roboclaw-web` as the frontend shell
- make Web chat fully align with the existing agent runtime
- expose ProSemA as a `skill + tool/service` capability
- move structured review and annotation into `/workbench`
- ship a `chat-first, workbench-backed` Learning Web UI

In one sentence:

```text
Users start in the chat window, and the chat window drives the ProSemA workflow;
the interface only switches into the Learning Workbench when structured review or
editing is required.
```
