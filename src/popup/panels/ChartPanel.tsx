// src/popup/panels/ChartPanel.tsx
// 7-day bar chart using Recharts — reads data directly from IndexedDB

import React from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useDailyTotals } from '../hooks/useAggregates'

export function ChartPanel() {
  const { dailyTotals, loading } = useDailyTotals(7)

  if (loading) {
    return <div className="ww-panel" data-testid="chart-panel"><p>Loading…</p></div>
  }

  // Format dates for display (e.g., "Mon", "Tue")
  const chartData = dailyTotals.map(d => ({
    day: new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }),
    gCO2e: Math.round(d.gCO2e * 100) / 100,
  }))

  return (
    <div className="ww-panel" data-testid="chart-panel">
      <h3>7-Day Trend</h3>
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={chartData}>
          <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#888' }} axisLine={{ stroke: '#333' }} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#888' }} axisLine={{ stroke: '#333' }} tickLine={false} width={40} />
          <Tooltip
            formatter={(value: number) => [`${value.toFixed(1)} g`, 'CO₂e']}
            contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '6px', color: '#e0e0e0', fontSize: 12 }}
            labelStyle={{ color: '#888' }}
          />
          <Bar dataKey="gCO2e" fill="#4ade80" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
