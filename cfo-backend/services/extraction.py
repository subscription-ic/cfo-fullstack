import asyncio
import json
import re
from pathlib import Path
from openai import AsyncOpenAI
from pypdf import PdfReader

# ── Concurrency limit: max 10 simultaneous OpenAI calls ───────────────────────
OPENAI_CONCURRENCY = 10

GENERIC_SPEAKER_LABELS = {
    "management", "management team", "the management", "executive",
    "speaker", "operator", "analyst", "moderator", "unknown", "n/a", "na", "not available",
}

def clean_text(text: str) -> str:
    return (text or "").replace("\u2019", "'").replace("\u2018", "'").replace("\u2013", "-").replace("\u2014", "-")

def normalize_space(text: str) -> str:
    return " ".join((text or "").split()).strip()

def normalize_speaker_name(speaker: str, role: str) -> str:
    name = normalize_space(speaker)
    if not name: return ""
    lowered = name.lower().strip(" .:-")
    if lowered in GENERIC_SPEAKER_LABELS: return ""
    if role == "management" and lowered.startswith("management"): return ""
    if name.isupper() and any(ch.isalpha() for ch in name):
        name = name.title()
    return name

def pull_speaker_from_text(text: str) -> tuple[str, str]:
    candidate = normalize_space(text)
    match = re.match(r"^([A-Z][A-Za-z .&'\-]{2,80}):\s*(.+)$", candidate)
    if not match: return "", candidate
    return normalize_space(match.group(1)), normalize_space(match.group(2))

def extract_json_object(text: str) -> dict:
    source = (text or "").strip()
    if not source: return {}
    try:
        parsed = json.loads(source)
        if isinstance(parsed, dict): return parsed
    except json.JSONDecodeError: pass

    match = re.search(r"\{[\s\S]*\}", source)
    if match:
        try:
            parsed = json.loads(match.group(0))
            if isinstance(parsed, dict): return parsed
        except json.JSONDecodeError: pass
    return {}

def build_page_prompt(page_num: int, page_text: str, carry_over: str) -> str:
    return (
        "You are extracting Q&A turns from an earnings-call transcript. "
        "The input is one PDF page plus unresolved carry-over text from the previous page.\n\n"
        "Task:\n"
        "1) Produce speaker turns in reading order.\n"
        "2) Classify each turn role: analyst, management, moderator, or unknown.\n"
        "3) If last lines on this page look incomplete, place unresolved part in carry_over for next page.\n\n"
        "Important rules:\n"
        "- Preserve wording exactly as much as possible.\n"
        "- Do not invent missing words.\n"
        "- If a turn continues from previous page, include merged text in its turn text.\n"
        "- Speaker must be a real person name when available in text.\n"
        "- Never use generic speaker labels like 'Management' or 'Analyst' as a person name.\n"
        "- If no clear speaker label exists, keep speaker as \"Unknown\" and role as \"unknown\".\n"
        "- Return only valid JSON object with keys: turns, carry_over.\n"
        "- turns must be an array of objects: {speaker, role, text}.\n"
        "- role must be one of: analyst, management, moderator, unknown.\n\n"
        f"Page Number: {page_num}\n"
        f"Carry Over From Previous Page:\n{carry_over or '[none]'}\n\n"
        f"Page Text:\n{page_text}"
    )

def build_classification_prompt(question: str, answer: str) -> str:
    return (
        "You are a financial analyst reviewing an earnings call Q&A.\n"
        "Create a concise category, specific sub-topic, reason, question topics, answer summary, and key points.\n\n"
        "Return only valid JSON object with exactly these keys:\n"
        "{\n"
        '  "question_category": "free-form category (2-5 words)",\n'
        '  "question_sub_topic": "specific sub-topic (2-8 words)",\n'
        '  "reason": "one short sentence",\n'
        '  "question_topics": "comma-separated list of topics",\n'
        '  "answer_summary": "1-2 sentence summary of the answer",\n'
        '  "key_points": "comma-separated key points drawn from the answer"\n'
        "}\n\n"
        "Rules:\n"
        "- No markdown and no extra keys.\n\n"
        f"Question:\n{question}\n\n"
        f"Answer:\n{answer}"
    )

def is_probable_question(text: str) -> bool:
    t = (text or "").strip().lower()
    if not t: return False
    if "?" in t: return True
    cues = ["could you", "can you", "what is", "what are", "how should", "help us understand",
            "guidance", "firstly", "secondly", "question", "clarify"]
    return len(t) > 50 and any(c in t for c in cues)

def build_rows_from_turns(turns: list[dict]) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    current_question_text = ""
    answer_segments: list[dict] = []
    last_management_speaker = ""

    def flush_current() -> None:
        nonlocal current_question_text, answer_segments
        q = normalize_space(current_question_text)
        if not q:
            current_question_text = ""
            answer_segments = []
            return
        people_in_order: list[str] = []
        for seg in answer_segments:
            speaker = normalize_space(seg.get("speaker", ""))
            if speaker and speaker not in people_in_order: people_in_order.append(speaker)
        person_name = " | ".join(people_in_order)
        answer_parts = []
        for seg in answer_segments:
            speaker = normalize_space(seg.get("speaker", ""))
            seg_text = normalize_space(seg.get("text", ""))
            if not seg_text: continue
            if speaker: answer_parts.append(f"[{speaker}] {seg_text}")
            else: answer_parts.append(seg_text)
        rows.append({"question": q, "person": person_name, "answer": "\n\n".join(answer_parts).strip()})
        current_question_text = ""
        answer_segments = []

    for turn in turns:
        role = turn["role"]
        speaker = turn["speaker"]
        text = turn["text"]
        if role == "analyst":
            if not current_question_text:
                if is_probable_question(text): current_question_text = text
                continue
            if answer_segments:
                flush_current()
                if is_probable_question(text): current_question_text = text
                continue
            current_question_text = normalize_space(current_question_text + " " + text)
            continue
        if role == "management":
            if not current_question_text: continue
            resolved_speaker = speaker
            if resolved_speaker == "Unknown" and last_management_speaker: resolved_speaker = last_management_speaker
            if answer_segments and answer_segments[-1]["speaker"] == resolved_speaker:
                answer_segments[-1]["text"] = normalize_space(answer_segments[-1]["text"] + " " + text)
            else:
                answer_segments.append({"speaker": resolved_speaker, "text": text})
            if speaker != "Unknown": last_management_speaker = speaker
            continue
        if role in {"moderator", "unknown"}:
            if current_question_text and not answer_segments and is_probable_question(text):
                current_question_text = normalize_space(current_question_text + " " + text)
            elif current_question_text and answer_segments:
                if len(text.split()) <= 10: continue
            continue
    flush_current()
    return rows

# ── Async OpenAI helpers ───────────────────────────────────────────────────────

async def async_extract_page_turns(
    client: AsyncOpenAI,
    semaphore: asyncio.Semaphore,
    page_num: int,
    page_text: str,
    carry_over: str,
) -> tuple[int, list[dict], str]:
    """Async page turn extraction, guarded by semaphore."""
    async with semaphore:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "Return only strict JSON for transcript turn extraction."},
                {"role": "user", "content": build_page_prompt(page_num, page_text, carry_over)},
            ],
        )
    payload = extract_json_object(getattr(response.choices[0].message, "content", ""))
    turns_raw = payload.get("turns", []) if isinstance(payload.get("turns", []), list) else []
    next_carry = normalize_space(str(payload.get("carry_over", "")))

    cleaned_turns: list[dict] = []
    for item in turns_raw:
        if not isinstance(item, dict): continue
        raw_speaker = normalize_space(str(item.get("speaker", "")))
        role = normalize_space(str(item.get("role", "unknown"))).lower()
        if role not in {"analyst", "management", "moderator", "unknown"}: role = "unknown"
        text = normalize_space(str(item.get("text", "")))
        inferred_speaker, text = pull_speaker_from_text(text)
        speaker = normalize_speaker_name(raw_speaker, role)
        if not speaker and inferred_speaker: speaker = normalize_speaker_name(inferred_speaker, role)
        if not speaker: speaker = "Unknown"
        if not text: continue
        cleaned_turns.append({"speaker": speaker, "role": role, "text": text, "page": page_num})
    return page_num, cleaned_turns, next_carry


async def async_classify_question(
    client: AsyncOpenAI,
    semaphore: asyncio.Semaphore,
    idx: int,
    question: str,
    answer: str,
) -> tuple[int, dict]:
    """Async classification, guarded by semaphore."""
    async with semaphore:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "Return only strict JSON for classification."},
                {"role": "user", "content": build_classification_prompt(question, answer)},
            ],
        )
    payload = extract_json_object(getattr(response.choices[0].message, "content", ""))
    return idx, {
        "category": normalize_space(str(payload.get("question_category", "General Output"))),
        "sub_topic": normalize_space(str(payload.get("question_sub_topic", "Management Commentary"))),
        "reason": normalize_space(str(payload.get("reason", ""))),
        "question_topics": normalize_space(str(payload.get("question_topics", ""))),
        "answer_summary": normalize_space(str(payload.get("answer_summary", ""))),
        "key_points": normalize_space(str(payload.get("key_points", ""))),
    }


async def _process_pdf_async(pdf_path: str, update_status_cb) -> list[dict]:
    update_status_cb("Reading PDF pages...")
    reader = PdfReader(pdf_path)
    pages = [clean_text(page.extract_text() or "") for page in reader.pages]
    total_pages = len(pages)

    client = AsyncOpenAI()
    semaphore = asyncio.Semaphore(OPENAI_CONCURRENCY)

    try:
        # ── Phase 1: extract turns from all pages concurrently ────────────────────
        update_status_cb(f"Extracting turns from {total_pages} pages concurrently (up to {OPENAI_CONCURRENCY} at a time)...")

        tasks = [
            async_extract_page_turns(client, semaphore, idx + 1, page_text, "")
            for idx, page_text in enumerate(pages)
        ]
        results = await asyncio.gather(*tasks)

        # Re-sort by page number and flatten
        results_sorted = sorted(results, key=lambda r: r[0])
        all_turns = []
        for _, turns, _ in results_sorted:
            all_turns.extend(turns)

        update_status_cb(f"Extracted {len(all_turns)} speaker turns. Grouping into Q&A blocks...")
        rows = build_rows_from_turns(all_turns)

        # ── Phase 2: classify all Q&A rows concurrently ───────────────────────────
        update_status_cb(f"Classifying {len(rows)} Q&A pairs concurrently (up to {OPENAI_CONCURRENCY} at a time)...")
        classify_tasks = [
            async_classify_question(client, semaphore, i, row["question"], row["answer"])
            for i, row in enumerate(rows)
        ]
        classify_results = await asyncio.gather(*classify_tasks)
        classify_map = {idx: cls for idx, cls in classify_results}

        final_rows = []
        for i, row in enumerate(rows):
            c = classify_map.get(i, {})
            final_rows.append({
                "question_text": row["question"],
                "answer_text": row["answer"],
                "answered_by": row["person"],
                "category": f"{c.get('category', 'General Output')} / {c.get('sub_topic', 'Management Commentary')}",
                "question_topics": c.get("question_topics", ""),
                "answer_summary": c.get("answer_summary", ""),
                "key_points": c.get("key_points", ""),
            })

        update_status_cb("Extraction pipeline complete!")
        return final_rows
    finally:
        # Explicitly close the client so httpx can clean up connections
        # while the event loop is still running, avoiding the 'Event loop is closed' warning
        await client.close()


def process_historical_pdf(pdf_path: str, update_status_cb) -> list[dict]:
    """Sync entry-point that runs the async pipeline in a dedicated event loop."""
    return asyncio.run(_process_pdf_async(pdf_path, update_status_cb))
