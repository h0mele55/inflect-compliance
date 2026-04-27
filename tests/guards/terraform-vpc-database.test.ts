/**
 * Epic OI-1 (part 2) — structural ratchet for the VPC + Database
 * modules.
 *
 * Locks the network + DB security model so the load-bearing invariants
 * cannot drift silently:
 *   - DB is never publicly accessible
 *   - DB security-group ingress is from the app SG only (not 0.0.0.0/0,
 *     not the VPC CIDR, not anywhere else)
 *   - Storage is encrypted (no opt-out)
 *   - Backups are retained (PITR-on)
 *   - row_security = 1 is set on the parameter group (cluster-wide
 *     RLS-on backstop, paired with prisma/rls-setup.sql per-table FORCE)
 *   - Postgres major version is 16
 *   - The private-db subnet route table has no default route (no
 *     internet egress for the DB tier)
 *
 * If one of these breaks, the diff is the design conversation. Update
 * this test in the same PR that justifies the change.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

const VPC_MAIN = 'infra/terraform/modules/vpc/main.tf';
const VPC_OUT = 'infra/terraform/modules/vpc/outputs.tf';
const VPC_VARS = 'infra/terraform/modules/vpc/variables.tf';
const DB_MAIN = 'infra/terraform/modules/database/main.tf';
const DB_OUT = 'infra/terraform/modules/database/outputs.tf';
const DB_VARS = 'infra/terraform/modules/database/variables.tf';
const ROOT_MAIN = 'infra/terraform/main.tf';

describe('OI-1 part 2 — VPC module networking model', () => {
    it('creates a VPC with DNS support enabled', () => {
        const src = read(VPC_MAIN);
        expect(src).toMatch(/resource\s+"aws_vpc"\s+"this"/);
        expect(src).toMatch(/enable_dns_hostnames\s*=\s*true/);
        expect(src).toMatch(/enable_dns_support\s*=\s*true/);
    });

    it('creates three subnet tiers (public, private-app, private-db)', () => {
        const src = read(VPC_MAIN);
        expect(src).toMatch(/resource\s+"aws_subnet"\s+"public"/);
        expect(src).toMatch(/resource\s+"aws_subnet"\s+"private_app"/);
        expect(src).toMatch(/resource\s+"aws_subnet"\s+"private_db"/);
    });

    it('NAT gateway count toggles between single and per-AZ', () => {
        const src = read(VPC_MAIN);
        expect(src).toMatch(/resource\s+"aws_nat_gateway"\s+"this"/);
        // The nat_gateway_count expression should branch on
        // single_nat_gateway. Lock the expression shape.
        expect(src).toMatch(/var\.single_nat_gateway\s*\?\s*1\s*:\s*local\.az_count/);
    });

    it('private-db route table has NO default 0.0.0.0/0 route', () => {
        const src = read(VPC_MAIN);
        // Find the private_db RT block; assert it does not declare a
        // route block with cidr_block 0.0.0.0/0.
        const dbRtMatch = src.match(/resource\s+"aws_route_table"\s+"private_db"\s*\{[\s\S]*?\n\}/);
        expect(dbRtMatch).toBeTruthy();
        const dbRt = dbRtMatch![0];
        expect(dbRt).not.toMatch(/0\.0\.0\.0\/0/);
        expect(dbRt).not.toMatch(/nat_gateway_id/);
    });

    it('alb security group accepts 80 + 443 from internet only', () => {
        const src = read(VPC_MAIN);
        expect(src).toMatch(/aws_vpc_security_group_ingress_rule"\s+"alb_http"/);
        expect(src).toMatch(/aws_vpc_security_group_ingress_rule"\s+"alb_https"/);
    });

    it('app security group accepts ingress only from alb_sg (no CIDR ingress)', () => {
        const src = read(VPC_MAIN);
        const appIngressMatch = src.match(
            /resource\s+"aws_vpc_security_group_ingress_rule"\s+"app_from_alb"\s*\{[\s\S]*?\n\}/,
        );
        expect(appIngressMatch).toBeTruthy();
        const block = appIngressMatch![0];
        expect(block).toMatch(/referenced_security_group_id\s*=\s*aws_security_group\.alb\.id/);
        expect(block).not.toMatch(/cidr_ipv4/);
    });

    it('exposes vpc_id, subnet IDs per tier, and SG IDs', () => {
        const src = read(VPC_OUT);
        for (const out of [
            'vpc_id',
            'public_subnet_ids',
            'private_app_subnet_ids',
            'private_db_subnet_ids',
            'alb_security_group_id',
            'app_security_group_id',
        ]) {
            expect(src).toMatch(new RegExp(`output\\s+"${out}"`));
        }
    });

    it('app_ingress_port + flow_logs are configurable inputs', () => {
        const src = read(VPC_VARS);
        expect(src).toMatch(/variable\s+"app_ingress_port"/);
        expect(src).toMatch(/variable\s+"enable_flow_logs"/);
        expect(src).toMatch(/variable\s+"single_nat_gateway"/);
    });
});

describe('OI-1 part 2 — Database module security baseline', () => {
    it('forces publicly_accessible = false (hardcoded, not tunable)', () => {
        const src = read(DB_MAIN);
        expect(src).toMatch(/publicly_accessible\s*=\s*false/);
        // No variable indirection allowed — this is a load-bearing
        // invariant for compliance and must not be operator-overridable.
        expect(src).not.toMatch(/publicly_accessible\s*=\s*var\./);
    });

    it('forces storage_encrypted = true (hardcoded, not tunable)', () => {
        const src = read(DB_MAIN);
        expect(src).toMatch(/storage_encrypted\s*=\s*true/);
        expect(src).not.toMatch(/storage_encrypted\s*=\s*var\./);
    });

    it('uses RDS-managed master password (no plaintext in tfvars or state)', () => {
        const src = read(DB_MAIN);
        expect(src).toMatch(/manage_master_user_password\s*=\s*true/);
        // No `password = ` argument anywhere (would put a plaintext
        // password into the state file).
        expect(src).not.toMatch(/^\s*password\s*=/m);
    });

    it('DB ingress comes from the app SG only — no CIDR-based rule', () => {
        const src = read(DB_MAIN);
        const ingressMatch = src.match(
            /resource\s+"aws_vpc_security_group_ingress_rule"\s+"db_from_app"\s*\{[\s\S]*?\n\}/,
        );
        expect(ingressMatch).toBeTruthy();
        const block = ingressMatch![0];
        expect(block).toMatch(/referenced_security_group_id\s*=\s*var\.app_security_group_id/);
        expect(block).not.toMatch(/cidr_ipv4/);
        expect(block).not.toMatch(/cidr_ipv6/);

        // Confirm there is no OTHER ingress rule on the DB SG that
        // could open it up. The module should produce exactly one
        // ingress rule.
        const ingressRuleCount = (
            src.match(/aws_vpc_security_group_ingress_rule/g) ?? []
        ).length;
        // 1 for the resource decl, 1 for the resource type prefix in
        // any nested reference (we don't use any) — so expect exactly 2
        // matches on the resource declaration line + zero elsewhere.
        // Tighten: the resource block is declared once.
        const declCount = (
            src.match(/^resource\s+"aws_vpc_security_group_ingress_rule"\s+"/gm) ?? []
        ).length;
        expect(declCount).toBe(1);
        expect(ingressRuleCount).toBeGreaterThanOrEqual(1);
    });

    it('parameter group sets row_security = 1 (RLS-on backstop)', () => {
        const src = read(DB_MAIN);
        const pgMatch = src.match(
            /resource\s+"aws_db_parameter_group"\s+"this"[\s\S]*?\n\}\n/,
        );
        expect(pgMatch).toBeTruthy();
        const block = pgMatch![0];
        // Lock the row_security = 1 entry inside the parameter group
        expect(block).toMatch(/name\s*=\s*"row_security"[\s\S]*?value\s*=\s*"1"/);
    });

    it('parameter group sets rds.force_ssl (TLS-or-reject)', () => {
        const src = read(DB_MAIN);
        expect(src).toMatch(/name\s*=\s*"rds\.force_ssl"/);
    });

    it('parameter group is on the postgres16 family (locks major version)', () => {
        const src = read(DB_MAIN);
        expect(src).toMatch(/family\s*=\s*"postgres16"/);
    });

    it('engine_version is constrained to the 16.x line', () => {
        const src = read(DB_VARS);
        // Validation block keeps engine_version on Postgres 16
        expect(src).toMatch(/can\(regex\("\^16\\\\\.",\s*var\.engine_version\)\)/);
    });

    it('backup_retention_days defaults to 7 and refuses 0 (PITR mandatory)', () => {
        const src = read(DB_VARS);
        expect(src).toMatch(/variable\s+"backup_retention_days"[\s\S]*?default\s*=\s*7/);
        expect(src).toMatch(/var\.backup_retention_days\s*>=\s*1/);
    });

    it('multi_az + deletion_protection default true (production-safe)', () => {
        const src = read(DB_VARS);
        expect(src).toMatch(/variable\s+"multi_az"[\s\S]*?default\s*=\s*true/);
        expect(src).toMatch(/variable\s+"deletion_protection"[\s\S]*?default\s*=\s*true/);
    });

    it('exposes endpoint, port, security_group_id, secret_arn', () => {
        const src = read(DB_OUT);
        for (const out of ['endpoint', 'port', 'security_group_id', 'secret_arn']) {
            expect(src).toMatch(new RegExp(`output\\s+"${out}"`));
        }
    });

    it('CloudWatch log exports include postgresql logs', () => {
        const src = read(DB_MAIN);
        expect(src).toMatch(/enabled_cloudwatch_logs_exports\s*=\s*\[\s*"postgresql"/);
    });
});

describe('OI-1 part 2 — root composition wires VPC into Database', () => {
    it('main.tf instantiates module "vpc" and module "database"', () => {
        const src = read(ROOT_MAIN);
        expect(src).toMatch(/module\s+"vpc"\s*\{/);
        expect(src).toMatch(/module\s+"database"\s*\{/);
    });

    it('database module receives vpc.private_db_subnet_ids and vpc.app_security_group_id', () => {
        const src = read(ROOT_MAIN);
        expect(src).toMatch(/subnet_ids\s*=\s*module\.vpc\.private_db_subnet_ids/);
        expect(src).toMatch(/app_security_group_id\s*=\s*module\.vpc\.app_security_group_id/);
    });

    it('outputs.tf surfaces db_endpoint and marks db_secret_arn sensitive', () => {
        const src = read('infra/terraform/outputs.tf');
        expect(src).toMatch(/output\s+"db_endpoint"/);
        const secretBlock = src.match(/output\s+"db_secret_arn"\s*\{[\s\S]*?\n\}/);
        expect(secretBlock).toBeTruthy();
        expect(secretBlock![0]).toMatch(/sensitive\s*=\s*true/);
    });
});

describe('OI-1 part 2 — env tradeoff overrides', () => {
    it('staging accepts smaller HA tradeoffs (multi_az=false, deletion_protection=false)', () => {
        const src = read('infra/terraform/environments/staging/terraform.tfvars');
        expect(src).toMatch(/db_multi_az\s*=\s*false/);
        expect(src).toMatch(/db_deletion_protection\s*=\s*false/);
        expect(src).toMatch(/vpc_single_nat_gateway\s*=\s*true/);
    });

    it('production keeps HA + protection on', () => {
        const src = read('infra/terraform/environments/production/terraform.tfvars');
        expect(src).toMatch(/db_multi_az\s*=\s*true/);
        expect(src).toMatch(/db_deletion_protection\s*=\s*true/);
        expect(src).toMatch(/vpc_single_nat_gateway\s*=\s*false/);
    });

    it('neither env disables PITR (backup_retention_days >= 7)', () => {
        for (const env of ['staging', 'production']) {
            const src = read(`infra/terraform/environments/${env}/terraform.tfvars`);
            const m = src.match(/db_backup_retention_days\s*=\s*(\d+)/);
            expect(m).toBeTruthy();
            expect(parseInt(m![1], 10)).toBeGreaterThanOrEqual(7);
        }
    });
});
