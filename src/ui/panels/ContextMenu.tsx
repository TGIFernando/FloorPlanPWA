import { useEffect, useRef } from 'react'
import { usePlanStore } from '../../store/planStore'

function Item({
  label,
  onClick,
  danger,
}: {
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full text-left px-3 py-1.5 text-xs"
      style={{
        background: 'transparent',
        border: 'none',
        color: danger ? '#f87171' : '#c8d8e8',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLButtonElement).style.background = '#1e3a5f'
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
      }}
    >
      {label}
    </button>
  )
}

function Divider() {
  return <div style={{ height: 1, background: '#243344', margin: '2px 0' }} />
}

export default function ContextMenu() {
  const contextMenu    = usePlanStore(s => s.contextMenu)
  const hideContextMenu = usePlanStore(s => s.hideContextMenu)
  const deleteBooth    = usePlanStore(s => s.deleteBooth)
  const unpinBooth     = usePlanStore(s => s.unpinBooth)
  const pinBooth       = usePlanStore(s => s.pinBooth)
  const setBoothStatus = usePlanStore(s => s.setBoothStatus)
  const setBoothType   = usePlanStore(s => s.setBoothType)
  const result         = usePlanStore(s => s.layoutResult)
  const plan           = usePlanStore(s => s.plan)

  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        hideContextMenu()
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [hideContextMenu])

  if (!contextMenu) return null

  const { boothId, screenX, screenY } = contextMenu
  const booth = result?.booths.find(b => b.id === boothId)
  if (!booth) return null

  const act = (fn: () => void) => () => { fn(); hideContextMenu() }

  // Position menu so it doesn't go off-screen
  const menuWidth = 180
  const menuHeight = 200
  const left = Math.min(screenX, window.innerWidth - menuWidth - 8)
  const top  = Math.min(screenY, window.innerHeight - menuHeight - 8)

  return (
    <div
      ref={ref}
      className="fixed z-50 rounded shadow-lg"
      style={{
        left,
        top,
        width: menuWidth,
        background: '#1b2a38',
        border: '1px solid #2a3f52',
        padding: '4px 0',
      }}
      onContextMenu={e => e.preventDefault()}
    >
      <div style={{ color: '#4a6070', fontSize: 10, padding: '4px 12px 2px',
        letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {booth.number || boothId}
      </div>
      <Divider />

      {booth.pinned
        ? <Item label="Unpin" onClick={act(() => unpinBooth(boothId))} />
        : <Item label="Pin in place" onClick={act(() => pinBooth(boothId))} />
      }

      <Divider />

      {booth.status !== 'available' && (
        <Item label="Mark available" onClick={act(() => setBoothStatus(boothId, 'available'))} />
      )}
      {booth.status !== 'held' && (
        <Item label="Mark held" onClick={act(() => setBoothStatus(boothId, 'held'))} />
      )}
      {booth.status !== 'sold' && (
        <Item label="Mark sold" onClick={act(() => setBoothStatus(boothId, 'sold'))} />
      )}

      {plan.boothTypes.length > 1 && (
        <>
          <Divider />
          {plan.boothTypes.filter(t => t.id !== booth.typeId).map(t => (
            <Item
              key={t.id}
              label={`Change to ${t.name}`}
              onClick={act(() => setBoothType(boothId, t.id))}
            />
          ))}
        </>
      )}

      <Divider />
      <Item label="Delete booth" onClick={act(() => deleteBooth(boothId))} danger />
    </div>
  )
}
