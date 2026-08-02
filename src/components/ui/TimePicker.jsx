import { useState, useRef, useEffect } from 'react'
import { Icon } from './icons'
import { cn } from './utils'

const QUICK_PRESETS = [
  '09:00 AM', '10:00 AM', '11:00 AM',
  '12:00 PM', '01:00 PM', '02:00 PM',
  '03:00 PM', '04:00 PM', '05:00 PM'
]

const CLOCK_HOURS = Array.from({ length: 12 }, (_, i) => {
  const hour = i === 0 ? 12 : i
  const angleDeg = hour * 30 - 90
  const angleRad = (angleDeg * Math.PI) / 180
  const x = Math.round(90 + 60 * Math.cos(angleRad))
  const y = Math.round(90 + 60 * Math.sin(angleRad))
  return { hour, x, y }
})

const CLOCK_MINUTES = Array.from({ length: 12 }, (_, i) => {
  const minuteVal = i * 5
  const minuteStr = String(minuteVal).padStart(2, '0')
  const angleDeg = i * 30 - 90
  const angleRad = (angleDeg * Math.PI) / 180
  const x = Math.round(90 + 60 * Math.cos(angleRad))
  const y = Math.round(90 + 60 * Math.sin(angleRad))
  return { minuteVal, minuteStr, x, y }
})

export function TimePicker({ value = '10:00 AM', onChange, className = '', placeholder = 'Type or select time...' }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState('HOURS')
  const [inputValue, setInputValue] = useState(value || '10:00 AM')
  const containerRef = useRef(null)

  const parseVal = (valStr) => {
    if (!valStr) return { hour: 10, minute: '00', period: 'AM' }
    const clean = String(valStr).trim().toUpperCase()
    const isPM = clean.includes('PM')
    const isAM = clean.includes('AM')
    const match = clean.match(/(\d{1,2}):(\d{2})/)
    if (!match) return { hour: 10, minute: '00', period: 'AM' }
    let h = parseInt(match[1], 10)
    const m = match[2]
    let period = 'AM'

    if (isPM) period = 'PM'
    else if (isAM) period = 'AM'
    else {
      if (h >= 12) {
        period = 'PM'
        if (h > 12) h -= 12
      } else {
        period = 'AM'
        if (h === 0) h = 12
      }
    }
    return { hour: h || 12, minute: m || '00', period }
  }

  const current = parseVal(value || inputValue)
  const [hourInput, setHourInput] = useState(String(current.hour).padStart(2, '0'))
  const [minuteInput, setMinuteInput] = useState(current.minute)

  useEffect(() => {
    setInputValue(value || '10:00 AM')
    const parsed = parseVal(value || '10:00 AM')
    const activeDataAttr = document.activeElement?.getAttribute('data-time-input')
    if (activeDataAttr !== 'hour' && activeDataAttr !== 'minute') {
      setHourInput(String(parsed.hour).padStart(2, '0'))
      setMinuteInput(parsed.minute)
    }
  }, [value])

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const formatTime = (h, m, p) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} ${p}`

  const updateTime = (h, m, p) => {
    const formatted = formatTime(h, m, p)
    setInputValue(formatted)
    onChange && onChange(formatted)
  }

  const handleMainInputKeyDown = (e) => {
    if (['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter'].includes(e.key)) return
    if (e.ctrlKey || e.metaKey) return
    if (!/^[0-9:\sAPMapm]$/i.test(e.key)) {
      e.preventDefault()
    }
  }

  const handleMainInputChange = (e) => {
    const val = e.target.value.replace(/[^0-9:\sAPMapm]/gi, '')
    setInputValue(val)
    onChange && onChange(val)
    const parsed = parseVal(val)
    setHourInput(String(parsed.hour).padStart(2, '0'))
    setMinuteInput(parsed.minute)
  }

  const blockNonNumericKeys = (e) => {
    if (['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter'].includes(e.key)) return
    if (e.ctrlKey || e.metaKey) return
    if (!/^[0-9]$/.test(e.key)) {
      e.preventDefault()
    }
  }

  const handleHourInputChange = (e) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 2)
    setHourInput(val)
    if (val !== '') {
      let num = parseInt(val, 10)
      if (num > 12) num = 12
      if (num === 0) num = 12
      updateTime(num, minuteInput || '00', current.period)
    }
  }

  const handleHourBlur = () => {
    if (!hourInput) {
      setHourInput(String(current.hour).padStart(2, '0'))
    } else {
      let num = parseInt(hourInput, 10)
      if (num > 12) num = 12
      if (num === 0) num = 12
      const formattedH = String(num).padStart(2, '0')
      setHourInput(formattedH)
      updateTime(num, minuteInput || '00', current.period)
    }
  }

  const handleMinuteInputChange = (e) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 2)
    setMinuteInput(val)
    if (val !== '') {
      let num = parseInt(val, 10)
      if (num > 59) num = 59
      const mStr = val.length === 1 ? String(num) : String(num).padStart(2, '0')
      updateTime(current.hour, mStr, current.period)
    }
  }

  const handleMinuteBlur = () => {
    if (!minuteInput) {
      setMinuteInput('00')
      updateTime(current.hour, '00', current.period)
    } else {
      let num = parseInt(minuteInput, 10)
      if (num > 59) num = 59
      const mStr = String(num).padStart(2, '0')
      setMinuteInput(mStr)
      updateTime(current.hour, mStr, current.period)
    }
  }

  const selectPreset = (presetStr) => {
    setInputValue(presetStr)
    onChange && onChange(presetStr)
    const parsed = parseVal(presetStr)
    setHourInput(String(parsed.hour).padStart(2, '0'))
    setMinuteInput(parsed.minute)
    setOpen(false)
  }

  const handleHourSelect = (h) => {
    const hStr = String(h).padStart(2, '0')
    setHourInput(hStr)
    updateTime(h, current.minute, current.period)
    setMode('MINUTES')
  }

  const handleMinuteSelect = (m) => {
    setMinuteInput(m)
    updateTime(current.hour, m, current.period)
  }

  const togglePeriod = () => {
    const newPeriod = current.period === 'AM' ? 'PM' : 'AM'
    updateTime(current.hour, current.minute, newPeriod)
  }

  const activeHourPos = CLOCK_HOURS.find(item => item.hour === current.hour) || CLOCK_HOURS[10]
  const currentMinNum = parseInt(current.minute, 10) || 0
  const closestMinIndex = Math.round(currentMinNum / 5) % 12
  const activeMinPos = CLOCK_MINUTES[closestMinIndex]

  const activeHandPos = mode === 'HOURS' ? activeHourPos : activeMinPos

  return (
    <div ref={containerRef} className={cn('relative inline-block w-full', className)}>
      {/* Main Typeable Input Field */}
      <div className="relative flex items-center">
        <Icon name="clock" size={13} className="absolute left-3 text-accent shrink-0 pointer-events-none" />
        <input
          type="text"
          value={inputValue}
          onFocus={() => setOpen(true)}
          onKeyDown={handleMainInputKeyDown}
          onChange={handleMainInputChange}
          placeholder={placeholder}
          className="w-full h-9 pl-8 pr-7 rounded-[var(--radius-sm)] border border-border bg-surface text-xs font-mono font-bold text-text shadow-xs hover:border-border-strong focus:outline-none focus:ring-2 focus:ring-accent tracking-wide"
        />
        <button
          type="button"
          onClick={() => setOpen(prev => !prev)}
          className="absolute right-2 text-text3 hover:text-text focus:outline-none p-1"
        >
          <Icon name="chevronDown" size={11} className={cn('transition-transform duration-200', open && 'rotate-180')} />
        </button>
      </div>

      {/* Clock Face Popover */}
      {open && (
        <div
          className="absolute right-0 top-full mt-1.5 w-[265px] max-w-[calc(100vw-32px)] bg-surface border border-border rounded-[var(--radius-md)] shadow-[var(--shadow-lg)] p-3 z-[100] flex flex-col items-center gap-2.5"
          onMouseDown={e => e.stopPropagation()}
        >
          {/* Quick Presets */}
          <div className="w-full">
            <div className="text-[10px] font-bold text-text3 uppercase tracking-wider mb-1 px-0.5">Quick Presets</div>
            <div className="grid grid-cols-3 gap-1">
              {QUICK_PRESETS.map(preset => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => selectPreset(preset)}
                  className={cn(
                    'px-1 py-1 rounded text-[10px] font-mono font-bold transition-all text-center border truncate',
                    inputValue.toUpperCase() === preset.toUpperCase()
                      ? 'bg-accent text-white border-accent shadow-xs'
                      : 'bg-surface2/70 text-text2 border-border/60 hover:bg-surface3 hover:text-text'
                  )}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <div className="w-full h-px bg-border/60" />

          {/* Editable Header Inputs for Hour & Minute */}
          <div className="w-full flex items-center justify-between px-1">
            <div className="flex items-center gap-1 font-mono">
              <input
                type="text"
                data-time-input="hour"
                value={hourInput}
                onKeyDown={blockNonNumericKeys}
                onFocus={(e) => { setMode('HOURS'); e.target.select() }}
                onChange={handleHourInputChange}
                onBlur={handleHourBlur}
                title="Type hour directly"
                className={cn(
                  'w-9 h-7 text-center text-sm font-black rounded border transition-colors focus:outline-none focus:ring-1 focus:ring-accent',
                  mode === 'HOURS'
                    ? 'bg-accent/15 text-accent border-accent/50'
                    : 'bg-surface2 text-text border-border'
                )}
              />
              <span className="text-sm font-bold text-text3">:</span>
              <input
                type="text"
                data-time-input="minute"
                value={minuteInput}
                onKeyDown={blockNonNumericKeys}
                onFocus={(e) => { setMode('MINUTES'); e.target.select() }}
                onChange={handleMinuteInputChange}
                onBlur={handleMinuteBlur}
                title="Type minute directly"
                className={cn(
                  'w-9 h-7 text-center text-sm font-black rounded border transition-colors focus:outline-none focus:ring-1 focus:ring-accent',
                  mode === 'MINUTES'
                    ? 'bg-accent/15 text-accent border-accent/50'
                    : 'bg-surface2 text-text border-border'
                )}
              />
            </div>

            {/* Mode Switcher */}
            <div className="flex bg-surface2 p-0.5 rounded border border-border">
              <button
                type="button"
                onClick={() => setMode('HOURS')}
                className={cn(
                  'px-2 py-0.5 text-[9.5px] font-extrabold rounded transition-colors',
                  mode === 'HOURS' ? 'bg-accent text-white shadow-xs' : 'text-text3 hover:text-text'
                )}
              >
                HRS
              </button>
              <button
                type="button"
                onClick={() => setMode('MINUTES')}
                className={cn(
                  'px-2 py-0.5 text-[9.5px] font-extrabold rounded transition-colors',
                  mode === 'MINUTES' ? 'bg-accent text-white shadow-xs' : 'text-text3 hover:text-text'
                )}
              >
                MINS
              </button>
            </div>
          </div>

          {/* Analog Clock Face */}
          <div className="relative w-[180px] h-[180px] select-none my-1">
            <svg width="180" height="180" viewBox="0 0 180 180" className="w-full h-full">
              <circle cx="90" cy="90" r="84" fill="var(--surface2)" stroke="var(--border)" strokeWidth="2" className="opacity-80" />
              <circle cx="90" cy="90" r="84" fill="none" stroke="var(--accent)" strokeWidth="1" opacity="0.15" />

              <line
                x1="90"
                y1="90"
                x2={activeHandPos.x}
                y2={activeHandPos.y}
                stroke="var(--accent)"
                strokeWidth="2.5"
                strokeLinecap="round"
                className="transition-all duration-200"
              />
              <circle cx={activeHandPos.x} cy={activeHandPos.y} r="14" fill="var(--accent)" opacity="0.25" className="transition-all duration-200" />
            </svg>

            {/* Center AM/PM Toggle Button */}
            <button
              type="button"
              onClick={togglePeriod}
              title="Click to toggle AM / PM"
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-11 h-11 rounded-full border-2 border-accent bg-accent text-white flex flex-col items-center justify-center transition-all duration-200 shadow-md outline-none focus:scale-105 active:scale-95 ring-2 ring-accent/30 hover:brightness-110"
            >
              <span className="text-xs font-black font-mono tracking-wider leading-none">{current.period}</span>
              <span className="text-[7.5px] opacity-80 font-semibold mt-0.5">TAP</span>
            </button>

            {/* Hours Mode Dial */}
            {mode === 'HOURS' && CLOCK_HOURS.map(({ hour, x, y }) => {
              const isSelected = current.hour === hour
              return (
                <button
                  key={hour}
                  type="button"
                  onClick={() => handleHourSelect(hour)}
                  style={{ left: `${x}px`, top: `${y}px` }}
                  className={cn(
                    'absolute -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full text-xs font-mono font-bold flex items-center justify-center transition-all duration-150 border',
                    isSelected
                      ? 'bg-accent text-white border-accent shadow-sm scale-110 z-10'
                      : 'bg-surface text-text2 border-border/80 hover:bg-accent/20 hover:text-accent hover:scale-105'
                  )}
                >
                  {hour}
                </button>
              )
            })}

            {/* Minutes Mode Dial */}
            {mode === 'MINUTES' && CLOCK_MINUTES.map(({ minuteStr, x, y }) => {
              const isSelected = current.minute === minuteStr
              return (
                <button
                  key={minuteStr}
                  type="button"
                  onClick={() => handleMinuteSelect(minuteStr)}
                  style={{ left: `${x}px`, top: `${y}px` }}
                  className={cn(
                    'absolute -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full text-[10.5px] font-mono font-bold flex items-center justify-center transition-all duration-150 border',
                    isSelected
                      ? 'bg-accent text-white border-accent shadow-sm scale-110 z-10'
                      : 'bg-surface text-text2 border-border/80 hover:bg-accent/20 hover:text-accent hover:scale-105'
                  )}
                >
                  :{minuteStr}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default TimePicker
