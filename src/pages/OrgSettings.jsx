import SettingsCenter from './SettingsCenter'

export default function OrgSettings({ onNavigate }) {
  return <SettingsCenter initialTab="organization" onNavigate={onNavigate} />
}
