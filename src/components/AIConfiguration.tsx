import React, { useState, useEffect } from 'react';
import { Save, Server, Key, Box, Cpu, AlertCircle, CheckCircle2, Info, ExternalLink } from 'lucide-react';
import { SETTINGS_AI } from '../utils/Api';
import AIUsageModal from './AIUsageModal';

export default function AIConfiguration() {
  const [config, setConfig] = useState({
    provider: 'groq',
    base_url: '',
    model_name: '',
    api_key: '',
    api_key_set: false
  });
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [isUsageModalOpen, setIsUsageModalOpen] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const response = await fetch(SETTINGS_AI);
      if (response.ok) {
        const data = await response.json();
        setConfig(prev => ({ 
          ...prev, 
          ...data,
          base_url: data.base_url || '',
          model_name: data.model_name || ''
        }));
      }
    } catch (error) {
      console.error('Failed to fetch AI settings:', error);
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
        provider: config.provider,
        base_url: config.base_url || null,
        model_name: config.model_name,
        api_key: config.api_key || null,
      };
      const response = await fetch(SETTINGS_AI, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error('Failed to save AI configuration');
      const data = await response.json();
      setConfig(prev => ({ ...prev, ...data, api_key: '' }));
      setMessage({ type: 'success', text: 'AI configuration saved successfully.' });
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
          <div className="p-2 bg-purple-50 border border-purple-200 rounded-lg">
            <Cpu className="w-6 h-6 text-purple-600" />
          </div>
          <h2 className="text-xl font-semibold text-slate-900">AI Configuration</h2>
        </div>
        <button
          onClick={() => setIsUsageModalOpen(true)}
          className="flex items-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-indigo-200"
        >
          <Info className="w-4 h-4" />
          Check Usage
        </button>
      </div>

      {message.text && (
        <div className={`p-4 rounded-lg mb-6 flex items-center gap-3 ${message.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-rose-50 border border-rose-200 text-rose-700'}`}>
          {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          {message.text}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-2">AI Provider</label>
            <div className="relative">
              <Box className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <select
                value={config.provider}
                onChange={e => setConfig({...config, provider: e.target.value})}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 pl-10 pr-4 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-colors appearance-none"
              >
                <option value="groq">Groq</option>
                <option value="ollama">Ollama (Cloud/Local)</option>
                <option value="openrouter">OpenRouter</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Model Name (Optional)</label>
            <div className="relative">
              <Cpu className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                autoComplete="off"
                data-lpignore="true"
                value={config.model_name}
                onChange={e => setConfig({...config, model_name: e.target.value})}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 pl-10 pr-4 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-colors"
                placeholder={config.provider === 'groq' ? 'Default: gpt-oss:120b' : config.provider === 'openrouter' ? 'Default: mistralai/mistral-7b-instruct:free' : 'Default: gpt-oss:120b-cloud'}
              />
            </div>
            
            <div className="mt-2 text-xs text-slate-500 flex items-center justify-end">
              <a 
                href={
                  config.provider === 'groq' ? 'https://console.groq.com/docs/models' :
                  config.provider === 'openrouter' ? 'https://openrouter.ai/models' :
                  'https://ollama.com/library'
                }
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center text-purple-600 hover:text-purple-700 hover:underline"
              >
                View available {config.provider} models
                <ExternalLink className="w-3 h-3 ml-1" />
              </a>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              API Key {config.api_key_set && <span className="text-emerald-600 text-xs ml-2 font-bold">(Saved)</span>}
            </label>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="password"
                autoComplete="new-password"
                data-lpignore="true"
                value={config.api_key}
                onChange={e => setConfig({...config, api_key: e.target.value})}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 pl-10 pr-4 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-colors"
                placeholder={config.api_key_set ? "Enter new API key to change" : "Enter API Key (Optional if in .env)"}
              />
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-2">Base URL (Optional for Groq)</label>
            <div className="relative">
              <Server className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                autoComplete="off"
                data-lpignore="true"
                value={config.base_url}
                onChange={e => setConfig({...config, base_url: e.target.value})}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 pl-10 pr-4 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-colors"
                placeholder={config.provider === 'ollama' ? "https://ai.shinelogics.com" : config.provider === 'openrouter' ? "https://openrouter.ai/api/v1" : "Leave empty for defaults"}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-slate-200">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
          >
            {saving ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : <Save className="w-5 h-5" />}
            Save Configuration
          </button>
        </div>
      </form>
      
      {isUsageModalOpen && (
        <AIUsageModal isOpen={isUsageModalOpen} onClose={() => setIsUsageModalOpen(false)} />
      )}
    </div>
  );
}
