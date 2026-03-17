# RoboClaw Embodied Stack 最终版图架构说明

## 1. 定位

这份文档不是“当前代码解释”，而是 RoboClaw 具身架构的收敛版本。

目标不是先把所有版图都实现完整，而是：

1. 先把第 1 版图做成可快速扩展、可稳定接入、可重复复用的底座。
2. 第 2/3/4 版图只在当前阶段保留明确接口和扩展边界，不做过度实现。
3. 让后续接入 `xArm / PiperX / SO101 / 人形 / 轮式 / 灵巧手 / 无人机` 时，不需要推翻现有框架。

## 2. 四块版图与当前优先级

当前阶段建议的真实推进顺序：

1. 版图 1: 通用具身入口
2. 版图 4: 本体接入范式
3. 版图 2: 跨本体技能底座
4. 版图 3: 研究助手

原因：

- 版图 1 是当前业务目标
- 版图 4 决定版图 1 能不能快速铺本体
- 版图 2 依赖更成熟的统一 action/observation contract
- 版图 3 依赖更成熟的 telemetry / replay / scene recovery

### P0: 通用具身入口版图

目标：

- 让普通用户通过自然语言完成 `连接 / 校准 / 移动 / debug / 复位`
- 成为最好上手的具身本体统一入口

当前要求：

- 必须实现清楚
- 必须成为整体架构的设计中心
- 所有当前代码优先服务这一层

### P1: 本体接入范式版图

目标：

- 给企业和深度用户一套标准接入范式
- 让自定义本体也能被 RoboClaw 快速理解和接入

当前要求：

- 现在就把 contract 和 checklist 定清楚
- 现在就把 workspace-first 生成链固定下来
- 不需要现在就做完整自动化平台

### P2: 跨本体技能底座版图

目标：

- 把最高频语义原技能抽出来
- 让技能能跨 arm / mobile base / humanoid / hand / drone 复用

当前要求：

- 只保留接口和抽象方向
- 不追求现在就做完整技能库

### P3: 研究助手版图

目标：

- 数据采集
- 成功失败判定
- 场景恢复
- 推理分析
- 实验复盘

当前要求：

- 只保留 telemetry / trace / replay / simulator hooks
- 不提前做复杂研究工作流

## 3. 最终版图总架构

```text
用户自然语言
    ↓
Agent
    ├── 对话理解
    ├── 设备发现与接入引导
    ├── workspace setup 生成
    └── procedure 选择
    ↓
RoboClaw Embodied Runtime
    ├── Catalog
    │   ├── framework definitions
    │   └── workspace-generated assets
    ├── Runtime Session Manager
    ├── Procedure Engine
    └── Telemetry / Diagnostics
    ↓
Embodied Definition Plane
    ├── schema
    ├── robots
    ├── sensors
    ├── assemblies
    ├── deployments
    └── simulators
    ↓
Embodied Execution Plane
    ├── transports
    ├── carriers
    ├── adapters
    └── runtime bindings
    ↓
ROS2
    ├── topics
    ├── services
    └── actions
    ↓
Domain Bridges
    ├── arm / hand bridge
    ├── humanoid / whole-body bridge
    ├── mobile base / fleet bridge
    ├── drone bridge
    └── simulator bridge
    ↓
真实本体 / 仿真本体
```

关键原则：

- `roboclaw/embodied/` 只放 framework 协议和通用定义
- 用户现场的具体 setup 永远生成到 `~/.roboclaw/workspace/embodied/`
- 上层 agent 不直接依赖 vendor SDK
- 最终执行统一通过 ROS2
- 下层不是一个“万能 adapter”，而是多个领域 bridge

## 4. 当前代码框架里已经做对的边界

### 4.1 framework 和 workspace 分离

这是当前最重要的正确决策。

- framework: `roboclaw/embodied/`
- 用户现场: `~/.roboclaw/workspace/embodied/`
- merge 点: `build_catalog(workspace)`

这意味着：

- 代码库不会被每个用户的现场配置污染
- agent 可以按用户设备动态生成 setup
- 未来接很多本体时，核心协议和现场实例不会缠在一起

### 4.2 definition / execution 分离

这是对的。

- `definition`: 回答“系统是什么”
- `execution`: 回答“系统如何被驱动”

这样后续可以继续扩展不同桥接和不同仿真，而不把所有逻辑塞进 manifest。

### 4.3 robot type / sensor type / attachment instance 分离

这也是对的。

- `RobotManifest` 不应承载用户现场
- `SensorManifest` 不应承载本体挂载位置
- `Assembly` 负责把组件实例化并组合

### 4.4 ROS2 作为统一边界

对当前目标是合理的。

原因不是“ROS2 最强”，而是：

- 它能隔离厂商 SDK
- 它能统一真机和仿真
- 它适合接 MoveIt、Nav2、`ros2_control`、Gazebo、Isaac 等成熟生态

## 5. 当前框架的核心不足

下面这些不是“以后可以再想”的问题，而是会直接影响第 1 版图能不能铺开的结构性缺口。

### R1. 缺少跨本体统一 observation/action contract

当前 `RobotManifest` 和 `PrimitiveSpec` 还偏“语义命令描述”，不够“机器可检查”。

必须补：

- typed observation schema
- typed action schema
- units
- reference frame
- update rate
- command mode
- tolerance / completion condition

如果不补：

- 跨本体技能底座无法稳定复用
- arm 能用的 primitive，mobile base / drone / humanoid 无法映射
- agent 只能靠 prompt 猜动作语义

### R2. Assembly 还不是真正的系统拓扑图

当前 assembly 还是 attachment 列表，不足以表达真实系统。

必须补：

- frame / TF 关系
- control group
- end effector / tool / hand 拓扑
- sensor mount transform
- resource ownership
- safety boundary
- failure domain

如果不补：

- 多传感器和多本体组合会失控
- 人形、双臂、移动底盘、无人机 payload 很难统一接入

### R3. Adapter contract 太薄

`AdapterBinding` 现在还只是静态入口说明，不足以承载真实接入。

必须补：

- lifecycle
- readiness
- degraded mode
- dependency checks
- compatibility/version
- timeout/retry policy
- error taxonomy

如果不补：

- debug 只能靠经验
- 用户会频繁遇到“连上了但其实不可用”
- 第 1 版图体验会非常脆弱

### R4. Procedure engine 还不是生产级

第 1 版图真正卖的是 procedure，不是 primitive。

必须补：

- step preconditions
- timeout
- cancel
- retry
- compensation / rollback
- idempotency
- human-in-the-loop pause points

如果不补：

- “连接 / 校准 / 复位 / debug” 会高度不稳定
- 同一句话在不同本体上的行为会不一致

### R5. Telemetry 还不够做 debug 和研究助手

必须补：

- timestamp
- correlation_id
- component_id
- severity
- error_code
- raw evidence handle
- replay pointer
- execution lineage

如果不补：

- 第 1 版图里的 debug 不可靠
- 第 3 版图后面几乎要重做

### R6. Workspace loader 还缺 validation 和 migration

workspace-first 是对的，但当前 import Python 文件的方式还不够稳。

必须补：

- schema validation
- version field
- migration path
- lint / dry-run
- duplicate conflict check
- provenance

如果不补：

- agent 生成的 setup 很容易失控
- 用户自定义 setup 会把 runtime 弄崩

### R7. 缺少分域 bridge 策略

最终执行都通过 ROS2 没问题，但下层桥接不能只有一种套路。

至少要预留 5 类 bridge：

- arm / hand
- humanoid / whole-body
- mobile base / fleet
- drone
- simulator

如果不补：

- 框架会下意识被 arm 世界绑死
- 无人机和移动底盘会被迫塞进错误抽象

## 6. P0 必补 contract 清单

下面这份清单只针对“第 1 版图落地必须有的 contract”。

### C1. Component Contract

作用：

- 定义 robot / sensor 的静态能力

必须字段：

- stable id
- family/type
- capability families
- supported control modes
- supported sensing modes
- safety defaults
- version

优先级：`P0`

### C2. Action/Observation Contract

作用：

- 定义跨本体统一动作和状态接口

必须字段：

- action name
- parameter schema
- unit
- frame
- tolerance
- completion semantics
- observation schema
- health schema

优先级：`P0`

### C3. Assembly Topology Contract

作用：

- 定义系统由哪些本体、传感器、挂载和控制资源组成

必须字段：

- robot attachments
- sensor attachments
- frames / transforms
- tool/end-effector map
- control groups
- execution targets
- default target

优先级：`P0`

### C4. Deployment Contract

作用：

- 定义某个现场的具体连接参数和安全覆盖

必须字段：

- target selection
- ROS2 namespace
- serial/IP/device ids
- calibration paths
- safety overrides
- local notes
- version

优先级：`P0`

### C5. Adapter Lifecycle Contract

作用：

- 定义从 RoboClaw runtime 到 ROS2/domain bridge 的执行边界

必须字段：

- connect
- disconnect
- ready
- stop
- reset
- recover
- dependency check
- timeout policy
- error code taxonomy

优先级：`P0`

### C6. Procedure Contract

作用：

- 定义 `connect / calibrate / move / debug / reset` 的稳定执行流程

必须字段：

- procedure id
- required capabilities
- step graph
- preconditions
- timeout
- retry policy
- operator intervention point

优先级：`P0`

### C7. Telemetry Contract

作用：

- 支撑 debug、诊断、复位和未来研究助手

必须字段：

- timestamp
- correlation id
- source component
- event kind
- severity
- machine-readable payload
- raw evidence handle

优先级：`P0`

### C8. Workspace Asset Contract

作用：

- 让 agent 生成的 setup 能被 catalog 稳定读回

必须字段：

- export convention
- schema version
- validation rules
- duplicate detection
- migration policy

优先级：`P0`

## 7. P2/P3 预留接口，不提前过度实现

### 第 2 版图现在只需预留

- semantic skill registry
- capability-to-skill mapper
- normalized action/observation bridge
- skill simulation hooks

### 第 3 版图现在只需预留

- richer telemetry
- trace store
- replay handle
- experiment metadata
- scene reset hooks

### 第 4 版图现在要先定规则，再逐步补工具

- onboarding scaffolds
- validator
- contract tests
- migration tools
- adapter packaging conventions

## 8. 接入任意新本体的标准 checklist

下面这份 checklist 适用于 `xArm / PiperX / SO101 / 人形 / 轮式 / 灵巧手 / 无人机`。

### Step 1. 归类本体

- 它属于 arm / humanoid / mobile base / hand / drone 中哪一类
- 它需要哪类 domain bridge
- 它是否包含多子系统

### Step 2. 明确控制面

- 支持 joint / cartesian / velocity / waypoint / mission 哪些控制方式
- 控制命令的单位、坐标系、频率、反馈是什么
- stop/reset/recover 怎么定义

### Step 3. 明确感知面

- 有哪些传感器
- 数据通过什么 ROS2 topic/service 暴露
- 哪些传感器对 `debug` 必不可少

### Step 4. 定义最小 P0 能力

第 1 版图最低必须支持：

- connect
- get_state
- get_health
- stop
- reset
- recover
- execute at least one movement primitive
- debug snapshot

如果这 8 项缺任何一项，该本体不应进入“可对话接入”名单。

### Step 5. 定义 robot/sensor manifests

- 优先复用 framework 的组件 manifest
- 如果是本地独有设备，先定义在 workspace
- 不要把现场参数写进 framework

### Step 6. 组装 assembly

- 明确 robots
- 明确 sensors
- 明确 execution targets
- 明确 default target
- 明确 frame / mount / tool 关系

### Step 7. 写 deployment

- 真实设备路径
- ROS2 namespace
- 相机设备
- 标定目录
- 本地安全限制

### Step 8. 写 adapter binding

- 指向 domain bridge 或 ROS2 entrypoint
- 标注 supported targets
- 标注依赖和 readiness 要求

### Step 9. 接 procedure

- connect procedure
- calibrate procedure
- move procedure
- debug procedure
- reset procedure

任何本体没有 procedure 对接完成，都不算第 1 版图接入完成。

### Step 10. 做 contract validation

- schema pass
- duplicate id check
- missing dependency check
- target consistency check
- telemetry availability check

## 9. 风险排序

下面是当前阶段最应该关注的风险，从高到低排序。

### Risk 1. 机械臂中心化风险

症状：

- primitive、capability、procedure 全部默认按 arm 思维设计

影响：

- 后面接轮式、人形、无人机会大幅重构

应对：

- 现在就把 domain bridge 分层写进设计
- 现在就把 observation/action contract 做成真正跨本体

### Risk 2. procedure 不稳定风险

症状：

- 有 manifest、有 adapter，但 `connect/debug/reset` 行为不稳定

影响：

- 第 1 版图用户体验直接失败

应对：

- procedure engine 优先级必须高于 skill engine

### Risk 3. workspace 资产失控风险

症状：

- agent 生成代码越来越多，但没有 validation/migration

影响：

- 用户 setup 很快不可维护

应对：

- 尽快补 schema version、validator、catalog dry-run

### Risk 4. telemetry 不足风险

症状：

- 系统能动，但说不清为什么动不了

影响：

- debug 体验差
- 研究助手版图未来返工

应对：

- 第 1 版图就补关键 telemetry 字段

### Risk 5. ROS2 统一但下层桥接混乱风险

症状：

- 所有本体都硬塞一套 adapter 模式

影响：

- 平台表面统一，底层难维护

应对：

- 显式定义 arm/mobile/drone/humanoid/simulator bridge 类型

## 10. 实施顺序

### Phase A: 只为第 1 版图落地

必须做：

1. 补强 `Action/Observation Contract`
2. 补强 `Assembly Topology Contract`
3. 补强 `Adapter Lifecycle Contract`
4. 补强 `Procedure Contract`
5. 补强 `Telemetry Contract`
6. 补强 `Workspace Asset Contract`

### Phase B: 扩到更多本体

再做：

1. domain bridge 分层
2. contract validator
3. catalog dry-run
4. richer deployment tooling

### Phase C: 为第 2/3/4 版图开口

最后再做：

1. semantic skill registry
2. trace store / replay
3. onboarding automation
4. migration / packaging / verification

## 11. 最终结论

当前这套框架可以被认定为：

- 一个合理的 `v0 平台骨架`
- 一个可以继续演化的方向
- 但还不是最终稳定范式

如果只看“方向”，它是对的。

如果只看“能不能立刻高效铺满所有开源知名本体”，答案是否定的。

当前最正确的策略是：

- 把第 1 版图做成设计中心
- 把其余版图做成接口保留
- 先把 P0 contract 补齐
- 再开始大规模铺本体

否则接入速度会很快，但后面返工会更快。
