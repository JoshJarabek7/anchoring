import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { saveVectorDBSettings, getVectorDBSettings } from '@/lib/db';

interface VectorDBSettings {
  pinecone_api_key: string;
  pinecone_environment: string;
  pinecone_index: string;
}

export default function VectorDBSettings() {
  const [settings, setSettings] = useState<VectorDBSettings>({
    pinecone_api_key: '',
    pinecone_environment: '',
    pinecone_index: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const config = await getVectorDBSettings();
      setSettings(config);
    } catch (error) {
      console.error('Error loading vector DB settings:', error);
      toast.error("Failed to load vector DB settings");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await saveVectorDBSettings(settings);
      toast.success("Vector DB settings saved successfully");
    } catch (error) {
      console.error('Error saving vector DB settings:', error);
      toast.error("Failed to save vector DB settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vector Database Settings</CardTitle>
        <CardDescription>Configure your vector database connections.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-medium">Remote Pinecone Settings</h3>
            <div className="grid gap-4 mt-2">
              <div className="grid gap-2">
                <Label htmlFor="pinecone_api_key">API Key</Label>
                <Input
                  id="pinecone_api_key"
                  type="password"
                  value={settings.pinecone_api_key}
                  onChange={(e) => setSettings({ ...settings, pinecone_api_key: e.target.value })}
                  placeholder="Enter Pinecone API key"
                  disabled={loading}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="pinecone_environment">Environment</Label>
                <Input
                  id="pinecone_environment"
                  value={settings.pinecone_environment}
                  onChange={(e) => setSettings({ ...settings, pinecone_environment: e.target.value })}
                  placeholder="us-east-1"
                  disabled={loading}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="pinecone_index">Index Name</Label>
                <Input
                  id="pinecone_index"
                  value={settings.pinecone_index}
                  onChange={(e) => setSettings({ ...settings, pinecone_index: e.target.value })}
                  placeholder="Enter index name"
                  disabled={loading}
                />
              </div>
            </div>
          </div>
        </div>

        <Button 
          onClick={handleSave} 
          className="w-full"
          disabled={loading || saving}
        >
          {saving ? "Saving..." : "Save Settings"}
        </Button>
      </CardContent>
    </Card>
  );
} 