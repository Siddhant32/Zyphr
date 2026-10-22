# Zyphr

**Your Practicals. Your Details. Your PDF.**

Zyphr lets an administrator upload a practical DOCX once. Students can find a published practical, enter their name and registration ID, and download an independently generated PDF without creating an account.

## Project layout

- `frontend/` — responsive Next.js, TypeScript, and Tailwind application; frontend API routes proxy requests to the processing service.
- `backend/` — FastAPI endpoints, Supabase REST/Storage integration, DOCX personalization, and LibreOffice conversion.
- `supabase/migrations/` — documents schema, RLS, storage buckets/policies, and the generation counter function.

## Requirements

- Node.js 20.9 or newer and npm.
- Python 3.12 for the supplied Docker image; Python 3.10+ can be used locally with compatible dependencies.
- LibreOffice Writer installed locally for PDF generation, or use the backend Docker image.
- A Supabase project with Auth, PostgreSQL, and Storage enabled.

## Supabase setup

1. Create a Supabase project.
2. Apply [`supabase/migrations/202610220001_zyphr_schema.sql`](./supabase/migrations/202610220001_zyphr_schema.sql) in the Supabase SQL Editor, or with the Supabase CLI.
3. In Supabase Auth, create the first administrator user. Copy that user's UUID from the Auth users page.
4. Set `ADMIN_USER_IDS` to a comma-separated list of administrator user UUIDs. The backend checks the access token with Supabase Auth and then enforces this allowlist on every admin endpoint. Do not rely on a client-side route guard.
5. The migration creates a private `practical-documents` bucket for source DOCX files and a public-read `practical-covers` bucket for optional, non-sensitive cover images. Original files are never served publicly.

The migration grants public metadata reads only through a sanitized `published_documents` view; direct client reads of the documents table (including source-storage paths) are revoked. The `app_metadata.zyphr_admin` claim is used by the optional direct Storage policies. Zyphr's application uses the server-only service-role key for database and storage operations, with administrator checks enforced by the API allowlist. Dashboard counts are computed server-side by a restricted aggregate function rather than fetching a capped document list.

## Local development

### 1. Configure the backend

Copy `.env.example` to `.env`, then set the Supabase project URL, anon key, service-role key, and administrator UUID(s). The service-role key must remain on the server and must never be added to a `NEXT_PUBLIC_*` variable.

From the project root, create a virtual environment and install the backend dependencies:

```powershell
py -3.12 -m venv backend\.venv
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
```

Run the API from `backend\` so its `app` package is importable. Load the root `.env` using Uvicorn:

```powershell
Set-Location backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --env-file ..\.env
```

Set `FRONTEND_ORIGINS=http://localhost:3000` for local development. Install LibreOffice Writer locally and ensure the `libreoffice` executable is on `PATH`, or use the Docker backend below.

### 2. Configure and run the frontend

Create `frontend\.env.local` with these values:

```dotenv
BACKEND_API_URL=http://localhost:8000
NEXT_PUBLIC_BACKEND_API_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
NEXT_PUBLIC_CONTACT_EMAIL=
```

`BACKEND_API_URL` is server-only. `NEXT_PUBLIC_BACKEND_API_URL` is the public API origin and contains no secret. The Supabase `NEXT_PUBLIC_*` values are the project URL and public anon key; never put a service-role key there. Set `NEXT_PUBLIC_CONTACT_EMAIL` if you want the footer's contact link enabled.

```powershell
Set-Location frontend
npm install
npm run dev
```

Open `http://localhost:3000`. The public library reads real published Supabase records; it does not contain sample production documents. Sign in at `/admin` with the administrator account created in Supabase Auth.

## DOCX field handling

The processor recognizes `Name of Student(s)`, `Student Name`, `Name`, `Reg. Id`, `Reg ID`, `Registration ID`, `Registration No.`, and `Roll No.` labels with common capitalization and punctuation variations. It looks in document paragraphs, table cells, headers, and footers; it handles labels/values split across Word runs and empty value cells adjacent to a labeled table cell.

Each request downloads the original from private storage to a fresh random temporary directory, edits a working copy, converts it with an isolated LibreOffice profile, returns the PDF with `Cache-Control: no-store`, and removes the temporary directory. Names and registration IDs are not written to analytics records or application logs. The original upload is not modified.

DOCX text boxes, floating shapes, and some other DrawingML/embedded-object text are not edited by `python-docx`. Complex fields or unusual run-level formatting may need an administrator to adjust the template. LibreOffice may render a DOCX differently from Microsoft Word, so administrators should test representative files and inspect generated PDFs before publishing. Zyphr rejects generation when it cannot find a supported student-detail field instead of silently returning an unpersonalized PDF.

## Tests

Run the document-processor tests from the backend directory:

```powershell
.\.venv\Scripts\python.exe -m pytest
```

The tests cover multiple pages, existing and blank details, label variants, run-split text, table values, headers/footers, source-file preservation, and documents without recognized fields. PDF conversion itself requires LibreOffice and should also be smoke-tested in the deployment container with representative school templates.

## Deployment

### Frontend on Vercel

Create a Vercel project with `frontend/` as the project root. Configure:

- `BACKEND_API_URL` — the deployed FastAPI service URL.
- `NEXT_PUBLIC_BACKEND_API_URL` — the same public FastAPI service URL, used by the browser for large DOCX uploads and PDF generation.
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon/public key.
- `NEXT_PUBLIC_CONTACT_EMAIL` — optional administrator contact address.

The Next.js API routes proxy public reads and small authenticated management requests to FastAPI, so the backend can remain a separate container service. Large DOCX uploads and PDF generation go directly from the browser to the separately hosted FastAPI service to avoid Vercel serverless request/response size limits; configure the exact deployed frontend origin(s) in `FRONTEND_ORIGINS`. Do not set any service-role secret as a `NEXT_PUBLIC_*` variable.

### FastAPI and LibreOffice container

The repository includes a Render Blueprint in [`render.yaml`](./render.yaml). After pushing the repository to GitHub, create a Blueprint on Render and select the `Zyphr` repository. Enter the requested Supabase values and administrator UUID from your private local configuration directly into Render's environment-variable form; do not commit them or share the service-role key. Set `FRONTEND_ORIGINS` to the exact Vercel frontend origin after the first frontend deployment, then redeploy the backend.

The Blueprint uses Render's free web-service plan, which may sleep when idle and can make the first request take longer. Choose a paid plan in Render if you need the backend to stay warm.

To build and run the backend locally from the repository root:

```powershell
docker build -t zyphr-backend -f backend\Dockerfile backend
docker run --env-file .env -p 8000:8000 zyphr-backend
```

Deploy the container on a platform that supports Docker, LibreOffice, request timeouts appropriate for file conversion, and temporary writable storage. Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_USER_IDS`, and `FRONTEND_ORIGINS` in the hosting platform's secret/environment configuration. Set `FRONTEND_ORIGINS` to the exact deployed frontend origin(s). The container installs LibreOffice Writer and runs as a non-root user.

The included rate limiter is process-local and intentionally bounded. Before running multiple backend replicas or exposing the service to high-volume traffic, enforce a shared/distributed generation rate limit at the API gateway or with a shared store. Configure platform-level request/body limits as well as `MAX_UPLOAD_BYTES` and `MAX_COVER_BYTES`.

## Operational notes

- Source DOCX uploads are limited by `MAX_UPLOAD_BYTES` (20 MiB by default), inspected for archive expansion by `MAX_DOCX_UNCOMPRESSED_BYTES` (100 MiB by default), and optional covers are limited by `MAX_COVER_BYTES` (5 MiB by default).
- Generation requests are validated on both the frontend and backend. Unpublished or missing documents cannot be generated.
- PDFs are streamed from the API response, are not persistently stored, and temporary generation files are deleted after each request.
- Generation statistics count successful conversions only and contain no student-identifying data.
- The administrator may publish/unpublish, edit metadata, filter the list, and delete documents. Deletion removes the database entry and then removes its stored files; if storage cleanup fails, the API reports that administrator cleanup is needed.
- Configure the contact details and review the Privacy and Terms pages for your deployment before public launch.
