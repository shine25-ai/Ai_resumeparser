import React, { useState, useEffect } from 'react';
import { Mail, Save, Server, Key, User, ToggleLeft, ToggleRight, CheckCircle2, AlertCircle, Settings as SettingsIcon, FileText } from 'lucide-react';
import { SETTINGS_EMAIL, SETTINGS_EMAIL_TEST } from '../utils/Api';
import MailTemplates from '../components/MailTemplates';

export default function Settings() {
  const [activeTab, setActiveTab] = useState<'config' | 'templates'>('config');
  const [config, setConfig] = useState({
    smtp_server: '',
    smtp_port: 587,
    smtp_username: '',
    smtp_password: '',
    sender_name: '',
    sender_email: '',
    use_tls: true,
    use_ssl: false,
    smtp_password_set: false
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      // Create a fetch or axios call depending on what's available
      const response = await fetch(SETTINGS_EMAIL);
      if (response.ok) {
        const data = await response.json();
        setConfig(prev => ({ ...prev, ...data }));
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ type: '', text: '' });
    try {
      const response = await fetch(SETTINGS_EMAIL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      if (!response.ok) throw new Error('Failed to save configuration');
      const data = await response.json();
      setConfig(prev => ({ ...prev, ...data, smtp_password: '' })); // clear password field
      setMessage({ type: 'success', text: 'Email configuration saved successfully.' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save configuration.' });
    } finally {
      setSaving(false);
    }
  };

  const handleTestEmail = async () => {
    if (!testEmail) {
      setMessage({ type: 'error', text: 'Please enter a test email address.' });
      return;
    }
    setTesting(true);
    setMessage({ type: '', text: '' });
    try {
      const response = await fetch(SETTINGS_EMAIL_TEST, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail })
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Failed to send test email');
      }
      setMessage({ type: 'success', text: 'Test email sent successfully!' });
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div></div>;
  }

  return (
    <div className="max-w-4xl mx-auto pb-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-cyan-600">Settings</h1>
        <p className="text-slate-500 mt-2">Configure system settings, email preferences, and templates</p>
      </div>

      <div className="flex space-x-1 bg-slate-100 p-1 rounded-xl mb-8 border border-slate-200">
        <button
          onClick={() => setActiveTab('config')}
          className={`flex items-center gap-2 flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all cursor-pointer ${
            activeTab === 'config'
              ? 'bg-white text-indigo-600 shadow-sm border border-slate-200 font-semibold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <SettingsIcon className="w-4 h-4" />
          Email Configuration
        </button>
        <button
          onClick={() => setActiveTab('templates')}
          className={`flex items-center gap-2 flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all cursor-pointer ${
            activeTab === 'templates'
              ? 'bg-white text-indigo-600 shadow-sm border border-slate-200 font-semibold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <FileText className="w-4 h-4" />
          Mail Templates
        </button>
      </div>

      {activeTab === 'config' ? (
        <>
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-6 border-b border-slate-200 pb-4">
              <div className="p-2 bg-indigo-50 border border-indigo-200 rounded-lg">
                <Mail className="w-6 h-6 text-indigo-600" />
              </div>
              <h2 className="text-xl font-semibold text-slate-900">Email Configuration (SMTP)</h2>
            </div>

            {message.text && (
              <div className={`p-4 rounded-lg mb-6 flex items-center gap-3 ${message.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-rose-50 border border-rose-200 text-rose-700'}`}>
                {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                {message.text}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">SMTP Server</label>
                  <div className="relative">
                    <Server className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="text"
                      required
                      value={config.smtp_server}
                      onChange={e => setConfig({...config, smtp_server: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 pl-10 pr-4 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
                      placeholder="smtp.gmail.com"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">SMTP Port</label>
                  <div className="relative">
                    <Server className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="number"
                      required
                      value={config.smtp_port}
                      onChange={e => setConfig({...config, smtp_port: parseInt(e.target.value)})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 pl-10 pr-4 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
                      placeholder="587"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Username / Email</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="text"
                      required
                      value={config.smtp_username}
                      onChange={e => setConfig({...config, smtp_username: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 pl-10 pr-4 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
                      placeholder="hr@company.com"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Password {config.smtp_password_set && <span className="text-emerald-600 text-xs ml-2 font-bold">(Saved)</span>}
                  </label>
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="password"
                      required={!config.smtp_password_set}
                      value={config.smtp_password}
                      onChange={e => setConfig({...config, smtp_password: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 pl-10 pr-4 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
                      placeholder={config.smtp_password_set ? "Enter new password to change" : "Enter SMTP password"}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Sender Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="text"
                      required
                      value={config.sender_name}
                      onChange={e => setConfig({...config, sender_name: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 pl-10 pr-4 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
                      placeholder="HR Department"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Sender Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="email"
                      required
                      value={config.sender_email}
                      onChange={e => setConfig({...config, sender_email: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 pl-10 pr-4 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
                      placeholder="no-reply@company.com"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-8 py-4 border-t border-slate-200">
                <div className="flex items-center gap-3 cursor-pointer" onClick={() => setConfig({...config, use_tls: !config.use_tls})}>
                  {config.use_tls ? <ToggleRight className="w-8 h-8 text-indigo-600" /> : <ToggleLeft className="w-8 h-8 text-slate-400" />}
                  <span className="text-slate-700 font-medium">Use TLS</span>
                </div>
                <div className="flex items-center gap-3 cursor-pointer" onClick={() => setConfig({...config, use_ssl: !config.use_ssl})}>
                  {config.use_ssl ? <ToggleRight className="w-8 h-8 text-indigo-600" /> : <ToggleLeft className="w-8 h-8 text-slate-400" />}
                  <span className="text-slate-700 font-medium">Use SSL</span>
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

          <div className="mt-8 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-6 border-b border-slate-200 pb-4">
              <div className="p-2 bg-cyan-50 border border-cyan-200 rounded-lg">
                <Mail className="w-6 h-6 text-cyan-600" />
              </div>
              <h2 className="text-xl font-semibold text-slate-900">Test Configuration</h2>
            </div>
            <div className="flex items-end gap-4">
              <div className="flex-1">
                 <label className="block text-sm font-medium text-slate-700 mb-2">Test Email Address</label>
                 <input
                    type="email"
                    value={testEmail}
                    onChange={e => setTestEmail(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 px-4 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
                    placeholder="test@example.com"
                  />
              </div>
              <button
                onClick={handleTestEmail}
                disabled={testing || !testEmail}
                className="flex items-center gap-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 px-6 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 shadow-sm cursor-pointer"
              >
                {testing ? 'Sending...' : 'Send Test Email'}
              </button>
            </div>
          </div>
        </>
      ) : (
        <MailTemplates />
      )}
    </div>
  );
}
