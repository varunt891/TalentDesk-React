import './demo-notice.css'

export default function DemoNotice() {
  return <div role="note" className="demo-notice">
    <span><strong>Temporary demo</strong><span> · Fictional data · Edits stay in this browser · Live AI and resume uploads unavailable</span></span>
    <button type="button" onClick={async () => {
      if (!window.confirm('Reset this browser’s demo candidates, jobs and edits?')) return
      const { resetDemo } = await import('../../lib/demoApi')
      resetDemo()
    }}>Reset demo</button>
  </div>
}
