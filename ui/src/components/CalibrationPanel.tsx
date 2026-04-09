import { useEffect } from 'react'
import { useDashboard } from '../controllers/dashboard'
import { useI18n } from '../controllers/i18n'
import { postJson } from '../controllers/api'

const CALIBRATION = '/api/calibration'

function sendCommand(cmd: string) {
  postJson(`${CALIBRATION}/command`, { command: cmd })
}

export function CalibrationPanel({ armAlias, onClose }: { armAlias: string; onClose: () => void }) {
  const session = useDashboard((s) => s.session)
  const { t } = useI18n()

  const step = (session as any).calibration_step || ''
  const positions = (session as any).calibration_positions as Record<string, { min: number; pos: number; max: number }> | undefined
  const isCalibrating = session.state === 'calibrating'

  useEffect(() => {
    if (!isCalibrating && step === '') return
    if (session.state === 'idle' && step === 'done') {
      const timer = setTimeout(onClose, 1500)
      return () => clearTimeout(timer)
    }
  }, [session.state, step])

  if (!isCalibrating && step !== 'done') {
    return null
  }

  return (
    <div className="rounded-xl border border-ac/30 bg-ac/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-tx">
          {t('calibrating')}: {armAlias}
        </h4>
        <button onClick={() => { sendCommand('stop'); onClose() }}
          className="text-2xs text-tx3 hover:text-rd">
          {t('cancel')}
        </button>
      </div>

      {step === 'choose' && (
        <div className="space-y-2">
          <p className="text-sm text-tx2">{t('calChoosePrompt')}</p>
          <div className="flex gap-2">
            <button onClick={() => sendCommand('confirm')}
              className="px-3 py-1.5 text-sm bg-gn text-white rounded-lg font-medium hover:bg-gn/90">
              {t('calUseExisting')}
            </button>
            <button onClick={() => sendCommand('recalibrate')}
              className="px-3 py-1.5 text-sm bg-ac text-white rounded-lg font-medium hover:bg-ac2">
              {t('calRunNew')}
            </button>
          </div>
        </div>
      )}

      {step === 'starting' && (
        <p className="text-sm text-tx2 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-ac animate-pulse" />
          {t('calStarting')}
        </p>
      )}

      {step === 'homing' && (
        <div className="space-y-2">
          <p className="text-sm text-tx2">{t('calHomingPrompt')}</p>
          <button onClick={() => sendCommand('confirm')}
            className="px-3 py-1.5 text-sm bg-ac text-white rounded-lg font-medium hover:bg-ac2">
            {t('calConfirmMiddle')}
          </button>
        </div>
      )}

      {step === 'recording' && (
        <div className="space-y-2">
          <p className="text-sm text-tx2">{t('calRecordingPrompt')}</p>
          {positions && Object.keys(positions).length > 0 && (
            <div className="rounded-lg bg-bg border border-bd/40 p-2 font-mono text-2xs">
              <div className="grid grid-cols-4 gap-1 text-tx3 mb-1">
                <span>Motor</span><span className="text-right">Min</span>
                <span className="text-right">Pos</span><span className="text-right">Max</span>
              </div>
              {Object.entries(positions).map(([name, v]) => (
                <div key={name} className="grid grid-cols-4 gap-1 text-tx">
                  <span className="truncate">{name}</span>
                  <span className="text-right tabular-nums">{v.min}</span>
                  <span className="text-right tabular-nums font-bold">{v.pos}</span>
                  <span className="text-right tabular-nums">{v.max}</span>
                </div>
              ))}
            </div>
          )}
          <button onClick={() => sendCommand('confirm')}
            className="px-3 py-1.5 text-sm bg-gn text-white rounded-lg font-medium hover:bg-gn/90">
            {t('calStopRecording')}
          </button>
        </div>
      )}

      {step === 'done' && (
        <p className="text-sm text-gn font-medium flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-gn" />
          {t('calDone')}
        </p>
      )}
    </div>
  )
}
