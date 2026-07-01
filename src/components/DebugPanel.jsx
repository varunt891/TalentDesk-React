import { useState, useEffect } from 'react'

export default function DebugPanel() {
  const [logs, setLogs] = useState([])
  const [isOpen, setIsOpen] = useState(false)
  const maxLogs = 50

  useEffect(() => {
    // Intercept console.log
    const originalLog = console.log
    const originalError = console.error

    const addLog = (type, args) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ')
      
      setLogs(prev => [...prev, { type, message, time: new Date().toLocaleTimeString() }].slice(-maxLogs))
    }

    console.log = (...args) => {
      originalLog(...args)
      addLog('log', args)
    }

    console.error = (...args) => {
      originalError(...args)
      addLog('error', args)
    }

    return () => {
      console.log = originalLog
      console.error = originalError
    }
  }, [])

  return (
    <div style={{
      position: 'fixed',
      bottom: 20,
      right: 20,
      zIndex: 9999,
      fontFamily: 'monospace',
      fontSize: '11px',
    }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          background: '#4f7cff',
          color: '#fff',
          border: 'none',
          borderRadius: '50%',
          width: 50,
          height: 50,
          cursor: 'pointer',
          fontSize: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        🔍
      </button>

      {isOpen && (
        <div style={{
          position: 'fixed',
          top: 60,
          right: 20,
          width: '90vw',
          maxWidth: 400,
          height: '60vh',
          background: '#1a1d2e',
          border: '1px solid #2c3148',
          borderRadius: 8,
          padding: 12,
          overflowY: 'auto',
          color: '#e8eaf2',
        }}>
          <div style={{ marginBottom: 10, fontWeight: 'bold', color: '#4f7cff' }}>
            Debug Logs ({logs.length})
          </div>
          <button
            onClick={() => setLogs([])}
            style={{
              background: '#ff4d6a',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              padding: '4px 8px',
              fontSize: '10px',
              marginBottom: 10,
              cursor: 'pointer',
            }}
          >
            Clear
          </button>
          {logs.map((log, i) => (
            <div
              key={i}
              style={{
                marginBottom: 8,
                paddingBottom: 8,
                borderBottom: '1px solid #2c3148',
                color: log.type === 'error' ? '#ff4d6a' : '#2ecc8f',
              }}
            >
              <div style={{ color: '#8b91a8', fontSize: '9px' }}>[{log.time}]</div>
              <div style={{ wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
                {log.message}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
