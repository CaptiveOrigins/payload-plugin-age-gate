'use client'

import React, { useId } from 'react'

export type BirthPickerText = { legend: string; month: string; year: string; chooseMonth: string; chooseYear: string; why: string; months: string[] }

export const defaultText: BirthPickerText = {
  legend: 'When were you born?',
  month: 'Month',
  year: 'Year',
  chooseMonth: 'Choose a month',
  chooseYear: 'Choose a year',
  why: 'We only use this to check you’re old enough. We don’t keep your answer.',
  months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
}

/**
 * A neutral birth month and year picker: nothing chosen at first (no year suggests an answer), plain labels, and a
 * line saying the answer isn't kept. Posts `birthMonth` and `birthYear` with the form.
 */
export function BirthMonthYear({ text = defaultText, now = new Date(), required = true }: { text?: Partial<BirthPickerText>; now?: Date; required?: boolean }) {
  const t = { ...defaultText, ...text }
  const id = useId()
  const thisYear = now.getUTCFullYear()
  const years = Array.from({ length: 101 }, (_, i) => thisYear - i)
  const box: React.CSSProperties = { minHeight: 40, padding: '0 8px', border: '1px solid currentColor', borderRadius: 6, background: 'transparent', color: 'inherit', font: 'inherit' }
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0 }} aria-describedby={`${id}-why`}>
      <legend style={{ fontWeight: 600, marginBottom: 6 }}>{t.legend}</legend>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <label style={{ display: 'grid', gap: 4 }}>
          <span>{t.month}</span>
          <select name="birthMonth" required={required} defaultValue="" style={box}>
            <option value="" disabled>
              {t.chooseMonth}
            </option>
            {t.months.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span>{t.year}</span>
          <select name="birthYear" required={required} defaultValue="" style={box}>
            <option value="" disabled>
              {t.chooseYear}
            </option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p id={`${id}-why`} style={{ marginTop: 6, fontSize: '0.875em', opacity: 0.8 }}>
        {t.why}
      </p>
    </fieldset>
  )
}
