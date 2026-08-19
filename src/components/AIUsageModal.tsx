import { useState, useEffect } from 'react';
import { X, Activity, Server, AlertCircle, RefreshCw, ExternalLink } from 'lucide-react';
import { SETTINGS_AI_USAGE } from '../utils/Api';

interface AIUsageModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AIUsageModal({ isOpen, onClose }: AIUsageModalProps) {
  const [usage, setUsage] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchUsage();
    }
  }, [isOpen]);

  const fetchUsage = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(SETTINGS_AI_USAGE);
      if (!response.ok) throw new Error('Failed to fetch usage');
      const data = await response.json();
      setUsage(data);
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-xl">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <Activity className="w-5 h-5" />
            </div>
            <h3 className="text-xl font-semibold text-slate-800">AI Usage Stats</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin mb-4" />
              <p className="text-slate-500">Fetching usage statistics...</p>
            </div>
          ) : error ? (
            <div className="p-4 bg-rose-50 text-rose-700 rounded-lg flex items-center gap-3">
              <AlertCircle className="w-5 h-5" />
              <p>{error}</p>
            </div>
          ) : usage ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between bg-slate-50 p-4 rounded-xl border border-slate-100">
                <div className="flex items-center gap-3">
                  <Server className="w-5 h-5 text-slate-400" />
                  <span className="font-medium text-slate-700">Active Provider</span>
                </div>
                <span className="px-3 py-1 bg-white border border-slate-200 rounded-md text-sm font-semibold capitalize shadow-sm">
                  {usage.provider}
                </span>
              </div>

              {usage.provider === 'openrouter' ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm">
                    <p className="text-sm text-slate-500 font-medium mb-1">Total Limit</p>
                    <p className="text-2xl font-bold text-slate-800">
                      ${usage.limit?.toFixed(2) || '0.00'}
                    </p>
                  </div>
                  <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm">
                    <p className="text-sm text-slate-500 font-medium mb-1">Current Usage</p>
                    <p className="text-2xl font-bold text-indigo-600">
                      ${usage.usage?.toFixed(2) || '0.00'}
                    </p>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl shadow-sm col-span-2">
                    <p className="text-sm text-emerald-600 font-medium mb-1">Remaining Credits</p>
                    <p className="text-2xl font-bold text-emerald-700">
                      {typeof usage.remaining === 'number' ? '$' + usage.remaining.toFixed(2) : usage.remaining}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm">
                    <p className="text-sm text-slate-500 font-medium mb-1">Prompt Tokens</p>
                    <p className="text-2xl font-bold text-slate-800">
                      {usage.total_prompt?.toLocaleString() || '0'}
                    </p>
                  </div>
                  <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm">
                    <p className="text-sm text-slate-500 font-medium mb-1">Completion Tokens</p>
                    <p className="text-2xl font-bold text-slate-800">
                      {usage.total_completion?.toLocaleString() || '0'}
                    </p>
                  </div>
                  <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl shadow-sm col-span-2">
                    <p className="text-sm text-indigo-600 font-medium mb-1">Total {usage.provider.charAt(0).toUpperCase() + usage.provider.slice(1)} Local Tokens Used</p>
                    <p className="text-2xl font-bold text-indigo-700">
                      {usage.usage?.toLocaleString() || '0'}
                    </p>
                  </div>

                  {usage.provider === 'groq' && usage.groq_limits && usage.groq_limits.limit_tokens && (
                    <div className="col-span-2 mt-4 space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                        <h4 className="text-sm font-semibold text-slate-800">Groq Live API Quota (From Headers)</h4>
                        <a 
                          href="https://console.groq.com/docs/rate-limits" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
                        >
                          View Tier Limits
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-orange-50 border border-orange-100 p-4 rounded-xl shadow-sm">
                          <p className="text-xs text-orange-600 font-medium mb-1">Remaining Tokens / Min</p>
                          <p className="text-xl font-bold text-orange-700">
                            {usage.groq_limits.remaining_tokens?.toLocaleString() || '0'} / {usage.groq_limits.limit_tokens?.toLocaleString()}
                          </p>
                          <p className="text-[10px] text-orange-500 mt-1">Resets in {usage.groq_limits.reset_tokens}</p>
                        </div>
                        <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl shadow-sm">
                          <p className="text-xs text-emerald-600 font-medium mb-1">Remaining Requests / Day</p>
                          <p className="text-xl font-bold text-emerald-700">
                            {usage.groq_limits.remaining_requests?.toLocaleString() || '0'} / {usage.groq_limits.limit_requests?.toLocaleString()}
                          </p>
                          <p className="text-[10px] text-emerald-500 mt-1">Resets in {usage.groq_limits.reset_requests}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {usage.provider === 'groq' && usage.latest_rate_limits && usage.latest_rate_limits.limit_tokens && (
                    <div className="col-span-2 mt-4 space-y-4">
                      <h4 className="text-sm font-semibold text-slate-800 border-b border-slate-200 pb-2">Last Stored Rate Limit (From Latest Parse)</h4>
                      <div className="grid grid-cols-2 gap-4 opacity-80">
                        <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl shadow-sm">
                          <p className="text-xs text-slate-600 font-medium mb-1">Remaining Tokens / Min</p>
                          <p className="text-xl font-bold text-slate-700">
                            {usage.latest_rate_limits.remaining_tokens?.toLocaleString() || '0'} / {usage.latest_rate_limits.limit_tokens?.toLocaleString()}
                          </p>
                        </div>
                        <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl shadow-sm">
                          <p className="text-xs text-slate-600 font-medium mb-1">Remaining Requests / Day</p>
                          <p className="text-xl font-bold text-slate-700">
                            {usage.latest_rate_limits.remaining_requests?.toLocaleString() || '0'} / {usage.latest_rate_limits.limit_requests?.toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {usage.message && (
                <div className="p-4 bg-blue-50 text-blue-700 rounded-lg flex gap-3 text-sm border border-blue-100">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <p>{usage.message}</p>
                </div>
              )}
            </div>
          ) : null}
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
          <button
            onClick={fetchUsage}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={onClose}
            className="px-6 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
