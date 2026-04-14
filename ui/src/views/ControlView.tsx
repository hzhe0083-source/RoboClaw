import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDashboard, type SessionState } from '../controllers/dashboard'
import { useI18n } from '../controllers/i18n'
import { CameraPreviewPanel } from '../components/CameraPreviewPanel'
import { ServoPanel } from '../components/ServoPanel'

function canDo(state: SessionState, hwReady: boolean) {
  const canStart = state === 'idle' || state === 'error'
  const tele = state === 'teleoperating'
  const rec = state === 'recording'
  const rep = state === 'replaying'
  const inf = state === 'inferring'
  return {
    teleopStart: canStart && hwReady,
    teleopStop: tele,
    recStart: (canStart || tele) && hwReady,
    recStop: rec,
    saveEp: rec,
    discardEp: rec,
    replayStart: canStart && hwReady,
    replayStop: rep,
    inferStart: canStart && hwReady,
    inferStop: inf,
  }
}

function ActionBtn({
  children, disabled, onClick, color, title,
}: {
  children: React.ReactNode; disabled?: boolean; onClick?: () => void
  color: 'ac' | 'gn' | 'rd' | 'yl'; title?: string
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
      className={`w-full px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition-all
        active:scale-[0.97] disabled:opacity-25 disabled:cursor-not-allowed disabled:shadow-none ${cls[color]}`}
    >
      {children}
    </button>
  )
}

export default function ControlView() {
  const store = useDashboard()
  const { session, datasets, loading, hardwareStatus: hwStatus, trainCurve } = store
  const { state, episode_phase: episodePhase, saved_episodes: savedEpisodes, target_episodes: targetEpisodes, embodiment_owner: owner } = session
  const hwReady = hwStatus?.ready ?? false
  const ok = canDo(state, hwReady)
  const { t } = useI18n()
  const navigate = useNavigate()

  const [task, setTask] = useState('')
  const [numEp, setNumEp] = useState(10)
  const [episodeTime, setEpisodeTime] = useState(300)
  const [resetTime, setResetTime] = useState(10)
  const [datasetName, setDatasetName] = useState('')
  const [fps, setFps] = useState(30)
  const [useCameras, setUseCameras] = useState(true)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [replayDataset, setReplayDataset] = useState('')
  const [replayEpisode, setReplayEpisode] = useState(0)
  const [inferCheckpoint, setInferCheckpoint] = useState('')
  const [inferSourceDs, setInferSourceDs] = useState('')
  const [inferEpisodes, setInferEpisodes] = useState(1)
  const [trainJobId, setTrainJobId] = useState('')

  useEffect(() => {
    store.loadDatasets()
    store.fetchHardwareStatus()
    store.fetchSessionStatus()
    const pollInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        store.fetchHardwareStatus()
        store.fetchSessionStatus()
        store.loadDatasets()
      }
    }, 5000)
    return () => clearInterval(pollInterval)
  }, [])

  useEffect(() => {
    const jobId = trainJobId.trim()
    store.clearTrainCurve()
    if (!jobId) {
      return
    }

    store.fetchTrainCurve(jobId)
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        store.fetchTrainCurve(jobId)
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [trainJobId])


  const stateLabel: Record<string, string> = {
    preparing: t('hwInitializing'),
    teleoperating: t('stateTeleoperating'),
    recording: t('stateRecording'),
    replaying: t('stateReplaying'),
    inferring: t('stateInferring'),
    calibrating: t('calibrating'),
  }
  const stateBadgeCls: Record<string, string> = {
    preparing: 'bg-yl/15 text-yl border-yl/30',
    teleoperating: 'bg-ac/15 text-ac border-ac/30',
    recording: 'bg-rd/15 text-rd border-rd/30',
    replaying: 'bg-gn/15 text-gn border-gn/30',
    inferring: 'bg-ac/15 text-ac border-ac/30',
    calibrating: 'bg-yl/15 text-yl border-yl/30',
  }

  const busy = state !== 'idle' && state !== 'error'

  // Local elapsed timer — WS events stop after state transitions, so we tick locally
  const [elapsedTick, setElapsedTick] = useState(0)
  useEffect(() => {
    setElapsedTick(Math.round(session.elapsed_seconds) || 0)
  }, [session.elapsed_seconds])
  useEffect(() => {
    if (!busy) return
    const interval = setInterval(() => setElapsedTick(t => t + 1), 1000)
    return () => clearInterval(interval)
  }, [busy])

  const [taskError, setTaskError] = useState(false)

  function handleRecordStart() {
    if (!task.trim()) {
      setTaskError(true)
      setTimeout(() => setTaskError(false), 1500)
      return
    }
    store.doRecordStart({
      task: task.trim(),
      num_episodes: numEp,
      episode_time_s: episodeTime,
      reset_time_s: resetTime,
      dataset_name: datasetName.trim() || undefined,
      fps,
      use_cameras: useCameras,
    })
  }
  const busyReason = busy ? `${stateLabel[state] || state}${owner ? ` (${owner})` : ''}` : ''
  const hwAccent = !hwStatus ? 'shadow-inset-ac' : hwStatus.ready ? 'shadow-inset-gn' : 'shadow-inset-yl'
  const camerasExist = hwStatus && hwStatus.cameras.length > 0 && hwStatus.cameras.some((c: any) => c.connected)
  const pct = targetEpisodes > 0 ? Math.round((savedEpisodes / targetEpisodes) * 100) : 0
  const curvePoints = trainCurve?.points ?? []
  const hasCurveData = curvePoints.length > 0
  const latestEp = hasCurveData ? curvePoints[curvePoints.length - 1].ep : null
  const xMin = hasCurveData ? Math.min(...curvePoints.map((point) => point.ep)) : 0
  const xMax = hasCurveData ? Math.max(...curvePoints.map((point) => point.ep)) : 100
  const rawYMin = hasCurveData ? Math.min(...curvePoints.map((point) => point.loss)) : 0.1
  const rawYMax = hasCurveData ? Math.max(...curvePoints.map((point) => point.loss)) : 1
  const yPadding = hasCurveData ? Math.max((rawYMax - rawYMin) * 0.15, 0.05) : 0
  const yMin = hasCurveData ? Math.max(0, rawYMin - yPadding) : rawYMin
  const yMax = hasCurveData ? rawYMax + yPadding : rawYMax
  const xSpan = Math.max(xMax - xMin, 1)
  const ySpan = Math.max(yMax - yMin, 0.1)
  const yTicks = hasCurveData
    ? Array.from({ length: 4 }, (_, index) => {
      const ratio = 1 - (index / 3)
      return (yMin + ySpan * ratio).toFixed(2)
    })
    : ['1.00', '0.70', '0.40', '0.10']
  const xTicks = hasCurveData
    ? Array.from({ length: 5 }, (_, index) => {
      const ratio = index / 4
      const tick = xMin + xSpan * ratio
      return String(Math.round(tick))
    })
    : ['0', '25', '50', '75', '100']
  const polylinePoints = hasCurveData
    ? curvePoints.map((point) => {
      const x = 8 + ((point.ep - xMin) / xSpan) * 84
      const y = 88 - ((point.loss - yMin) / ySpan) * 74
      return `${x.toFixed(2)},${y.toFixed(2)}`
    }).join(' ')
    : ''

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Error & hardware warning bars */}
      {session.error && (
        <div className="px-4 py-2 bg-rd/10 border-b border-rd/30 border-l-4 border-l-rd text-rd text-sm font-mono whitespace-pre-wrap flex items-start gap-2">
          <span className="flex-1">{session.error}</span>
          <button
            onClick={store.doDismissError}
            className="shrink-0 px-2 py-0.5 rounded text-xs font-semibold bg-rd/20 hover:bg-rd/30 transition-colors"
          >
            {t('dismissError')}
          </button>
        </div>
      )}
      {!hwReady && hwStatus && (
        <div className="px-4 py-2.5 bg-yl/8 border-b border-yl/20 text-yl text-sm font-medium">
          {hwStatus.missing.join(' · ')}
        </div>
      )}

      <div className="p-4 space-y-3">
        {/* Top row: Hardware status + Teleop + Recording */}
        <div className="flex gap-3 max-[900px]:flex-col">
          {/* Hardware status card — enhanced with embodiment state */}
          <div
            onClick={() => navigate('/settings')}
            className={`w-[200px] max-[900px]:w-full shrink-0 bg-sf rounded-lg p-3.5 cursor-pointer
              ${hwAccent} transition-all hover:shadow-card-hover animate-slide-up stagger-1`}
          >
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-2xs text-tx3 font-mono uppercase tracking-widest">{t('arms')}</span>
                <div className="flex items-center gap-1">
                  {hwStatus?.arms.map(arm => (
                    <span key={arm.alias}
                      className={`w-2.5 h-2.5 rounded-full ring-2 ring-white ${!arm.connected ? 'bg-rd' : !arm.calibrated ? 'bg-yl' : 'bg-gn'}`}
                      title={arm.alias}
                    />
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xs text-tx3 font-mono uppercase tracking-widest">{t('cameras')}</span>
                <div className="flex items-center gap-1">
                  {hwStatus?.cameras.map(cam => (
                    <span key={cam.alias}
                      className={`w-2.5 h-2.5 rounded-full ring-2 ring-white ${cam.connected ? 'bg-gn' : 'bg-rd'}`}
                      title={cam.alias}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-2 text-2xs text-tx3 font-medium">
              {hwStatus?.ready ? t('hwReady') : `${hwStatus?.missing?.length ?? 0} ${t('warnings')}`}
            </div>

            {/* Embodiment status — local process or cross-process (agent) */}
            {busy && (
              <div className="mt-2 pt-2 border-t border-bd/40">
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full animate-pulse ${stateBadgeCls[state]?.includes('text-rd') ? 'bg-rd' : stateBadgeCls[state]?.includes('text-yl') ? 'bg-yl' : 'bg-ac'}`} />
                  <span className="text-xs font-semibold text-tx">{stateLabel[state] || state}</span>
                </div>
                <div className="text-2xs text-tx3 mt-0.5 font-mono">
                  {elapsedTick > 0 && `${elapsedTick}s`}
                  {owner && ` · ${t('embodimentSource')}: ${owner}`}
                </div>
              </div>
            )}
            {!busy && owner && owner !== 'unknown' && (
              <div className="mt-2 pt-2 border-t border-bd/40">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full animate-pulse bg-yl" />
                  <span className="text-xs font-semibold text-tx">{owner}</span>
                </div>
                <div className="text-2xs text-tx3 mt-0.5 font-mono">{t('embodimentSource')}</div>
              </div>
            )}

          </div>

          {/* Teleop */}
          <div className="w-[190px] max-[900px]:w-full shrink-0 bg-sf rounded-lg p-3.5 shadow-card animate-slide-up stagger-2">
            <h3 className="text-2xs text-tx3 font-mono uppercase tracking-widest mb-3">{t('teleoperation')}</h3>
            <div className="space-y-2">
              <ActionBtn color="ac" disabled={!ok.teleopStart || !!loading}
                onClick={() => store.doTeleopStart()}
                title={busy ? busyReason : undefined}>
                {loading === 'teleop' ? t('startingTeleop') : t('startTeleop')}
              </ActionBtn>
              <ActionBtn color="yl" disabled={!ok.teleopStop || !!loading} onClick={store.doTeleopStop}>
                {t('stopTeleop')}
              </ActionBtn>
            </div>
            {(loading === 'teleop' || state === 'teleoperating') && (
              <div className="mt-3 flex items-center gap-2 text-xs text-ac font-medium">
                <span className="w-2 h-2 rounded-full bg-ac animate-pulse" />
                {loading === 'teleop' ? t('hwInitializing') : t('stateTeleoperating')}
              </div>
            )}
          </div>

          {/* Recording */}
          <div className="flex-1 min-w-0 bg-sf rounded-lg p-3.5 shadow-card animate-slide-up stagger-3">
            <h3 className="text-2xs text-tx3 font-mono uppercase tracking-widest mb-3">{t('recording')}</h3>
            <input
              value={task}
              onChange={(e) => { setTask(e.target.value); setTaskError(false) }}
              placeholder="Pick up the red block"
              className={`w-full bg-sf2 border text-tx px-3 py-2 rounded-lg text-sm
                focus:outline-none focus:border-ac focus:shadow-glow-ac placeholder:text-tx3 mb-3
                ${taskError ? 'border-rd animate-shake' : 'border-bd'}`}
            />
            <div className="flex gap-2 items-end flex-wrap">
              <label className="flex flex-col gap-1 text-2xs text-tx3 font-mono w-[72px]">
                {t('numEpisodes')}
                <input type="number" value={numEp} onChange={(e) => setNumEp(Number(e.target.value) || 10)} min={1}
                  className="bg-sf2 border border-bd text-tx px-2 py-1.5 rounded text-sm font-mono focus:outline-none focus:border-ac" />
              </label>
              <label className="flex flex-col gap-1 text-2xs text-tx3 font-mono w-[80px]">
                {t('epTime')}
                <input type="number" value={episodeTime} onChange={(e) => setEpisodeTime(Number(e.target.value) || 300)} min={1}
                  className="bg-sf2 border border-bd text-tx px-2 py-1.5 rounded text-sm font-mono focus:outline-none focus:border-ac" />
              </label>
              <label className="flex flex-col gap-1 text-2xs text-tx3 font-mono w-[80px]">
                {t('resetTime')}
                <input type="number" value={resetTime} onChange={(e) => setResetTime(Number(e.target.value) || 10)} min={0}
                  className="bg-sf2 border border-bd text-tx px-2 py-1.5 rounded text-sm font-mono focus:outline-none focus:border-ac" />
              </label>
            </div>

            {/* Collapsible advanced options */}
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1.5 text-2xs text-tx3 font-mono uppercase tracking-widest
                hover:text-tx2 transition-colors my-2"
            >
              <svg
                className={`w-3 h-3 transition-transform ${showAdvanced ? 'rotate-90' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              {t('advancedOptions')}
            </button>

            {showAdvanced && (
              <div className="flex gap-2 items-end flex-wrap mb-3 pl-4 border-l-2 border-bd/40">
                <label className="flex flex-col gap-1 text-2xs text-tx3 font-mono flex-1 min-w-[120px]">
                  {t('datasetName')}
                  <input
                    value={datasetName}
                    onChange={(e) => setDatasetName(e.target.value)}
                    placeholder="rec_20260410_..."
                    className="bg-sf2 border border-bd text-tx px-2 py-1.5 rounded text-sm font-mono
                      focus:outline-none focus:border-ac placeholder:text-tx3"
                  />
                </label>
                <label className="flex flex-col gap-1 text-2xs text-tx3 font-mono w-[72px]">
                  {t('fps')}
                  <input
                    type="number" value={fps}
                    onChange={(e) => setFps(Number(e.target.value) || 30)} min={1} max={120}
                    className="bg-sf2 border border-bd text-tx px-2 py-1.5 rounded text-sm font-mono
                      focus:outline-none focus:border-ac"
                  />
                </label>
                <label className="flex items-center gap-2 text-2xs text-tx3 font-mono cursor-pointer self-center pb-1.5">
                  <input
                    type="checkbox" checked={useCameras}
                    onChange={(e) => setUseCameras(e.target.checked)}
                    className="w-4 h-4 rounded border-bd accent-ac"
                  />
                  {t('useCameras')}
                </label>
              </div>
            )}

            <div className="flex gap-2 items-end flex-wrap">
              <div className="flex gap-2 ml-auto">
                <ActionBtn color="gn" disabled={!ok.recStart || !!loading} onClick={handleRecordStart}
                  title={busy && state !== 'teleoperating' ? busyReason : undefined}>
                  {loading === 'record' ? t('startingRecord') : t('startRecording')}
                </ActionBtn>
                <ActionBtn color="rd" disabled={!ok.recStop} onClick={store.doRecordStop}>
                  {t('stopRecording')}
                </ActionBtn>
              </div>
            </div>

            {state === 'recording' && (
              <div className="mt-3 pt-3 border-t border-bd/40">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-mono text-tx2">{savedEpisodes} / {targetEpisodes}</span>
                  <span className="font-mono font-bold text-ac">{pct}%</span>
                </div>
                <div className="w-full h-2 bg-sf2 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-ac2 to-ac rounded-full transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex gap-2 mt-3">
                  <ActionBtn color="gn" disabled={episodePhase !== 'recording'} onClick={store.doSaveEpisode}>
                    {episodePhase === 'saving' ? t('episodeSaving') : t('saveEpisode')}
                  </ActionBtn>
                  <ActionBtn color="yl" disabled={episodePhase !== 'recording'} onClick={store.doDiscardEpisode}>
                    {t('discardEpisode')}
                  </ActionBtn>
                  {episodePhase === 'resetting' && (
                    <ActionBtn color="ac" onClick={store.doSkipReset}>
                      {t('skipReset')}
                    </ActionBtn>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs font-medium">
                  {(episodePhase === 'recording' || !episodePhase) && (
                    <><span className="w-2 h-2 rounded-full bg-ac animate-pulse" /><span className="text-ac">{t('stateRecording')}</span></>
                  )}
                  {episodePhase === 'saving' && (
                    <><span className="w-2 h-2 rounded-full bg-yl animate-pulse" /><span className="text-yl">{t('episodeSaving')}</span></>
                  )}
                  {episodePhase === 'resetting' && (
                    <><span className="w-2 h-2 rounded-full bg-yl animate-pulse" /><span className="text-yl">{t('episodeResetting')}</span></>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Second row: Replay + Inference */}
        <div className="flex gap-3 max-[900px]:flex-col">
          {/* Replay */}
          <div className="w-[220px] max-[900px]:w-full shrink-0 bg-sf rounded-lg p-3.5 shadow-card animate-slide-up stagger-4">
            <h3 className="text-2xs text-tx3 font-mono uppercase tracking-widest mb-3">{t('replay')}</h3>
            <select
              value={replayDataset}
              onChange={(e) => { setReplayDataset(e.target.value); setReplayEpisode(0) }}
              className="w-full bg-sf2 border border-bd text-tx px-2 py-1.5 rounded text-sm mb-2
                focus:outline-none focus:border-ac"
            >
              <option value="">{t('selectDataset')}</option>
              {datasets.filter(d => d.total_episodes && d.total_episodes > 0).map(d => (
                <option key={d.name} value={d.name}>
                  {d.name} ({d.total_episodes} ep)
                </option>
              ))}
            </select>
            {(() => {
              const sel = datasets.find(d => d.name === replayDataset)
              const maxEp = (sel?.total_episodes ?? 1) - 1
              return (
                <label className="flex flex-col gap-1 text-2xs text-tx3 font-mono mb-2">
                  {t('episode')} {sel ? `(0-${maxEp})` : ''}
                  <input type="number" value={replayEpisode}
                    onChange={(e) => setReplayEpisode(Math.min(Number(e.target.value) || 0, maxEp))}
                    min={0} max={maxEp}
                    className="bg-sf2 border border-bd text-tx px-2 py-1.5 rounded text-sm font-mono focus:outline-none focus:border-ac" />
                </label>
              )
            })()}
            <div className="space-y-2">
              <ActionBtn color="gn" disabled={!ok.replayStart || !replayDataset || !!loading}
                onClick={() => store.doReplayStart({ dataset_name: replayDataset, episode: replayEpisode })}
                title={busy ? busyReason : undefined}>
                {loading === 'replay' ? t('startingReplay') : t('startReplay')}
              </ActionBtn>
              <ActionBtn color="yl" disabled={!ok.replayStop} onClick={store.doReplayStop}>
                {t('stopReplay')}
              </ActionBtn>
            </div>
          </div>

          {/* Inference */}
          <div className="flex-1 min-w-0 bg-sf rounded-lg p-3.5 shadow-card animate-slide-up stagger-5">
            <h3 className="text-2xs text-tx3 font-mono uppercase tracking-widest mb-3">{t('inference')}</h3>
            <div className="flex gap-2 mb-2">
              <label className="flex flex-col gap-1 text-2xs text-tx3 font-mono flex-1">
                {t('selectCheckpoint')}
                <input value={inferCheckpoint} onChange={(e) => setInferCheckpoint(e.target.value)}
                  placeholder="/path/to/checkpoint"
                  className="bg-sf2 border border-bd text-tx px-2 py-1.5 rounded text-sm focus:outline-none focus:border-ac placeholder:text-tx3" />
              </label>
              <label className="flex flex-col gap-1 text-2xs text-tx3 font-mono flex-1">
                {t('sourceDataset')}
                <select value={inferSourceDs} onChange={(e) => setInferSourceDs(e.target.value)}
                  className="bg-sf2 border border-bd text-tx px-2 py-1.5 rounded text-sm focus:outline-none focus:border-ac">
                  <option value="">--</option>
                  {datasets.filter(d => d.total_episodes && d.total_episodes > 0).map(d => (
                    <option key={d.name} value={d.name}>{d.name}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-2xs text-tx3 font-mono w-[72px]">
                {t('numEpisodes')}
                <input type="number" value={inferEpisodes} onChange={(e) => setInferEpisodes(Number(e.target.value) || 1)} min={1}
                  className="bg-sf2 border border-bd text-tx px-2 py-1.5 rounded text-sm font-mono focus:outline-none focus:border-ac" />
              </label>
            </div>
            <div className="flex gap-2">
              <ActionBtn color="ac" disabled={!ok.inferStart || !!loading}
                onClick={() => store.doInferStart({ checkpoint_path: inferCheckpoint, source_dataset: inferSourceDs, num_episodes: inferEpisodes })}
                title={busy ? busyReason : undefined}>
                {loading === 'infer' ? t('startingInference') : t('startInference')}
              </ActionBtn>
              <ActionBtn color="yl" disabled={!ok.inferStop} onClick={store.doInferStop}>
                {t('stopInference')}
              </ActionBtn>
            </div>
            {state === 'inferring' && (
              <div className="mt-2 flex items-center gap-2 text-xs text-ac font-medium">
                <span className="w-2 h-2 rounded-full bg-ac animate-pulse" />
                {t('stateInferring')}
              </div>
            )}
          </div>
        </div>

        {/* Bottom: Camera + Servo monitoring + Loss curve placeholder */}
        <div className="grid grid-cols-3 gap-3 min-h-[240px] max-[1200px]:grid-cols-1">
          {camerasExist ? (
            <CameraPreviewPanel cameras={hwStatus!.cameras} busy={busy} />
          ) : (
            <div className="bg-sf rounded-lg p-4 shadow-card flex items-center justify-center text-sm text-tx3">
              {t('noCameraFeed')}
            </div>
          )}
          <ServoPanel state={state} />
          <section className="bg-sf rounded-lg p-4 shadow-card flex flex-col animate-slide-up stagger-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-2xs text-tx3 font-mono uppercase tracking-widest">{t('lossCurve')}</h3>
              <div className="text-right text-[11px] font-mono text-tx3">
                {hasCurveData ? (
                  <>
                    <div>{`${t('latestLoss')}: ${trainCurve?.last_loss?.toFixed(3)}`}</div>
                    <div>{`${t('latestEpoch')}: ${latestEp}`}</div>
                    <div className="mt-1">{`${t('bestLoss')}: ${trainCurve?.best_loss?.toFixed(3)}`}</div>
                    <div>{`${t('bestEpoch')}: ${trainCurve?.best_ep}`}</div>
                  </>
                ) : (
                  <div className="px-2 py-1 rounded-full bg-ac/10 text-ac font-semibold">Live</div>
                )}
              </div>
            </div>
            <label className="mt-3 flex flex-col gap-1 text-2xs text-tx3 font-mono">
              {t('trainingId')}
              <input
                value={trainJobId}
                onChange={(e) => setTrainJobId(e.target.value)}
                placeholder={t('trainingIdPlaceholder')}
                className="bg-sf2 border border-bd text-tx px-3 py-2 rounded-lg text-sm font-mono focus:outline-none focus:border-ac placeholder:text-tx3"
              />
            </label>
            <div className="mt-4 flex-1 min-h-[240px] rounded-xl border border-dashed border-bd2/80 bg-gradient-to-br from-sf2/80 via-white to-ac/5 p-4">
              <div className="h-full flex gap-3">
                <div className="w-8 shrink-0 flex items-center justify-center">
                  <span className="text-xs font-mono uppercase tracking-[0.25em] text-tx3 [writing-mode:vertical-rl] rotate-180">
                    {t('loss')}
                  </span>
                </div>
                <div className="flex-1 min-w-0 flex flex-col">
                  <div className="relative flex-1 rounded-lg border border-bd/60 bg-white/70 overflow-hidden">
                    <div
                      className="absolute inset-0 opacity-80"
                      style={{
                        backgroundImage: `
                          linear-gradient(to right, rgba(156,163,175,0.18) 1px, transparent 1px),
                          linear-gradient(to bottom, rgba(156,163,175,0.18) 1px, transparent 1px)
                        `,
                        backgroundSize: '20% 100%, 100% 25%',
                      }}
                    />
                    <div className="absolute left-0 top-0 bottom-0 w-px bg-tx2/25" />
                    <div className="absolute left-0 right-0 bottom-0 h-px bg-tx2/25" />
                    <svg
                      className="absolute inset-0 w-full h-full text-ac/70"
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                      aria-hidden="true"
                    >
                      <defs>
                        <linearGradient id="loss-placeholder-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
                          <stop offset="100%" stopColor="currentColor" stopOpacity="0.9" />
                        </linearGradient>
                      </defs>
                      <path
                        d="M8 78 C18 65, 24 56, 34 54 S50 36, 60 40 S74 24, 92 18"
                        fill="none"
                        stroke="url(#loss-placeholder-gradient)"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        className={hasCurveData ? 'hidden' : ''}
                      />
                      {hasCurveData && (
                        <>
                          <polyline
                            points={polylinePoints}
                            fill="none"
                            stroke="url(#loss-placeholder-gradient)"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </>
                      )}
                    </svg>
                    {hasCurveData && curvePoints.map((point, index) => {
                      const x = 8 + ((point.ep - xMin) / xSpan) * 84
                      const y = 88 - ((point.loss - yMin) / ySpan) * 74
                      return (
                        <span
                          key={`${point.ep}-${point.loss}-${index}`}
                          className="absolute block w-[4px] h-[4px] rounded-full bg-ac/85 shadow-[0_0_0_1px_rgba(255,255,255,0.65)]"
                          style={{
                            left: `${x}%`,
                            top: `${y}%`,
                            transform: 'translate(-50%, -50%)',
                          }}
                        />
                      )
                    })}
                    {!hasCurveData && (
                      <>
                        <span className="absolute block w-[4px] h-[4px] rounded-full bg-ac/80 shadow-[0_0_0_1px_rgba(255,255,255,0.65)]" style={{ left: '34%', top: '54%', transform: 'translate(-50%, -50%)' }} />
                        <span className="absolute block w-[4px] h-[4px] rounded-full bg-ac/80 shadow-[0_0_0_1px_rgba(255,255,255,0.65)]" style={{ left: '60%', top: '40%', transform: 'translate(-50%, -50%)' }} />
                        <span className="absolute block w-[4px] h-[4px] rounded-full bg-ac/80 shadow-[0_0_0_1px_rgba(255,255,255,0.65)]" style={{ left: '92%', top: '18%', transform: 'translate(-50%, -50%)' }} />
                      </>
                    )}
                    {!hasCurveData && (
                      <div className="absolute inset-x-0 bottom-5 text-center px-6">
                        <div className="text-sm font-semibold text-tx">{t('lossCurve')}</div>
                        <div className="mt-1 text-sm text-tx3">{t('lossCurvePlaceholder')}</div>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 px-1 flex items-center justify-between text-[11px] font-mono text-tx3">
                    {xTicks.map((tick) => (
                      <span key={tick}>{tick}</span>
                    ))}
                  </div>
                  <div className="mt-1 text-center text-xs font-mono uppercase tracking-[0.25em] text-tx3">
                    {t('epoch')}
                  </div>
                </div>
                <div className="w-8 shrink-0 flex flex-col justify-between text-[11px] font-mono text-tx3 py-1">
                  {yTicks.map((tick) => (
                    <span key={tick}>{tick}</span>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
