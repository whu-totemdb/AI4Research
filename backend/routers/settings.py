import json
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from models import AppSetting

router = APIRouter(prefix="/api/settings", tags=["settings"])

SENSITIVE_FRAGMENTS = ("key", "password", "secret")


def _is_sensitive(key: str) -> bool:
    lower = key.lower()
    return any(frag in lower for frag in SENSITIVE_FRAGMENTS)


def _mask(value: str) -> str:
    if len(value) <= 6:
        return "***"
    return value[:3] + "***" + value[-3:]


class SettingBody(BaseModel):
    value: str


class ClassifySettingsBody(BaseModel):
    classify_context_chars: int = 1000
    classify_concurrency: int = 3
    classify_provider_id: str = ""
    folder_gen_prompt: str = "最多3级目录，目录标题要简洁明了，分类要合理且互不重叠，使用中文"


class TranslationSettingsBody(BaseModel):
    translation_enabled: bool = False
    translation_provider_id: str = ""
    translation_prompt: str = "请将以下文本翻译成中文，保持专业术语的准确性："


# --- AI Providers (must be registered BEFORE the /{key} routes) ---

AI_PROVIDERS_KEY = "ai_providers"
AGENT_SERVICES_KEY = "agent_services"


def _default_agent_services() -> list[dict]:
    return [
        {
            "id": "author_exploration",
            "name": "作者探索",
            "enabled": True,
            "enabled_tools": ["searxng_search", "dblp_search", "openalex_search"],
            "tool_priority": {
                "dblp_search": 1,
                "openalex_search": 2,
                "searxng_search": 3,
            },
            "prompt_override": "",
        },
        {
            "id": "metadata_extraction",
            "name": "元数据提取",
            "enabled": True,
            "enabled_tools": ["dblp_search", "openalex_search", "searxng_search", "web_fetch"],
            "tool_priority": {
                "dblp_search": 1,
                "openalex_search": 2,
                "searxng_search": 3,
                "web_fetch": 4,
            },
            "prompt_override": "",
        }
    ]


@router.get("/ai-providers")
async def get_ai_providers(db: AsyncSession = Depends(get_db)):
    setting = await db.get(AppSetting, AI_PROVIDERS_KEY)
    if not setting:
        return []
    try:
        providers = json.loads(setting.value)
    except json.JSONDecodeError:
        return []
    # mask api_key in each provider
    for p in providers:
        if "api_key" in p and p["api_key"]:
            p["api_key"] = _mask(p["api_key"])
    return providers


@router.post("/ai-providers")
async def save_ai_providers(providers: list[dict], db: AsyncSession = Depends(get_db)):
    # If a provider's api_key looks masked, preserve the old value
    existing = await db.get(AppSetting, AI_PROVIDERS_KEY)
    old_providers = {}
    if existing:
        try:
            for p in json.loads(existing.value):
                old_providers[p.get("id")] = p
        except json.JSONDecodeError:
            pass

    for p in providers:
        api_key = p.get("api_key", "")
        if "***" in api_key:
            old = old_providers.get(p.get("id"), {})
            p["api_key"] = old.get("api_key", "")

    raw = json.dumps(providers, ensure_ascii=False)
    if existing:
        existing.value = raw
    else:
        db.add(AppSetting(key=AI_PROVIDERS_KEY, value=raw))
    await db.commit()
    return {"ok": True}


@router.get("/agent-services")
async def get_agent_services(db: AsyncSession = Depends(get_db)):
    defaults = _default_agent_services()
    setting = await db.get(AppSetting, AGENT_SERVICES_KEY)
    if not setting:
        return defaults
    try:
        items = json.loads(setting.value)
        if isinstance(items, list):
            merged = []
            default_map = {d.get("id"): d for d in defaults}
            for item in items:
                if not isinstance(item, dict):
                    continue
                sid = item.get("id")
                base = (default_map.get(sid) or {}).copy()
                base.update(item)
                merged.append(base if base else item)
            return merged or defaults
    except json.JSONDecodeError:
        pass
    return defaults


@router.post("/agent-services")
async def save_agent_services(services: list[dict], db: AsyncSession = Depends(get_db)):
    raw = json.dumps(services, ensure_ascii=False)
    setting = await db.get(AppSetting, AGENT_SERVICES_KEY)
    if setting:
        setting.value = raw
    else:
        db.add(AppSetting(key=AGENT_SERVICES_KEY, value=raw))
    await db.commit()
    return {"ok": True}


# --- Classify settings ---

CLASSIFY_SETTING_KEYS = [
    "classify_context_chars",
    "classify_concurrency",
    "classify_provider_id",
    "folder_gen_prompt",
]

CLASSIFY_DEFAULTS = {
    "classify_context_chars": "1000",
    "classify_concurrency": "3",
    "classify_provider_id": "",
    "folder_gen_prompt": "最多3级目录，目录标题要简洁明了，分类要合理且互不重叠，使用中文",
}


# --- Translation settings ---

TRANSLATION_SETTING_KEYS = [
    "translation_enabled",
    "translation_provider_id",
    "translation_prompt",
]

TRANSLATION_DEFAULTS = {
    "translation_enabled": "false",
    "translation_provider_id": "",
    "translation_prompt": "请将以下文本翻译成中文，保持专业术语的准确性：",
}


@router.get("/translation")
async def get_translation_settings(db: AsyncSession = Depends(get_db)):
    """Get translation settings"""
    result = {}
    for key in TRANSLATION_SETTING_KEYS:
        setting = await db.get(AppSetting, key)
        result[key] = setting.value if setting else TRANSLATION_DEFAULTS[key]
    # Convert boolean field
    result["translation_enabled"] = result["translation_enabled"].lower() == "true"
    return result


@router.put("/translation")
async def save_translation_settings(body: TranslationSettingsBody, db: AsyncSession = Depends(get_db)):
    """Save translation settings"""
    values = {
        "translation_enabled": str(body.translation_enabled).lower(),
        "translation_provider_id": body.translation_provider_id,
        "translation_prompt": body.translation_prompt,
    }
    for key, val in values.items():
        setting = await db.get(AppSetting, key)
        if setting:
            setting.value = val
        else:
            db.add(AppSetting(key=key, value=val))
    await db.commit()
    return {"ok": True}


# --- Classify settings ---
async def get_classify_settings(db: AsyncSession = Depends(get_db)):
    result = {}
    for key in CLASSIFY_SETTING_KEYS:
        setting = await db.get(AppSetting, key)
        result[key] = setting.value if setting else CLASSIFY_DEFAULTS[key]
    # Convert numeric fields
    result["classify_context_chars"] = int(result["classify_context_chars"])
    result["classify_concurrency"] = int(result["classify_concurrency"])
    return result


@router.put("/classify")
async def save_classify_settings(body: ClassifySettingsBody, db: AsyncSession = Depends(get_db)):
    values = {
        "classify_context_chars": str(max(500, min(5000, body.classify_context_chars))),
        "classify_concurrency": str(max(1, min(10, body.classify_concurrency))),
        "classify_provider_id": body.classify_provider_id,
        "folder_gen_prompt": body.folder_gen_prompt,
    }
    for key, val in values.items():
        setting = await db.get(AppSetting, key)
        if setting:
            setting.value = val
        else:
            db.add(AppSetting(key=key, value=val))
    await db.commit()
    return {"ok": True}


# --- Generic settings ---

@router.get("")
async def list_settings(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AppSetting))
    rows = result.scalars().all()
    out = {}
    for r in rows:
        out[r.key] = _mask(r.value) if _is_sensitive(r.key) else r.value
    return out


@router.get("/{key}")
async def get_setting(key: str, db: AsyncSession = Depends(get_db)):
    setting = await db.get(AppSetting, key)
    if not setting:
        raise HTTPException(404, "Setting not found")
    value = _mask(setting.value) if _is_sensitive(key) else setting.value
    return {"key": setting.key, "value": value}


@router.put("/{key}")
async def update_setting(key: str, body: SettingBody, db: AsyncSession = Depends(get_db)):
    # If the key is sensitive and the value contains "***", skip the update
    # to avoid overwriting the real value with a masked placeholder.
    if _is_sensitive(key) and "***" in body.value:
        return {"ok": True}

    setting = await db.get(AppSetting, key)
    if setting:
        setting.value = body.value
    else:
        db.add(AppSetting(key=key, value=body.value))
    await db.commit()
    return {"ok": True}
