import SettingsCenter from './SettingsCenter'

export default function TeamManagement({ onNavigate }) {
  return <SettingsCenter initialTab="users" onNavigate={onNavigate} />
}
