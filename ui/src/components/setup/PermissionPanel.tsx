import { useState } from 'react'
import { useSetup } from '../../controllers/setup'
import type { PermissionStatus } from '../../controllers/setup'
import { useI18n } from '../../controllers/i18n'

/* ── iOS-style toggle switch ────────────────────────────────────────── */

function Toggle({ on, disabled, onClick }: {
  on: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className={`relative inline-flex h-[26px] w-[46px] shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${on ? 'bg-gn' : 'bg-tx3/30'}`}
    >
      <span className={`pointer-events-none inline-block h-[22px] w-[22px] rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out
        ${on ? 'translate-x-5' : 'translate-x-0'}`}
      />
    </button>
  )
}

/* ── Permission row ─────────────────────────────────────────────────── */

function PermissionRow({ icon, label, ok, count, onToggle, busy }: {
  icon: string
  label: string
  ok: boolean
  count: number
  onToggle: () => void
  busy: boolean
}) {
  const { t } = useI18n()
  const noDevice = count === 0

  return (
    <div className="flex items-center gap-3 py-3 border-b border-bd/15 last:border-b-0">
      <span className="text-base w-6 text-center shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-tx font-medium">{label}</p>
        <p className="text-2xs text-tx3">
          {noDevice
            ? t('permNoDevice')
            : t('permDeviceCount').replace('{count}', String(count))}
        </p>
      </div>
      {noDevice ? (
        <Toggle on={false} disabled onClick={() => {}} />
      ) : (
        <Toggle on={ok} disabled={busy || ok} onClick={onToggle} />
      )}
    </div>
  )
}

/* ── Panel (standalone settings card) ───────────────────────────────── */

export default function PermissionPanel({ perms, onFixed }: {
  perms: PermissionStatus
  onFixed: () => void
}) {
  const { t } = useI18n()
  const { fixPermissions, permFixing, permissions } = useSetup()
  const [fixAttempted, setFixAttempted] = useState(false)

  const current = permissions ?? perms
  const allOk = current.serial.ok && current.camera.ok
  const showHint = fixAttempted && !allOk && current.hint

  async function handleToggle() {
    setFixAttempted(true)
    await fixPermissions()
    const updated = useSetup.getState().permissions
    if (updated && updated.serial.ok && updated.camera.ok) {
      onFixed()
    }
  }

  if (current.platform !== 'linux') return null

  return (
    <section className="bg-sf rounded-xl p-5 shadow-card shadow-inset-ac">
      <h3 className="text-sm font-bold text-tx uppercase tracking-wide mb-3">{t('permTitle')}</h3>

      <div className="px-1">
        <PermissionRow
          icon="🔌"
          label={t('permSerial')}
          ok={current.serial.ok}
          count={current.serial.count}
          onToggle={handleToggle}
          busy={permFixing}
        />
        <PermissionRow
          icon="📷"
          label={t('permCamera')}
          ok={current.camera.ok}
          count={current.camera.count}
          onToggle={handleToggle}
          busy={permFixing}
        />
      </div>

      {showHint && (
        <div className="mt-3 p-3 rounded-lg bg-yl/5 border border-yl/20 space-y-1.5">
          <p className="text-2xs text-tx2">{t('permFixFailed')}</p>
          <code className="block px-2.5 py-1.5 bg-sf2 rounded text-xs text-tx font-mono select-all">
            {current.hint}
          </code>
        </div>
      )}
    </section>
  )
}
