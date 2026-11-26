import React, { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Lock, Mail, ArrowRight, AlertCircle, Building2, ShieldCheck, ArrowLeft, KeyRound } from "lucide-react";
import { confirmMfaSetup, loginUser, startMfaSetup, verifyMfaLogin, type AuthSuccessResult, type LoginPayload, type MfaSetup } from "../utils/Api";
import { assetUrl, useTheme } from "../theme/ThemeProvider";
import { rememberLoginCompany } from "../theme/brandingCache";

/**
 * Sign-in page. /<company>/login (or /login?company=<slug>) shows that company's branding and only lets its
 * users in; plain /login is the platform's sign-in page.
 */
export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const [search] = useSearchParams();
  const companySlug = (params.company || search.get("company") || "").toLowerCase() || null;
  const { branding, logo, refresh } = useTheme();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // MFA 2-step state
  const [mfaData, setMfaData] = useState<{ mfa_token: string; email: string; enrolled: boolean } | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  // First-time setup when MFA is required but the account has no authenticator yet
  const [setup, setSetup] = useState<MfaSetup | null>(null);

  useEffect(() => {
    if (!mfaData || mfaData.enrolled || setup) return;
    startMfaSetup(mfaData.mfa_token)
      .then(setSetup)
      .catch((err) => setError(err.message || "Could not start two-factor setup. Please sign in again."));
  }, [mfaData, setup]);

  useEffect(() => {
    // The company's look on its own page; the platform's look on /login.
    refresh(companySlug);
  }, [companySlug, refresh]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const payload: LoginPayload = { email, password, ...(companySlug ? { company: companySlug } : {}) };
      const data = await loginUser(payload);

      if (data.mfa_required) {
        setMfaData({
          mfa_token: data.mfa_token || "",
          email: data.email || email,
          enrolled: Boolean(data.mfa_enrolled),
        });
        setLoading(false);
        return;
      }

      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("refresh_token", data.refresh_token);
      localStorage.setItem("user", JSON.stringify(data.user));
      rememberLoginCompany(companySlug || (data.user as { company_slug?: string })?.company_slug);
      // Load the signed-in company's branding (it may differ from this page's).
      await refresh();

      // Return to the page the session expired on, otherwise the dashboard
      navigate(location.state?.from || "/");
    } catch (err: any) {
      setError(err.message || "Failed to authenticate. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaData) return;
    setError(null);
    setLoading(true);

    try {
      const data: AuthSuccessResult = mfaData.enrolled
        ? await verifyMfaLogin(mfaData.mfa_token, mfaCode.trim())
        : await confirmMfaSetup(mfaData.mfa_token, mfaCode.trim());
      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("refresh_token", data.refresh_token);
      localStorage.setItem("user", JSON.stringify(data.user));
      rememberLoginCompany(companySlug || (data.user as { company_slug?: string })?.company_slug);
      await refresh();
      navigate(location.state?.from || "/");
    } catch (err: any) {
      setError(err.message || "Invalid authentication code. Please check and try again.");
    } finally {
      setLoading(false);
    }
  };

  const background = assetUrl(branding.login.background_url);

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.05fr_1fr] bg-[var(--app-bg)] text-slate-900">
      {/* Brand panel */}
      <aside
        className="relative hidden lg:flex flex-col justify-between overflow-hidden p-10 text-white"
        style={{ backgroundColor: "var(--sidebar-bg)" }}
      >
        {background && <img src={background} alt="" className="absolute inset-0 h-full w-full object-cover opacity-35" />}
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full blur-3xl" style={{ background: "color-mix(in oklab, var(--brand) 55%, transparent)" }} />
        <div className="absolute -bottom-32 -left-16 h-80 w-80 rounded-full blur-3xl" style={{ background: "color-mix(in oklab, var(--accent) 35%, transparent)" }} />

        <div className="relative flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-white shadow">
            {logo ? <img src={logo} alt="" className="h-full w-full object-contain p-1.5" /> : <Building2 className="text-indigo-600" size={22} />}
          </div>
          <div>
            <p className="text-lg font-extrabold leading-tight">{branding.app_name}</p>
            <p className="text-xs opacity-70">Recruitment portal</p>
          </div>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-3xl font-bold leading-tight">{branding.login.welcome_title}</h2>
          <p className="mt-3 text-sm leading-relaxed opacity-80">{branding.login.welcome_text}</p>
        </div>

        <p className="relative text-[11px] opacity-50">© {new Date().getFullYear()} {branding.app_name}</p>
      </aside>

      {/* Form */}
      <main className="flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-white shadow">
              {logo ? <img src={logo} alt="" className="h-full w-full object-contain p-1" /> : <Building2 className="text-indigo-600" size={20} />}
            </div>
            <p className="text-lg font-extrabold">{branding.app_name}</p>
          </div>

          {!mfaData ? (
            <>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Sign in</h1>
              <p className="mt-1 mb-6 text-sm text-slate-500">
                {companySlug ? `Use your ${branding.app_name} account.` : "Use the account your administrator created for you."}
              </p>

              <div className="bg-white border border-slate-200 rounded-2xl p-7 shadow-sm">
                {error && (
                  <div className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3 text-red-600 text-sm">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label htmlFor="login-email" className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2">
                      Email Address
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Mail className="w-4 h-4" />
                      </div>
                      <input
                        id="login-email"
                        type="email"
                        required
                        autoComplete="email"
                        placeholder="you@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="login-password" className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2">
                      Password
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Lock className="w-4 h-4" />
                      </div>
                      <input
                        id="login-password"
                        type="password"
                        required
                        autoComplete="current-password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all text-sm"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-xl shadow-md transition-all duration-200 flex items-center justify-center gap-2 group cursor-pointer text-sm"
                  >
                    {loading ? (
                      <span>Signing in...</span>
                    ) : (
                      <>
                        <span>Sign In</span>
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                      </>
                    )}
                  </button>
                </form>
              </div>
              <p className="mt-6 text-center text-xs text-slate-400">Forgot your password? Ask your company administrator to reset it.</p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-indigo-600 mb-2">
                <ShieldCheck className="w-6 h-6" />
                <span className="text-xs font-bold uppercase tracking-wider">Two-Factor Authentication</span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                {mfaData.enrolled ? "Security Verification" : "Set up two-factor sign-in"}
              </h1>
              <p className="mt-1 mb-6 text-sm text-slate-500">
                {mfaData.enrolled
                  ? "Enter the 6-digit code from your authenticator app or one of your single-use backup codes."
                  : "Your account needs two-factor sign-in. Scan the QR code with an authenticator app (Google Authenticator, Microsoft Authenticator, Authy), then enter the 6-digit code it shows."}
              </p>

              {!mfaData.enrolled && setup && (
                <div className="mb-5 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                  <div className="flex flex-col sm:flex-row gap-4 items-start">
                    {/* The QR code SVG is generated by our own backend from the otpauth link */}
                    <div className="shrink-0 rounded-xl border border-slate-200 p-2 bg-white [&_svg]:h-40 [&_svg]:w-40" dangerouslySetInnerHTML={{ __html: setup.qr_svg }} />
                    <div className="min-w-0 text-xs text-slate-600 space-y-2">
                      <p>Can't scan it? Enter this key in the app:</p>
                      <code className="block bg-slate-100 p-2 rounded text-slate-800 font-mono select-all break-all">{setup.secret}</code>
                      <p className="font-semibold text-slate-700">Backup codes (each works once). Save them somewhere safe now:</p>
                      <div className="grid grid-cols-2 gap-1 font-mono">
                        {setup.backup_codes.map((c) => <span key={c} className="bg-slate-50 px-2 py-0.5 rounded border border-slate-200">{c}</span>)}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-white border border-slate-200 rounded-2xl p-7 shadow-sm">
                {error && (
                  <div className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3 text-red-600 text-sm">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <form onSubmit={handleMfaSubmit} className="space-y-5">
                  <div>
                    <label htmlFor="mfa-code" className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2">
                      Passcode / Backup Code
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <KeyRound className="w-4 h-4" />
                      </div>
                      <input
                        id="mfa-code"
                        type="text"
                        required
                        autoFocus
                        placeholder="123456 or a8f1-c4d2"
                        value={mfaCode}
                        onChange={(e) => setMfaCode(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-mono tracking-widest text-center text-lg placeholder-slate-400 focus:bg-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || !mfaCode.trim() || (!mfaData.enrolled && !setup)}
                    className="w-full py-3.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-xl shadow-md transition-all duration-200 flex items-center justify-center gap-2 group cursor-pointer text-sm"
                  >
                    {loading ? <span>Verifying...</span> : <span>{mfaData.enrolled ? "Verify & Continue" : "Turn on & Sign In"}</span>}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMfaData(null);
                      setSetup(null);
                      setMfaCode("");
                      setError(null);
                    }}
                    className="w-full py-2 text-xs font-medium text-slate-500 hover:text-slate-800 flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" /> Back to password sign in
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
