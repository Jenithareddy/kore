// src/components/RegionSelector.tsx
import React, { useState, useMemo } from 'react'
import { filterZones, getZoneByCode, type RegionZone } from '../region-zones'

interface RegionSelectorProps {
  value: string
  onChange: (code: string) => void
  compact?: boolean  // true for settings panel (smaller), false for onboarding
}

export function RegionSelector({ value, onChange, compact = false }: RegionSelectorProps) {
  const [search, setSearch] = useState('')
  const [isOpen, setIsOpen] = useState(false)

  const filtered = useMemo(() => filterZones(search), [search])
  const selected = getZoneByCode(value)

  const handleSelect = (zone: RegionZone) => {
    onChange(zone.code)
    setSearch('')
    setIsOpen(false)
  }

  return (
    <div style={{ position: 'relative' }} data-testid="region-selector">
      {/* Selected display / search input */}
      <input
        type="text"
        value={isOpen ? search : (selected ? `${selected.state} — ${selected.name}` : '')}
        onChange={e => { setSearch(e.target.value); setIsOpen(true) }}
        onFocus={() => setIsOpen(true)}
        placeholder="Search by state or region name..."
        data-testid="region-input"
        style={{
          width: '100%',
          padding: compact ? '6px 10px' : '10px 12px',
          fontSize: compact ? '13px' : '15px',
          background: '#111',
          border: '1px solid #333',
          color: '#e0e0e0',
          borderRadius: '6px',
          boxSizing: 'border-box' as const,
        }}
      />

      {/* Dropdown */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            maxHeight: compact ? '180px' : '240px',
            overflowY: 'auto' as const,
            background: '#1a1a1a',
            border: '1px solid #333',
            borderTop: 'none',
            borderRadius: '0 0 6px 6px',
            zIndex: 100,
            boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
          }}
          data-testid="region-dropdown"
        >
          {filtered.length === 0 ? (
            <div style={{ padding: '8px 12px', color: '#666', fontSize: '13px' }}>
              No matching regions
            </div>
          ) : (
            filtered.map(zone => (
              <div
                key={zone.code}
                onClick={() => handleSelect(zone)}
                data-testid={`region-option-${zone.code}`}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  borderBottom: '1px solid #222',
                  background: zone.code === value ? '#0a1a0a' : 'transparent',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#222')}
                onMouseLeave={e => (e.currentTarget.style.background = zone.code === value ? '#0a1a0a' : 'transparent')}
              >
                <div style={{ fontWeight: 500, color: '#e0e0e0' }}>{zone.state}</div>
                <div style={{ fontSize: '11px', color: '#666' }}>{zone.name} ({zone.code})</div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Click outside to close */}
      {isOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 99 }}
          onClick={() => { setIsOpen(false); setSearch('') }}
        />
      )}
    </div>
  )
}
