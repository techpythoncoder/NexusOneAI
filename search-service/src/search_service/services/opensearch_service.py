"""
OpenSearch integration — indexes documents from all services.
Hybrid search: BM25 keyword (fuzzy/prefix) + k-NN semantic (BGE-M3 via ai-service).
Org isolation via `organization_id.keyword` filter on every query.
"""

import logging
import re

import httpx
from opensearchpy._async.client import AsyncOpenSearch

from search_service.core.config import settings

_ALL_RESOURCE_TYPES = ["projects", "tasks", "documents", "members", "comments"]

# ── Rule-based intent parsing tables ─────────────────────────────────────────

_TYPE_KEYWORDS: dict[str, str] = {
    "task": "tasks", "tasks": "tasks",
    "project": "projects", "projects": "projects",
    "member": "members", "members": "members",
    "user": "members", "users": "members",
    "people": "members", "person": "members", "team": "members",
    "document": "documents", "documents": "documents",
    "doc": "documents", "docs": "documents",
    "wiki": "documents", "note": "documents", "notes": "documents",
    "comment": "comments", "comments": "comments",
    "notification": "notifications", "notifications": "notifications",
    "alert": "notifications", "alerts": "notifications",
    "inbox": "notifications",
}

_STATUS_MAP: dict[str, str] = {
    "todo": "todo", "to-do": "todo",
    "in_progress": "in_progress", "in-progress": "in_progress",
    "inprogress": "in_progress", "ongoing": "in_progress",
    "in_review": "in_review", "in-review": "in_review", "review": "in_review",
    "done": "done", "completed": "done", "finished": "done", "closed": "done",
}

_PRIORITY_MAP: dict[str, str] = {
    "low": "low",
    "medium": "medium", "normal": "medium",
    "high": "high",
    "critical": "critical", "urgent": "critical",
}

_ROLE_MAP: dict[str, str] = {
    "owner": "owner", "owners": "owner",
    "admin": "admin", "admins": "admin", "administrator": "admin",
    "member": "member",
}

# Common question/filler words that pollute keyword and semantic search
_STOPWORDS = frozenset({
    # Question words
    "what", "whats", "who", "whos", "where", "when", "why", "how",
    # Verbs of being
    "is", "are", "was", "were", "be", "been", "being",
    # Articles / prepositions
    "the", "a", "an", "of", "in", "on", "at", "to", "for",
    "if", "with", "by", "from", "and", "or", "but",
    # Action / command words (user intent, not content)
    "can", "could", "do", "does", "did", "has", "have", "had",
    "will", "would", "should", "shall",
    "tell", "me", "my", "find", "show", "get", "give", "search",
    "list", "fetch", "display", "return", "retrieve", "bring",
    # Pronouns / generic nouns that add no search value
    "their", "its", "our", "your", "all", "any", "every",
    "whose", "which", "this", "that", "these", "those",
    "task", "tasks", "project", "projects",
    # Filter/intent words — extracted as structured filters, not search text
    "you", "status", "priority", "role", "whose",
    # Temporal / vague qualifiers that add no search value
    "recent", "latest", "newest", "oldest", "current", "new", "old",
    "today", "yesterday", "now", "soon", "last", "first",
    "active", "inactive", "open", "existing", "available",
    # Inclusion/relationship words that appear in "X with/without Y" queries
    "included", "include", "includes", "including", "contain", "contains",
    "containing", "having", "has", "have", "linked", "associated", "attached",
    "related", "belonging", "belong", "belongs",
})

_EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")


def _clean_query(raw: str) -> str:
    """
    Extract a clean, searchable term from a raw user query.

    - If the query contains an email address, return just that email — it is
      the most specific signal and avoids noise words like "what is the role if".
    - Otherwise, strip common English question/filler words so keyword and
      semantic search focus on meaningful terms only.
    """
    email_match = _EMAIL_RE.search(raw)
    if email_match:
        return email_match.group(0)

    tokens = [t for t in raw.lower().split() if t not in _STOPWORDS and len(t) > 1]
    return " ".join(tokens) if tokens else raw

logger = logging.getLogger(__name__)

_client: AsyncOpenSearch | None = None
_knn_indices_ready: set[str] = set()  # indices already provisioned with knn mapping
_knn_cache_loaded: bool = False  # whether we've loaded existing knn indices from OpenSearch

_SYSTEM_HEADERS = {
    "X-User-ID": "00000000-0000-0000-0000-000000000000",
    "X-Org-ID": "00000000-0000-0000-0000-000000000000",
    "X-User-Role": "system",
    "X-User-Email": "system@nexus.internal",
}


def get_client() -> AsyncOpenSearch:
    global _client
    if _client is None:
        _client = AsyncOpenSearch(
            hosts=[{"host": settings.OPENSEARCH_HOST, "port": settings.OPENSEARCH_PORT}],
            http_auth=(settings.OPENSEARCH_USER, settings.OPENSEARCH_PASSWORD),
            use_ssl=False,
            verify_certs=False,
        )
    return _client


def index_name(resource_type: str) -> str:
    return f"{settings.OPENSEARCH_INDEX_PREFIX}_{resource_type}"


# ── Index provisioning ────────────────────────────────────────────────────────

async def _load_knn_indices() -> None:
    """Populate _knn_indices_ready from OpenSearch on first call (survives restarts)."""
    global _knn_cache_loaded
    if _knn_cache_loaded:
        return
    _knn_cache_loaded = True
    client = get_client()
    try:
        settings_resp = await client.indices.get_settings(index=f"{settings.OPENSEARCH_INDEX_PREFIX}_*")
        for idx_name, idx_cfg in settings_resp.items():
            knn_enabled = (
                idx_cfg.get("settings", {})
                .get("index", {})
                .get("knn", "false")
            )
            if str(knn_enabled).lower() == "true":
                _knn_indices_ready.add(idx_name)
        logger.info("knn-ready indices loaded from OpenSearch: %s", _knn_indices_ready)
    except Exception:
        logger.debug("Could not load knn index list from OpenSearch (non-fatal)")


async def _ensure_knn_index(idx: str) -> None:
    """Create index with knn_vector mapping if it does not exist yet."""
    if idx in _knn_indices_ready:
        return
    client = get_client()
    try:
        exists = await client.indices.exists(index=idx)
        if not exists:
            await client.indices.create(
                index=idx,
                body={
                    "settings": {"index": {"knn": True}},
                    "mappings": {
                        "properties": {
                            "embedding": {
                                "type": "knn_vector",
                                "dimension": settings.EMBEDDING_DIMENSION,
                            }
                        }
                    },
                },
            )
            logger.info("Created knn-enabled index: %s", idx)
        else:
            # Index exists but may predate knn support — add mapping, ignore conflicts
            try:
                await client.indices.put_mapping(
                    index=idx,
                    body={
                        "properties": {
                            "embedding": {
                                "type": "knn_vector",
                                "dimension": settings.EMBEDDING_DIMENSION,
                            }
                        }
                    },
                )
            except Exception:
                pass  # already has correct mapping or type conflict (safe to ignore)
    except Exception:
        logger.warning("Could not provision knn mapping for index %s", idx)
    finally:
        _knn_indices_ready.add(idx)


# ── Intent parsing ────────────────────────────────────────────────────────────

# Negation markers that signal "X without Y" queries
_NEGATION_WORDS = frozenset({
    "no", "not", "without", "none", "zero", "empty",
    "missing", "lacking", "excluded", "exclude",
})

def _rule_parse_intent(raw: str) -> dict | None:
    """
    Fast, deterministic intent parser — no network call, no LLM.

    Scans tokens for resource-type keywords, status/priority/role filters,
    and negation patterns ("projects with no tasks").
    Returns None for plain text queries (falls through to hybrid search).
    """
    lower = raw.lower()
    tokens = re.split(r"[\s,?!]+", lower)

    found_types: list[str] = []
    filters: dict[str, str] = {}
    text_tokens: list[str] = []
    seen_types: list[str] = []   # ordered as they appear in the query
    negation_seen = False

    for tok in tokens:
        tok = tok.strip(".'\"")
        if not tok or len(tok) < 2:
            continue
        if tok in _NEGATION_WORDS:
            negation_seen = True
        # Check type keywords with prefix / spelling tolerance
        matched_type = None
        if tok in _TYPE_KEYWORDS:
            matched_type = _TYPE_KEYWORDS[tok]
        elif tok.startswith("notif") or tok.startswith("alert") or tok == "inbox":
            matched_type = "notifications"
        elif tok.startswith("proj"):
            matched_type = "projects"
        elif tok.startswith("task"):
            matched_type = "tasks"
        elif tok.startswith("doc") or tok.startswith("wiki") or tok.startswith("note"):
            matched_type = "documents"
        elif tok.startswith("comm"):
            matched_type = "comments"
        elif tok.startswith("memb") or tok.startswith("user") or tok.startswith("peop") or tok.startswith("pers") or tok == "team":
            matched_type = "members"

        if matched_type:
            seen_types.append(matched_type)
            if matched_type not in found_types:
                found_types.append(matched_type)
        elif tok in _STATUS_MAP:
            filters["status"] = _STATUS_MAP[tok]
        elif tok in _PRIORITY_MAP:
            filters["priority"] = _PRIORITY_MAP[tok]
        elif tok in _ROLE_MAP:
            filters["role"] = _ROLE_MAP[tok]
        elif tok not in _STOPWORDS:
            text_tokens.append(tok)

    if not found_types and not filters:
        return None

    # Detect "projects with no tasks" / "tasks without members" pattern:
    # Two distinct resource types appeared AND a negation word is present.
    # The first type is what to return; the second is what should be absent.
    exclude_type: str | None = None
    if negation_seen and len(set(seen_types)) >= 2:
        # e.g. ["projects", "tasks"] → return projects that have no tasks
        unique = list(dict.fromkeys(seen_types))  # preserve order, dedupe
        found_types = [unique[0]]
        exclude_type = unique[1]

    # status/priority only apply to tasks; role only to members
    if "status" in filters and found_types and "tasks" not in found_types:
        del filters["status"]
    if "priority" in filters and found_types and "tasks" not in found_types:
        del filters["priority"]
    if "role" in filters and found_types and "members" not in found_types:
        del filters["role"]

    # Auto-infer type from filter when the user didn't name it
    if not found_types:
        if "role" in filters:
            found_types = ["members"]
        elif "status" in filters or "priority" in filters:
            found_types = ["tasks"]

    result = {"types": found_types, "filters": filters, "text": " ".join(text_tokens)}
    if exclude_type:
        result["exclude_type"] = exclude_type
    return result


def _text_for_embedding(body: dict) -> str:
    """Build a single text string from document fields for embedding."""
    parts = []
    for key in ("title", "name", "description", "content", "tags"):
        val = body.get(key)
        if isinstance(val, str) and val:
            # Truncate long content to keep embedding request reasonable
            parts.append(val[:1500] if key == "content" else val)
        elif isinstance(val, list):
            parts.append(" ".join(str(v) for v in val))
    return " ".join(parts).strip()


async def _get_embedding(text: str) -> list[float]:
    """Call ai-service BGE-M3 embedding endpoint. Returns [] when unavailable."""
    if not text:
        return []
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{settings.AI_SERVICE_URL}/api/v1/ai/embeddings",
                json={"texts": [text]},
                headers=_SYSTEM_HEADERS,
            )
            resp.raise_for_status()
            vec: list[float] = resp.json().get("embeddings", [[]])[0]
            # Zero vector = HuggingFace key not configured (dev mode)
            if vec and any(v != 0.0 for v in vec):
                return vec
    except Exception:
        logger.debug("Embedding unavailable (ai-service unreachable or HF key not set)")
    return []


def _has_vector(vec: list[float]) -> bool:
    return bool(vec) and any(v != 0.0 for v in vec)


# ── Public API ────────────────────────────────────────────────────────────────

async def index_document(resource_type: str, doc_id: str, body: dict) -> None:
    client = get_client()
    idx = index_name(resource_type)

    # Ensure index has knn_vector mapping before first write
    await _ensure_knn_index(idx)

    # Generate and attach semantic embedding
    text = _text_for_embedding(body)
    if text:
        vec = await _get_embedding(text)
        if _has_vector(vec):
            body = {**body, "embedding": vec}

    await client.index(index=idx, id=doc_id, body=body, refresh=True)


async def delete_document(resource_type: str, doc_id: str) -> None:
    client = get_client()
    try:
        await client.delete(index=index_name(resource_type), id=doc_id, ignore=[404])
    except Exception:
        logger.exception("Failed to delete document from index")


def _rrf_merge(
    keyword_hits: list[dict],
    knn_hits: list[dict],
    limit: int,
    k: int = 60,
) -> list[dict]:
    """
    Reciprocal Rank Fusion: combines two ranked lists into one.
    Score = 1/(k + rank_keyword) + 1/(k + rank_knn).
    Docs that appear in both lists score highest.
    """
    scores: dict[str, float] = {}
    docs: dict[str, dict] = {}

    for rank, hit in enumerate(keyword_hits, start=1):
        doc_id = hit["_id"]
        scores[doc_id] = scores.get(doc_id, 0.0) + 1.0 / (k + rank)
        docs[doc_id] = hit

    for rank, hit in enumerate(knn_hits, start=1):
        doc_id = hit["_id"]
        scores[doc_id] = scores.get(doc_id, 0.0) + 1.0 / (k + rank)
        if doc_id not in docs:
            docs[doc_id] = hit

    ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    return [
        {**docs[doc_id], "_score": rrf_score}
        for doc_id, rrf_score in ranked[:limit]
    ]


def _fmt_hit(h: dict, prefix: str) -> dict:
    return {
        "id": h["_id"],
        "type": h["_index"].replace(prefix, "") if "_index" in h else "unknown",
        "score": round(h.get("_score") or 0.0, 6),
        "source": h.get("_source", {}),
        "highlights": h.get("highlight", {}),
    }


async def _fetch_notifications(user_id: str, org_id: str, skip: int, limit: int) -> dict:
    """Proxy to notification service — returns results in standard search format."""
    page = skip // limit + 1
    # Try multiple hostnames to ensure resolution across different docker network setups
    hosts = [
        "http://notification-service:8009",
        "http://notification-service-notification-service-1:8009"
    ]
    data = None
    for host in hosts:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(
                    f"{host}/api/v1/notifications/",
                    params={"page": page, "page_size": limit},
                    headers={
                        "X-User-ID": user_id,
                        "X-Org-ID": org_id,
                        "X-User-Role": "member",
                        "X-User-Email": "search@nexus.internal",
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                break
        except Exception:
            continue

    if not data:
        logger.error("Notification service proxy failed for all hosts")
        return {"total": 0, "semantic": False, "intent": {"types": ["notifications"], "filters": {}, "text": ""}, "results": []}

    results = [
        {
            "id": item["id"],
            "type": "notifications",
            "score": 1.0,
            "source": {
                "title": item.get("title", ""),
                "body": item.get("body", ""),
                "notification_type": item.get("notification_type", ""),
                "is_read": item.get("is_read", False),
                "action_url": item.get("action_url"),
                "created_at": item.get("created_at"),
                "organization_id": org_id,
            },
            "highlights": {},
        }
        for item in data.get("items", [])
    ]
    return {"total": data.get("total", 0), "semantic": False, "intent": {"types": ["notifications"], "filters": {}, "text": ""}, "results": results}


async def search(
    query: str,
    org_id: str,
    user_id: str = "",
    resource_types: list[str] | None = None,
    skip: int = 0,
    limit: int = 20,
) -> dict:
    """
    Natural-language-aware search with four modes:

    1. NOTIFICATIONS — proxied live from notification service (user-specific)
    2. STRUCTURED — rule-parsed type + field filters → OpenSearch filter query
    3. EMAIL — exact prefix match, no fuzzy or semantic noise
    4. HYBRID keyword (BM25) + semantic (k-NN/RRF) — for free-text queries
    """
    await _load_knn_indices()

    client = get_client()
    params = {"ignore_unavailable": "true", "allow_no_indices": "true"}
    prefix = f"{settings.OPENSEARCH_INDEX_PREFIX}_"

    # ── Step 1: Rule-based intent parsing for multi-word natural language queries
    intent: dict | None = None
    if len(query.split()) >= 2:
        intent = _rule_parse_intent(query)

    # ── Step 1b: Notification queries — always proxy to notification service ──
    if intent and intent.get("types") == ["notifications"]:
        return await _fetch_notifications(user_id, org_id, skip, limit)

    # ── Step 2: Route based on intent ─────────────────────────────────────────
    has_intent = intent and (intent.get("types") or intent.get("filters"))

    if has_intent:
        struct_filters = intent["filters"]

        # Auto-infer types from filter keys when Groq didn't specify them
        ai_types = intent["types"] or []
        if not ai_types:
            if "role" in struct_filters:
                ai_types = ["members"]
            elif any(f in struct_filters for f in ("status", "priority")):
                ai_types = ["tasks"]

        active_types = ai_types if ai_types else (resource_types or _ALL_RESOURCE_TYPES)

        # Strip stopwords from the intent text (Groq sometimes leaves question words)
        text_query = _clean_query(intent.get("text", "").strip())
        logger.info("AI intent: types=%s filters=%s text=%r", active_types, struct_filters, text_query)
    else:
        active_types = resource_types or _ALL_RESOURCE_TYPES
        struct_filters = {}
        text_query = _clean_query(query)

    all_indices = [index_name(rt) for rt in active_types]
    knn_indices = [idx for idx in all_indices if idx in _knn_indices_ready]

    # Build base filter (org isolation + any structured field filters)
    base_filters: list[dict] = [{"term": {"organization_id.keyword": org_id}}]
    for field, val in struct_filters.items():
        base_filters.append({"term": {field: val}})

    # ── Step 3a: Cross-index exclusion ("projects with no tasks") ────────────
    exclude_type = (intent or {}).get("exclude_type")
    if exclude_type and not text_query:
        exclude_idx = index_name(exclude_type)
        # Determine which field on the excluded resource links back to the primary
        link_field = {"tasks": "project_id", "members": "project_id", "comments": "task_id"}.get(exclude_type)
        if link_field:
            try:
                # 1. Collect all IDs of primary resources that ARE referenced
                agg_res = await client.search(
                    index=exclude_idx,
                    body={
                        "size": 0,
                        "query": {"term": {"organization_id.keyword": org_id}},
                        "aggs": {"linked": {"terms": {"field": f"{link_field}.keyword", "size": 10000}}},
                    },
                    params=params,
                )
                linked_ids = [b["key"] for b in agg_res["aggregations"]["linked"]["buckets"]]

                # 2. Return primary resources whose _id is NOT in that set
                must_not = [{"ids": {"values": linked_ids}}] if linked_ids else []
                res = await client.search(
                    index=",".join(all_indices),
                    body={
                        "from": skip, "size": limit,
                        "query": {"bool": {"filter": base_filters, "must_not": must_not}},
                    },
                    params=params,
                )
                hits = res["hits"]["hits"]
                return {
                    "total": res["hits"]["total"]["value"],
                    "semantic": False,
                    "intent": intent,
                    "results": [_fmt_hit(h, prefix) for h in hits],
                }
            except Exception:
                logger.exception("Cross-index exclusion query failed")

    # ── Step 3b: Pure structured filter query (no free text) ─────────────────
    if not text_query:
        try:
            res = await client.search(
                index=",".join(all_indices),
                body={
                    "from": skip, "size": limit,
                    "query": {"bool": {"filter": base_filters}},
                },
                params=params,
            )
            hits = res["hits"]["hits"]
            return {
                "total": res["hits"]["total"]["value"],
                "semantic": False,
                "intent": intent,
                "results": [_fmt_hit(h, prefix) for h in hits],
            }
        except Exception:
            logger.exception("Structured filter search failed")
            return {"total": 0, "semantic": False, "intent": intent, "results": []}

    # ── Step 3b: Email query — exact prefix only ──────────────────────────────
    is_email_query = "@" in text_query
    if is_email_query:
        kw_should = [
            {"prefix": {"email.keyword": {"value": text_query.lower(), "boost": 6}}},
            {"prefix": {"author_email.keyword": {"value": text_query.lower(), "boost": 3}}},
        ]
        try:
            res = await client.search(
                index=",".join(all_indices),
                body={
                    "from": skip, "size": limit,
                    "query": {"bool": {
                        "must": [{"bool": {"should": kw_should, "minimum_should_match": 1}}],
                        "filter": base_filters,
                    }},
                },
                params=params,
            )
            hits = res["hits"]["hits"]
            return {
                "total": res["hits"]["total"]["value"],
                "semantic": False,
                "intent": intent,
                "results": [_fmt_hit(h, prefix) for h in hits],
            }
        except Exception:
            logger.exception("Email search failed")
            return {"total": 0, "semantic": False, "intent": intent, "results": []}

    # ── Step 3c: Hybrid keyword + semantic (RRF) ──────────────────────────────
    query_vec: list[float] = await _get_embedding(text_query)
    use_semantic = _has_vector(query_vec) and bool(knn_indices)

    kw_should = [
        {
            "multi_match": {
                "query": text_query,
                "fields": ["title^3", "name^3", "description", "content", "tags", "status^2"],
                "type": "best_fields",
                "fuzziness": "AUTO",
            }
        },
        {"prefix": {"email.keyword": {"value": text_query.lower(), "boost": 4}}},
        {"prefix": {"author_email.keyword": {"value": text_query.lower(), "boost": 2}}},
        {"term": {"role": {"value": text_query.lower(), "boost": 2}}},
    ]

    keyword_hits: list[dict] = []
    try:
        res = await client.search(
            index=",".join(all_indices),
            body={
                "size": limit * 2,
                "query": {"bool": {
                    "must": [{"bool": {"should": kw_should, "minimum_should_match": 1}}],
                    "filter": base_filters,
                }},
                "highlight": {"fields": {"title": {}, "name": {}, "description": {}, "content": {}}},
            },
            params=params,
        )
        keyword_hits = res["hits"]["hits"]
    except Exception:
        logger.exception("Keyword search failed. query=%s", text_query)

    knn_hits: list[dict] = []
    if use_semantic:
        try:
            res = await client.search(
                index=",".join(knn_indices),
                body={
                    "size": limit * 2,
                    "query": {"bool": {
                        "must": [{"knn": {"embedding": {"vector": query_vec, "k": limit * 2}}}],
                        "filter": base_filters,
                    }},
                },
                params=params,
            )
            knn_hits = res["hits"]["hits"]
        except Exception:
            logger.warning("knn search failed (non-fatal). query=%s", text_query)

    merged = _rrf_merge(keyword_hits, knn_hits, limit=limit + skip) if (use_semantic and knn_hits) else keyword_hits[: limit + skip]
    page = merged[skip: skip + limit]

    return {
        "total": len(merged),
        "semantic": use_semantic and bool(knn_hits),
        "intent": intent,
        "results": [_fmt_hit(h, prefix) for h in page],
    }
