# API Validation & Security Guidelines

This document outlines the standard pattern for validating incoming API requests in the robust validation framework of Inflect Compliance.

## Overview

All API endpoints that accept data (POST, PUT, PATCH) **must** use our custom validation higher-order functions (HOFs). This ensures:
1. **Consistent 400 Bad Request** error formats when validation fails.
2. **Type Safety** inside the route handler.
3. **Security** against Mass Assignment attacks by automatically stripping unknown JSON fields.
4. **Resilience** against Path Traversal and File Upload exploits via FormData validation.

## Schemas (`src/lib/schemas/`)

All Zod schemas must be defined in `src/lib/schemas/index.ts`. 

**Golden Rules for Schemas**:
- Use `.strip()` at the end of every object schema to drop extra payload data before it hits Prisma.
- Use `z.coerce` for number and boolean types, especially for query string / URL parameters.
- Provide descriptive error messages `z.string().min(1, 'Title is required')`.

### Example Schema
```typescript
import { z } from 'zod';

export const CreateTaskSchema = z.object({
    title: z.string().min(1, 'Title is required'),
    description: z.string().optional(),
    dueDate: z.string().optional().nullable(),
}).strip();
```

## Route Validation Wrappers (`src/lib/validation/route.ts`)

Instead of exporting standard asynchronous API functions, export the wrapped function. The wrappers catch Zod parse errors before the main logic runs.

### 1. `withValidatedBody` (JSON payload)

Use this for typical `application/json` REST updates.

```typescript
import { NextResponse } from 'next/server';
import { withValidatedBody } from '@/lib/validation/route';
import { CreateTaskSchema } from '@/lib/schemas';
import { getSessionOrThrow } from '@/lib/auth';

// The body argument is already fully typed and stripped of unknown fields!
export const POST = withValidatedBody(CreateTaskSchema, async (req, ctx, body) => {
    // 1. Authorization happens here
    const session = await getSessionOrThrow();
    
    // 2. Business logic
    const task = await prisma.task.create({
        data: {
            title: body.title, // safe
            description: body.description, // safe
            // malicious extra fields have already been removed by the wrapper
        }
    });

    return NextResponse.json(task, { status: 201 });
});
```

### 2. `withValidatedForm` (Multipart FormData)

Use this when uploading files or submitting `multipart/form-data`.

The middleware maps form fields to a JSON object to validate them. Files remain `File` web API objects within the payload.

```typescript
import { withValidatedForm } from '@/lib/validation/route';
import { CreateEvidenceFormSchema } from '@/lib/schemas';

export const POST = withValidatedForm(CreateEvidenceFormSchema, async (req, ctx, body) => {
    const session = await getSessionOrThrow();
    
    // Validate custom file aspects
    if (body.type === 'FILE') {
        if (!body.file) throw new Error('File is missing');
        // See storage module below
    }
    
    return NextResponse.json({ success: true });
});
```

## Storage & File Security (`src/lib/storage.ts`)

Never handle files manually. Use the `storage.ts` abstraction.

### Uploading Forms
```typescript
import { uploadFile, validateFile } from '@/lib/storage';

// 1. Validate MIME and size
validateFile(file, { maxSizeMB: 10 }); 

// 2. Upload safely (generates UUID and drops original path to stop traversal)
const { fileName, size } = await uploadFile(file);
```

### Retrieving Files
File retrieval expects a `/api/files/[fileName]` endpoint. The `getFile` method removes path segments like `../` to ensure users cannot break out of the upload directory.
```typescript
import { getFile } from '@/lib/storage';

const fileData = await getFile(params.fileName);
if (!fileData) return new NextResponse('Not found', { status: 404 });
```
