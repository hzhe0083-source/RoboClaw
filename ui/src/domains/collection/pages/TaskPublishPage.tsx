import { type DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import {
  collectionApi,
  type Assignment,
  type CollectionTask,
  type TaskPayload,
} from '@/domains/collection/api/collectionApi'
import { todayIso } from '@/domains/collection/lib/metrics'
import { useAuthStore } from '@/shared/lib/authStore'
import { ActionButton } from '@/shared/ui'

function secondsToHours(seconds: number) {
  return (seconds / 3600).toFixed(1)
}

function progressPct(item: Assignment) {
  if (item.target_seconds <= 0) return 0
  return Math.min(100, Math.round((item.completed_seconds / item.target_seconds) * 100))
}

function normalizePhoneRows(rows: string[]) {
  return Array.from(new Set(rows.map((item) => item.trim()).filter(Boolean)))
}

function invalidPhones(phones: string[]) {
  return phones.filter((phone) => !/^1\d{10}$/.test(phone))
}

function countPublishedAssignments(items: Assignment[]) {
  return items.reduce<Record<string, number>>((counts, item) => {
    counts[item.task_id] = (counts[item.task_id] || 0) + 1
    return counts
  }, {})
}

const emptyTask: TaskPayload = {
  description: '',
  task_prompt: '',
  num_episodes: 1,
  fps: 30,
  episode_time_s: 300,
  reset_time_s: 10,
  use_cameras: true,
  dataset_prefix: 'rec',
  is_active: true,
}

interface AssignmentEditState {
  id: string
  phone: string
  task_id: string
  target_date: string
  target_hours: string
  episode_time_s: string
  reset_time_s: string
  is_active: boolean
}

function assignmentToEditState(item: Assignment): AssignmentEditState {
  return {
    id: item.id,
    phone: item.phone,
    task_id: item.task_id,
    target_date: item.target_date,
    target_hours: secondsToHours(item.target_seconds),
    episode_time_s: String(item.task_params.episode_time_s),
    reset_time_s: String(item.task_params.reset_time_s),
    is_active: item.is_active,
  }
}

function taskToPayload(task: CollectionTask): TaskPayload {
  return {
    name: task.name,
    description: task.description || '',
    task_prompt: task.task_prompt,
    num_episodes: task.num_episodes,
    fps: task.fps,
    episode_time_s: task.episode_time_s,
    reset_time_s: task.reset_time_s,
    use_cameras: task.use_cameras,
    dataset_prefix: task.dataset_prefix,
    is_active: task.is_active,
  }
}

export default function TaskPublishPage() {
  const { user, isLoggedIn, isChecking } = useAuthStore()
  const [view, setView] = useState<'publish' | 'progress'>('publish')
  const [tasks, setTasks] = useState<CollectionTask[]>([])
  const [progress, setProgress] = useState<Assignment[]>([])
  const [taskForm, setTaskForm] = useState<TaskPayload>(emptyTask)
  const [taskEditor, setTaskEditor] = useState<TaskPayload>(emptyTask)
  const [taskDialogMode, setTaskDialogMode] = useState<'create' | 'details' | 'edit' | 'publish' | null>(null)
  const [dialogTaskId, setDialogTaskId] = useState('')
  const [deleteCandidate, setDeleteCandidate] = useState<CollectionTask | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState('')
  const [publishCounts, setPublishCounts] = useState<Record<string, number>>({})
  const [draggingTaskId, setDraggingTaskId] = useState('')
  const [trashHover, setTrashHover] = useState(false)
  const [trashReady, setTrashReady] = useState(false)
  const [assignmentEditor, setAssignmentEditor] = useState<AssignmentEditState | null>(null)
  const [phoneRows, setPhoneRows] = useState([''])
  const [targetDate, setTargetDate] = useState(todayIso())
  const [allDates, setAllDates] = useState(false)
  const [targetHours, setTargetHours] = useState('3')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const activeTasks = useMemo(() => tasks.filter((task) => task.is_active), [tasks])
  const dialogTask = useMemo(
    () => tasks.find((task) => task.id === dialogTaskId) || null,
    [dialogTaskId, tasks],
  )
  const progressDate = allDates ? undefined : targetDate
  const totalTargetSeconds = progress.reduce((sum, item) => sum + item.target_seconds, 0)
  const totalCompletedSeconds = progress.reduce((sum, item) => sum + item.completed_seconds, 0)
  const trashReadyTimer = useRef<number | null>(null)

  function clearTrashReadyTimer() {
    if (trashReadyTimer.current !== null) {
      window.clearTimeout(trashReadyTimer.current)
      trashReadyTimer.current = null
    }
  }

  function resetTrashDragState() {
    clearTrashReadyTimer()
    setDraggingTaskId('')
    setTrashHover(false)
    setTrashReady(false)
  }

  async function refresh() {
    const [nextTasks, nextProgress, allProgress] = await Promise.all([
      collectionApi.listTasks(),
      collectionApi.getProgress(progressDate),
      collectionApi.getProgress(),
    ])
    const nextSelectedTask = nextTasks.find((task) => task.id === selectedTaskId && task.is_active)
    const firstActiveTask = nextTasks.find((task) => task.is_active)
    setTasks(nextTasks)
    setProgress(nextProgress)
    setPublishCounts(countPublishedAssignments(allProgress))
    if (!nextSelectedTask) {
      setSelectedTaskId(firstActiveTask?.id || '')
    }
  }

  useEffect(() => {
    if (!isLoggedIn || user?.level !== 'admin') return
    let cancelled = false
    async function load() {
      try {
        setError('')
        const [nextTasks, nextProgress, allProgress] = await Promise.all([
          collectionApi.listTasks(),
          collectionApi.getProgress(progressDate),
          collectionApi.getProgress(),
        ])
        if (cancelled) return
        setTasks(nextTasks)
        setProgress(nextProgress)
        setPublishCounts(countPublishedAssignments(allProgress))
        const nextSelectedTask = nextTasks.find((task) => task.id === selectedTaskId && task.is_active)
        const firstActiveTask = nextTasks.find((task) => task.is_active)
        if (!nextSelectedTask) {
          setSelectedTaskId(firstActiveTask?.id || '')
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [allDates, isLoggedIn, progressDate, selectedTaskId, targetDate, user?.level])

  useEffect(() => () => clearTrashReadyTimer(), [])

  async function createTask(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const created = await collectionApi.createTask(taskForm)
      setTaskForm({ ...emptyTask })
      setTaskDialogMode(null)
      await refresh()
      setSelectedTaskId(created.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  async function assignTask(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const phones = normalizePhoneRows(phoneRows)
      const invalid = invalidPhones(phones)
      if (phones.length === 0) {
        throw new Error('请输入手机号')
      }
      if (invalid.length > 0) {
        throw new Error(`手机号格式不正确：${invalid.join(', ')}`)
      }
      for (const phone of phones) {
        await collectionApi.upsertAssignment({
          phone,
          task_id: selectedTaskId,
          target_date: targetDate,
          target_seconds: Math.round(Number(targetHours) * 3600),
          is_active: true,
        })
      }
      setPhoneRows([''])
      await refresh()
      if (taskDialogMode === 'publish') {
        setTaskDialogMode(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  async function updateAssignment(event: FormEvent) {
    event.preventDefault()
    if (!assignmentEditor) return
    setLoading(true)
    setError('')
    try {
      if (!/^1\d{10}$/.test(assignmentEditor.phone.trim())) {
        throw new Error('手机号格式不正确')
      }
      const episodeSeconds = Number(assignmentEditor.episode_time_s)
      const resetSeconds = Number(assignmentEditor.reset_time_s)
      if (!(episodeSeconds > 0)) {
        throw new Error('录制时间必须大于 0')
      }
      if (resetSeconds < 0) {
        throw new Error('Reset 时间不能小于 0')
      }
      await collectionApi.upsertAssignment({
        phone: assignmentEditor.phone.trim(),
        task_id: assignmentEditor.task_id,
        target_date: assignmentEditor.target_date,
        target_seconds: Math.round(Number(assignmentEditor.target_hours) * 3600),
        is_active: assignmentEditor.is_active,
      })
      await collectionApi.updateTask(assignmentEditor.task_id, {
        episode_time_s: Math.round(episodeSeconds),
        reset_time_s: Math.round(resetSeconds),
      })
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  async function updateTask(event: FormEvent) {
    event.preventDefault()
    if (!dialogTask) return
    setLoading(true)
    setError('')
    try {
      await collectionApi.updateTask(dialogTask.id, taskEditor)
      await refresh()
      setTaskDialogMode('details')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  async function deleteTask() {
    if (!deleteCandidate) return
    setLoading(true)
    setError('')
    try {
      await collectionApi.deleteTask(deleteCandidate.id)
      if (selectedTaskId === deleteCandidate.id) {
        setSelectedTaskId('')
      }
      if (dialogTaskId === deleteCandidate.id) {
        setTaskDialogMode(null)
        setDialogTaskId('')
      }
      setDeleteCandidate(null)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  async function toggleAssignmentActive(item: Assignment, isActive: boolean) {
    setLoading(true)
    setError('')
    try {
      await collectionApi.upsertAssignment({
        phone: item.phone,
        task_id: item.task_id,
        target_date: item.target_date,
        target_seconds: item.target_seconds,
        is_active: isActive,
      })
      if (assignmentEditor?.id === item.id) {
        setAssignmentEditor({ ...assignmentEditor, is_active: isActive })
      }
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  function openCreateDialog() {
    setTaskForm({ ...emptyTask })
    setDialogTaskId('')
    setTaskDialogMode('create')
  }

  function openTaskDialog(task: CollectionTask) {
    if (!task.is_active) return
    setDialogTaskId(task.id)
    setTaskEditor(taskToPayload(task))
    setTaskDialogMode('details')
  }

  function editDialogTask() {
    if (!dialogTask) return
    setTaskEditor(taskToPayload(dialogTask))
    setTaskDialogMode('edit')
  }

  function publishDialogTask() {
    if (!dialogTask) return
    setSelectedTaskId(dialogTask.id)
    setTaskDialogMode('publish')
  }

  function taskPublishCount(taskId: string) {
    return publishCounts[taskId] || 0
  }

  function closeTaskDialog() {
    setTaskDialogMode(null)
    setDialogTaskId('')
  }

  function updatePhoneRow(index: number, value: string) {
    setPhoneRows((rows) => rows.map((row, rowIndex) => (rowIndex === index ? value : row)))
  }

  function addPhoneRow() {
    setPhoneRows((rows) => [...rows, ''])
  }

  function removePhoneRow(index: number) {
    setPhoneRows((rows) => (rows.length === 1 ? [''] : rows.filter((_, rowIndex) => rowIndex !== index)))
  }

  function dragTask(event: DragEvent<HTMLButtonElement>, task: CollectionTask) {
    if (!task.is_active) {
      event.preventDefault()
      return
    }
    setDraggingTaskId(task.id)
    setTrashHover(false)
    setTrashReady(false)
    clearTrashReadyTimer()
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', task.id)
  }

  function armTrashDrop() {
    if (!draggingTaskId) return
    setTrashHover(true)
    if (trashReadyTimer.current !== null) return
    trashReadyTimer.current = window.setTimeout(() => {
      setTrashReady(true)
      trashReadyTimer.current = null
    }, 650)
  }

  function disarmTrashDrop() {
    clearTrashReadyTimer()
    setTrashHover(false)
    setTrashReady(false)
  }

  function leaveTrashDrop(event: DragEvent<HTMLElement>) {
    const nextTarget = event.relatedTarget
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return
    }
    disarmTrashDrop()
  }

  function dropTaskForDelete(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    const taskId = event.dataTransfer.getData('text/plain')
    const task = trashReady ? tasks.find((item) => item.id === taskId) : null
    resetTrashDragState()
    if (task) {
      setDeleteCandidate(task)
    }
  }

  function renderTaskFields(value: TaskPayload, update: (next: TaskPayload) => void) {
    return (
      <>
        <label>
          <span>任务描述</span>
          <textarea
            className="collection-input collection-textarea"
            value={value.task_prompt}
            onChange={(event) => update({ ...value, task_prompt: event.target.value })}
            required
          />
        </label>
        <div className="collection-form-grid">
          <label>
            <span>Episodes</span>
            <input className="collection-input" type="number" min={1} value={value.num_episodes} onChange={(event) => update({ ...value, num_episodes: Number(event.target.value) })} />
          </label>
          <label>
            <span>FPS</span>
            <input className="collection-input" type="number" min={1} value={value.fps} onChange={(event) => update({ ...value, fps: Number(event.target.value) })} />
          </label>
          <label>
            <span>录制秒</span>
            <input className="collection-input" type="number" min={1} value={value.episode_time_s} onChange={(event) => update({ ...value, episode_time_s: Number(event.target.value) })} />
          </label>
          <label>
            <span>Reset 秒</span>
            <input className="collection-input" type="number" min={0} value={value.reset_time_s} onChange={(event) => update({ ...value, reset_time_s: Number(event.target.value) })} />
          </label>
          <label>
            <span>Dataset prefix</span>
            <input className="collection-input" value={value.dataset_prefix} onChange={(event) => update({ ...value, dataset_prefix: event.target.value })} required />
          </label>
        </div>
      </>
    )
  }

  function renderPhoneInputs() {
    return (
      <label>
        <span>手机号</span>
        <div className="collection-phone-list">
          {phoneRows.map((phone, index) => (
            <div className="collection-phone-row" key={index}>
              <input
                className="collection-input"
                value={phone}
                onChange={(event) => updatePhoneRow(index, event.target.value)}
                placeholder="13800000000"
                required={index === 0}
              />
              <button
                className="collection-icon-button"
                type="button"
                onClick={addPhoneRow}
                aria-label="添加手机号"
              >
                +
              </button>
              <button
                className="collection-icon-button collection-icon-button--muted"
                type="button"
                onClick={() => removePhoneRow(index)}
                disabled={phoneRows.length === 1 && !phone}
                aria-label="删除手机号"
              >
                -
              </button>
            </div>
          ))}
        </div>
      </label>
    )
  }

  if (isChecking) {
    return <div className="collection-page"><div className="collection-empty">Checking account...</div></div>
  }

  if (!isLoggedIn || user?.level !== 'admin') {
    return <Navigate to="/collection/control" replace />
  }

  return (
    <div className="collection-page">
      <div className="collection-toolbar collection-toolbar--actions-only">
        <div className="collection-toolbar__actions">
          <div className="collection-mode-tabs" role="tablist" aria-label="采集管理视图">
            <button
              type="button"
              className={view === 'publish' ? 'collection-mode-tab collection-mode-tab--active' : 'collection-mode-tab'}
              onClick={() => setView('publish')}
            >
              任务发布
            </button>
            <button
              type="button"
              className={view === 'progress' ? 'collection-mode-tab collection-mode-tab--active' : 'collection-mode-tab'}
              onClick={() => setView('progress')}
            >
              任务进度
            </button>
          </div>
        </div>
      </div>

      {error && <div className="collection-error">{error}</div>}

      {view === 'publish' && (
        <div className="collection-publish-stage">
          <section className="collection-task-pool">
            <div className="collection-pool-head">
              <div>
                <h3>任务池</h3>
                <span>{activeTasks.length} 个任务</span>
              </div>
              <button type="button" className="collection-link-button collection-link-button--primary" onClick={openCreateDialog}>
                新建任务
              </button>
            </div>

            <div className="collection-task-bubbles" aria-label="任务池">
              {activeTasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  draggable={task.is_active}
                  onDragStart={(event) => dragTask(event, task)}
                  onDragEnd={resetTrashDragState}
                  onClick={() => openTaskDialog(task)}
                  disabled={!task.is_active}
                  className={[
                    'collection-task-bubble',
                    selectedTaskId === task.id ? 'collection-task-bubble--selected' : '',
                    !task.is_active ? 'collection-task-bubble--inactive' : '',
                  ].filter(Boolean).join(' ')}
                >
                  <div className="collection-task-bubble__top">
                    <strong>{task.task_prompt}</strong>
                    <span>{taskPublishCount(task.id)} 次发布</span>
                  </div>
                  <div className="collection-task-bubble__metrics">
                    <span>{task.num_episodes} eps · {task.fps} fps</span>
                    <small>{task.episode_time_s}s record · {task.reset_time_s}s reset</small>
                  </div>
                </button>
              ))}
              {activeTasks.length === 0 && (
                <div className="collection-empty collection-empty--compact">先创建一个任务</div>
              )}
            </div>
          </section>
        </div>
      )}

      {draggingTaskId && (
        <section
          className={[
            'collection-trash-flyout',
            trashHover ? 'collection-trash-flyout--hover' : '',
            trashReady ? 'collection-trash-flyout--ready' : '',
          ].filter(Boolean).join(' ')}
          onDragEnter={(event) => {
            event.preventDefault()
            armTrashDrop()
          }}
          onDragOver={(event) => {
            event.preventDefault()
            event.dataTransfer.dropEffect = trashReady ? 'move' : 'none'
            armTrashDrop()
          }}
          onDragLeave={leaveTrashDrop}
          onDrop={dropTaskForDelete}
        >
          <strong>{trashReady ? '松开删除' : '删除任务'}</strong>
          <span>{trashReady ? '会先让你确认' : '拖到这里停留片刻'}</span>
        </section>
      )}

      {view === 'progress' && (
        <section className="collection-panel collection-panel--wide">
        <div className="collection-panel__head collection-panel__head--progress">
          <div>
            <h3>{allDates ? '全部进度' : `${targetDate} 进度`}</h3>
            <span>{progress.length} 个分配 · {secondsToHours(totalCompletedSeconds)} / {secondsToHours(totalTargetSeconds)} h</span>
          </div>
          <div className="collection-progress-filters">
            <button
              type="button"
              className={allDates ? 'collection-link-button collection-link-button--primary' : 'collection-link-button'}
              onClick={() => setAllDates((value) => !value)}
            >
              全部日期
            </button>
            <input
              className="collection-input collection-input--date"
              type="date"
              value={targetDate}
              disabled={allDates}
              onChange={(event) => setTargetDate(event.target.value)}
            />
          </div>
        </div>
        <div className="collection-progress-list">
          {progress.map((item) => {
            const pct = progressPct(item)
            const editing = assignmentEditor?.id === item.id
            return (
              <div
                className={editing ? 'collection-progress-item collection-progress-item--editing' : 'collection-progress-item'}
                key={item.id}
              >
                <div className="collection-progress-row">
                  <div>
                    <strong>{item.task_params.task}</strong>
                    <span>{item.target_date} · {item.phone}{item.user_nickname ? ` · ${item.user_nickname}` : ''}</span>
                  </div>
                  <div className="collection-progress-row__bar"><span style={{ width: `${pct}%` }} /></div>
                  <div className="collection-progress-row__actions">
                    <button
                      type="button"
                      className={item.is_active ? 'collection-assignment-switch collection-assignment-switch--on' : 'collection-assignment-switch'}
                      aria-pressed={item.is_active}
                      disabled={loading}
                      onClick={() => toggleAssignmentActive(item, !item.is_active)}
                    >
                      <span><i /></span>
                      <strong>{item.is_active ? '分配' : '停止'}</strong>
                    </button>
                    <div className="collection-progress-row__value">
                      {secondsToHours(item.completed_seconds)} / {secondsToHours(item.target_seconds)} h
                    </div>
                    <button
                      type="button"
                      className="collection-link-button"
                      onClick={() => setAssignmentEditor(editing ? null : assignmentToEditState(item))}
                    >
                      {editing ? '收起' : '编辑'}
                    </button>
                  </div>
                </div>

                {editing && assignmentEditor && (
                  <form className="collection-progress-edit" onSubmit={updateAssignment}>
                    <label>
                      <span>任务</span>
                      <select
                        className="collection-input"
                        value={assignmentEditor.task_id}
                        onChange={(event) => setAssignmentEditor({ ...assignmentEditor, task_id: event.target.value })}
                        required
                      >
                        {tasks.map((task) => (
                          <option key={task.id} value={task.id}>{task.task_prompt}</option>
                        ))}
                      </select>
                    </label>
                    <div className="collection-progress-edit__grid">
                      <label>
                        <span>日期</span>
                        <input className="collection-input" type="date" value={assignmentEditor.target_date} onChange={(event) => setAssignmentEditor({ ...assignmentEditor, target_date: event.target.value })} required />
                      </label>
                      <label>
                        <span>目标小时</span>
                        <input className="collection-input" type="number" min={0.1} step={0.1} value={assignmentEditor.target_hours} onChange={(event) => setAssignmentEditor({ ...assignmentEditor, target_hours: event.target.value })} required />
                      </label>
                      <label>
                        <span>录制秒</span>
                        <input className="collection-input" type="number" min={1} value={assignmentEditor.episode_time_s} onChange={(event) => setAssignmentEditor({ ...assignmentEditor, episode_time_s: event.target.value })} required />
                      </label>
                      <label>
                        <span>Reset 秒</span>
                        <input className="collection-input" type="number" min={0} value={assignmentEditor.reset_time_s} onChange={(event) => setAssignmentEditor({ ...assignmentEditor, reset_time_s: event.target.value })} required />
                      </label>
                    </div>
                    <div className="collection-progress-edit__actions">
                      <button
                        type="button"
                        className="collection-link-button"
                        onClick={() => setAssignmentEditor(null)}
                      >
                        取消
                      </button>
                      <ActionButton type="submit" disabled={loading || !assignmentEditor.task_id}>确定</ActionButton>
                    </div>
                  </form>
                )}
              </div>
            )
          })}
          {progress.length === 0 && <div className="collection-empty collection-empty--compact">暂无分配</div>}
        </div>
        </section>
      )}

      {taskDialogMode && (
        <div
          className="collection-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeTaskDialog()
          }}
        >
          <section className="collection-modal" role="dialog" aria-modal="true" aria-labelledby="collection-task-dialog-title">
            <div className="collection-modal__head">
              <div>
                <h3 id="collection-task-dialog-title">
                  {taskDialogMode === 'create' ? '创建新任务' : taskDialogMode === 'edit' ? '编辑任务' : taskDialogMode === 'publish' ? '发布任务' : '任务详情'}
                </h3>
                <span>{taskDialogMode === 'create' ? '创建后自动进入任务池' : '任务池里的任务可以编辑参数，也可以直接发布'}</span>
              </div>
              <button type="button" className="collection-link-button" onClick={closeTaskDialog}>关闭</button>
            </div>

            {taskDialogMode === 'create' && (
              <form className="collection-modal-form" onSubmit={createTask}>
                {renderTaskFields(taskForm, setTaskForm)}
                <div className="collection-modal__actions">
                  <button type="button" className="collection-link-button" onClick={closeTaskDialog}>取消</button>
                  <ActionButton type="submit" disabled={loading}>创建</ActionButton>
                </div>
              </form>
            )}

            {taskDialogMode === 'details' && dialogTask && (
              <div className="collection-task-dialog">
                <div className="collection-task-dialog-card">
                  <strong>{dialogTask.task_prompt}</strong>
                  <span>{dialogTask.num_episodes} eps · {dialogTask.fps} fps · {dialogTask.episode_time_s}s record · {dialogTask.reset_time_s}s reset</span>
                  <span>{taskPublishCount(dialogTask.id)} 次发布</span>
                  <small>Dataset prefix: {dialogTask.dataset_prefix}</small>
                </div>
                <div className="collection-modal__actions">
                  <button type="button" className="collection-link-button" onClick={editDialogTask}>编辑</button>
                  <ActionButton type="button" onClick={publishDialogTask}>发布</ActionButton>
                </div>
              </div>
            )}

            {taskDialogMode === 'edit' && dialogTask && (
              <form className="collection-modal-form" onSubmit={updateTask}>
                {renderTaskFields(taskEditor, setTaskEditor)}
                <div className="collection-modal__actions">
                  <button type="button" className="collection-link-button" onClick={() => setTaskDialogMode('details')}>取消</button>
                  <ActionButton type="submit" disabled={loading}>确定</ActionButton>
                </div>
              </form>
            )}

            {taskDialogMode === 'publish' && dialogTask && (
              <form className="collection-modal-form" onSubmit={assignTask}>
                <div className="collection-drop-target">
                  <strong>{dialogTask.task_prompt}</strong>
                  <span>{dialogTask.num_episodes} eps · {dialogTask.fps} fps · {dialogTask.episode_time_s}s</span>
                  <span>{taskPublishCount(dialogTask.id)} 次发布</span>
                </div>
                {renderPhoneInputs()}
                <div className="collection-form-grid">
                  <label>
                    <span>指定日期</span>
                    <input className="collection-input" type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} />
                  </label>
                  <label>
                    <span>目标小时</span>
                    <input className="collection-input" type="number" min={0.1} step={0.1} value={targetHours} onChange={(event) => setTargetHours(event.target.value)} />
                  </label>
                </div>
                <div className="collection-modal__actions">
                  <button type="button" className="collection-link-button" onClick={() => setTaskDialogMode('details')}>返回</button>
                  <ActionButton type="submit" disabled={loading || normalizePhoneRows(phoneRows).length === 0}>发布</ActionButton>
                </div>
              </form>
            )}
          </section>
        </div>
      )}

      {deleteCandidate && (
        <div
          className="collection-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDeleteCandidate(null)
          }}
        >
          <section className="collection-modal collection-modal--narrow" role="dialog" aria-modal="true" aria-labelledby="collection-delete-dialog-title">
            <div className="collection-modal__head">
              <div>
                <h3 id="collection-delete-dialog-title">删除任务</h3>
                <span>确认后这个任务会从任务池删除</span>
              </div>
              <button type="button" className="collection-link-button" onClick={() => setDeleteCandidate(null)}>关闭</button>
            </div>
            <div className="collection-task-dialog-card">
              <strong>{deleteCandidate.task_prompt}</strong>
              <span>{deleteCandidate.num_episodes} eps · {deleteCandidate.fps} fps · {deleteCandidate.episode_time_s}s</span>
            </div>
            <div className="collection-modal__actions">
              <button type="button" className="collection-link-button" onClick={() => setDeleteCandidate(null)}>取消</button>
              <ActionButton type="button" variant="danger" disabled={loading} onClick={deleteTask}>确认删除</ActionButton>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
