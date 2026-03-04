# AI Model Behavior Investigation - Curator Paper (Paper 9)

## Investigation Date
2026-03-02

## Key Findings

### 1. AI Configuration
- **Provider Type**: Supports both Claude and OpenAI-compatible providers
- **Configuration Location**: `/backend/routers/settings.py` - `ai_providers` setting
- **Provider Fields**:
  - `id`: Provider identifier
  - `provider_type`: "claude" or other (OpenAI-compatible)
  - `api_url`: API endpoint URL
  - `api_key`: Authentication key
  - `model`: Model name (e.g., "claude-3-5-sonnet-20241022")
  - `thinking_budget`: Optional thinking tokens for Claude
  - `is_default`: Boolean flag for default provider

### 2. Metadata Extraction Flow
**File**: `/backend/routers/papers.py` - `extract_metadata()` endpoint (line 1103)

**Process**:
1. Uses agent loop with MCP tools (max 5 rounds)
2. Tools available: `dblp_search`, `openalex_search`, `tavily_search`, `searxng_search`
3. System prompt explicitly requires JSON-only output
4. AI response is parsed by `_parse_metadata_json()` function

### 3. Metadata Parsing Function
**Location**: `/backend/routers/papers.py:1328`

```python
def _parse_metadata_json(text: str) -> dict | None:
    """Try to extract a JSON object from LLM output."""
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines).strip()
    # Try direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Try to find JSON object in text
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(text[start:end + 1])
        except json.JSONDecodeError:
            pass
    return None
```

**Parsing Logic**:
1. Strips whitespace
2. Removes markdown code block markers (```)
3. Attempts direct JSON parse
4. Falls back to finding first `{` and last `}` and parsing that substring
5. Returns None if all parsing fails

### 4. Metadata Extraction Prompt
**System Prompt** (lines 1127-1145):
- Explicitly states: "Your final response MUST be ONLY a valid JSON object, nothing else"
- Prohibits markdown code blocks
- Requires specific format: `{"title": "...", "authors": "...", "venue": "...", "publish_date": "..."}`
- Provides example response for Curator paper itself

### 5. Curator Paper (Paper 9) Details
- **ID**: 9
- **Title**: "Jin 等 - 2024 - Curator Efficient Indexing for Multi-Tenant Vector Databases"
- **Authors**: Yicheng Jin, Yongji Wu, Wenjun Hu, Bruce M. Maggs, Xiao Zhang, Danyang Zhuo
- **Venue**: OSDI 2024
- **Paper Dir**: `/backend/data/papers/9/`
- **Markdown Size**: ~81KB

### 6. Potential Parsing Issues

**Issue 1: Markdown Code Blocks**
- Parser removes lines starting with ``` but may fail if:
  - Code block markers are indented
  - Multiple code blocks exist
  - Markers have extra spaces

**Issue 2: Nested JSON**
- Parser uses simple `find("{")` and `rfind("}")` which fails if:
  - AI includes explanatory text with curly braces
  - JSON contains escaped quotes or special characters
  - Multiple JSON objects in response

**Issue 3: AI Response Format**
- If AI returns: `Here's the metadata: {...}` - parser finds first `{` and last `}`
- If AI returns: `The paper is about {...} and {...}` - parser gets wrong substring
- If AI returns thinking blocks with `<think>{...}</think>` - may extract wrong JSON

### 7. Fallback Mechanism
When JSON parsing fails:
1. Attempts `_extract_metadata_from_markdown()` using regex patterns
2. Looks for: title (first heading), authors (name patterns), venue (conference abbreviations)
3. If fallback succeeds, uses that metadata
4. If both fail, returns error to user

### 8. AI Provider Configuration
**Current Setup** (from logs):
- API endpoint: `https://api.liyiqi.site/v1/messages` (Claude-compatible)
- Model: Likely Claude 3.5 Sonnet or similar
- Max tokens: 4096 for metadata extraction, 8192 for other operations
- Timeout: 120 seconds

### 9. Logs Analysis
- **Backend logs**: No specific errors for paper 9 metadata extraction found
- **Error log**: Shows 503 Service Unavailable for author exploration (different endpoint)
- **No "Could not parse metadata JSON" errors** in recent logs

## Potential Root Causes for Curator Paper Issues

1. **AI Response Format Deviation**
   - AI might include explanatory text before/after JSON
   - AI might use markdown code blocks despite instructions
   - AI might return multiple JSON objects

2. **Special Characters in Metadata**
   - Author names with special characters (e.g., "Danyang Zhuo")
   - Venue abbreviations with numbers (e.g., "OSDI 2024")
   - Escaped quotes in JSON

3. **Parser Edge Cases**
   - If response contains `{` or `}` outside JSON (e.g., in explanatory text)
   - If JSON is malformed (missing quotes, trailing commas)
   - If response is truncated

## Testing Recommendations

1. **Direct API Test**
   - Call metadata extraction endpoint for paper 9
   - Capture raw AI response
   - Check if parsing succeeds

2. **Unit Tests**
   - Test `_parse_metadata_json()` with various AI response formats
   - Test with special characters and edge cases
   - Test with malformed JSON

3. **Integration Tests**
   - Test full metadata extraction flow
   - Monitor AI response format
   - Verify fallback mechanism works

## Files to Monitor
- `/backend/routers/papers.py` - Main extraction logic
- `/backend/services/ai_chat_service.py` - AI provider communication
- `/backend/services/classify_service.py` - Similar JSON parsing pattern
- `.runlogs/backend.out.log` - Execution logs
