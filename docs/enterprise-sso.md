# Enterprise SSO — Configuration & Operations Guide

## Architecture

```
┌───────────────────────────────────────────────────────┐
│                    Login Page                          │
│  [Sign in with SSO] ──► resolves tenant + provider    │
└────────────┬─────────────────────┬────────────────────┘
             │ OIDC                │ SAML 2.0
             ▼                    ▼
┌─────────────────────┐  ┌─────────────────────────────┐
│ /api/auth/sso/oidc/ │  │ /api/auth/sso/saml/         │
│   start → callback  │  │   start → callback (ACS)    │
│   PKCE + nonce      │  │   AuthnRequest + XML-DSig   │
└──────────┬──────────┘  └──────────┬──────────────────┘
           │                        │
           ▼                        ▼
┌────────────────────────────────────────────────────────┐
│              linkExternalIdentity()                     │
│  Domain validation → Existing link check →              │
│  Email match → JIT provisioning (if enabled)            │
└────────────────────────┬───────────────────────────────┘
                         ▼
┌────────────────────────────────────────────────────────┐
│              JWT Session Creation                       │
│  Auth.js-compatible cookie → redirect to app            │
└────────────────────────────────────────────────────────┘
```

## Configuration

### Admin UI

Navigate to: `/t/<your-tenant>/admin` → click **SSO & Identity** pill button.

### OIDC Configuration Fields

| Field | Required | Description |
|-------|----------|-------------|
| **Issuer URL** | ✅ | OIDC Issuer URL (e.g. `https://login.example.com`) |
| **Client ID** | ✅ | OAuth client ID from your IdP |
| **Client Secret** | ✅ | OAuth client secret (encrypted at rest) |
| **Scopes** | Default: `openid email profile` | Space-separated OIDC scopes |
| **Email Domains** | Optional | Comma-separated (e.g. `acme.com, acme.io`) |

**Callback URL** (register in your IdP):
```
https://<your-domain>/api/auth/sso/oidc/callback
```

### SAML Configuration Fields

| Field | Required | Description |
|-------|----------|-------------|
| **IdP Entity ID** | ✅ | Your IdP's entity identifier |
| **SSO URL** | ✅ | IdP's Single Sign-On endpoint |
| **X.509 Certificate** | ✅ | IdP's signing certificate (PEM format) |
| **NameID Format** | Default: `emailAddress` | SAML NameID format |
| **Email Domains** | Optional | Restricts which emails can authenticate |

**ACS URL** (register in your IdP):
```
https://<your-domain>/api/auth/sso/saml/callback
```

**SP Entity ID / Issuer**:
```
https://<your-domain>/saml/metadata/<tenant-slug>
```

## Enforcement Behavior

| Setting | Effect |
|---------|--------|
| **Enabled** | SSO login option appears on login page |
| **Enforced** | Users must use SSO — local login blocked |

### Break-Glass Access

When SSO is enforced, local login is still possible for users who meet **both** criteria:
1. Have **ADMIN** role in the tenant
2. Have a **local password** set (passwordHash exists)

This prevents tenant admin lockout while maintaining enforcement for all other users.

## JIT Provisioning

When enabled per provider:
- Users whose email domain matches are auto-created on first SSO login
- Default role: **READER** (configurable to EDITOR)
- **ADMIN role is never auto-provisioned** — this is enforced at schema level

## Test IdP Setup

### Okta Developer (OIDC)

1. Create a free [Okta Developer](https://developer.okta.com) account
2. Go to **Applications** → **Create App Integration** → **OIDC - OpenID Connect** → **Web Application**
3. Set:
   - **Sign-in redirect URI**: `http://localhost:3000/api/auth/sso/oidc/callback`
   - **Sign-out redirect URI**: `http://localhost:3000/login`
4. Copy the **Client ID**, **Client Secret**, and **Okta domain** (issuer = `https://<your-okta-domain>`)
5. In the app admin panel, go to SSO → OIDC tab and enter the values
6. Enable the provider and click **Test Login**

### Okta Developer (SAML)

1. In Okta, go to **Applications** → **Create App Integration** → **SAML 2.0**
2. Set:
   - **Single sign-on URL**: `http://localhost:3000/api/auth/sso/saml/callback`
   - **Audience URI (SP Entity ID)**: `http://localhost:3000/saml/metadata/<your-tenant-slug>`
   - **Name ID format**: `EmailAddress`
3. Download the IdP metadata or copy:
   - **IdP SSO URL**
   - **IdP Entity ID / Issuer**
   - **X.509 Certificate**
4. In the app admin panel, go to SSO → SAML tab and enter the values

### Environment Variables

```env
# Required for SSO
APP_URL=http://localhost:3000        # Your application URL
AUTH_SECRET=<your-auth-secret>       # NextAuth.js secret for JWT signing
```

## Troubleshooting

### Common Issues

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| "SSO provider not found" | Provider disabled or wrong tenant | Check admin panel — ensure provider is enabled |
| "Domain not allowed" | Email domain not in `emailDomains` | Add user's domain to provider config, or clear the field to allow any domain |
| "No matching account" | User doesn't exist or has no membership | Invite user first, or enable JIT provisioning |
| "Identity conflict" | User already linked to a different IdP subject | Contact admin to unlink the existing identity |
| "Cross-tenant login blocked" | Identity link exists for a different tenant | User must log into the correct tenant |
| "SAML response validation failed" | Certificate mismatch or expired assertion | Verify the X.509 certificate matches the IdP |

### Diagnostic Logs

SSO events are logged in structured JSON format:
```json
{
  "timestamp": "2026-03-22T09:12:34.567Z",
  "level": "warn",
  "component": "sso",
  "message": "Identity linking rejected",
  "tenantSlug": "acme-corp",
  "providerType": "OIDC",
  "stage": "identity_linking",
  "requestId": "sso-abc123-xyz789"
}
```

**Never logged**: tokens, assertions, secrets, certificates, client secrets.

### Security Checklist

- [ ] Secrets encrypted at rest (via Prisma field-level encryption or KMS)
- [ ] HTTPS enforced in production (`APP_URL` starts with `https://`)
- [ ] `AUTH_SECRET` is a strong random value (≥32 chars)
- [ ] IdP certificates are current and not expired
- [ ] `emailDomains` configured to restrict SSO to your organization
- [ ] JIT provisioning reviewed — consider leaving disabled unless needed
- [ ] Break-glass admin has local password set before enforcing SSO
