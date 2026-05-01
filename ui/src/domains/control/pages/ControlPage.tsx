import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { collectionApi, type CollectionStatus } from '@/domains/collection/api/collectionApi'
import { CameraPreviewPanel } from '@/domains/control/components/CameraPreviewPanel'
import { ServoPanel } from '@/domains/hardware/components/ServoPanel'
import { useHardwareStore, type OperationCapability } from '@/domains/hardware/store/useHardwareStore'
import { useSessionStore, type SessionState } from '@/domains/session/store/useSessionStore'
import { useI18n } from '@/i18n'
import { useAuthStore } from '@/shared/lib/authStore'

const blockedCapability: OperationCapability = { ready: false, missing: [] }

function ActionBtn({
  children, disabled, onClick, color, title,
}: {
  children: React.ReactNode
  disabled?: boolean
  onClick?: () => void
  color: 'ac' | 'gn' | 'rd' | 'yl'
  title?: string
}) {
  const cls: Record<string, string> = {
    ac: 'bg-ac hover:bg-ac2 shadow-glow-ac',
    gn: 'bg-gn hover:bg-gn/90 shadow-glow-gn',
    rd: 'bg-rd hover:bg-rd/90 shadow-glow-rd',
    yl: 'bg-yl hover:bg-yl/90 shadow-glow-yl',
  }
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      title={title}
      className={`w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-all
        active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-25 disabled:shadow-none ${cls[color]}`}
    >
      {children}
    </button>
  )
}

function capabilityReason(capability: OperationCapability) {
  return capability.missing.join(' · ')
}

function capabilityOf(hwStatus: any, name: string): OperationCapability {
  return hwStatus?.capabilities?.[name] ?? blockedCapability
}

function canStart(state: SessionState) {
  return state === 'idle' || state === 'error'
}

function formatSeconds(seconds: number) {
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`
}

function HardwareSummary({ hwStatus, busy, state, owner }: {
  hwStatus: any
  busy: boolean
  state: string
  owner: string
}) {
  const { t } = useI18n()
  const hwReady = hwStatus?.ready ?? false
  const accent = !hwStatus ? 'shadow-inset-ac' : hwReady ? 'shadow-inset-gn' : 'shadow-inset-yl'

  return (
    <div className={`bg-sf rounded-lg p-3.5 ${accent}`}>
      <div className="flex flex-wrap items-center gap-5">
        <div>
          <div className="text-2xs font-mono uppercase tracking-widest text-tx3">{t('arms')}</div>
          <div className="mt-2 flex items-center gap-1.5">
            {hwStatus?.arms.map((arm: any) => (
              <span
                key={arm.alias}
                className={`h-2.5 w-2.5 rounded-full ring-2 ring-white ${!arm.connected ? 'bg-rd' : !arm.calibrated ? 'bg-yl' : 'bg-gn'}`}
                title={arm.alias}
              />
            ))}
          </div>
        </div>
        <div>
          <div className="text-2xs font-mono uppercase tracking-widest text-tx3">{t('cameras')}</div>
          <div className="mt-2 flex items-center gap-1.5">
            {hwStatus?.cameras.map((camera: any) => (
              <span
                key={camera.alias}
                className={`h-2.5 w-2.5 rounded-full ring-2 ring-white ${camera.connected ? 'bg-gn' : 'bg-rd'}`}
                title={camera.alias}
              />
            ))}
          </div>
        </div>
        <div className="ml-auto text-right">
          <div className="text-xs font-semibold text-tx">
            {hwReady ? t('hwReady') : `${hwStatus?.missing?.length ?? 0} ${t('warnings')}`}
          </div>
          {busy && <div className="mt-1 text-2xs font-mono text-tx3">{state}{owner ? ` · ${owner}` : ''}</div>}
        </div>
      </div>
    </div>
  )
}

function CollectionRunPanel({
  collectionStatus,
  session,
  loading,
  onStop,
  onSave,
  onDiscard,
  onSkipReset,
}: {
  collectionStatus: CollectionStatus | null
  session: any
  loading: boolean
  onStop: () => void
  onSave: () => void
  onDiscard: () => void
  onSkipReset: () => void
}) {
  const active = collectionStatus?.active_run
  const targetEpisodes = session.target_episodes || active?.task_params.num_episodes || 0
  const pct = targetEpisodes > 0 ? Math.min(100, Math.round((session.saved_episodes / targetEpisodes) * 100)) : 0

  if (!active) {
    return (
      <section className="bg-sf rounded-lg p-5 shadow-card">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-2xs font-mono uppercase tracking-widest text-tx3">Collection</div>
            <h2 className="mt-2 text-xl font-bold text-tx">没有进行中的采集</h2>
            <p className="mt-1 text-sm text-tx2">请从采集任务页选择任务后开始采集。</p>
          </div>
          <Link className="collection-link-button" to="/collection">返回采集任务</Link>
        </div>
      </section>
    )
  }

  return (
    <section className="bg-sf rounded-lg p-5 shadow-card">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-2xs font-mono uppercase tracking-widest text-tx3">Collection</div>
          <h2 className="mt-2 text-xl font-bold text-tx">正在采集</h2>
          <p className="mt-1 text-sm text-tx2">{active.dataset_name}</p>
          <p className="mt-2 max-w-3xl text-sm text-tx">{active.task_params.task}</p>
        </div>
        <div className="grid min-w-[220px] grid-cols-2 gap-2 text-sm">
          <div className="rounded-lg bg-sf2 p-3">
            <div className="text-2xs font-mono uppercase tracking-widest text-tx3">Episodes</div>
            <div className="mt-1 text-lg font-bold text-tx">{session.saved_episodes}/{targetEpisodes}</div>
          </div>
          <div className="rounded-lg bg-sf2 p-3">
            <div className="text-2xs font-mono uppercase tracking-widest text-tx3">Elapsed</div>
            <div className="mt-1 text-lg font-bold text-tx">{formatSeconds(Math.round(session.elapsed_seconds || 0))}</div>
          </div>
        </div>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-sf2">
        <div
          className="h-full rounded-full bg-gradient-to-r from-ac2 to-ac transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <ActionBtn color="gn" disabled={loading || session.record_phase !== 'recording' || !!session.record_pending_command} onClick={onSave}>
          保存 episode
        </ActionBtn>
        <ActionBtn color="yl" disabled={loading || session.record_phase !== 'recording' || !!session.record_pending_command} onClick={onSkipReset}>
          跳过 reset
        </ActionBtn>
        <ActionBtn color="yl" disabled={loading || session.record_phase !== 'recording' || !!session.record_pending_command} onClick={onDiscard}>
          丢弃 episode
        </ActionBtn>
        <ActionBtn color="rd" disabled={loading} onClick={onStop}>
          结束采集
        </ActionBtn>
      </div>
      <div className="mt-3 text-xs font-medium text-tx2">
        状态：{session.record_phase || session.state}
      </div>
    </section>
  )
}

function AdminDebugPanel({
  state,
  loading,
  hwStatus,
  onTeleopStart,
  onTeleopStop,
  onRecordStart,
  onRecordStop,
}: {
  state: SessionState
  loading: string | null
  hwStatus: any
  onTeleopStart: () => void
  onTeleopStop: () => void
  onRecordStart: (params: {
    task: string
    numEpisodes: number
    fps: number
    episodeTime: number
    resetTime: number
  }) => void
  onRecordStop: () => void
}) {
  const [task, setTask] = useState('')
  const [fps, setFps] = useState(30)
  const [numEpisodes, setNumEpisodes] = useState(1)
  const [episodeTime, setEpisodeTime] = useState(300)
  const [resetTime, setResetTime] = useState(10)
  const teleopCapability = capabilityOf(hwStatus, 'teleop')
  const recordCapability = capabilityOf(hwStatus, 'record')
  const busy = state !== 'idle' && state !== 'error'

  return (
    <section className="bg-sf rounded-lg p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-2xs font-mono uppercase tracking-widest text-tx3">Admin Debug</div>
          <h2 className="mt-2 text-xl font-bold text-tx">调试控制</h2>
        </div>
        <Link className="collection-link-button" to="/collection/admin">任务发布</Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div className="grid gap-2">
          <ActionBtn color="ac" disabled={!canStart(state) || !teleopCapability.ready || !!loading} onClick={onTeleopStart} title={capabilityReason(teleopCapability)}>
            开始遥操作
          </ActionBtn>
          <ActionBtn color="yl" disabled={state !== 'teleoperating' || !!loading} onClick={onTeleopStop}>
            停止遥操作
          </ActionBtn>
        </div>

        <div className="grid gap-3">
          <input
            className="collection-input"
            value={task}
            onChange={(event) => setTask(event.target.value)}
            placeholder="调试录制任务描述"
          />
          <div className="collection-form-grid">
            <input className="collection-input" type="number" min={1} value={numEpisodes} onChange={(event) => setNumEpisodes(Number(event.target.value) || 1)} />
            <input className="collection-input" type="number" min={1} value={fps} onChange={(event) => setFps(Number(event.target.value) || 30)} />
            <input className="collection-input" type="number" min={1} value={episodeTime} onChange={(event) => setEpisodeTime(Number(event.target.value) || 300)} />
            <input className="collection-input" type="number" min={0} value={resetTime} onChange={(event) => setResetTime(Number(event.target.value) || 0)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <ActionBtn
              color="gn"
              disabled={busy || !recordCapability.ready || !!loading || !task.trim()}
              onClick={() => onRecordStart({ task, numEpisodes, fps, episodeTime, resetTime })}
              title={capabilityReason(recordCapability)}
            >
              开始调试录制
            </ActionBtn>
            <ActionBtn color="rd" disabled={state !== 'recording' || !!loading} onClick={onRecordStop}>
              停止调试录制
            </ActionBtn>
          </div>
        </div>
      </div>
    </section>
  )
}

export default function ControlPage() {
  const user = useAuthStore((store) => store.user)
  const isAdmin = user?.level === 'admin'
  const session = useSessionStore((store) => store.session)
  const loading = useSessionStore((store) => store.loading)
  const fetchSessionStatus = useSessionStore((store) => store.fetchSessionStatus)
  const doTeleopStart = useSessionStore((store) => store.doTeleopStart)
  const doTeleopStop = useSessionStore((store) => store.doTeleopStop)
  const doRecordStart = useSessionStore((store) => store.doRecordStart)
  const doRecordStop = useSessionStore((store) => store.doRecordStop)
  const doSaveEpisode = useSessionStore((store) => store.doSaveEpisode)
  const doDiscardEpisode = useSessionStore((store) => store.doDiscardEpisode)
  const doSkipReset = useSessionStore((store) => store.doSkipReset)
  const hwStatus = useHardwareStore((store) => store.hardwareStatus)
  const fetchHardwareStatus = useHardwareStore((store) => store.fetchHardwareStatus)
  const [collectionStatus, setCollectionStatus] = useState<CollectionStatus | null>(null)
  const [collectionError, setCollectionError] = useState('')
  const [collectionLoading, setCollectionLoading] = useState(false)

  const busy = session.state !== 'idle' && session.state !== 'error'
  const camerasExist = hwStatus && hwStatus.cameras.length > 0 && hwStatus.cameras.some((camera: any) => camera.connected)

  async function refreshCollectionStatus() {
    const [nextStatus] = await Promise.all([
      collectionApi.getStatus(),
      fetchSessionStatus(),
    ])
    setCollectionStatus(nextStatus)
  }

  useEffect(() => {
    void fetchHardwareStatus()
    void refreshCollectionStatus().catch((err) => setCollectionError(err instanceof Error ? err.message : String(err)))
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void fetchHardwareStatus()
        void refreshCollectionStatus().catch((err) => setCollectionError(err instanceof Error ? err.message : String(err)))
      }
    }, 5000)
    return () => clearInterval(timer)
  }, [fetchHardwareStatus, fetchSessionStatus])

  async function runCollectionAction(action: () => Promise<void>) {
    setCollectionLoading(true)
    setCollectionError('')
    try {
      await action()
      await refreshCollectionStatus()
    } catch (err) {
      setCollectionError(err instanceof Error ? err.message : String(err))
    } finally {
      setCollectionLoading(false)
    }
  }

  function handleAdminRecordStart(params: {
    task: string
    numEpisodes: number
    fps: number
    episodeTime: number
    resetTime: number
  }) {
    void doRecordStart({
      task: params.task,
      num_episodes: params.numEpisodes,
      fps: params.fps,
      episode_time_s: params.episodeTime,
      reset_time_s: params.resetTime,
      use_cameras: true,
    })
  }

  async function stopCollectionRun() {
    await runCollectionAction(async () => {
      const result = await collectionApi.stopRun()
      if (result.status === 'pending_cloud_finish') {
        setCollectionError(`本地采集已结束，云端 finish 待重试：${result.detail || ''}`)
      }
    })
  }

  return (
    <div className="page-enter flex h-full flex-col overflow-y-auto">
      {collectionError && (
        <div className="border-b border-rd/30 border-l-4 border-l-rd bg-rd/10 px-4 py-2 text-sm font-medium text-rd">
          {collectionError}
        </div>
      )}

      <div className="space-y-3 p-4">
        <HardwareSummary
          hwStatus={hwStatus}
          busy={busy}
          state={session.state}
          owner={session.embodiment_owner}
        />

        <CollectionRunPanel
          collectionStatus={collectionStatus}
          session={session}
          loading={collectionLoading || Boolean(loading)}
          onStop={() => { void stopCollectionRun() }}
          onSave={() => { void runCollectionAction(doSaveEpisode) }}
          onDiscard={() => { void runCollectionAction(doDiscardEpisode) }}
          onSkipReset={() => { void runCollectionAction(doSkipReset) }}
        />

        {isAdmin && (
          <AdminDebugPanel
            state={session.state}
            loading={loading}
            hwStatus={hwStatus}
            onTeleopStart={() => { void doTeleopStart() }}
            onTeleopStop={() => { void doTeleopStop() }}
            onRecordStart={handleAdminRecordStart}
            onRecordStop={() => { void doRecordStop() }}
          />
        )}

        <div className="grid min-h-[240px] grid-cols-2 gap-3 max-[900px]:grid-cols-1">
          {camerasExist ? (
            <CameraPreviewPanel cameras={hwStatus!.cameras} busy={busy} />
          ) : (
            <div className="flex items-center justify-center rounded-lg bg-sf p-4 text-sm text-tx3 shadow-card">
              没有可用相机画面
            </div>
          )}
          <ServoPanel state={session.state} />
        </div>
      </div>
    </div>
  )
}
