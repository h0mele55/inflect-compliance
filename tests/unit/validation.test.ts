import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withValidatedBody, withValidatedForm, withValidatedQuery } from '@/lib/validation/route';
import { withApiErrorHandling } from '@/lib/errors/api';

// Mock getSessionOrThrow or any other auth if needed, but the wrappers themselves don't do auth.

describe('Validation Wrappers', () => {
    // A simple schema that strips unknown fields by default
    const TestSchema = z.object({
        name: z.string().min(1),
        age: z.coerce.number().min(18),
    }).strip();

    describe('withValidatedBody', () => {
        it('validates and parses correct JSON body', async () => {
            const req = new NextRequest('http://localhost/api/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'Alice', age: '25', extra: 'drop me' }),
            });

            const handler = withApiErrorHandling(withValidatedBody(TestSchema, async (req, ctx, body) => {
                expect(body).toEqual({ name: 'Alice', age: 25 });
                return NextResponse.json({ success: true, received: body });
            }));

            const response = await handler(req, { params: {} });
            expect(response.status).toBe(200);

            const json = await response.json();
            expect(json.success).toBe(true);
            expect(json.received.extra).toBeUndefined();
        });

        it('returns 400 on invalid body format', async () => {
            const req = new NextRequest('http://localhost/api/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: 'invalid-json',
            });

            const handler = withApiErrorHandling(withValidatedBody(TestSchema, async () => {
                return NextResponse.json({ success: true });
            }));

            const response = await handler(req, { params: {} });
            expect(response.status).toBe(400);

            const json = await response.json();
            expect(json.error.code).toBe('BAD_REQUEST');
            expect(json.error.message).toBe('Invalid JSON payload');
        });

        it('returns 400 with format errors when schema validation fails', async () => {
            const req = new NextRequest('http://localhost/api/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // Missing name, age too low
                body: JSON.stringify({ name: '', age: 10 }),
            });

            const handler = withApiErrorHandling(withValidatedBody(TestSchema, async () => {
                return NextResponse.json({ success: true });
            }));

            const response = await handler(req, { params: {} });
            expect(response.status).toBe(400);

            const json = await response.json();
            expect(json.error.code).toBe('VALIDATION_ERROR');
            expect(json.error.message).toBe('Invalid request payload');
            expect(json.error.details).toBeDefined();
            expect(json.error.details.length).toBeGreaterThan(0);
        });
    });

    describe('withValidatedForm', () => {
        it('validates and parses correct FormData', async () => {
            const formData = new FormData();
            formData.append('name', 'Bob');
            formData.append('age', '30');
            formData.append('ignoredField', 'drop this');

            const req = new NextRequest('http://localhost/api/test', {
                method: 'POST',
                body: formData,
            });

            const handler = withApiErrorHandling(withValidatedForm(TestSchema, async (req, ctx, body) => {
                expect(body).toEqual({ name: 'Bob', age: 30 });
                return NextResponse.json({ success: true });
            }));

            const response = await handler(req, { params: {} });
            expect(response.status).toBe(200);
        });

        it('returns 400 when missing required form fields', async () => {
            const formData = new FormData();
            formData.append('age', '30');

            const req = new NextRequest('http://localhost/api/test', {
                method: 'POST',
                body: formData,
            });

            const handler = withApiErrorHandling(withValidatedForm(TestSchema, async () => {
                return NextResponse.json({ success: true });
            }));

            const response = await handler(req, { params: {} });
            expect(response.status).toBe(400);

            const json = await response.json();
            expect(json.error.code).toBe('VALIDATION_ERROR');
        });
    });

    describe('withValidatedQuery', () => {
        const QuerySchema = z.object({
            q: z.string().optional(),
            page: z.coerce.number().default(1),
        });

        it('validates and parses search params', async () => {
            const req = new NextRequest('http://localhost/api/test?q=hello&page=2&drop=me');

            const handler = withApiErrorHandling(withValidatedQuery(QuerySchema, async (req, ctx, query) => {
                expect(query).toEqual({ q: 'hello', page: 2 });
                return NextResponse.json({ success: true });
            }));

            const response = await handler(req, { params: {} });
            expect(response.status).toBe(200);
        });

        it('uses defaults from schema', async () => {
            const req = new NextRequest('http://localhost/api/test?q=hello');

            const handler = withApiErrorHandling(withValidatedQuery(QuerySchema, async (req, ctx, query) => {
                expect(query).toEqual({ q: 'hello', page: 1 });
                return NextResponse.json({ success: true });
            }));

            const response = await handler(req, { params: {} });
            expect(response.status).toBe(200);
        });
    });
});
