/**
 * AI Risk Assessment — Asset-Type Knowledge Base
 *
 * Internal heuristics and risk templates organized by asset type.
 * Used to:
 * 1. Enrich AI prompts with asset-type-specific context
 * 2. Provide deterministic fallback suggestions when AI is unavailable
 * 3. Improve relevance of stub-provider output
 */
import type { ConfidenceLevel, StructuredRationale } from './types';

// ─── Asset-Type Profile ───

export interface AssetTypeProfile {
    /** Canonical name for this asset type */
    type: string;
    /** Common risk categories for this asset type */
    riskCategories: string[];
    /** Typical threat actors and vectors */
    typicalThreats: string[];
    /** Common vulnerability areas */
    commonVulnerabilities: string[];
    /** Key characteristics that affect risk */
    keyCharacteristics: string[];
}

// ─── Risk Template (expanded) ───

export interface EnrichedRiskTemplate {
    title: string;
    description: string;
    category: string;
    threat: string;
    vulnerability: string;
    likelihood: number;
    impact: number;
    rationale: string;
    suggestedControls: string[];
    assetTypes: string[];
    frameworks: string[];
    confidence: ConfidenceLevel;
    structuredRationale: StructuredRationale;
}

// ─── Asset-Type Profiles ───

export const ASSET_TYPE_PROFILES: Record<string, AssetTypeProfile> = {
    APPLICATION: {
        type: 'APPLICATION',
        riskCategories: ['Access Control', 'Injection', 'Data Exposure', 'Authentication', 'Supply Chain', 'Availability'],
        typicalThreats: ['SQL injection', 'Cross-site scripting', 'Broken authentication', 'API abuse', 'Dependency vulnerabilities'],
        commonVulnerabilities: ['Unvalidated input', 'Weak session management', 'Insecure deserialization', 'Missing rate limiting', 'Outdated dependencies'],
        keyCharacteristics: ['Internet-facing', 'Processes user data', 'Handles authentication', 'Integrates with third-party APIs'],
    },
    INFRASTRUCTURE: {
        type: 'INFRASTRUCTURE',
        riskCategories: ['Network Security', 'Configuration', 'Availability', 'Physical Security', 'Patch Management'],
        typicalThreats: ['Network intrusion', 'Misconfiguration exploit', 'DDoS attack', 'Hardware failure', 'Unpatched vulnerability'],
        commonVulnerabilities: ['Default credentials', 'Open ports', 'Unencrypted traffic', 'Missing redundancy', 'Delayed patching'],
        keyCharacteristics: ['Supports multiple services', 'Network-connected', 'Requires physical security', 'Contains compute/storage resources'],
    },
    PROCESS: {
        type: 'PROCESS',
        riskCategories: ['Operational Risk', 'Human Error', 'Business Continuity', 'Compliance', 'Change Management'],
        typicalThreats: ['Process failure', 'Human error', 'Fraud', 'Non-compliance with regulations', 'Uncontrolled changes'],
        commonVulnerabilities: ['Undocumented procedures', 'Lack of segregation of duties', 'Missing approval workflows', 'No fallback procedures'],
        keyCharacteristics: ['Involves human actions', 'Has defined steps', 'May handle sensitive operations', 'Requires training'],
    },
    VENDOR: {
        type: 'VENDOR',
        riskCategories: ['Third-Party Risk', 'Supply Chain', 'Data Sharing', 'Contractual', 'Concentration Risk'],
        typicalThreats: ['Vendor data breach', 'Service disruption', 'Supply chain compromise', 'Regulatory non-compliance by vendor', 'Vendor lock-in'],
        commonVulnerabilities: ['Insufficient vendor due diligence', 'Missing contractual security requirements', 'No vendor monitoring', 'Single-vendor dependency'],
        keyCharacteristics: ['External party', 'Data sharing agreement', 'Service dependency', 'Limited direct control'],
    },
    DATA_STORE: {
        type: 'DATA_STORE',
        riskCategories: ['Data Protection', 'Encryption', 'Access Control', 'Backup', 'Retention'],
        typicalThreats: ['Data exfiltration', 'Unauthorized access', 'Data corruption', 'Ransomware', 'Accidental deletion'],
        commonVulnerabilities: ['Unencrypted data at rest', 'Overly permissive access', 'Missing backup verification', 'No data classification', 'Unlimited retention'],
        keyCharacteristics: ['Contains persistent data', 'May hold PII/sensitive data', 'Requires backup strategy', 'Subject to retention policies'],
    },
    // Additional types that map to closest profile
    SYSTEM: {
        type: 'SYSTEM',
        riskCategories: ['Configuration', 'Access Control', 'Patch Management', 'Availability', 'Monitoring'],
        typicalThreats: ['Unauthorized access', 'Malware', 'Configuration drift', 'System failure', 'Privilege escalation'],
        commonVulnerabilities: ['Hardening gaps', 'Missing patches', 'Excessive privileges', 'Insufficient logging', 'Weak authentication'],
        keyCharacteristics: ['Hosts services', 'Requires regular patching', 'Has privileged accounts', 'May contain sensitive configuration'],
    },
    SERVICE: {
        type: 'SERVICE',
        riskCategories: ['Availability', 'Third-Party Risk', 'Data Protection', 'Access Control', 'SLA Compliance'],
        typicalThreats: ['Service outage', 'API compromise', 'Data leak via service', 'Man-in-the-middle attack', 'SLA breach'],
        commonVulnerabilities: ['Single point of failure', 'Insufficient monitoring', 'Weak API security', 'Missing failover'],
        keyCharacteristics: ['Provides functionality to users', 'May be externally hosted', 'Has defined SLAs', 'Handles data in transit'],
    },
    INFORMATION: {
        type: 'INFORMATION',
        riskCategories: ['Data Protection', 'Classification', 'Retention', 'Access Control', 'Compliance'],
        typicalThreats: ['Data breach', 'Unauthorized disclosure', 'Data loss', 'Regulatory non-compliance', 'Insider threat'],
        commonVulnerabilities: ['Missing classification', 'Uncontrolled distribution', 'No encryption', 'Insufficient access controls'],
        keyCharacteristics: ['Has classification level', 'May contain PII', 'Subject to regulations', 'Requires controlled access'],
    },
    PEOPLE_PROCESS: {
        type: 'PEOPLE_PROCESS',
        riskCategories: ['Human Error', 'Social Engineering', 'Insider Threat', 'Training', 'Awareness'],
        typicalThreats: ['Phishing', 'Social engineering', 'Accidental data exposure', 'Insider threat', 'Knowledge loss'],
        commonVulnerabilities: ['Insufficient security training', 'No security awareness program', 'Weak verification of identity', 'Missing background checks'],
        keyCharacteristics: ['Relies on human judgment', 'Involves access to sensitive systems', 'Requires ongoing training', 'Subject to social engineering'],
    },
};

/**
 * Get the profile for an asset type, with fallback to APPLICATION if unknown.
 */
export function getAssetTypeProfile(assetType: string): AssetTypeProfile {
    return ASSET_TYPE_PROFILES[assetType] ?? ASSET_TYPE_PROFILES['APPLICATION'];
}

// ─── Framework-Specific Categories ───

export interface FrameworkGuidance {
    name: string;
    focusAreas: string[];
    riskBias: string;
    avoidAreas: string[];
}

export const FRAMEWORK_GUIDANCE: Record<string, FrameworkGuidance> = {
    ISO27001: {
        name: 'ISO 27001',
        focusAreas: [
            'Information security policy violations',
            'Access control failures (A.9)',
            'Cryptographic control gaps (A.10)',
            'Physical security breaches (A.11)',
            'Operations security failures (A.12)',
            'Communications security issues (A.13)',
            'System acquisition/development risks (A.14)',
            'Supplier relationship risks (A.15)',
            'Incident management gaps (A.16)',
            'Business continuity planning (A.17)',
            'Compliance failures (A.18)',
        ],
        riskBias: 'Focus on information security management system controls, Annex A categories, and systematic risk treatment.',
        avoidAreas: ['Generic IT risks without security relevance', 'Purely financial risks', 'Non-information risks'],
    },
    NIS2: {
        name: 'NIS2 Directive',
        focusAreas: [
            'Operational resilience failures',
            'Incident detection and response gaps',
            'Supply chain security weaknesses',
            'Encryption and cryptography deficiencies',
            'Business continuity disruptions',
            'Network and information system vulnerabilities',
            'Identity and access management failures',
            'Cyber hygiene practice gaps',
            'Crisis management readiness',
            'Reporting obligation compliance',
        ],
        riskBias: 'Emphasize operational resilience, incident response readiness, supply chain integrity, and cross-border cooperation requirements.',
        avoidAreas: ['Risks not related to network/information systems', 'Physical-only risks', 'Non-essential service risks'],
    },
    SOC2: {
        name: 'SOC 2',
        focusAreas: [
            'Security principle violations (CC)',
            'Availability disruptions (A1)',
            'Processing integrity failures (PI1)',
            'Confidentiality breaches (C1)',
            'Privacy control gaps (P1)',
            'Logical access control failures',
            'Change management weaknesses',
            'Risk assessment process gaps',
            'Monitoring and detection deficiencies',
            'Vendor management risks',
        ],
        riskBias: 'Center on Trust Service Criteria: security, availability, processing integrity, confidentiality, and privacy.',
        avoidAreas: ['Risks outside TSC scope', 'Purely regulatory risks without TSC mapping', 'Physical-only risks'],
    },
};

/**
 * Get guidance for selected frameworks.
 */
export function getFrameworkGuidance(frameworks: string[]): FrameworkGuidance[] {
    return frameworks
        .map(fw => FRAMEWORK_GUIDANCE[fw.toUpperCase().replace(/\s/g, '')])
        .filter((g): g is FrameworkGuidance => !!g);
}

// ─── Enriched Risk Catalog (deterministic, asset-type-aware) ───

export const ENRICHED_RISK_CATALOG: EnrichedRiskTemplate[] = [
    // ─── APPLICATION-focused risks ───
    {
        title: 'Injection attack compromising application data',
        description: 'SQL injection, NoSQL injection, or command injection attacks exploit input validation gaps to access or modify application data.',
        category: 'Injection',
        threat: 'Attacker exploits input validation weaknesses in application interfaces',
        vulnerability: 'Insufficient input validation, parameterized query absence, or ORM misconfiguration',
        likelihood: 3, impact: 4,
        rationale: 'Injection remains in the OWASP Top 10 and is particularly relevant for applications handling structured data.',
        suggestedControls: ['Parameterized queries', 'Input validation framework', 'Web application firewall', 'Security code review'],
        assetTypes: ['APPLICATION', 'SYSTEM'],
        frameworks: ['ISO27001', 'SOC2'],
        confidence: 'high',
        structuredRationale: {
            whyThisRisk: 'Applications processing user input are inherently exposed to injection attacks, which can lead to full database compromise.',
            affectedAssetCharacteristics: ['Accepts user input', 'Connects to data store', 'Internet-facing'],
            suggestedControlThemes: ['Input validation', 'Secure coding', 'Runtime protection'],
        },
    },
    {
        title: 'Broken authentication allowing account takeover',
        description: 'Weak authentication mechanisms enable attackers to compromise user accounts, impersonate legitimate users, and access protected resources.',
        category: 'Authentication',
        threat: 'Credential stuffing, brute force, or session hijacking by external attacker',
        vulnerability: 'Missing multi-factor authentication, weak password policies, or insecure session management',
        likelihood: 3, impact: 4,
        rationale: 'Authentication failures are a primary attack vector. Applications without MFA and strong session controls face elevated risk.',
        suggestedControls: ['Multi-factor authentication', 'Account lockout policy', 'Secure session management', 'Password complexity requirements'],
        assetTypes: ['APPLICATION', 'SYSTEM', 'SERVICE'],
        frameworks: ['ISO27001', 'SOC2', 'NIS2'],
        confidence: 'high',
        structuredRationale: {
            whyThisRisk: 'Authentication is the first line of defense; failures here cascade into data breaches and unauthorized actions.',
            affectedAssetCharacteristics: ['Has user accounts', 'Handles authentication', 'Stores credentials'],
            suggestedControlThemes: ['Identity management', 'Access control', 'Credential security'],
        },
    },
    // ─── INFRASTRUCTURE-focused risks ───
    {
        title: 'Unpatched infrastructure vulnerability exploitation',
        description: 'Known CVEs in operating systems, network devices, or middleware are exploited before patches can be applied.',
        category: 'Patch Management',
        threat: 'Automated exploit tools targeting unpatched public-facing infrastructure',
        vulnerability: 'Delayed or missing patch management process for infrastructure components',
        likelihood: 3, impact: 4,
        rationale: 'Mean time to exploit for critical CVEs continues to shrink. Infrastructure without systematic patching is increasingly exposed.',
        suggestedControls: ['Automated patch management', 'Vulnerability scanning schedule', 'Risk-based patching prioritization', 'Virtual patching (WAF/IPS)'],
        assetTypes: ['INFRASTRUCTURE', 'SYSTEM'],
        frameworks: ['ISO27001', 'NIS2', 'SOC2'],
        confidence: 'high',
        structuredRationale: {
            whyThisRisk: 'Infrastructure components have large attack surfaces; unpatched vulnerabilities are the most commonly exploited entry point.',
            affectedAssetCharacteristics: ['Network-connected', 'Runs software with known CVE history', 'Supports critical services'],
            suggestedControlThemes: ['Vulnerability management', 'Patch automation', 'Compensating controls'],
        },
    },
    {
        title: 'Network segmentation failure enabling lateral movement',
        description: 'Insufficient network segmentation allows an attacker who compromises one system to move laterally across the environment.',
        category: 'Network Security',
        threat: 'Internal lateral movement after initial compromise of a single endpoint',
        vulnerability: 'Flat network architecture without micro-segmentation or zone isolation',
        likelihood: 2, impact: 5,
        rationale: 'Flat networks dramatically increase blast radius. A single compromised host can lead to full environment compromise.',
        suggestedControls: ['Network segmentation', 'Micro-segmentation', 'Zero-trust architecture', 'Network monitoring'],
        assetTypes: ['INFRASTRUCTURE', 'SYSTEM'],
        frameworks: ['ISO27001', 'NIS2'],
        confidence: 'high',
        structuredRationale: {
            whyThisRisk: 'Without segmentation, a single breach can cascade across the entire infrastructure, multiplying the impact.',
            affectedAssetCharacteristics: ['Hosts multiple services', 'Connected to other systems', 'Contains sensitive data zones'],
            suggestedControlThemes: ['Network architecture', 'Zero trust', 'Detection and response'],
        },
    },
    // ─── VENDOR-focused risks ───
    {
        title: 'Third-party vendor data breach',
        description: 'A vendor with access to organizational data suffers a security breach, exposing shared information and potentially disrupting services.',
        category: 'Third-Party Risk',
        threat: 'Vendor security incident compromising shared data or APIs',
        vulnerability: 'Insufficient vendor due diligence, missing contractual security requirements, or absent ongoing monitoring',
        likelihood: 3, impact: 3,
        rationale: 'Supply chain attacks are increasing in frequency and sophistication. Vendor ecosystems represent an extended attack surface.',
        suggestedControls: ['Vendor risk assessment program', 'Contractual security SLAs', 'Regular vendor security reviews', 'Vendor incident notification requirements'],
        assetTypes: ['VENDOR', 'SERVICE'],
        frameworks: ['ISO27001', 'SOC2', 'NIS2'],
        confidence: 'high',
        structuredRationale: {
            whyThisRisk: 'Organizations are only as secure as their weakest vendor. Third-party breaches directly expose shared data.',
            affectedAssetCharacteristics: ['External party dependency', 'Data sharing', 'Limited direct control'],
            suggestedControlThemes: ['Vendor governance', 'Contractual controls', 'Continuous monitoring'],
        },
    },
    {
        title: 'Vendor lock-in creating concentration risk',
        description: 'Over-reliance on a single vendor for critical services creates risk if the vendor fails, changes terms, or is acquired.',
        category: 'Concentration Risk',
        threat: 'Vendor bankruptcy, hostile acquisition, or sudden service discontinuation',
        vulnerability: 'Single-vendor dependency without exit strategy or data portability provisions',
        likelihood: 2, impact: 4,
        rationale: 'Vendor concentration risk is often overlooked but can have existential impact when a critical provider fails.',
        suggestedControls: ['Vendor diversification strategy', 'Data portability requirements', 'Exit planning', 'Escrow agreements'],
        assetTypes: ['VENDOR', 'SERVICE'],
        frameworks: ['NIS2', 'ISO27001'],
        confidence: 'medium',
        structuredRationale: {
            whyThisRisk: 'Critical dependency on a single vendor creates a single point of failure for business operations.',
            affectedAssetCharacteristics: ['Critical service provider', 'No alternatives identified', 'Proprietary data formats'],
            suggestedControlThemes: ['Business continuity', 'Diversification', 'Contractual protection'],
        },
    },
    // ─── DATA_STORE-focused risks ───
    {
        title: 'Unencrypted data at rest exposure',
        description: 'Sensitive data stored without encryption can be accessed by attackers who gain physical or logical access to storage systems.',
        category: 'Data Protection',
        threat: 'Attacker or insider gains access to storage containing unencrypted sensitive data',
        vulnerability: 'Missing encryption at rest for databases, file systems, or backup media',
        likelihood: 2, impact: 5,
        rationale: 'Encryption at rest is a baseline control. Its absence means any storage compromise directly exposes data in cleartext.',
        suggestedControls: ['Encryption at rest (AES-256)', 'Key management system', 'Data classification', 'Storage access controls'],
        assetTypes: ['DATA_STORE', 'INFORMATION', 'SYSTEM'],
        frameworks: ['ISO27001', 'SOC2', 'NIS2'],
        confidence: 'high',
        structuredRationale: {
            whyThisRisk: 'Data stores without encryption are directly exposed if access controls are bypassed or storage media is physically compromised.',
            affectedAssetCharacteristics: ['Contains persistent data', 'May hold PII/financial data', 'Subject to compliance requirements'],
            suggestedControlThemes: ['Encryption', 'Key management', 'Classification'],
        },
    },
    {
        title: 'Backup failure causing unrecoverable data loss',
        description: 'Insufficient or untested backup procedures result in inability to restore data after corruption, deletion, or ransomware attack.',
        category: 'Backup & Recovery',
        threat: 'Ransomware attack, accidental deletion, or hardware failure destroying primary data',
        vulnerability: 'Untested backups, missing backup verification, or insufficient backup frequency',
        likelihood: 2, impact: 5,
        rationale: 'Backups are the last line of defense against data loss. Untested backups frequently fail when actually needed.',
        suggestedControls: ['Regular backup testing', 'Immutable backup copies', 'Off-site backup storage', 'Backup monitoring and alerting'],
        assetTypes: ['DATA_STORE', 'SYSTEM', 'INFRASTRUCTURE'],
        frameworks: ['ISO27001', 'NIS2'],
        confidence: 'high',
        structuredRationale: {
            whyThisRisk: 'Without verified backups, any data destruction event becomes permanent, with potentially catastrophic business impact.',
            affectedAssetCharacteristics: ['Contains business-critical data', 'Has recovery time requirements', 'Subject to retention policies'],
            suggestedControlThemes: ['Backup management', 'Disaster recovery', 'Testing and verification'],
        },
    },
    // ─── PROCESS-focused risks ───
    {
        title: 'Change management failure causing service disruption',
        description: 'Uncontrolled changes to systems or processes cause unexpected outages, data corruption, or security vulnerabilities.',
        category: 'Change Management',
        threat: 'Unauthorized or untested change deployed to production environment',
        vulnerability: 'Missing or bypassed change management process, insufficient testing, or no rollback capability',
        likelihood: 3, impact: 3,
        rationale: 'Change management failures are among the most common root causes of outages. Controlled change reduces unexpected impact.',
        suggestedControls: ['Change advisory board', 'Automated testing pipeline', 'Rollback procedures', 'Change impact assessment'],
        assetTypes: ['PROCESS', 'APPLICATION', 'INFRASTRUCTURE'],
        frameworks: ['ISO27001', 'SOC2'],
        confidence: 'high',
        structuredRationale: {
            whyThisRisk: 'Uncontrolled changes introduce unpredictable risk; a systematic process prevents cascading failures.',
            affectedAssetCharacteristics: ['Involves system modifications', 'Affects production environment', 'Requires coordination'],
            suggestedControlThemes: ['Change control', 'Testing', 'Rollback and recovery'],
        },
    },
    {
        title: 'Segregation of duties violation enabling fraud',
        description: 'One individual can both initiate and approve sensitive operations (financial, system, or data) without oversight.',
        category: 'Operational Risk',
        threat: 'Insider fraud or accidental misuse due to excessive privilege concentration',
        vulnerability: 'Missing segregation of duties in critical business processes',
        likelihood: 2, impact: 4,
        rationale: 'SoD is a fundamental control principle. Its absence enables both intentional fraud and accidental errors to pass undetected.',
        suggestedControls: ['Segregation of duties matrix', 'Dual approval workflows', 'Periodic SoD review', 'Privileged access monitoring'],
        assetTypes: ['PROCESS', 'PEOPLE_PROCESS', 'APPLICATION'],
        frameworks: ['ISO27001', 'SOC2'],
        confidence: 'medium',
        structuredRationale: {
            whyThisRisk: 'Without segregation of duties, a single individual can execute and conceal unauthorized actions.',
            affectedAssetCharacteristics: ['Involves financial/sensitive operations', 'Has approval workflows', 'Requires audit trail'],
            suggestedControlThemes: ['Governance', 'Authorization controls', 'Audit and monitoring'],
        },
    },
    // ─── Cross-cutting risks ───
    {
        title: 'Ransomware infection disrupting operations',
        description: 'Malware encrypts critical systems and data, demanding payment for decryption. Can cause extended downtime and permanent data loss.',
        category: 'Malware',
        threat: 'Ransomware delivered via phishing, exploit kits, or supply chain compromise',
        vulnerability: 'Unpatched systems, lack of endpoint detection, insufficient backup isolation, missing email security',
        likelihood: 3, impact: 5,
        rationale: 'Ransomware is the single highest-impact cyber threat for most organizations, combining data loss with operational disruption.',
        suggestedControls: ['Endpoint detection and response (EDR)', 'Immutable backups', 'Email security gateway', 'Patch management', 'Network segmentation'],
        assetTypes: ['APPLICATION', 'SYSTEM', 'INFRASTRUCTURE', 'DATA_STORE'],
        frameworks: ['ISO27001', 'SOC2', 'NIS2'],
        confidence: 'high',
        structuredRationale: {
            whyThisRisk: 'Ransomware combines data destruction with service disruption, making it the most impactful single threat vector.',
            affectedAssetCharacteristics: ['Network-connected', 'Contains critical data', 'Has availability requirements'],
            suggestedControlThemes: ['Endpoint protection', 'Backup resilience', 'Incident response'],
        },
    },
    {
        title: 'Inadequate security event monitoring',
        description: 'Insufficient security logging and monitoring prevents timely detection of incidents, extending dwell time and blast radius.',
        category: 'Detection',
        threat: 'Undetected security incidents persisting for weeks or months due to monitoring blind spots',
        vulnerability: 'Missing centralized logging, insufficient alerting rules, or no 24/7 monitoring coverage',
        likelihood: 3, impact: 3,
        rationale: 'Mean dwell time for undetected breaches remains months. Logging and detection are prerequisite for any incident response.',
        suggestedControls: ['SIEM deployment', 'Security alerting rules', 'Log retention policy', '24/7 SOC coverage or managed detection'],
        assetTypes: ['APPLICATION', 'SYSTEM', 'INFRASTRUCTURE'],
        frameworks: ['ISO27001', 'SOC2', 'NIS2'],
        confidence: 'high',
        structuredRationale: {
            whyThisRisk: 'Without detection, breaches persist unnoticed, dramatically increasing damage and recovery cost.',
            affectedAssetCharacteristics: ['Generates security-relevant events', 'Internet-facing', 'Handles sensitive data'],
            suggestedControlThemes: ['Logging infrastructure', 'Alert management', 'Incident detection'],
        },
    },
    {
        title: 'Business continuity failure during major incident',
        description: 'Organization unable to maintain critical operations during a significant security incident, infrastructure failure, or disaster.',
        category: 'Business Continuity',
        threat: 'Major cyber incident, natural disaster, or cascading infrastructure failure',
        vulnerability: 'Untested or missing business continuity and disaster recovery plans',
        likelihood: 2, impact: 5,
        rationale: 'Without tested BCP/DR plans, recovery time may exceed business tolerance. NIS2 specifically mandates operational resilience.',
        suggestedControls: ['Business continuity plan', 'DR testing (annual minimum)', 'Incident response procedures', 'Redundant infrastructure'],
        assetTypes: ['INFRASTRUCTURE', 'SYSTEM', 'SERVICE', 'PROCESS'],
        frameworks: ['ISO27001', 'NIS2'],
        confidence: 'high',
        structuredRationale: {
            whyThisRisk: 'Business continuity failures can be existential; tested plans are the difference between recovery and permanent impact.',
            affectedAssetCharacteristics: ['Supports critical business functions', 'Has availability SLAs', 'Single point of failure risk'],
            suggestedControlThemes: ['Continuity planning', 'Disaster recovery', 'Resilience testing'],
        },
    },
    {
        title: 'Personal data processing non-compliance',
        description: 'Processing personal data without proper legal basis, DPIA, or consent mechanisms, risking regulatory enforcement.',
        category: 'Data Protection',
        threat: 'Regulatory enforcement action, fines, or reputational damage from non-compliant data processing',
        vulnerability: 'Missing or outdated DPIAs, consent mechanisms, or data processing records',
        likelihood: 3, impact: 4,
        rationale: 'GDPR/NIS2 impose strict requirements. Non-compliance can result in fines up to 4% of global revenue.',
        suggestedControls: ['DPIA process', 'Consent management platform', 'Data processing register (ROPA)', 'DPO appointment'],
        assetTypes: ['INFORMATION', 'DATA_STORE', 'APPLICATION', 'PEOPLE_PROCESS'],
        frameworks: ['ISO27001', 'NIS2'],
        confidence: 'medium',
        structuredRationale: {
            whyThisRisk: 'Privacy regulation enforcement is increasing; organizations lacking systematic compliance face substantial financial and reputational risk.',
            affectedAssetCharacteristics: ['Processes PII', 'Subject to data protection laws', 'Cross-border data transfer'],
            suggestedControlThemes: ['Privacy governance', 'Legal compliance', 'Data subject rights'],
        },
    },
    {
        title: 'Software supply chain compromise',
        description: 'Malicious code introduced through compromised open-source dependencies, build pipelines, or development tools.',
        category: 'Supply Chain',
        threat: 'Compromised software library, malicious package, or build pipeline injection',
        vulnerability: 'Missing dependency scanning, no SBOM, or unsigned artifacts',
        likelihood: 2, impact: 4,
        rationale: 'Supply chain attacks (SolarWinds, Log4Shell, xz-utils) demonstrate cascading impact of compromised dependencies.',
        suggestedControls: ['Software composition analysis (SCA)', 'Dependency vulnerability scanning', 'SBOM generation', 'Signed builds and artifacts'],
        assetTypes: ['APPLICATION', 'SYSTEM'],
        frameworks: ['ISO27001', 'SOC2', 'NIS2'],
        confidence: 'high',
        structuredRationale: {
            whyThisRisk: 'Modern software depends on hundreds of third-party libraries; a single compromised dependency can affect the entire application.',
            affectedAssetCharacteristics: ['Uses open-source libraries', 'Has CI/CD pipeline', 'Distributes software to users'],
            suggestedControlThemes: ['Dependency management', 'Build security', 'Software integrity'],
        },
    },
    {
        title: 'Insider threat causing data exfiltration',
        description: 'Malicious or negligent employee with legitimate access exfiltrates sensitive data to unauthorized parties or personal accounts.',
        category: 'Insider Threat',
        threat: 'Disgruntled employee, departing staff, or accidental sharing via personal channels',
        vulnerability: 'Lack of data loss prevention, insufficient user activity monitoring, overly broad data access',
        likelihood: 2, impact: 4,
        rationale: 'Insiders have legitimate access, making detection harder. Departing employees represent elevated exfiltration risk.',
        suggestedControls: ['DLP solution', 'User behavior analytics', 'Least-privilege access', 'Offboarding data access review'],
        assetTypes: ['INFORMATION', 'DATA_STORE', 'APPLICATION'],
        frameworks: ['ISO27001', 'SOC2'],
        confidence: 'medium',
        structuredRationale: {
            whyThisRisk: 'Legitimate access combined with motivation creates a hard-to-detect threat; preventive controls must complement detection.',
            affectedAssetCharacteristics: ['Accessible to multiple users', 'Contains high-value data', 'Data export capabilities'],
            suggestedControlThemes: ['Access governance', 'Data loss prevention', 'Behavioral monitoring'],
        },
    },
    // ─── NIS2-specific risks ───
    {
        title: 'Incident notification obligation failure',
        description: 'Organization fails to detect, classify, and report significant cyber incidents within mandated timeframes.',
        category: 'Incident Response',
        threat: 'Regulatory penalty for late or missing incident notification to competent authority',
        vulnerability: 'Undefined incident classification criteria, missing notification procedures, or unclear escalation paths',
        likelihood: 3, impact: 3,
        rationale: 'NIS2 requires initial notification within 24 hours and full report within 72 hours. Non-compliance carries penalties.',
        suggestedControls: ['Incident classification framework', 'Notification procedure and templates', 'Escalation matrix', 'Tabletop exercises'],
        assetTypes: ['PROCESS', 'INFRASTRUCTURE', 'APPLICATION'],
        frameworks: ['NIS2'],
        confidence: 'high',
        structuredRationale: {
            whyThisRisk: 'NIS2 imposes strict notification timelines; organizations without procedures will fail to comply during an actual incident.',
            affectedAssetCharacteristics: ['Subject to NIS2 scope', 'Provides essential/important service', 'Data processing activity'],
            suggestedControlThemes: ['Incident response', 'Regulatory compliance', 'Communication procedures'],
        },
    },
    {
        title: 'Cloud misconfiguration exposing data or services',
        description: 'Misconfigured cloud resources (storage, compute, network) expose data publicly or create lateral movement paths.',
        category: 'Cloud Security',
        threat: 'Misconfigured storage buckets, overly permissive IAM, or open security groups',
        vulnerability: 'Absent cloud security posture management and infrastructure-as-code security scanning',
        likelihood: 3, impact: 4,
        rationale: 'Cloud misconfiguration is the #1 cause of cloud data breaches. The speed of cloud provisioning outpaces security review.',
        suggestedControls: ['Cloud security posture management (CSPM)', 'Infrastructure as code scanning', 'Cloud configuration baselines', 'Automated remediation'],
        assetTypes: ['INFRASTRUCTURE', 'APPLICATION', 'DATA_STORE'],
        frameworks: ['ISO27001', 'SOC2'],
        confidence: 'high',
        structuredRationale: {
            whyThisRisk: 'Cloud environments are complex; a single misconfiguration can expose entire environments without detection.',
            affectedAssetCharacteristics: ['Cloud-hosted', 'Uses cloud storage', 'Multi-tenant environment'],
            suggestedControlThemes: ['Configuration management', 'Cloud governance', 'Automated scanning'],
        },
    },
];
