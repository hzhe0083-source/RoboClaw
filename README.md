<h1>
  <img src="assets/roboclaw_icon.png" alt="RoboClaw icon" width="84" />
  RoboClaw
</h1>

<p>
  <img src="https://img.shields.io/badge/status-early_stage-orange" alt="status">
  <img src="https://img.shields.io/badge/open-source-blue" alt="open source">
  <img src="https://img.shields.io/badge/community-co--create-green" alt="community">
  <img src="https://img.shields.io/badge/focus-embodied_ai-black" alt="focus">
  <a href="https://discord.gg/HNcDbDYR"><img src="https://img.shields.io/badge/Discord-Join%20Chat-5865F2?logo=discord&logoColor=white" alt="Discord"></a>
</p>

**RoboClaw** is an open-source embodied intelligence assistant.

## ✨ What We Want To Build

RoboClaw is being built around four planes:

- `General Embodied Entry Plane`: the user-facing path from natural language to a runnable embodied session
- `Embodiment Onboarding Pattern Plane`: the reusable pattern for bringing new open-source embodiments into RoboClaw without hard-coding one robot into the generic stack
- `Cross-Embodiment Skill Base Plane`: the shared semantic layer where multiple embodiments can expose compatible skills and procedures
- `Research Assistant Plane`: evaluation, failure analysis, recovery, and research workflows built on top of the embodied execution stack

Right now, we are concentrated on the first plane.

```mermaid
graph TB
    subgraph UI ["🖥️ User Interface"]
        CLI["CLI<br/><i>roboclaw agent</i>"]
        WebUI["Web UI<br/><i>control panel</i>"]
    end

    subgraph Channels ["📡 Channels"]
        Discord["Discord"]
        WeChat["WeChat"]
        WhatsApp["WhatsApp"]
    end

    LLM["🧠 LLM<br/><i>Claude / GPT / Local</i>"]

    subgraph Agent ["⚙️ Agent Runtime"]
        Loop["Agent Loop<br/><i>conversation + tool use</i>"]
        Memory["Memory"]
        Tools["Tool Registry"]
        Intent["Intent Classifier"]
    end

    subgraph Embodied ["🦾 Embodied Layer"]
        direction TB
        subgraph Onboard ["① Onboarding"]
            Detect["Hardware Detection"]
            Calibrate["Calibration"]
            AdapterGen["Adapter Generation"]
        end
        subgraph Control ["② Control"]
            Primitives["Primitives"]
            Skills["Skill Composition"]
            Safety["Safety Constraints"]
        end
        subgraph Perception ["③ Perception"]
            Camera["Camera Manager"]
            Stream["MJPEG Streaming"]
            VLM["Visual Feedback"]
        end
        subgraph Data ["④ Data Collection"]
            Episodes["Episode Recording"]
            Dataset["Dataset Management"]
            CollectGUI["Collection GUI"]
        end
        subgraph Training ["⑤ Training"]
            ACT["ACT Policy"]
            DP["Diffusion Policy"]
            Checkpoint["Checkpoint Mgmt"]
        end
        subgraph Deploy ["⑥ Deployment"]
            Inference["Policy Inference"]
            Monitor["Supervision"]
            SimToReal["Sim → Real"]
        end
    end

    subgraph Transport ["🔌 Transport Layer"]
        ROS2["ROS2"]
        Serial["Serial<br/><i>Feetech / Dynamixel</i>"]
        Sim["MuJoCo Simulation"]
    end

    subgraph Hardware ["🤖 Hardware"]
        SO101["SO101 Arm"]
        PiperX["PiperX Arm"]
        Gripper["Gripper"]
        Cam["USB Camera"]
        Future["More robots..."]
    end

    UI --> Agent
    Channels --> Agent
    Agent <--> LLM
    Loop --> Tools
    Loop --> Memory
    Loop --> Intent
    Tools --> Embodied
    Embodied --> Transport
    Transport --> Hardware
    Sim -.-> |"web viewer"| WebUI

    style UI fill:#e3f2fd,stroke:#1565c0
    style Channels fill:#fce4ec,stroke:#c62828
    style Agent fill:#fff3e0,stroke:#e65100
    style Embodied fill:#e8f5e9,stroke:#2e7d32
    style Transport fill:#f3e5f5,stroke:#6a1b9a
    style Hardware fill:#eceff1,stroke:#37474f
    style LLM fill:#fffde7,stroke:#f57f17
```

Current embodiment coverage is tracked like this:

| Category | Representative | Simulation | Real |
| --- | --- | --- | --- |
| Arm | SO101 | 🟡 | 🟡 |
| Dexterous Hand | Inspire | 🔴 | 🔴 |
| Humanoid | G1 | 🔴 | 🔴 |
| Wheeled Robot | WBase | 🔴 | 🔴 |

## 📦 Installation

### For Users

- `AI-assisted setup`: ask your coding assistant:

```text
Help me install RoboClaw from https://github.com/MINT-SJTU/RoboClaw
```

- [Non-Docker Installation](./INSTALLATION.md)
- [Docker Installation](./DOCKERINSTALLATION.md)

### For Developers

- [Docker Workflow](./DOCKER_WORKFLOW.md)

## 📢 Community Co-Creation

RoboClaw is being built in the open. We want major direction-setting choices, such as embodiment support, simulator priorities, and roadmap focus, to be discussed with the community.

You can contribute through:

- `Issues`: bug reports, feature requests, and implementation suggestions
- `Pull Requests`: code and documentation improvements

The most useful contribution areas right now are:

- embodied AI architecture
- capability abstraction and semantic skill interfaces
- ROS2 and execution-layer integration
- simulator support and real robot adaptation
- evaluation, validation, and developer experience

If you want to contribute more actively, contact us at bozhaonanjing [[@]] gmail [[DOT]] com.

## 🗺️ To-do List

- [x] Set up the open-source repository, publish the initial README, and add GitHub-native proposal entry points
- [x] Document the first embodied stack and its boundaries
- [ ] Define unified embodied capabilities and semantic interfaces
- [x] Run the first real setup end to end with workspace-generated assets
- [x] Support the first real robot platform
- [ ] Design safe-stop and recovery mechanisms
- [ ] Improve first-run reliability for embodied setup and execution
- [ ] Expand from the first supported embodiment to more open-source robots
- [ ] ...

Coming soon.

## 🙏 Acknowledgments

RoboClaw references and inherits part of its initial thinking from [nanobot](https://github.com/HKUDS/nanobot). We appreciate its lightweight practice along the [OpenClaw](https://github.com/openclaw/openclaw) line, which helped us build the first prototype faster and continue evolving toward embodied intelligence.

## Community Channels

- Discord: [Join the server](https://discord.gg/HNcDbDYR)
- WeChat official post: [Coming Soon](https://evorl.example.com/wechat-post)
- GitHub Issues: [Create an issue](https://github.com/MINT-SJTU/RoboClaw/issues)
- Email: business@evomind-tech.com

## Affiliations

<p align="center">
  <img alt="SJTU community visual" src="https://raw.githubusercontent.com/MINT-SJTU/Evo-RL/main/website/assets/images/sjtu.png" height="68"/>
  <img alt="EvoMind" src="https://raw.githubusercontent.com/MINT-SJTU/Evo-RL/main/website/assets/images/evomind1.png" height="60"/>
</p>

## Citation

```bibtex
@misc{roboclaw2026,
  title        = {RoboClaw: An Open-Source Embodied Intelligence Assistant},
  author       = {RoboClaw Contributors},
  year         = {2026},
  howpublished = {\url{https://github.com/MINT-SJTU/RoboClaw}}
}
```
