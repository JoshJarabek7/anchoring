import ApiSettings from './ApiSettings';
import ProxySettings from './ProxySettings';
import VectorDBSettings from './VectorDBSettings';

export default function SettingsPage() {
  return (
    <div className="container mx-auto p-4 space-y-4">
      <ApiSettings />
      <ProxySettings />
      <VectorDBSettings />
    </div>
  );
}