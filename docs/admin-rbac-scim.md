# Admin, RBAC & SCIM — Operational Guide

## Admin Information Architecture

```
/t/[tenantSlug]/admin
├── Audit Log (default tab)
├── Policy Templates
├── Members & Roles    → /admin/members
├── Roles & Access     → /admin/rbac
├── Billing            → /admin/billing
├── SSO & Identity     → /admin/sso
├── SCIM Provisioning  → /admin/scim
└── Security & MFA     → /admin/security
```

All admin pages require `canAdmin` permission (ADMIN role on `TenantMembership`).

## Member Management

### Invite a Member
1. Navigate to **Members & Roles**
2. Enter email address and select role
3. Click **Send Invite**

### Change a Member's Role
1. Open **Members & Roles**
2. Click the role dropdown next to the member
3. Select the new role

**Safety**: The last ADMIN cannot demote themselves.

### Remove/Deactivate a Member
1. Open **Members & Roles**
2. Click the action menu → **Deactivate**
3. Member's status changes to DEACTIVATED

Deactivated members lose access. Their historical records (audit entries, task assignments, evidence reviews) remain intact.

## Roles

| Role | Permissions |
|------|------------|
| **ADMIN** | Full access: member management, settings, billing, SSO, SCIM |
| **EDITOR** | Create/edit resources (controls, risks, evidence, policies) |
| **AUDITOR** | Read-only + audit cycle management |
| **READER** | Read-only access to tenant resources |

## SSO Configuration

Navigate to **SSO & Identity** (`/admin/sso`).

### Supported Protocols
- **OIDC** — Okta, Azure AD, Google Workspace, Auth0
- **SAML 2.0** — Any SAML-compliant IdP

### Enforcement
- **Disabled**: SSO available but not required
- **Enabled**: SSO available for configured email domains
- **Enforced**: All non-admin users must use SSO (break-glass: admins with local password can bypass)

## SCIM 2.0 Provisioning

### Endpoints

| Endpoint | Methods | Purpose |
|----------|---------|---------|
| `/api/scim/v2/ServiceProviderConfig` | GET | SCIM capabilities (public) |
| `/api/scim/v2/Users` | GET, POST | List/create users |
| `/api/scim/v2/Users/:id` | GET, PATCH, PUT, DELETE | User CRUD |

### Setup
1. Navigate to **SCIM Provisioning** (`/admin/scim`)
2. Click **Generate Token** and copy the token (shown once only)
3. Configure your IdP's SCIM connector:
   - **Base URL**: The SCIM endpoint shown on the page
   - **Auth**: Bearer token (HTTP header)
   - **Operations**: Create, Update, Deactivate

### Token Rotation
1. Generate a new token
2. Update your IdP with the new token
3. Revoke the old token

### Role Mapping

| SCIM Role Value | Local Role | Status |
|----------------|------------|--------|
| `reader` | READER | ✅ Default |
| `editor` | EDITOR | ✅ Allowed |
| `auditor` | AUDITOR | ✅ Allowed |
| `admin` | — | ⛔ Blocked |

**ADMIN role cannot be assigned via SCIM.** It must be set manually by an existing admin.

### Deactivation Behavior
- SCIM `DELETE` or `PATCH active=false` → membership `DEACTIVATED`
- User loses tenant access immediately
- Historical records preserved (audit trail, task ownership, evidence)
- Re-provisioning the same user reactivates their membership

### Audit Events

All SCIM operations emit structured audit events:
- `SCIM_USER_CREATED`
- `SCIM_USER_UPDATED`
- `SCIM_USER_DEACTIVATED`
- `SCIM_USER_REACTIVATED`
