import { NavIcon } from './nav-icon';

const settingsTopics = {
  profile: 'Profil',
  appearance: 'Tampilan',
  security: 'Keamanan',
  sessions: 'Sesi aktif',
  passkey: 'Passkey',
  users: 'Pengguna',
  groups: 'Grup & hak akses menu',
  identity: 'Identitas dokumen',
} as const;

export type SettingsTopic = keyof typeof settingsTopics;

export function SettingsSectionHeading({topic, description}: {topic: SettingsTopic; description?: string}) {
  const title = settingsTopics[topic];
  return <div className="settings-section-heading">
    {topic==='sessions'&&<span className="settings-icon"><NavIcon name="sessions"/></span>}
    <div>
      <h3>{title}</h3>
      {description&&<p>{description}</p>}
    </div>
  </div>;
}
