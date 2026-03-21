'use client';
import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useTranslations } from 'next-intl';

function LoginForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const callbackUrl = searchParams?.get('callbackUrl') || '/dashboard';
    const t = useTranslations('login');
    const [mode, setMode] = useState<'login' | 'register'>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [orgName, setOrgName] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleCredentialsSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            if (mode === 'register') {
                // Registration still uses the legacy API (creates tenant + user)
                const res = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'register', email, password, name, orgName }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Registration failed');
                // After registration, sign in with credentials
            }

            // Sign in via NextAuth credentials provider
            const result = await signIn('credentials', {
                email,
                password,
                redirect: false,
                callbackUrl,
            });

            if (result?.error) {
                throw new Error(result.error === 'CredentialsSignin' ? 'Invalid credentials' : result.error);
            }

            router.push(callbackUrl);
            router.refresh();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleOAuthSignIn = async (provider: string) => {
        setError('');
        setLoading(true);
        try {
            await signIn(provider, { callbackUrl });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
            setError(err.message);
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-brand-950 p-4">
            {/* Background effects */}
            <div className="absolute inset-0 overflow-hidden">
                <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-brand-600/10 blur-3xl" />
                <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full bg-purple-600/10 blur-3xl" />
            </div>

            <div className="relative w-full max-w-md">
                {/* Logo */}
                <div className="text-center mb-8 animate-fadeIn">
                    <div className="inline-flex items-center gap-2 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center">
                            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                        </div>
                    </div>
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                        {t('title')}
                    </h1>
                    <p className="text-slate-400 text-sm mt-1">{t('subtitle')}</p>
                </div>

                {/* Form */}
                <div className="glass-card p-8 animate-fadeIn">
                    <h2 className="text-lg font-semibold mb-6">
                        {mode === 'login' ? t('signIn') : t('register')}
                    </h2>

                    {error && (
                        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    {/* OAuth Buttons */}
                    <div className="space-y-3 mb-6">
                        <button
                            onClick={() => handleOAuthSignIn('google')}
                            disabled={loading}
                            className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-lg border border-slate-600/50 bg-slate-800/50 hover:bg-slate-700/50 transition-colors text-sm font-medium text-slate-200"
                        >
                            <svg className="w-5 h-5" viewBox="0 0 24 24">
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                            </svg>
                            Continue with Google
                        </button>
                        <button
                            onClick={() => handleOAuthSignIn('microsoft-entra-id')}
                            disabled={loading}
                            className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-lg border border-slate-600/50 bg-slate-800/50 hover:bg-slate-700/50 transition-colors text-sm font-medium text-slate-200"
                        >
                            <svg className="w-5 h-5" viewBox="0 0 21 21">
                                <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                                <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                                <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                                <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                            </svg>
                            Continue with Microsoft
                        </button>
                    </div>

                    {/* Divider */}
                    <div className="relative mb-6">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-slate-700/50" />
                        </div>
                        <div className="relative flex justify-center text-xs">
                            <span className="px-2 bg-slate-900 text-slate-500">or continue with email</span>
                        </div>
                    </div>

                    {/* Credentials Form */}
                    <form onSubmit={handleCredentialsSubmit} className="space-y-4">
                        {mode === 'register' && (
                            <>
                                <div>
                                    <label className="input-label">{t('name')}</label>
                                    <input className="input" value={name} onChange={(e) => setName(e.target.value)} required placeholder={t('namePlaceholder')} />
                                </div>
                                <div>
                                    <label className="input-label">{t('orgName')}</label>
                                    <input className="input" value={orgName} onChange={(e) => setOrgName(e.target.value)} required placeholder={t('orgPlaceholder')} />
                                </div>
                            </>
                        )}
                        <div>
                            <label className="input-label">{t('email')}</label>
                            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder={t('emailPlaceholder')} />
                        </div>
                        <div>
                            <label className="input-label">{t('password')}</label>
                            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder={t('passwordPlaceholder')} minLength={6} />
                        </div>
                        <button type="submit" disabled={loading} className="btn btn-primary w-full py-2.5">
                            {loading ? t('pleaseWait') : mode === 'login' ? t('submitLogin') : t('submitRegister')}
                        </button>
                    </form>

                    <div className="mt-6 text-center text-sm text-slate-400">
                        {mode === 'login' ? (
                            <span>{t('noAccount')} <button onClick={() => setMode('register')} className="text-brand-400 hover:text-brand-300">{t('registerLink')}</button></span>
                        ) : (
                            <span>{t('hasAccount')} <button onClick={() => setMode('login')} className="text-brand-400 hover:text-brand-300">{t('signInLink')}</button></span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-brand-950">
                <div className="text-slate-400">Loading...</div>
            </div>
        }>
            <LoginForm />
        </Suspense>
    );
}
