import React, { useState, useEffect } from 'react';
import { Save, Settings as SettingsIcon, AlertCircle, CheckCircle2, Box } from 'lucide-react';
import { SETTINGS_APP } from '../utils/Api';

export default function AppConfiguration() {
  const [config, setConfig] = useState({
    enable_bulk_parsing: true,
    bulk_parsing_limit: 5
  });
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const response = await fetch(SETTINGS_APP);
      if (response.ok) {
        const data = await response.json();
        setConfig({ 
          enable_bulk_parsing: data.enable_bulk_parsing ?? true,
          bulk_parsing_limit: data.bulk_parsing_limit ?? 5
        });
      }
    } catch (error) {
      console.error('Failed to fetch App settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ type: '', text: '' });
    try {
      const payload = {
        enable_bulk_parsing: config.enable_bulk_parsing,
        bulk_parsing_limit: config.bulk_parsing_limit,
      };
      const response = await fetch(SETTINGS_APP, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error('Failed to save App configuration');
      const data = await response.json();
      setConfig(data);
      setMessage({ type: 'success', text: 'App configuration saved successfully.' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save configuration.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-40"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div></div>;
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-50 border border-indigo-200 rounded-lg">
            <SettingsIcon className="w-6 h-6 text-indigo-600" />
          </div>
          <h2 className="text-xl font-semibold text-slate-900">App Configuration</h2>
        </div>
      </div>

      {message.text && (
        <div className={`p-4 rounded-lg mb-6 flex items-center gap-3 ${message.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-rose-50 border border-rose-200 text-rose-700'}`}>
          {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          {message.text}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        <div className="grid grid-cols-1 gap-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-sm font-medium text-slate-900">Enable Bulk Parsing</h3>
              <p className="text-xs text-slate-500 mt-1">Allow users to select and parse multiple resumes at once.</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={config.enable_bulk_parsing}
                onChange={(e) => setConfig({...config, enable_bulk_parsing: e.target.checked})}
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Max Bulk Files Limit</label>
            <div className="relative">
              <Box className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="number"
                min="1"
                max="50"
                required
                value={config.bulk_parsing_limit}
                onChange={e => setConfig({...config, bulk_parsing_limit: parseInt(e.target.value) || 5})}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 pl-10 pr-4 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
                disabled={!config.enable_bulk_parsing}
              />
            </div>
            <p className="text-xs text-slate-500 mt-1">The maximum number of resumes that can be selected in a single batch.</p>
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-slate-200">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
          >
            {saving ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : <Save className="w-5 h-5" />}
            Save Configuration
          </button>
        </div>
      </form>
    </div>
  );
}
