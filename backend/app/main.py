import asyncio
import io
import logging
import re
import shutil
import subprocess
import tempfile
import time
import zipfile
from collections import OrderedDict, deque
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4
from zipfile import BadZipFile, ZipFile

import httpx
from docx import Document
from docx.opc.exceptions import PackageNotFoundError
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from lxml.etree import XMLSyntaxError
from pydantic import BaseModel, Field, field_validator

from .docx_processor import convert_docx_to_pdf, personalize_docx
from .settings import settings

logger = logging.getLogger("zyphr")


class ServiceError(Exception):
    pass


class GenerationRequest(BaseModel):
    document_id: UUID
    full_name: str = Field(min_length=1, max_length=120)
    registration_id: str = Field(min_length=1, max_length=64)

    @field_validator("full_name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        value = value.strip()
        if not value or not re.fullmatch(r"[\wÀ-ž][\wÀ-ž .,'’\-]{0,119}", value):
            raise ValueError("Enter a valid full name.")
        return value

    @field_validator("registration_id")
    @classmethod
    def validate_registration_id(cls, value: str) -> str:
        value = value.strip()
        if not value or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9 ./_-]{0,63}", value):
            raise ValueError("Enter a valid registration ID.")
        return value


class DocumentUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    subject: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=2000)
    experiment_count: int | None = Field(default=None, ge=0, le=1000)
    tags: list[str] | None = Field(default=None, max_length=20)
    published: bool | None = None


app = FastAPI(title="Zyphr document service", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.frontend_origins),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

generation_requests: OrderedDict[str, deque[float]] = OrderedDict()


def _ensure_supabase_configured() -> None:
    if not settings.supabase_url or not settings.service_role_key:
        raise HTTPException(
            status_code=503,
            detail="Document storage is not configured. Please try again later.",
        )


def _service_headers(extra: dict[str, str] | None = None) -> dict[str, str]:
    _ensure_supabase_configured()
    headers = {
        "apikey": settings.service_role_key,
        "Authorization": f"Bearer {settings.service_role_key}",
    }
    if extra:
        headers.update(extra)
    return headers


async def _supabase_request(
    method: str,
    path: str,
    *,
    params: dict[str, str] | None = None,
    json: Any = None,
    content: bytes | None = None,
    headers: dict[str, str] | None = None,
) -> httpx.Response:
    _ensure_supabase_configured()
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.request(
                method,
                f"{settings.supabase_url}{path}",
                params=params,
                json=json,
                content=content,
                headers=headers or _service_headers(),
            )
    except httpx.HTTPError as exc:
        raise ServiceError("Supabase could not be reached.") from exc
    if response.is_error:
        raise ServiceError("The document service could not complete the request.")
    return response


async def _load_document(document_id: UUID, *, published_only: bool = False) -> dict[str, Any]:
    params = {"id": f"eq.{document_id}", "select": "*", "limit": "1"}
    if published_only:
        params["published"] = "eq.true"
    response = await _supabase_request(
        "GET", "/rest/v1/documents", params=params
    )
    documents = response.json()
    if not documents:
        raise HTTPException(status_code=404, detail="Practical not found.")
    return documents[0]


async def _require_admin(authorization: str | None = Header(default=None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Sign in to continue.")
    _ensure_supabase_configured()
    token = authorization.removeprefix("Bearer ").strip()
    if not settings.supabase_anon_key:
        raise HTTPException(status_code=503, detail="Authentication is not configured.")
    if not token or not settings.admin_user_ids:
        raise HTTPException(status_code=403, detail="Administrator access is not enabled.")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                f"{settings.supabase_url}/auth/v1/user",
                headers={
                    "apikey": settings.supabase_anon_key,
                    "Authorization": f"Bearer {token}",
                },
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="Authentication is temporarily unavailable.") from exc
    if response.status_code != 200:
        raise HTTPException(status_code=401, detail="Your session is invalid or expired.")
    user_id = response.json().get("id")
    if user_id not in settings.admin_user_ids:
        raise HTTPException(status_code=403, detail="Administrator access is required.")
    return user_id


def _public_document(document: dict[str, Any]) -> dict[str, Any]:
    cover_path = document.get("cover_image_path")
    document["cover_image_url"] = (
        f"{settings.supabase_url}/storage/v1/object/public/"
        f"{settings.covers_bucket}/{cover_path}"
        if cover_path
        else None
    )
    return document


def _admin_document(document: dict[str, Any]) -> dict[str, Any]:
    fields = (
        "id",
        "title",
        "subject",
        "description",
        "cover_image_path",
        "experiment_count",
        "tags",
        "published",
        "generation_count",
        "created_at",
        "updated_at",
    )
    return _public_document({key: document.get(key) for key in fields})


def _filter_text(value: str, label: str) -> str:
    if len(value) > 100 or not re.fullmatch(r"[\wÀ-ž .'-]+", value):
        raise HTTPException(status_code=400, detail=f"Invalid {label} filter.")
    return value.replace("_", r"\_")


def _validate_docx_archive(content: bytes) -> None:
    try:
        with ZipFile(io.BytesIO(content)) as archive:
            members = archive.infolist()
            required = {"[Content_Types].xml", "word/document.xml"}
            if (
                len(members) > 10000
                or not required.issubset({member.filename for member in members})
                or sum(member.file_size for member in members)
                > settings.max_docx_uncompressed_bytes
            ):
                raise ValueError
            for member in members:
                if member.file_size > 0 and (
                    member.compress_size == 0
                    or member.file_size / member.compress_size > 1000
                ):
                    raise ValueError
    except (BadZipFile, OSError, ValueError) as exc:
        raise HTTPException(
            status_code=422,
            detail="The selected DOCX file is corrupt, unreadable, or too large to process.",
        ) from exc


async def _upload_storage(bucket: str, path: str, data: bytes, content_type: str) -> None:
    await _supabase_request(
        "POST",
        f"/storage/v1/object/{bucket}/{path}",
        content=data,
        headers=_service_headers(
            {
                "Content-Type": content_type,
                "x-upsert": "false",
            }
        ),
    )


async def _delete_storage(bucket: str, paths: list[str]) -> None:
    if not paths:
        return
    await _supabase_request(
        "DELETE",
        f"/storage/v1/object/{bucket}",
        json={"prefixes": paths},
    )


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/practicals")
async def list_practicals(
    search: str | None = None,
    subject: str | None = None,
    sort: str = "newest",
    limit: int = 60,
    offset: int = 0,
) -> dict[str, Any]:
    if sort not in {"newest", "title"}:
        raise HTTPException(status_code=400, detail="Unsupported sort order.")
    if not 1 <= limit <= 100 or not 0 <= offset <= 10000:
        raise HTTPException(status_code=400, detail="Invalid pagination values.")
    params = {
        "select": "id,title,subject,description,cover_image_path,experiment_count,tags,created_at",
        "published": "eq.true",
        "order": "title.asc" if sort == "title" else "created_at.desc",
        "limit": str(limit + 1),
        "offset": str(offset),
    }
    if subject:
        params["subject"] = f"eq.{_filter_text(subject, 'subject')}"
    if search:
        safe_search = _filter_text(search, "search")
        params["or"] = f"(title.ilike.*{safe_search}*,subject.ilike.*{safe_search}*)"
    response = await _supabase_request("GET", "/rest/v1/documents", params=params)
    results = response.json()
    return {
        "items": [_public_document(item) for item in results[:limit]],
        "has_more": len(results) > limit,
    }


@app.get("/api/practicals/{document_id}")
async def get_practical(document_id: UUID) -> dict[str, Any]:
    document = await _load_document(document_id, published_only=True)
    fields = {
        key: document.get(key)
        for key in (
            "id",
            "title",
            "subject",
            "description",
            "cover_image_path",
            "experiment_count",
            "tags",
            "created_at",
        )
    }
    return _public_document(fields)


def _check_generation_rate_limit(client_ip: str) -> None:
    now = time.monotonic()
    window_start = now - settings.generation_rate_window_seconds
    attempts = generation_requests.get(client_ip, deque())
    while attempts and attempts[0] < window_start:
        attempts.popleft()
    if len(attempts) >= settings.generation_rate_limit:
        raise HTTPException(
            status_code=429,
            detail="Too many PDF requests. Please wait before trying again.",
        )
    attempts.append(now)
    generation_requests[client_ip] = attempts
    generation_requests.move_to_end(client_ip)
    while len(generation_requests) > 10000:
        generation_requests.popitem(last=False)


@app.post("/api/generate")
async def generate_pdf(payload: GenerationRequest, request: Request) -> Response:
    client_ip = request.client.host if request.client else "unknown"
    _check_generation_rate_limit(client_ip)
    document = await _load_document(payload.document_id, published_only=True)

    try:
        source_response = await _supabase_request(
            "GET",
            f"/storage/v1/object/{settings.docs_bucket}/{document['original_file_path']}",
        )
    except ServiceError as exc:
        raise HTTPException(status_code=503, detail="The practical file is temporarily unavailable.") from exc

    temporary_directory = Path(tempfile.mkdtemp(prefix=f"zyphr-{uuid4().hex}-"))
    try:
        source_path = temporary_directory / "source.docx"
        working_path = temporary_directory / "personalized.docx"
        source_path.write_bytes(source_response.content)
        try:
            counts = personalize_docx(
                source_path,
                working_path,
                payload.full_name,
                payload.registration_id,
            )
        except (
            ValueError,
            zipfile.BadZipFile,
            OSError,
            PackageNotFoundError,
            XMLSyntaxError,
        ) as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        try:
            pdf_path = await asyncio.to_thread(
                convert_docx_to_pdf,
                working_path,
                temporary_directory,
                settings.libreoffice_timeout_seconds,
            )
        except (subprocess.TimeoutExpired, RuntimeError, OSError) as exc:
            raise HTTPException(
                status_code=422,
                detail="PDF conversion failed. Please try again or contact the administrator.",
            ) from exc

        pdf_content = pdf_path.read_bytes()
        try:
            await _supabase_request(
                "POST",
                "/rest/v1/rpc/increment_generation_count",
                json={"document_id": str(payload.document_id)},
            )
        except ServiceError as exc:
            raise HTTPException(
                status_code=503,
                detail="Your PDF was created, but the service could not record completion. Please retry.",
            ) from exc
        filename = f"zyphr-practical-{payload.document_id}.pdf"
        return Response(
            content=pdf_content,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Cache-Control": "no-store",
                "X-Document-Fields-Updated": str(sum(counts.values())),
            },
        )
    finally:
        shutil.rmtree(temporary_directory, ignore_errors=True)


@app.get("/api/admin/documents")
async def admin_list_documents(
    _: str = Depends(_require_admin),
    search: str | None = None,
    subject: str | None = None,
    published: bool | None = None,
    limit: int = 100,
    offset: int = 0,
) -> dict[str, Any]:
    if not 1 <= limit <= 100 or not 0 <= offset <= 1000000:
        raise HTTPException(status_code=400, detail="Invalid pagination values.")
    params = {
        "select": "*",
        "order": "created_at.desc",
        "limit": str(limit + 1),
        "offset": str(offset),
    }
    if subject:
        params["subject"] = f"eq.{_filter_text(subject, 'subject')}"
    if published is not None:
        params["published"] = f"eq.{str(published).lower()}"
    if search:
        safe_search = _filter_text(search, "search")
        params["or"] = f"(title.ilike.*{safe_search}*,subject.ilike.*{safe_search}*)"
    response = await _supabase_request("GET", "/rest/v1/documents", params=params)
    results = response.json()
    return {
        "items": [_admin_document(item) for item in results[:limit]],
        "has_more": len(results) > limit,
    }


@app.post("/api/admin/documents", status_code=201)
async def create_document(
    _: str = Depends(_require_admin),
    file: UploadFile = File(...),
    title: str = Form(..., min_length=1, max_length=160),
    subject: str = Form(..., min_length=1, max_length=100),
    description: str = Form(..., min_length=1, max_length=2000),
    experiment_count: int | None = Form(default=None, ge=0, le=1000),
    tags: str = Form(default=""),
    published: bool = Form(default=False),
    cover_image: UploadFile | None = File(default=None),
) -> dict[str, Any]:
    title, subject = title.strip(), subject.strip()
    description = description.strip()
    if not title or not subject or not description:
        raise HTTPException(
            status_code=422,
            detail="Title, subject, and description are required.",
        )
    if not file.filename or Path(file.filename).suffix.lower() != ".docx":
        raise HTTPException(status_code=415, detail="Upload a DOCX file.")
    if file.content_type not in {
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/octet-stream",
        None,
    }:
        raise HTTPException(status_code=415, detail="Upload a valid DOCX file.")
    content = await file.read(settings.max_upload_bytes + 1)
    if len(content) > settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail="The DOCX exceeds the upload size limit.")
    _validate_docx_archive(content)
    try:
        Document(io.BytesIO(content))
    except (ValueError, BadZipFile, KeyError, PackageNotFoundError, XMLSyntaxError) as exc:
        raise HTTPException(status_code=422, detail="The selected DOCX file is corrupt or unreadable.") from exc

    document_id = uuid4()
    storage_path = f"documents/{document_id}.docx"
    cover_path: str | None = None
    cover_content: bytes | None = None
    cover_type: str | None = None
    if cover_image and cover_image.filename:
        cover_content = await cover_image.read(settings.max_cover_bytes + 1)
        if len(cover_content) > settings.max_cover_bytes:
            raise HTTPException(status_code=413, detail="The cover image exceeds the upload size limit.")
        content_types = {
            b"\x89PNG\r\n\x1a\n": ("image/png", "png"),
            b"\xff\xd8\xff": ("image/jpeg", "jpg"),
        }
        image_match = next(
            (details for signature, details in content_types.items() if cover_content.startswith(signature)),
            None,
        )
        if (
            image_match is None
            and cover_content.startswith(b"RIFF")
            and cover_content[8:12] == b"WEBP"
        ):
            image_match = ("image/webp", "webp")
        if not image_match:
            raise HTTPException(status_code=415, detail="Use a PNG, JPEG, or WebP cover image.")
        cover_type, extension = image_match
        cover_path = f"covers/{document_id}.{extension}"

    tags_list = [tag.strip()[:40] for tag in tags.split(",") if tag.strip()][:20]
    try:
        await _upload_storage(
            settings.docs_bucket,
            storage_path,
            content,
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
        if cover_path and cover_content and cover_type:
            await _upload_storage(
                settings.covers_bucket, cover_path, cover_content, cover_type
            )
        response = await _supabase_request(
            "POST",
            "/rest/v1/documents",
            json={
                "id": str(document_id),
                "title": title,
                "subject": subject,
                "description": description,
                "original_file_path": storage_path,
                "cover_image_path": cover_path,
                "experiment_count": experiment_count,
                "tags": tags_list,
                "published": published,
            },
            headers=_service_headers({"Prefer": "return=representation"}),
        )
    except ServiceError as exc:
        cleanup = [storage_path]
        if cover_path:
            cleanup.append(cover_path)
        try:
            await _delete_storage(settings.docs_bucket, [storage_path])
            if cover_path:
                await _delete_storage(settings.covers_bucket, [cover_path])
        except ServiceError:
            logger.exception("Failed to clean up source files after a document upload failure.")
        raise HTTPException(status_code=503, detail="The practical could not be saved. Please try again.") from exc
    result = response.json()[0]
    return _admin_document(result)


@app.patch("/api/admin/documents/{document_id}")
async def update_document(
    document_id: UUID,
    update: DocumentUpdate,
    _: str = Depends(_require_admin),
) -> dict[str, Any]:
    if not update.model_fields_set:
        raise HTTPException(status_code=400, detail="No document changes were provided.")
    values = update.model_dump(exclude_unset=True)
    for key in ("title", "subject"):
        if key in values:
            values[key] = values[key].strip()
            if not values[key]:
                raise HTTPException(status_code=422, detail=f"{key.title()} cannot be blank.")
    for key in ("description", "tags"):
        if key in values and values[key] is not None:
            values[key] = values[key].strip() if key == "description" else [
                tag.strip()[:40] for tag in values[key] if tag.strip()
            ][:20]
    await _load_document(document_id)
    response = await _supabase_request(
        "PATCH",
        "/rest/v1/documents",
        params={"id": f"eq.{document_id}"},
        json=values,
        headers=_service_headers({"Prefer": "return=representation"}),
    )
    return _public_document(response.json()[0])


@app.delete("/api/admin/documents/{document_id}", status_code=204)
async def delete_document(
    document_id: UUID,
    _: str = Depends(_require_admin),
) -> Response:
    document = await _load_document(document_id)
    response = await _supabase_request(
        "DELETE",
        "/rest/v1/documents",
        params={"id": f"eq.{document_id}"},
    )
    if response.status_code not in (200, 204):
        raise HTTPException(status_code=503, detail="The practical could not be deleted.")
    try:
        await _delete_storage(settings.docs_bucket, [document["original_file_path"]])
        if document.get("cover_image_path"):
            await _delete_storage(settings.covers_bucket, [document["cover_image_path"]])
    except ServiceError as exc:
        logger.exception("Document storage cleanup failed during deletion.")
        raise HTTPException(
            status_code=503,
            detail="The practical was removed from the library, but its stored file needs administrator cleanup.",
        ) from exc
    return Response(status_code=204)


@app.get("/api/admin/stats")
async def admin_stats(_: str = Depends(_require_admin)) -> dict[str, int]:
    response = await _supabase_request(
        "POST",
        "/rest/v1/rpc/get_zyphr_dashboard_stats",
    )
    return response.json()
