const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding Inflect Compliance database...');

    // ─── Tenant ───
    const tenant = await prisma.tenant.upsert({
        where: { slug: 'acme-corp' },
        update: {},
        create: { name: 'Acme Corp', slug: 'acme-corp', industry: 'Technology', maxRiskScale: 5 },
    });
    console.log('✅ Tenant:', tenant.name);

    // ─── Users ───
    const pwd = await bcrypt.hash('password123', 10);

    const admin = await prisma.user.upsert({
        where: { email: 'admin@acme.com' },
        update: {},
        create: { tenantId: tenant.id, email: 'admin@acme.com', passwordHash: pwd, name: 'Alice Admin', role: 'ADMIN' },
    });
    const editor = await prisma.user.upsert({
        where: { email: 'editor@acme.com' },
        update: {},
        create: { tenantId: tenant.id, email: 'editor@acme.com', passwordHash: pwd, name: 'Bob Editor', role: 'EDITOR' },
    });
    const reader = await prisma.user.upsert({
        where: { email: 'viewer@acme.com' },
        update: {},
        create: { tenantId: tenant.id, email: 'viewer@acme.com', passwordHash: pwd, name: 'Carol Reader', role: 'READER' },
    });
    const auditor = await prisma.user.upsert({
        where: { email: 'auditor@acme.com' },
        update: {},
        create: { tenantId: tenant.id, email: 'auditor@acme.com', passwordHash: pwd, name: 'Dan Auditor', role: 'AUDITOR' },
    });
    console.log('✅ Users created');

    // ─── Tenant Memberships (authoritative roles) ───
    await prisma.tenantMembership.upsert({
        where: { tenantId_userId: { tenantId: tenant.id, userId: admin.id } },
        update: {},
        create: { tenantId: tenant.id, userId: admin.id, role: 'ADMIN' },
    });
    await prisma.tenantMembership.upsert({
        where: { tenantId_userId: { tenantId: tenant.id, userId: editor.id } },
        update: {},
        create: { tenantId: tenant.id, userId: editor.id, role: 'EDITOR' },
    });
    await prisma.tenantMembership.upsert({
        where: { tenantId_userId: { tenantId: tenant.id, userId: reader.id } },
        update: {},
        create: { tenantId: tenant.id, userId: reader.id, role: 'READER' },
    });
    await prisma.tenantMembership.upsert({
        where: { tenantId_userId: { tenantId: tenant.id, userId: auditor.id } },
        update: {},
        create: { tenantId: tenant.id, userId: auditor.id, role: 'AUDITOR' },
    });
    console.log('✅ Tenant memberships created');

    // ─── Seed clauses ───
    const clauseData = [
        { number: '4', title: 'Context of the Organization', sortOrder: 4 },
        { number: '5', title: 'Leadership', sortOrder: 5 },
        { number: '6', title: 'Planning', sortOrder: 6 },
        { number: '7', title: 'Support', sortOrder: 7 },
        { number: '8', title: 'Operation', sortOrder: 8 },
        { number: '9', title: 'Performance Evaluation', sortOrder: 9 },
        { number: '10', title: 'Improvement', sortOrder: 10 },
    ];
    for (const c of clauseData) {
        await prisma.clause.upsert({ where: { number: c.number }, create: c, update: {} });
    }
    console.log('✅ Clauses seeded');

    // ─── Seed assets ───
    const assetCount = await prisma.asset.count({ where: { tenantId: tenant.id } });
    if (assetCount === 0) {
        await prisma.asset.create({ data: { tenantId: tenant.id, name: 'Customer Database', type: 'DATA_STORE', classification: 'Confidential', owner: 'IT', confidentiality: 5, integrity: 5, availability: 4 } });
        await prisma.asset.create({ data: { tenantId: tenant.id, name: 'Production Servers', type: 'SYSTEM', classification: 'Internal', owner: 'DevOps', confidentiality: 4, integrity: 5, availability: 5 } });
        await prisma.asset.create({ data: { tenantId: tenant.id, name: 'Email Service', type: 'SERVICE', classification: 'Internal', owner: 'IT', confidentiality: 3, integrity: 4, availability: 4 } });
    }
    console.log('✅ Assets seeded');

    // ─── Seed risk templates (global) ───
    const riskTemplates = [
        { title: 'Data Breach via SQL Injection', description: 'Risk of unauthorized data access through SQL injection attacks on input fields.', category: 'Cybersecurity', defaultLikelihood: 3, defaultImpact: 5, frameworkTag: 'ISO27001:A.8' },
        { title: 'Phishing Attack Compromise', description: 'Risk of credential theft through targeted phishing campaigns against employees.', category: 'Cybersecurity', defaultLikelihood: 4, defaultImpact: 4, frameworkTag: 'ISO27001:A.6' },
        { title: 'DDoS Service Disruption', description: 'Risk of service downtime caused by distributed denial-of-service attacks.', category: 'Cybersecurity', defaultLikelihood: 3, defaultImpact: 4, frameworkTag: 'ISO27001:A.8' },
        { title: 'Ransomware Infection', description: 'Risk of data encryption and extortion through ransomware malware.', category: 'Cybersecurity', defaultLikelihood: 3, defaultImpact: 5, frameworkTag: 'ISO27001:A.8' },
        { title: 'Insider Data Theft', description: 'Risk of sensitive data exfiltration by privileged internal users.', category: 'Cybersecurity', defaultLikelihood: 2, defaultImpact: 5, frameworkTag: 'ISO27001:A.6' },
        { title: 'Third-Party Vendor Breach', description: 'Risk of data exposure through compromised third-party service providers.', category: 'Vendor', defaultLikelihood: 3, defaultImpact: 4, frameworkTag: 'ISO27001:A.5' },
        { title: 'Physical Server Room Intrusion', description: 'Risk of unauthorized physical access to server rooms and data centers.', category: 'Physical', defaultLikelihood: 2, defaultImpact: 4, frameworkTag: 'ISO27001:A.7' },
        { title: 'Natural Disaster Impact', description: 'Risk of infrastructure damage from earthquakes, floods, or severe weather.', category: 'Physical', defaultLikelihood: 1, defaultImpact: 5, frameworkTag: 'ISO27001:A.7' },
        { title: 'GDPR Non-Compliance', description: 'Risk of penalties from failure to comply with EU data protection regulations.', category: 'Legal', defaultLikelihood: 2, defaultImpact: 5, frameworkTag: 'GDPR' },
        { title: 'License Violation', description: 'Risk of legal action from unauthorized use of third-party software licenses.', category: 'Legal', defaultLikelihood: 2, defaultImpact: 3, frameworkTag: null },
        { title: 'Key Personnel Departure', description: 'Risk of knowledge loss and operational disruption from critical staff turnover.', category: 'Operational', defaultLikelihood: 3, defaultImpact: 3, frameworkTag: 'ISO27001:A.6' },
        { title: 'Backup Failure', description: 'Risk of data loss due to failed or incomplete backup procedures.', category: 'Operational', defaultLikelihood: 2, defaultImpact: 5, frameworkTag: 'ISO27001:A.8' },
        { title: 'Cloud Misconfiguration', description: 'Risk of data exposure through improperly configured cloud services.', category: 'Cybersecurity', defaultLikelihood: 3, defaultImpact: 4, frameworkTag: 'ISO27001:A.8' },
        { title: 'Weak Access Controls', description: 'Risk of unauthorized system access due to inadequate authentication and authorization.', category: 'Cybersecurity', defaultLikelihood: 3, defaultImpact: 4, frameworkTag: 'ISO27001:A.8' },
        { title: 'Business Email Compromise', description: 'Risk of financial loss through fraudulent email impersonation of executives.', category: 'Cybersecurity', defaultLikelihood: 3, defaultImpact: 4, frameworkTag: 'ISO27001:A.5' },
    ];
    for (const t of riskTemplates) {
        await prisma.riskTemplate.upsert({
            where: { id: t.title.replace(/\s+/g, '-').toLowerCase().slice(0, 25) },
            create: t,
            update: {},
        });
    }
    console.log('✅ Risk templates seeded (15 templates)');

    // ─── Seed risks (tenant-wide) ───
    const riskCount = await prisma.risk.count({ where: { tenantId: tenant.id } });
    if (riskCount === 0) {
        await prisma.risk.create({ data: { tenantId: tenant.id, title: 'Data Breach via SQL Injection', description: 'Unvalidated input fields in production APIs', category: 'Cybersecurity', threat: 'External attacker', vulnerability: 'Unvalidated input fields', impact: 5, likelihood: 3, score: 15, inherentScore: 15, status: 'OPEN', treatment: 'TREAT', treatmentOwner: 'DevOps', createdByUserId: admin.id } });
        await prisma.risk.create({ data: { tenantId: tenant.id, title: 'Server Downtime from DDoS', description: 'Production servers vulnerable to volumetric attacks', category: 'Cybersecurity', threat: 'DDoS attack', vulnerability: 'No rate limiting', impact: 4, likelihood: 3, score: 12, inherentScore: 12, status: 'MITIGATING', treatment: 'TREAT', treatmentOwner: 'Infrastructure', createdByUserId: admin.id } });
        await prisma.risk.create({ data: { tenantId: tenant.id, title: 'Phishing Compromise', description: 'Staff susceptible to social engineering attacks', category: 'Cybersecurity', threat: 'Social engineering', vulnerability: 'Lack of awareness training', impact: 4, likelihood: 4, score: 16, inherentScore: 16, status: 'OPEN', treatment: 'TREAT', treatmentOwner: 'HR', createdByUserId: admin.id } });
        await prisma.risk.create({ data: { tenantId: tenant.id, title: 'Dev Environment Data Leak', description: 'Sensitive production data used in dev testing', category: 'Operational', threat: 'Data leak', vulnerability: 'No data masking in dev', impact: 3, likelihood: 3, score: 9, inherentScore: 9, status: 'OPEN', createdByUserId: editor.id } });
    }
    console.log('✅ Risks seeded (tenant-wide)');

    // ─── Seed controls ───
    const sampleControls = [
        { annexId: 'A.5.1', name: 'Information Security Policies', intent: 'Ensure management direction and support for information security.', status: 'IMPLEMENTED' },
        { annexId: 'A.5.2', name: 'Information Security Roles', intent: 'Establish defined roles and responsibilities.', status: 'IMPLEMENTING' },
        { annexId: 'A.8.1', name: 'User Endpoint Devices', intent: 'Protect information on user endpoint devices.', status: 'IMPLEMENTED' },
        { annexId: 'A.8.9', name: 'Configuration Management', intent: 'Ensure correct and secure configuration of systems.', status: 'PLANNED' },
    ];
    for (const c of sampleControls) {
        const existing = await prisma.control.findFirst({ where: { annexId: c.annexId } });
        if (!existing) {
            await prisma.control.create({ data: { tenantId: tenant.id, ...c } });
        }
    }
    console.log('✅ Controls seeded');

    // ─── Policy Templates ───
    const policyTemplates = [
        { title: 'Information Security Policy', category: 'Core', tags: 'isms,governance', contentText: '# Information Security Policy\n\n## Purpose\nEstablish the organization\'s commitment to information security.\n\n## Policy Statements\n1. Information classified and protected by sensitivity.\n2. Access granted on need-to-know basis.\n3. Incidents reported and investigated promptly.' },
        { title: 'Access Control Policy', category: 'Technical', tags: 'access,authentication', contentText: '# Access Control Policy\n\n## Purpose\nEnsure authorized access and prevent unauthorized access.\n\n## Statements\n1. Least privilege principle.\n2. MFA for privileged accounts.\n3. Quarterly access reviews.' },
        { title: 'Data Classification Policy', category: 'Core', tags: 'data,classification', contentText: '# Data Classification Policy\n\n## Levels\n- Public\n- Internal\n- Confidential\n- Restricted' },
        { title: 'Acceptable Use Policy', category: 'HR', tags: 'acceptable-use', contentText: '# Acceptable Use Policy\n\n## Statements\n1. IT resources for business purposes.\n2. No bypassing security controls.\n3. Protect credentials.' },
        { title: 'Incident Response Policy', category: 'Operations', tags: 'incident,response', contentText: '# Incident Response Policy\n\n## Phases\n1. Identification\n2. Containment\n3. Eradication\n4. Recovery\n5. Lessons Learned' },
        { title: 'Business Continuity Policy', category: 'Operations', tags: 'bcp,disaster-recovery', contentText: '# Business Continuity Policy\n\n## Statements\n1. Annual BIA.\n2. Defined RTO/RPO.\n3. Annual BC/DR tests.' },
        { title: 'Risk Management Policy', category: 'Core', tags: 'risk,assessment', contentText: '# Risk Management Policy\n\n## Framework\n1. Identify\n2. Assess\n3. Treat\n4. Monitor' },
        { title: 'Change Management Policy', category: 'Operations', tags: 'change,management', contentText: '# Change Management Policy\n\n## Types\n- Standard\n- Normal\n- Emergency' },
        { title: 'Physical Security Policy', category: 'Physical', tags: 'physical,facilities', contentText: '# Physical Security Policy\n\n## Statements\n1. Appropriate entry controls.\n2. Visitor logging.\n3. Clear desk policy.' },
        { title: 'Human Resources Security Policy', category: 'HR', tags: 'hr,screening', contentText: '# HR Security Policy\n\n## Statements\n1. Background screening.\n2. Annual awareness training.\n3. NDA before access.' },
        { title: 'Third-Party Security Policy', category: 'Vendor', tags: 'vendor,supplier', contentText: '# Third-Party Security\n\n## Statements\n1. Security in supplier agreements.\n2. Minimum access.\n3. Monitor performance.' },
        { title: 'Logging and Monitoring Policy', category: 'Technical', tags: 'logging,monitoring', contentText: '# Logging and Monitoring\n\n## Statements\n1. Log security events.\n2. Protect logs.\n3. Automated alerting.' },
    ];
    for (const tmpl of policyTemplates) {
        const existing = await prisma.policyTemplate.findFirst({ where: { title: tmpl.title } });
        if (!existing) {
            await prisma.policyTemplate.create({ data: tmpl });
        }
    }
    console.log('✅ Policy Templates seeded');

    // ─── Frameworks & Requirements ───
    const annexAData = require('./fixtures/iso27001_2022_annexA.json') as Array<{
        key: string; theme: string; themeNumber: number; sortOrder: number; title: string; summary?: string;
    }>;

    // ISO 27001:2022
    const iso27001 = await prisma.framework.upsert({
        where: { key: 'ISO27001' },
        update: { name: 'ISO/IEC 27001', version: '2022', description: 'ISO/IEC 27001:2022 Information Security Management' },
        create: { key: 'ISO27001', name: 'ISO/IEC 27001', version: '2022', description: 'ISO/IEC 27001:2022 Information Security Management' },
    });

    // Upsert all 93 Annex A requirements
    const requirementMap: Record<string, string> = {};
    for (const req of annexAData) {
        const r = await prisma.frameworkRequirement.upsert({
            where: { frameworkId_code: { frameworkId: iso27001.id, code: req.key } },
            update: { title: req.title, description: req.summary || null, theme: req.theme, themeNumber: req.themeNumber, sortOrder: req.sortOrder },
            create: { frameworkId: iso27001.id, code: req.key, title: req.title, description: req.summary || null, category: req.theme, theme: req.theme, themeNumber: req.themeNumber, sortOrder: req.sortOrder },
        });
        requirementMap[req.key] = r.id;
    }
    console.log(`✅ ISO 27001:2022 framework + ${annexAData.length} Annex A requirements seeded`);

    // SOC2
    const soc2 = await prisma.framework.upsert({
        where: { key: 'SOC2' },
        update: { name: 'SOC 2', description: 'SOC 2 Trust Services Criteria' },
        create: { key: 'SOC2', name: 'SOC 2', description: 'SOC 2 Trust Services Criteria' },
    });
    const soc2Reqs = [
        { code: 'CC1.1', title: 'COSO principle 1 — Integrity and ethical values', category: 'Control Environment' },
        { code: 'CC2.1', title: 'Information for internal controls', category: 'Communication' },
        { code: 'CC3.1', title: 'Specifies objectives', category: 'Risk Assessment' },
        { code: 'CC5.1', title: 'Selects and develops control activities', category: 'Control Activities' },
        { code: 'CC6.1', title: 'Logical and physical access controls', category: 'Logical Access' },
        { code: 'CC7.1', title: 'System operations monitoring', category: 'System Operations' },
        { code: 'CC8.1', title: 'Change management', category: 'Change Management' },
    ];
    for (let i = 0; i < soc2Reqs.length; i++) {
        const req = soc2Reqs[i];
        await prisma.frameworkRequirement.upsert({
            where: { frameworkId_code: { frameworkId: soc2.id, code: req.code } },
            update: {},
            create: { frameworkId: soc2.id, code: req.code, title: req.title, category: req.category, sortOrder: i },
        });
    }

    // NIS2 — full fixture-driven
    const nis2Data = require('./fixtures/nis2_requirements.json') as Array<{ key: string; section: string; sortOrder: number; title: string }>;
    const nis2 = await prisma.framework.upsert({
        where: { key_version: { key: 'NIS2', version: '2022/2555' } },
        update: { name: 'NIS2 Directive', kind: 'EU_DIRECTIVE', description: 'Directive (EU) 2022/2555 on cybersecurity' },
        create: { key: 'NIS2', name: 'NIS2 Directive', version: '2022/2555', kind: 'EU_DIRECTIVE', description: 'Directive (EU) 2022/2555 on cybersecurity' },
    });
    // Clean old NIS2 requirements from key-only era
    const oldNis2 = await prisma.framework.findFirst({ where: { key: 'NIS2', version: null } });
    if (oldNis2 && oldNis2.id !== nis2.id) {
        await prisma.frameworkRequirement.deleteMany({ where: { frameworkId: oldNis2.id } });
        await prisma.framework.delete({ where: { id: oldNis2.id } }).catch(() => { });
    }
    const nis2ReqMap: Record<string, string> = {};
    for (const req of nis2Data) {
        const r = await prisma.frameworkRequirement.upsert({
            where: { frameworkId_code: { frameworkId: nis2.id, code: req.key } },
            update: { title: req.title, section: req.section, sortOrder: req.sortOrder },
            create: { frameworkId: nis2.id, code: req.key, title: req.title, section: req.section, category: req.section, sortOrder: req.sortOrder },
        });
        nis2ReqMap[req.key] = r.id;
    }
    console.log(`✅ NIS2 framework + ${nis2Data.length} requirements seeded`);

    // ISO 9001
    const iso9001Data = require('./fixtures/iso9001_clauses.json') as Array<{ key: string; section: string; sortOrder: number; title: string }>;
    const iso9001 = await prisma.framework.upsert({
        where: { key_version: { key: 'ISO9001', version: '2015' } },
        update: { name: 'ISO 9001', description: 'ISO 9001:2015 Quality Management Systems' },
        create: { key: 'ISO9001', name: 'ISO 9001', version: '2015', kind: 'ISO_STANDARD', description: 'ISO 9001:2015 Quality Management Systems' },
    });
    const iso9001ReqMap: Record<string, string> = {};
    for (const req of iso9001Data) {
        const r = await prisma.frameworkRequirement.upsert({
            where: { frameworkId_code: { frameworkId: iso9001.id, code: req.key } },
            update: { title: req.title, section: req.section, sortOrder: req.sortOrder },
            create: { frameworkId: iso9001.id, code: req.key, title: req.title, section: req.section, category: req.section, sortOrder: req.sortOrder },
        });
        iso9001ReqMap[req.key] = r.id;
    }
    console.log(`✅ ISO 9001 framework + ${iso9001Data.length} requirements seeded`);

    // ISO 28000
    const iso28000Data = require('./fixtures/iso28000_clauses.json') as Array<{ key: string; section: string; sortOrder: number; title: string }>;
    const iso28000 = await prisma.framework.upsert({
        where: { key_version: { key: 'ISO28000', version: '2022' } },
        update: { name: 'ISO 28000', description: 'ISO 28000:2022 Supply Chain Security Management' },
        create: { key: 'ISO28000', name: 'ISO 28000', version: '2022', kind: 'ISO_STANDARD', description: 'ISO 28000:2022 Supply Chain Security Management' },
    });
    const iso28000ReqMap: Record<string, string> = {};
    for (const req of iso28000Data) {
        const r = await prisma.frameworkRequirement.upsert({
            where: { frameworkId_code: { frameworkId: iso28000.id, code: req.key } },
            update: { title: req.title, section: req.section, sortOrder: req.sortOrder },
            create: { frameworkId: iso28000.id, code: req.key, title: req.title, section: req.section, category: req.section, sortOrder: req.sortOrder },
        });
        iso28000ReqMap[req.key] = r.id;
    }
    console.log(`✅ ISO 28000 framework + ${iso28000Data.length} requirements seeded`);

    // ISO 39001
    const iso39001Data = require('./fixtures/iso39001_clauses.json') as Array<{ key: string; section: string; sortOrder: number; title: string }>;
    const iso39001 = await prisma.framework.upsert({
        where: { key_version: { key: 'ISO39001', version: '2012' } },
        update: { name: 'ISO 39001', description: 'ISO 39001:2012 Road Traffic Safety Management' },
        create: { key: 'ISO39001', name: 'ISO 39001', version: '2012', kind: 'ISO_STANDARD', description: 'ISO 39001:2012 Road Traffic Safety Management' },
    });
    const iso39001ReqMap: Record<string, string> = {};
    for (const req of iso39001Data) {
        const r = await prisma.frameworkRequirement.upsert({
            where: { frameworkId_code: { frameworkId: iso39001.id, code: req.key } },
            update: { title: req.title, section: req.section, sortOrder: req.sortOrder },
            create: { frameworkId: iso39001.id, code: req.key, title: req.title, section: req.section, category: req.section, sortOrder: req.sortOrder },
        });
        iso39001ReqMap[req.key] = r.id;
    }
    console.log(`✅ ISO 39001 framework + ${iso39001Data.length} requirements seeded`);

    console.log('✅ SOC2 + NIS2 + ISO9001 + ISO28000 + ISO39001 frameworks seeded');

    // ─── ISO 27001:2022 Control Templates (one per Annex A control) ───
    const defaultTasks = [
        { title: 'Define control owner and scope', description: 'Assign an owner and define the scope of this control within the organization.' },
        { title: 'Document procedure or policy', description: 'Create or reference the policy/procedure that implements this control.' },
        { title: 'Implement technical or operational measure', description: 'Put the control into practice — deploy tooling, configure settings, or establish processes.' },
        { title: 'Collect evidence of implementation', description: 'Gather evidence demonstrating the control is operating effectively.' },
        { title: 'Review effectiveness', description: 'Periodically review and assess whether the control meets its objectives.' },
    ];

    let templatesCreated = 0;
    for (const req of annexAData) {
        const code = `A-${req.key}`;
        const existing = await prisma.controlTemplate.findUnique({ where: { code } });
        if (!existing) {
            const template = await prisma.controlTemplate.create({
                data: { code, title: req.title, description: req.summary || null, category: req.theme, defaultFrequency: 'QUARTERLY' },
            });
            for (const task of defaultTasks) {
                await prisma.controlTemplateTask.create({
                    data: { templateId: template.id, title: task.title, description: task.description },
                });
            }
            await prisma.controlTemplateRequirementLink.create({
                data: { templateId: template.id, requirementId: requirementMap[req.key] },
            });
            templatesCreated++;
        }
    }
    console.log(`✅ ISO 27001 control templates seeded (${templatesCreated} new)`);

    // ─── NIS2 Control Templates ───
    const nis2Templates = [
        { code: 'NIS2-RA', title: 'Risk analysis and information security policies', reqs: ['Art.21(2)(a)'] },
        { code: 'NIS2-IH', title: 'Incident handling procedures', reqs: ['Art.21(2)(b)'] },
        { code: 'NIS2-BC', title: 'Business continuity and crisis management', reqs: ['Art.21(2)(c)'] },
        { code: 'NIS2-SC', title: 'Supply chain security management', reqs: ['Art.21(2)(d)'] },
        { code: 'NIS2-NS', title: 'Network and information system security', reqs: ['Art.21(2)(e)'] },
        { code: 'NIS2-EF', title: 'Effectiveness assessment of cybersecurity measures', reqs: ['Art.21(2)(f)'] },
        { code: 'NIS2-CH', title: 'Cyber hygiene and security training', reqs: ['Art.21(2)(g)'] },
        { code: 'NIS2-CR', title: 'Cryptography and encryption policies', reqs: ['Art.21(2)(h)'] },
        { code: 'NIS2-HR', title: 'HR security and access control', reqs: ['Art.21(2)(i)'] },
        { code: 'NIS2-MFA', title: 'Multi-factor authentication and secured communications', reqs: ['Art.21(2)(j)'] },
        { code: 'NIS2-EW', title: 'Early warning notification (24h)', reqs: ['Art.23(1)'] },
        { code: 'NIS2-IN', title: 'Incident notification (72h)', reqs: ['Art.23(2)'] },
        { code: 'NIS2-FR', title: 'Final incident report (1 month)', reqs: ['Art.23(3)'] },
        { code: 'NIS2-GO', title: 'Management body cybersecurity oversight', reqs: ['Art.20(1)'] },
        { code: 'NIS2-TR', title: 'Management cybersecurity training', reqs: ['Art.20(2)'] },
        { code: 'NIS2-CE', title: 'Cybersecurity certification schemes', reqs: ['Art.24(1)'] },
        { code: 'NIS2-ST', title: 'Standards and technical specifications', reqs: ['Art.25'] },
        { code: 'NIS2-DN', title: 'Domain name registration accuracy', reqs: ['Art.28(1)'] },
        { code: 'NIS2-IS', title: 'Information sharing arrangements', reqs: ['Art.29(1)'] },
        { code: 'NIS2-NS2', title: 'National cybersecurity strategy compliance', reqs: ['Art.7(1)'] },
    ];
    for (const t of nis2Templates) {
        const existing = await prisma.controlTemplate.findUnique({ where: { code: t.code } });
        if (!existing) {
            const tmpl = await prisma.controlTemplate.create({
                data: { code: t.code, title: t.title, category: 'NIS2', defaultFrequency: 'QUARTERLY' },
            });
            for (const task of defaultTasks) {
                await prisma.controlTemplateTask.create({ data: { templateId: tmpl.id, title: task.title, description: task.description } });
            }
            for (const rk of t.reqs) {
                if (nis2ReqMap[rk]) {
                    await prisma.controlTemplateRequirementLink.create({ data: { templateId: tmpl.id, requirementId: nis2ReqMap[rk] } }).catch(() => { });
                }
            }
        }
    }
    console.log('✅ NIS2 control templates seeded');

    // ─── ISO 9001 Control Templates ───
    const iso9001Templates = [
        { code: 'QMS-CTX', title: 'Organizational context determination', reqs: ['4.1', '4.2'] },
        { code: 'QMS-SCP', title: 'QMS scope definition', reqs: ['4.3'] },
        { code: 'QMS-PRC', title: 'QMS process management', reqs: ['4.4'] },
        { code: 'QMS-LDR', title: 'Leadership commitment and customer focus', reqs: ['5.1', '5.1.2'] },
        { code: 'QMS-POL', title: 'Quality policy establishment', reqs: ['5.2'] },
        { code: 'QMS-ROL', title: 'Roles and responsibilities assignment', reqs: ['5.3'] },
        { code: 'QMS-RSK', title: 'Risk and opportunity management', reqs: ['6.1'] },
        { code: 'QMS-OBJ', title: 'Quality objectives planning', reqs: ['6.2'] },
        { code: 'QMS-CHG', title: 'Change planning', reqs: ['6.3'] },
        { code: 'QMS-RES', title: 'Resource management', reqs: ['7.1', '7.1.5', '7.1.6'] },
        { code: 'QMS-CMP', title: 'Competence and awareness', reqs: ['7.2', '7.3'] },
        { code: 'QMS-COM', title: 'Communication management', reqs: ['7.4'] },
        { code: 'QMS-DOC', title: 'Documented information control', reqs: ['7.5'] },
        { code: 'QMS-OPC', title: 'Operational planning and control', reqs: ['8.1'] },
        { code: 'QMS-REQ', title: 'Product/service requirements', reqs: ['8.2'] },
        { code: 'QMS-DES', title: 'Design and development control', reqs: ['8.3'] },
        { code: 'QMS-EXT', title: 'External provider control', reqs: ['8.4'] },
        { code: 'QMS-PRD', title: 'Production and service provision', reqs: ['8.5', '8.5.1', '8.6', '8.7'] },
        { code: 'QMS-MON', title: 'Performance monitoring and evaluation', reqs: ['9.1', '9.1.2', '9.1.3'] },
        { code: 'QMS-AUD', title: 'Internal audit program', reqs: ['9.2'] },
        { code: 'QMS-MGR', title: 'Management review', reqs: ['9.3'] },
        { code: 'QMS-IMP', title: 'Improvement and corrective action', reqs: ['10.1', '10.2', '10.3'] },
    ];
    for (const t of iso9001Templates) {
        const existing = await prisma.controlTemplate.findUnique({ where: { code: t.code } });
        if (!existing) {
            const tmpl = await prisma.controlTemplate.create({
                data: { code: t.code, title: t.title, category: 'ISO9001', defaultFrequency: 'QUARTERLY' },
            });
            for (const task of defaultTasks) {
                await prisma.controlTemplateTask.create({ data: { templateId: tmpl.id, title: task.title, description: task.description } });
            }
            for (const rk of t.reqs) {
                if (iso9001ReqMap[rk]) {
                    await prisma.controlTemplateRequirementLink.create({ data: { templateId: tmpl.id, requirementId: iso9001ReqMap[rk] } }).catch(() => { });
                }
            }
        }
    }
    console.log('✅ ISO 9001 control templates seeded');

    // ─── ISO 28000 Control Templates ───
    const iso28000Templates = [
        { code: 'SCS-CTX', title: 'Supply chain context determination', reqs: ['4.1', '4.2'] },
        { code: 'SCS-SCP', title: 'Security management system scope', reqs: ['4.3', '4.4'] },
        { code: 'SCS-LDR', title: 'Leadership and security policy', reqs: ['5.1', '5.2'] },
        { code: 'SCS-ROL', title: 'Security roles and authorities', reqs: ['5.3'] },
        { code: 'SCS-RSK', title: 'Security risk assessment and treatment', reqs: ['6.1', '8.2', '8.3'] },
        { code: 'SCS-OBJ', title: 'Security objectives planning', reqs: ['6.2'] },
        { code: 'SCS-RES', title: 'Resource and competence management', reqs: ['7.1', '7.2', '7.3'] },
        { code: 'SCS-COM', title: 'Communication management', reqs: ['7.4'] },
        { code: 'SCS-DOC', title: 'Documented information', reqs: ['7.5'] },
        { code: 'SCS-OPC', title: 'Operational control', reqs: ['8.1'] },
        { code: 'SCS-SUP', title: 'Supply chain security management', reqs: ['8.4'] },
        { code: 'SCS-MON', title: 'Performance monitoring', reqs: ['9.1'] },
        { code: 'SCS-AUD', title: 'Internal audit program', reqs: ['9.2'] },
        { code: 'SCS-MGR', title: 'Management review', reqs: ['9.3'] },
        { code: 'SCS-IMP', title: 'Improvement and corrective action', reqs: ['10.1', '10.2'] },
    ];
    for (const t of iso28000Templates) {
        const existing = await prisma.controlTemplate.findUnique({ where: { code: t.code } });
        if (!existing) {
            const tmpl = await prisma.controlTemplate.create({
                data: { code: t.code, title: t.title, category: 'ISO28000', defaultFrequency: 'QUARTERLY' },
            });
            for (const task of defaultTasks) {
                await prisma.controlTemplateTask.create({ data: { templateId: tmpl.id, title: task.title, description: task.description } });
            }
            for (const rk of t.reqs) {
                if (iso28000ReqMap[rk]) {
                    await prisma.controlTemplateRequirementLink.create({ data: { templateId: tmpl.id, requirementId: iso28000ReqMap[rk] } }).catch(() => { });
                }
            }
        }
    }
    console.log('✅ ISO 28000 control templates seeded');

    // ─── ISO 39001 Control Templates ───
    const iso39001Templates = [
        { code: 'RTS-CTX', title: 'Organization context and interested parties', reqs: ['4.1', '4.2'] },
        { code: 'RTS-SCP', title: 'RTS management system scope', reqs: ['4.3', '4.4'] },
        { code: 'RTS-LDR', title: 'Leadership and RTS policy', reqs: ['5.1', '5.2'] },
        { code: 'RTS-ROL', title: 'RTS roles and authorities', reqs: ['5.3'] },
        { code: 'RTS-RSK', title: 'RTS risk and opportunity management', reqs: ['6.1'] },
        { code: 'RTS-OBJ', title: 'RTS performance factors and objectives', reqs: ['6.2'] },
        { code: 'RTS-CHG', title: 'RTS change planning', reqs: ['6.3'] },
        { code: 'RTS-RES', title: 'Resource and competence management', reqs: ['7.1', '7.2', '7.3'] },
        { code: 'RTS-COM', title: 'Communication management', reqs: ['7.4'] },
        { code: 'RTS-DOC', title: 'Documented information', reqs: ['7.5'] },
        { code: 'RTS-OPC', title: 'Operational planning and control', reqs: ['8.1'] },
        { code: 'RTS-EMR', title: 'Emergency preparedness and response', reqs: ['8.2'] },
        { code: 'RTS-MON', title: 'Performance monitoring and evaluation', reqs: ['9.1'] },
        { code: 'RTS-INV', title: 'Crash and incident investigation', reqs: ['9.2'] },
        { code: 'RTS-AUD', title: 'Internal audit program', reqs: ['9.3'] },
        { code: 'RTS-MGR', title: 'Management review', reqs: ['9.4'] },
        { code: 'RTS-IMP', title: 'Improvement and corrective action', reqs: ['10.1', '10.2'] },
    ];
    for (const t of iso39001Templates) {
        const existing = await prisma.controlTemplate.findUnique({ where: { code: t.code } });
        if (!existing) {
            const tmpl = await prisma.controlTemplate.create({
                data: { code: t.code, title: t.title, category: 'ISO39001', defaultFrequency: 'QUARTERLY' },
            });
            for (const task of defaultTasks) {
                await prisma.controlTemplateTask.create({ data: { templateId: tmpl.id, title: task.title, description: task.description } });
            }
            for (const rk of t.reqs) {
                if (iso39001ReqMap[rk]) {
                    await prisma.controlTemplateRequirementLink.create({ data: { templateId: tmpl.id, requirementId: iso39001ReqMap[rk] } }).catch(() => { });
                }
            }
        }
    }
    console.log('✅ ISO 39001 control templates seeded');

    // ─── Framework Packs ───
    const allIsoTemplates = await prisma.controlTemplate.findMany({ where: { code: { startsWith: 'A-' } } });
    const pack = await prisma.frameworkPack.upsert({
        where: { key: 'ISO27001_2022_BASE' },
        update: { name: 'ISO 27001:2022 Starter Pack', frameworkId: iso27001.id, version: '2022' },
        create: { key: 'ISO27001_2022_BASE', name: 'ISO 27001:2022 Starter Pack', frameworkId: iso27001.id, version: '2022', description: 'Full Annex A control set with default implementation tasks.' },
    });
    for (const tmpl of allIsoTemplates) {
        const existing = await prisma.packTemplateLink.findUnique({
            where: { packId_templateId: { packId: pack.id, templateId: tmpl.id } },
        });
        if (!existing) {
            await prisma.packTemplateLink.create({ data: { packId: pack.id, templateId: tmpl.id } });
        }
    }

    // NIS2 Pack
    const nis2Tmpls = await prisma.controlTemplate.findMany({ where: { code: { startsWith: 'NIS2-' } } });
    const nis2Pack = await prisma.frameworkPack.upsert({
        where: { key: 'NIS2_BASELINE' },
        update: { name: 'NIS2 Baseline Pack', frameworkId: nis2.id, version: '2022/2555' },
        create: { key: 'NIS2_BASELINE', name: 'NIS2 Baseline Pack', frameworkId: nis2.id, version: '2022/2555', description: 'NIS2 directive security measures baseline.' },
    });
    for (const tmpl of nis2Tmpls) {
        await prisma.packTemplateLink.upsert({
            where: { packId_templateId: { packId: nis2Pack.id, templateId: tmpl.id } },
            create: { packId: nis2Pack.id, templateId: tmpl.id }, update: {},
        });
    }

    // ISO 9001 Pack
    const iso9001Tmpls = await prisma.controlTemplate.findMany({ where: { code: { startsWith: 'QMS-' } } });
    const iso9001Pack = await prisma.frameworkPack.upsert({
        where: { key: 'ISO9001_CORE' },
        update: { name: 'ISO 9001 Core Pack', frameworkId: iso9001.id, version: '2015' },
        create: { key: 'ISO9001_CORE', name: 'ISO 9001 Core Pack', frameworkId: iso9001.id, version: '2015', description: 'ISO 9001 quality management core controls.' },
    });
    for (const tmpl of iso9001Tmpls) {
        await prisma.packTemplateLink.upsert({
            where: { packId_templateId: { packId: iso9001Pack.id, templateId: tmpl.id } },
            create: { packId: iso9001Pack.id, templateId: tmpl.id }, update: {},
        });
    }

    // ISO 28000 Pack
    const iso28000Tmpls = await prisma.controlTemplate.findMany({ where: { code: { startsWith: 'SCS-' } } });
    const iso28000Pack = await prisma.frameworkPack.upsert({
        where: { key: 'ISO28000_CORE' },
        update: { name: 'ISO 28000 Core Pack', frameworkId: iso28000.id, version: '2022' },
        create: { key: 'ISO28000_CORE', name: 'ISO 28000 Core Pack', frameworkId: iso28000.id, version: '2022', description: 'ISO 28000 supply chain security core controls.' },
    });
    for (const tmpl of iso28000Tmpls) {
        await prisma.packTemplateLink.upsert({
            where: { packId_templateId: { packId: iso28000Pack.id, templateId: tmpl.id } },
            create: { packId: iso28000Pack.id, templateId: tmpl.id }, update: {},
        });
    }

    // ISO 39001 Pack
    const iso39001Tmpls = await prisma.controlTemplate.findMany({ where: { code: { startsWith: 'RTS-' } } });
    const iso39001Pack = await prisma.frameworkPack.upsert({
        where: { key: 'ISO39001_CORE' },
        update: { name: 'ISO 39001 Core Pack', frameworkId: iso39001.id, version: '2012' },
        create: { key: 'ISO39001_CORE', name: 'ISO 39001 Core Pack', frameworkId: iso39001.id, version: '2012', description: 'ISO 39001 road traffic safety core controls.' },
    });
    for (const tmpl of iso39001Tmpls) {
        await prisma.packTemplateLink.upsert({
            where: { packId_templateId: { packId: iso39001Pack.id, templateId: tmpl.id } },
            create: { packId: iso39001Pack.id, templateId: tmpl.id }, update: {},
        });
    }

    console.log('✅ All Framework Packs seeded');

    // ─── Legacy Control Templates ───
    const legacyTemplates = [
        { code: 'AC-01', title: 'Access Control Policy', category: 'Access Control', description: 'Define and enforce access control policies.', defaultFrequency: 'ANNUALLY' as const },
        { code: 'AC-02', title: 'Account Management', category: 'Access Control', description: 'Manage user accounts lifecycle.', defaultFrequency: 'QUARTERLY' as const },
        { code: 'IR-01', title: 'Incident Response Plan', category: 'Incident Management', description: 'Establish incident response plan.', defaultFrequency: 'ANNUALLY' as const },
        { code: 'RA-01', title: 'Risk Assessment', category: 'Risk Management', description: 'Conduct regular risk assessments.', defaultFrequency: 'ANNUALLY' as const },
        { code: 'CM-01', title: 'Change Management', category: 'Operations', description: 'Control changes to production systems.', defaultFrequency: 'MONTHLY' as const },
        { code: 'SC-01', title: 'System Protection', category: 'Technical', description: 'Protect communications and enforce encryption.', defaultFrequency: 'QUARTERLY' as const },
        { code: 'BC-01', title: 'Business Continuity', category: 'Business Continuity', description: 'Maintain BC plans.', defaultFrequency: 'ANNUALLY' as const },
        { code: 'SA-01', title: 'Security Awareness', category: 'Human Resource', description: 'Security training for employees.', defaultFrequency: 'ANNUALLY' as const },
        { code: 'AU-01', title: 'Audit Logging', category: 'Operations', description: 'Audit logging and monitoring.', defaultFrequency: 'MONTHLY' as const },
        { code: 'VN-01', title: 'Vendor Risk Management', category: 'Supply Chain', description: 'Assess vendor security risks.', defaultFrequency: 'ANNUALLY' as const },
    ];
    for (const tpl of legacyTemplates) {
        const existing = await prisma.controlTemplate.findUnique({ where: { code: tpl.code } });
        if (!existing) {
            await prisma.controlTemplate.create({ data: tpl });
        }
    }
    console.log('✅ Legacy control templates seeded');

    console.log('\n🎉 Seed complete! Login with admin@acme.com / password123');
}

main().catch(console.error).finally(() => prisma.$disconnect());
