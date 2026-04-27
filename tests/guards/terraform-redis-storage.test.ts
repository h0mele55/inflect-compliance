/**
 * Epic OI-1 (part 3) — structural ratchet for the Redis + Storage
 * modules.
 *
 * Locks the load-bearing security/operational invariants so they
 * can't drift silently:
 *
 *   Redis:
 *     - transit_encryption_enabled = true (HARDCODED)
 *     - at_rest_encryption_enabled = true
 *     - auth_token wired (only valid when transit encryption is on)
 *     - ingress only from app SG (no CIDR-based ingress)
 *     - parameter_group_family = redis7
 *     - maxmemory-policy = noeviction (BullMQ requirement)
 *     - replicas_per_node_group toggles HA semantics correctly
 *
 *   Storage:
 *     - versioning enabled
 *     - SSE-S3 (AES256) — not SSE-KMS, per spec
 *     - public-access-block all four flags = true
 *     - lifecycle: STANDARD_IA transition at 90d (default)
 *     - CORS only when origins are non-empty (no wildcard origin)
 *     - deny-non-TLS bucket policy
 *     - IAM policy ALWAYS created; role optional
 *     - bucket has no public-grant policy statement
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

const REDIS_MAIN = 'infra/terraform/modules/redis/main.tf';
const REDIS_OUT = 'infra/terraform/modules/redis/outputs.tf';
const REDIS_VARS = 'infra/terraform/modules/redis/variables.tf';
const STORAGE_MAIN = 'infra/terraform/modules/storage/main.tf';
const STORAGE_OUT = 'infra/terraform/modules/storage/outputs.tf';
const STORAGE_VARS = 'infra/terraform/modules/storage/variables.tf';
const ROOT_MAIN = 'infra/terraform/main.tf';
const ROOT_OUT = 'infra/terraform/outputs.tf';

describe('OI-1 part 3 — Redis module security baseline', () => {
    it('forces transit_encryption_enabled = true (hardcoded, not tunable)', () => {
        const src = read(REDIS_MAIN);
        expect(src).toMatch(/transit_encryption_enabled\s*=\s*true/);
        // No variable indirection allowed — TLS-in-transit is a load-
        // bearing OI-1 spec invariant.
        expect(src).not.toMatch(/transit_encryption_enabled\s*=\s*var\./);
    });

    it('forces at_rest_encryption_enabled = true', () => {
        const src = read(REDIS_MAIN);
        expect(src).toMatch(/at_rest_encryption_enabled\s*=\s*true/);
    });

    it('wires auth_token from a generated random_password', () => {
        const src = read(REDIS_MAIN);
        expect(src).toMatch(/resource\s+"random_password"\s+"auth"/);
        expect(src).toMatch(/auth_token\s*=\s*random_password\.auth\.result/);
    });

    it('persists the AUTH token to AWS Secrets Manager', () => {
        const src = read(REDIS_MAIN);
        expect(src).toMatch(/resource\s+"aws_secretsmanager_secret"\s+"auth"/);
        expect(src).toMatch(/resource\s+"aws_secretsmanager_secret_version"\s+"auth"/);
    });

    it('Redis ingress comes from the app SG only — no CIDR-based rule', () => {
        const src = read(REDIS_MAIN);
        const ingressMatch = src.match(
            /resource\s+"aws_vpc_security_group_ingress_rule"\s+"redis_from_app"\s*\{[\s\S]*?\n\}/,
        );
        expect(ingressMatch).toBeTruthy();
        const block = ingressMatch![0];
        expect(block).toMatch(/referenced_security_group_id\s*=\s*var\.app_security_group_id/);
        expect(block).not.toMatch(/cidr_ipv4/);
        expect(block).not.toMatch(/cidr_ipv6/);

        // Confirm there's exactly one ingress rule resource on the SG.
        const declCount = (
            src.match(/^resource\s+"aws_vpc_security_group_ingress_rule"\s+"/gm) ?? []
        ).length;
        expect(declCount).toBe(1);
    });

    it('parameter_group on the redis7 family with maxmemory-policy = noeviction', () => {
        const src = read(REDIS_MAIN);
        expect(src).toMatch(/resource\s+"aws_elasticache_parameter_group"\s+"this"/);
        expect(src).toMatch(/family\s*=\s*"redis7"/);
        expect(src).toMatch(
            /name\s*=\s*"maxmemory-policy"[\s\S]*?value\s*=\s*"noeviction"/,
        );
    });

    it('engine_version is constrained to 7.x', () => {
        const src = read(REDIS_VARS);
        expect(src).toMatch(/can\(regex\("\^7\\\\\.",\s*var\.engine_version\)\)/);
    });

    it('automatic_failover and multi_az toggle together with replicas', () => {
        const src = read(REDIS_MAIN);
        expect(src).toMatch(/automatic_failover_enabled\s*=\s*var\.replicas_per_node_group\s*>\s*0/);
        expect(src).toMatch(/multi_az_enabled\s*=\s*var\.replicas_per_node_group\s*>\s*0/);
    });

    it('uses cluster-mode-disabled (single node group)', () => {
        const src = read(REDIS_MAIN);
        expect(src).toMatch(/num_node_groups\s*=\s*1/);
    });

    it('snapshot retention defaults >= 1 day (PITR-equivalent on)', () => {
        const src = read(REDIS_VARS);
        expect(src).toMatch(/variable\s+"snapshot_retention_days"[\s\S]*?default\s*=\s*1/);
        expect(src).toMatch(/var\.snapshot_retention_days\s*>=\s*1/);
    });

    it('exposes primary_endpoint, port, security_group_id, auth_secret_arn', () => {
        const src = read(REDIS_OUT);
        for (const out of [
            'primary_endpoint_address',
            'port',
            'security_group_id',
            'auth_secret_arn',
        ]) {
            expect(src).toMatch(new RegExp(`output\\s+"${out}"`));
        }
    });

    it('auth_secret_arn output is marked sensitive', () => {
        const src = read(REDIS_OUT);
        const block = src.match(/output\s+"auth_secret_arn"\s*\{[\s\S]*?\n\}/);
        expect(block).toBeTruthy();
        expect(block![0]).toMatch(/sensitive\s*=\s*true/);
    });
});

describe('OI-1 part 3 — Storage module security baseline', () => {
    it('public-access-block has all four flags = true', () => {
        const src = read(STORAGE_MAIN);
        const block = src.match(
            /resource\s+"aws_s3_bucket_public_access_block"\s+"this"\s*\{[\s\S]*?\n\}/,
        );
        expect(block).toBeTruthy();
        const text = block![0];
        for (const flag of [
            'block_public_acls',
            'block_public_policy',
            'ignore_public_acls',
            'restrict_public_buckets',
        ]) {
            expect(text).toMatch(new RegExp(`${flag}\\s*=\\s*true`));
        }
    });

    it('versioning resource exists and is wired to var.versioning_enabled', () => {
        const src = read(STORAGE_MAIN);
        expect(src).toMatch(/resource\s+"aws_s3_bucket_versioning"\s+"this"/);
        expect(src).toMatch(/status\s*=\s*var\.versioning_enabled\s*\?\s*"Enabled"\s*:\s*"Suspended"/);
    });

    it('versioning defaults to true (OI-1 spec)', () => {
        const src = read(STORAGE_VARS);
        expect(src).toMatch(/variable\s+"versioning_enabled"[\s\S]*?default\s*=\s*true/);
    });

    it('SSE is AES256 (SSE-S3, not SSE-KMS — per OI-1 spec)', () => {
        const src = read(STORAGE_MAIN);
        expect(src).toMatch(/sse_algorithm\s*=\s*"AES256"/);
        // No KMS reference in the SSE block — would imply SSE-KMS.
        const sseBlock = src.match(
            /resource\s+"aws_s3_bucket_server_side_encryption_configuration"[\s\S]*?\n\}/,
        );
        expect(sseBlock).toBeTruthy();
        expect(sseBlock![0]).not.toMatch(/kms_master_key_id/);
    });

    it('lifecycle: STANDARD_IA transition rule exists with default 90 days', () => {
        const src = read(STORAGE_MAIN);
        expect(src).toMatch(/storage_class\s*=\s*"STANDARD_IA"/);
        const varSrc = read(STORAGE_VARS);
        expect(varSrc).toMatch(/variable\s+"ia_transition_days"[\s\S]*?default\s*=\s*90/);
    });

    it('lifecycle: incomplete-multipart cleanup rule exists', () => {
        const src = read(STORAGE_MAIN);
        expect(src).toMatch(/abort_incomplete_multipart_upload\s*\{/);
    });

    it('CORS configuration is gated on cors_allowed_origins being non-empty', () => {
        const src = read(STORAGE_MAIN);
        expect(src).toMatch(/resource\s+"aws_s3_bucket_cors_configuration"/);
        expect(src).toMatch(/has_cors\s*=\s*length\(var\.cors_allowed_origins\)\s*>\s*0/);
        // count = local.has_cors ? 1 : 0 — module is a no-op for
        // server-side-only upload flows (default empty list).
        expect(src).toMatch(/count\s*=\s*local\.has_cors\s*\?\s*1\s*:\s*0/);
    });

    it('CORS defaults include PUT (pre-signed URL upload flow)', () => {
        const src = read(STORAGE_VARS);
        expect(src).toMatch(/variable\s+"cors_allowed_methods"[\s\S]*?default\s*=\s*\[\s*"PUT"/);
    });

    it('deny-non-TLS bucket policy is on by default', () => {
        const src = read(STORAGE_MAIN);
        expect(src).toMatch(/sid\s*=\s*"DenyNonTLS"/);
        expect(src).toMatch(/aws:SecureTransport/);
        const varSrc = read(STORAGE_VARS);
        expect(varSrc).toMatch(/variable\s+"deny_non_tls_access"[\s\S]*?default\s*=\s*true/);
    });

    it('IAM policy is ALWAYS created (no count gating); role is optional', () => {
        const src = read(STORAGE_MAIN);
        // IAM policy resource is unconditional
        const policyBlock = src.match(
            /resource\s+"aws_iam_policy"\s+"app_access"\s*\{[\s\S]*?\n\}/,
        );
        expect(policyBlock).toBeTruthy();
        expect(policyBlock![0]).not.toMatch(/^\s*count\s*=/m);
        // Role IS gated
        const roleBlock = src.match(
            /resource\s+"aws_iam_role"\s+"app"\s*\{[\s\S]*?\n\}/,
        );
        expect(roleBlock).toBeTruthy();
        expect(roleBlock![0]).toMatch(/count\s*=\s*var\.create_app_role/);
    });

    it('IAM policy grants object-level read+write+delete on bucket/* and ListBucket on bucket', () => {
        const src = read(STORAGE_MAIN);
        // bucket/* resource scope for object actions
        expect(src).toMatch(/"\$\{aws_s3_bucket\.this\.arn\}\/\*"/);
        // ListBucket for the bucket itself
        expect(src).toMatch(/"s3:ListBucket"/);
        // Object actions
        for (const action of [
            's3:GetObject',
            's3:PutObject',
            's3:DeleteObject',
            's3:AbortMultipartUpload',
        ]) {
            expect(src).toContain(`"${action}"`);
        }
    });

    it('bucket has no public-grant policy (no Allow * to *)', () => {
        const src = read(STORAGE_MAIN);
        // Quick scan: there should be no Allow effect with Principal *
        // anywhere in this file. Only the DenyNonTLS Deny+* is present.
        const bucketPolicy = src.match(
            /data\s+"aws_iam_policy_document"\s+"bucket"[\s\S]*?\n\}/,
        );
        expect(bucketPolicy).toBeTruthy();
        // Only Deny statements — no Allow.
        expect(bucketPolicy![0]).not.toMatch(/effect\s*=\s*"Allow"/);
    });

    it('exposes bucket_id, bucket_arn, access_policy_arn, regional_domain_name', () => {
        const src = read(STORAGE_OUT);
        for (const out of [
            'bucket_id',
            'bucket_arn',
            'access_policy_arn',
            'bucket_regional_domain_name',
        ]) {
            expect(src).toMatch(new RegExp(`output\\s+"${out}"`));
        }
    });
});

describe('OI-1 part 3 — root composition wires Redis + Storage', () => {
    it('main.tf instantiates module "redis" and module "storage"', () => {
        const src = read(ROOT_MAIN);
        expect(src).toMatch(/module\s+"redis"\s*\{/);
        expect(src).toMatch(/module\s+"storage"\s*\{/);
    });

    it('redis lives in private_app subnets and uses the app SG', () => {
        const src = read(ROOT_MAIN);
        // The redis module block should reference module.vpc.private_app_subnet_ids
        const redisBlock = src.match(/module\s+"redis"\s*\{[\s\S]*?\n\}/);
        expect(redisBlock).toBeTruthy();
        expect(redisBlock![0]).toMatch(/subnet_ids\s*=\s*module\.vpc\.private_app_subnet_ids/);
        expect(redisBlock![0]).toMatch(/app_security_group_id\s*=\s*module\.vpc\.app_security_group_id/);
    });

    it('outputs surface redis + storage with auth_secret_arn marked sensitive', () => {
        const src = read(ROOT_OUT);
        for (const out of [
            'redis_primary_endpoint',
            'redis_port',
            'redis_auth_secret_arn',
            'storage_bucket_id',
            'storage_bucket_arn',
            'storage_access_policy_arn',
        ]) {
            expect(src).toMatch(new RegExp(`output\\s+"${out}"`));
        }
        const authBlock = src.match(/output\s+"redis_auth_secret_arn"\s*\{[\s\S]*?\n\}/);
        expect(authBlock).toBeTruthy();
        expect(authBlock![0]).toMatch(/sensitive\s*=\s*true/);
    });
});

describe('OI-1 part 3 — env tradeoff overrides', () => {
    it('staging is single-node Redis + force_destroy on storage', () => {
        const src = read('infra/terraform/environments/staging/terraform.tfvars');
        expect(src).toMatch(/redis_replicas_per_node_group\s*=\s*0/);
        expect(src).toMatch(/storage_force_destroy\s*=\s*true/);
    });

    it('production is HA Redis + force_destroy = false on storage', () => {
        const src = read('infra/terraform/environments/production/terraform.tfvars');
        expect(src).toMatch(/redis_replicas_per_node_group\s*=\s*1/);
        expect(src).toMatch(/storage_force_destroy\s*=\s*false/);
    });

    it('both envs configure CORS allowed origins (no empty list, no wildcard)', () => {
        for (const env of ['staging', 'production']) {
            const src = read(`infra/terraform/environments/${env}/terraform.tfvars`);
            const m = src.match(/storage_cors_allowed_origins\s*=\s*\[([^\]]*)\]/);
            expect(m).toBeTruthy();
            const body = m![1];
            // Non-empty
            expect(body.trim()).not.toEqual('');
            // No wildcard
            expect(body).not.toMatch(/"\*"/);
            // At least one https:// origin
            expect(body).toMatch(/"https:\/\//);
        }
    });
});
