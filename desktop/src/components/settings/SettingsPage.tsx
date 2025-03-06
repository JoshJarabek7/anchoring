import ApiSettings from './ApiSettings';
import ProxySettings from './ProxySettings';

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <ApiSettings />
      <ProxySettings />
    </div>
  );
}