import CommunicationWorkspace from './CommunicationWorkspace'

export default function Followups({ onNavigate }) {
  return <CommunicationWorkspace defaultView="followups" onNavigate={onNavigate} />
}
