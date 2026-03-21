'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useTenantApiUrl, useTenantHref, useTenantContext } from '@/lib/tenant-context-provider';

type ControlOption = { id: string; annexId: string | null; name: string; status: string };

type Template = {
    id: string;
    title: string;
    description: string | null;
    category: string | null;
    defaultLikelihood: number;
    defaultImpact: number;
    frameworkTag: string | null;
};

function getRiskBadge(score: number, t: (key: string) => string) {
    if (score <= 5) return { label: t('low'), cls: 'text-emerald-400' };
    if (score <= 12) return { label: t('medium'), cls: 'text-amber-400' };
    if (score <= 18) return { label: t('high'), cls: 'text-orange-400' };
    return { label: t('critical'), cls: 'text-red-400' };
}

const CATEGORIES = ['Technical', 'Operational', 'Compliance', 'Strategic', 'Financial', 'Reputational', 'Physical', 'Human Resources'] as const;

export default function NewRiskPage() {
    const apiUrl = useTenantApiUrl();
    const href = useTenantHref();
    const tenant = useTenantContext();
    const router = useRouter();
    const canWrite = tenant.permissions.canWrite;
    const t = useTranslations('riskManager');

    // Wizard state
    const [mode, setMode] = useState<'choose' | 'blank' | 'template'>('choose');
    const [step, setStep] = useState(0);

    // Template state
    const [templates, setTemplates] = useState<Template[]>([]);
    const [templateSearch, setTemplateSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
    const [loadingTemplates, setLoadingTemplates] = useState(false);

    // Control state
    const [controls, setControls] = useState<ControlOption[]>([]);
    const [selectedControlIds, setSelectedControlIds] = useState<Set<string>>(new Set());

    // Form state
    const [form, setForm] = useState({
        title: '',
        description: '',
        category: '',
        likelihood: 3,
        impact: 3,
        nextReviewAt: '',
        treatmentOwner: '',
    });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Fetch controls on mount
    useEffect(() => {
        fetch(apiUrl('/controls'))
            .then(r => { if (!r.ok) throw new Error(`Controls: ${r.status}`); return r.json(); })
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .then((data: any[]) => setControls(Array.isArray(data) ? data.map(c => ({ id: c.id, annexId: c.annexId, name: c.name, status: c.status })) : []))
            .catch((e) => { console.error('Failed to load controls:', e); setControls([]); });
    }, [apiUrl]);

    const toggleControl = (id: string) => {
        setSelectedControlIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    // Fetch templates
    useEffect(() => {
        if (mode === 'template' || mode === 'choose') {
            setLoadingTemplates(true);
            fetch('/api/risk-templates')
                .then(r => r.json())
                .then(setTemplates)
                .catch(() => setTemplates([]))
                .finally(() => setLoadingTemplates(false));
        }
    }, [mode]);

    const filteredTemplates = templates.filter(tmpl => {
        if (templateSearch && !tmpl.title.toLowerCase().includes(templateSearch.toLowerCase()) &&
            !tmpl.description?.toLowerCase().includes(templateSearch.toLowerCase())) return false;
        if (categoryFilter && tmpl.category !== categoryFilter) return false;
        return true;
    });

    const tmplCategories = [...new Set(templates.map(tmpl => tmpl.category).filter(Boolean))] as string[];

    const selectTemplate = (tmpl: Template) => {
        setSelectedTemplate(tmpl);
        setForm(f => ({
            ...f,
            title: tmpl.title,
            description: tmpl.description || '',
            category: tmpl.category || '',
            likelihood: tmpl.defaultLikelihood,
            impact: tmpl.defaultImpact,
        }));
        setStep(1);
    };

    const computedScore = form.likelihood * form.impact;
    const badge = getRiskBadge(computedScore, t);

    const handleSubmit = async () => {
        setSubmitting(true);
        setError(null);
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const payload: Record<string, any> = {
                title: form.title,
                description: form.description || undefined,
                category: form.category || undefined,
                likelihood: form.likelihood,
                impact: form.impact,
                treatmentOwner: form.treatmentOwner || undefined,
            };
            if (form.nextReviewAt) {
                payload.nextReviewAt = new Date(form.nextReviewAt).toISOString();
            }
            if (selectedTemplate) {
                payload.templateId = selectedTemplate.id;
            }

            const res = await fetch(apiUrl('/risks'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.message || `Failed to create risk (${res.status})`);
            }
            const risk = await res.json();

            // Link selected controls
            for (const controlId of selectedControlIds) {
                await fetch(apiUrl(`/risks/${risk.id}/controls`), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ controlId }),
                }).catch(() => { }); // best-effort
            }

            router.push(href('/risks'));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
        setForm(f => ({ ...f, [field]: e.target.value }));
    const setNum = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm(f => ({ ...f, [field]: Number(e.target.value) }));

    if (!canWrite) {
        return (
            <div className="space-y-6 animate-fadeIn">
                <div className="glass-card p-8 text-center">
                    <p className="text-slate-400">{t('noPermission')}</p>
                    <Link href={href('/risks')} className="btn btn-secondary mt-4">{t('backToRisks')}</Link>
                </div>
            </div>
        );
    }

    // ─── Choose mode ───
    if (mode === 'choose') {
        return (
            <div className="space-y-6 animate-fadeIn max-w-3xl">
                <div className="flex items-center gap-3">
                    <Link href={href('/risks')} className="text-slate-400 hover:text-white transition">←</Link>
                    <div>
                        <h1 className="text-2xl font-bold">{t('newRiskTitle')}</h1>
                        <p className="text-slate-400 text-sm">{tenant.tenantName}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button
                        onClick={() => { setMode('blank'); setStep(1); }}
                        className="glass-card p-6 text-left hover:border-brand-500/50 transition group cursor-pointer"
                        id="create-blank"
                    >
                        <div className="text-2xl mb-2"></div>
                        <h3 className="font-semibold text-white group-hover:text-brand-400 transition">{t('startScratch')}</h3>
                        <p className="text-sm text-slate-400 mt-1">{t('startScratchDesc')}</p>
                    </button>

                    <button
                        onClick={() => setMode('template')}
                        className="glass-card p-6 text-left hover:border-purple-500/50 transition group cursor-pointer"
                        id="create-from-template"
                    >
                        <div className="text-2xl mb-2"></div>
                        <h3 className="font-semibold text-white group-hover:text-purple-400 transition">{t('useTemplate')}</h3>
                        <p className="text-sm text-slate-400 mt-1">{t('useTemplateDesc')}</p>
                        {!loadingTemplates && templates.length > 0 && (
                            <p className="text-xs text-purple-400 mt-2">{t('templatesAvailable', { count: templates.length })}</p>
                        )}
                    </button>
                </div>
            </div>
        );
    }

    // ─── Template picker (Step 0) ───
    if (mode === 'template' && step === 0) {
        return (
            <div className="space-y-6 animate-fadeIn max-w-3xl">
                <div className="flex items-center gap-3">
                    <button onClick={() => setMode('choose')} className="text-slate-400 hover:text-white transition">←</button>
                    <div>
                        <h1 className="text-2xl font-bold">{t('selectTemplate')}</h1>
                        <p className="text-slate-400 text-sm">{t('stepOf', { step: 1, total: 4 })} — {t('chooseTemplate')}</p>
                    </div>
                </div>

                <div className="flex gap-3">
                    <input
                        type="text"
                        placeholder={t('searchTemplates')}
                        className="input flex-1"
                        value={templateSearch}
                        onChange={e => setTemplateSearch(e.target.value)}
                        id="template-search"
                    />
                    <select className="input w-44" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
                        <option value="">{t('allCategories')}</option>
                        {tmplCategories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>

                {loadingTemplates ? (
                    <div className="glass-card p-8 text-center text-slate-500 animate-pulse">{t('loading')}</div>
                ) : filteredTemplates.length === 0 ? (
                    <div className="glass-card p-8 text-center text-slate-500">
                        {templates.length === 0 ? t('noTemplates') : t('noTemplatesMatch')}
                    </div>
                ) : (
                    <div className="space-y-2">
                        {filteredTemplates.map(tmpl => {
                            const score = tmpl.defaultLikelihood * tmpl.defaultImpact;
                            const b = getRiskBadge(score, t);
                            return (
                                <button
                                    key={tmpl.id}
                                    onClick={() => selectTemplate(tmpl)}
                                    className="glass-card p-4 w-full text-left hover:border-purple-500/50 transition group cursor-pointer"
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <h3 className="font-medium text-white group-hover:text-purple-400 transition text-sm">{tmpl.title}</h3>
                                            {tmpl.description && <p className="text-xs text-slate-400 mt-1 line-clamp-2">{tmpl.description}</p>}
                                            <div className="flex gap-2 mt-2">
                                                {tmpl.category && <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-300">{tmpl.category}</span>}
                                                {tmpl.frameworkTag && <span className="text-xs px-2 py-0.5 rounded-full bg-purple-900/30 text-purple-300">{tmpl.frameworkTag}</span>}
                                            </div>
                                        </div>
                                        <div className="text-right ml-4">
                                            <p className={`text-lg font-bold ${b.cls}`}>{score}</p>
                                            <p className="text-xs text-slate-500">{tmpl.defaultLikelihood}×{tmpl.defaultImpact}</p>
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    }

    // ─── Wizard Steps 1–3 ───
    const stepLabels = [t('titleLabel'), t('descriptionLabel'), t('scorePreview'), t('ownerLabel')];

    return (
        <div className="space-y-6 animate-fadeIn max-w-3xl">
            <div className="flex items-center gap-3">
                <button onClick={() => step === 1 ? setMode('choose') : setStep(s => s - 1)} className="text-slate-400 hover:text-white transition">←</button>
                <div className="flex-1">
                    <h1 className="text-2xl font-bold">
                        {selectedTemplate ? t('createFromTemplate') : t('newRiskTitle')}
                    </h1>
                    <p className="text-slate-400 text-sm">
                        {t('stepOf', { step, total: 3 })}
                        {selectedTemplate && <span className="text-purple-400 ml-2">· {selectedTemplate.title}</span>}
                    </p>
                </div>
            </div>

            <div className="flex gap-1">
                {stepLabels.slice(0, 4).map((label, i) => (
                    <div key={i} className="flex-1">
                        <div className={`h-1 rounded-full transition-all ${i < step ? 'bg-brand-500' : i === step ? 'bg-brand-400/50' : 'bg-slate-700'}`} />
                        <p className={`text-xs mt-1 ${i === step ? 'text-brand-400' : 'text-slate-600'}`}>{label}</p>
                    </div>
                ))}
            </div>

            {error && <div className="glass-card p-4 border-red-500/50 text-red-400 text-sm">{error}</div>}

            <div className="glass-card p-6 space-y-5" id="wizard-step">
                {step === 1 && (
                    <>
                        <div>
                            <label className="input-label">{t('titleRequired')}</label>
                            <input className="input" required value={form.title} onChange={set('title')} placeholder="e.g. Unauthorized access" id="risk-title" />
                        </div>
                        <div>
                            <label className="input-label">{t('categoryLabel')}</label>
                            <select className="input" value={form.category} onChange={set('category')} id="risk-category">
                                <option value="">— {t('categoryLabel')} —</option>
                                {CATEGORIES.map(c =>
                                    <option key={c} value={c}>{c}</option>
                                )}
                            </select>
                        </div>
                        <div>
                            <label className="input-label">{t('descriptionLabel')}</label>
                            <textarea className="input min-h-[100px]" value={form.description} onChange={set('description')} placeholder={t('descPlaceholder')} id="risk-description" />
                        </div>
                        <div className="flex justify-end">
                            <button onClick={() => { if (form.title.trim()) setStep(2); }} disabled={!form.title.trim()} className="btn btn-primary" id="wizard-next">{t('next')}</button>
                        </div>
                    </>
                )}

                {step === 2 && (
                    <>
                        <div className="grid grid-cols-3 gap-6">
                            <div>
                                <label className="input-label">{t('likelihoodLabel')}</label>
                                <input type="range" min={1} max={5} value={form.likelihood} onChange={setNum('likelihood')} className="w-full accent-brand-500" />
                                <div className="text-center text-2xl font-bold mt-1">{form.likelihood}</div>
                            </div>
                            <div>
                                <label className="input-label">{t('impactLabel')}</label>
                                <input type="range" min={1} max={5} value={form.impact} onChange={setNum('impact')} className="w-full accent-brand-500" />
                                <div className="text-center text-2xl font-bold mt-1">{form.impact}</div>
                            </div>
                            <div className="glass-card p-4 text-center flex flex-col justify-center">
                                <p className="text-xs text-slate-400 uppercase mb-1">{t('scorePreview')}</p>
                                <p className={`text-4xl font-bold ${badge.cls}`}>{computedScore}</p>
                                <p className={`text-sm font-medium ${badge.cls}`}>{badge.label}</p>
                            </div>
                        </div>

                        <div className="glass-card p-4">
                            <p className="text-xs text-slate-400 uppercase mb-2">{t('riskPosition')}</p>
                            <div className="grid grid-cols-5 gap-1 max-w-xs">
                                {[5, 4, 3, 2, 1].map(l =>
                                    [1, 2, 3, 4, 5].map(i => {
                                        const s = l * i;
                                        const isSelected = l === form.likelihood && i === form.impact;
                                        const bg = s <= 5 ? 'bg-emerald-900/40' : s <= 12 ? 'bg-amber-900/40' : s <= 18 ? 'bg-orange-900/40' : 'bg-red-900/40';
                                        return (
                                            <div
                                                key={`${l}-${i}`}
                                                className={`h-8 rounded ${bg} flex items-center justify-center text-xs transition ${isSelected ? 'ring-2 ring-white scale-110 font-bold' : 'opacity-40'}`}
                                            >
                                                {isSelected ? s : ''}
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                        <div className="flex justify-between">
                            <button onClick={() => setStep(1)} className="btn btn-secondary">{t('back')}</button>
                            <button onClick={() => setStep(3)} className="btn btn-primary" id="wizard-next">{t('next')}</button>
                        </div>
                    </>
                )}

                {step === 3 && (
                    <>
                        <div>
                            <label className="input-label">{t('ownerLabel')}</label>
                            <input className="input" value={form.treatmentOwner} onChange={set('treatmentOwner')} placeholder={t('ownerPlaceholder')} id="risk-owner" />
                        </div>
                        <div>
                            <label className="input-label">{t('reviewDateLabel')}</label>
                            <input type="date" className="input" value={form.nextReviewAt} onChange={set('nextReviewAt')} id="risk-review-date" />
                        </div>

                        {/* Control mapping */}
                        <div>
                            <label className="input-label">{t('linkedControls')} ({selectedControlIds.size})</label>
                            {controls.length > 0 ? (
                                <div className="glass-card p-3 max-h-40 overflow-y-auto space-y-1">
                                    {controls.map(c => (
                                        <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-800/50 rounded px-2 py-1 transition">
                                            <input
                                                type="checkbox"
                                                checked={selectedControlIds.has(c.id)}
                                                onChange={() => toggleControl(c.id)}
                                                className="accent-brand-500"
                                            />
                                            <span className="text-slate-400 text-xs w-16 shrink-0">{c.annexId || 'CUST'}</span>
                                            <span className="text-white truncate">{c.name}</span>
                                        </label>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-slate-500">{t('noControlsAvailable')}</p>
                            )}
                        </div>

                        <div className="glass-card p-4 space-y-2 border-brand-500/30">
                            <p className="text-xs text-slate-400 uppercase font-semibold">{t('summary')}</p>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                                <div><span className="text-slate-500">{t('titleLabel')}:</span> <span className="text-white">{form.title}</span></div>
                                <div><span className="text-slate-500">{t('categoryLabel')}:</span> <span className="text-white">{form.category || '—'}</span></div>
                                <div><span className="text-slate-500">{t('colScore')}:</span> <span className={`font-bold ${badge.cls}`}>{computedScore} ({badge.label})</span></div>
                                <div><span className="text-slate-500">{t('ownerLabel')}:</span> <span className="text-white">{form.treatmentOwner || '—'}</span></div>
                                {selectedControlIds.size > 0 && (
                                    <div><span className="text-slate-500">{t('linkedControls')}:</span> <span className="text-white">{selectedControlIds.size}</span></div>
                                )}
                            </div>
                            {selectedTemplate && (
                                <p className="text-xs text-purple-400">{t('template')}: {selectedTemplate.title}</p>
                            )}
                        </div>

                        <div className="flex justify-between">
                            <button onClick={() => setStep(2)} className="btn btn-secondary">{t('back')}</button>
                            <button onClick={handleSubmit} disabled={submitting} className="btn btn-primary" id="submit-risk">
                                {submitting ? t('creating') : t('createRisk')}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
