import argparse
import json
import os
import re
import time
from pathlib import Path

from openai import OpenAI
from openpyxl import Workbook
from pypdf import PdfReader


GENERIC_SPEAKER_LABELS = {
    "management",
    "management team",
    "the management",
    "executive",
    "speaker",
    "operator",
    "analyst",
    "moderator",
    "unknown",
    "n/a",
    "na",
    "not available",
}


def load_dotenv(dotenv_path: Path) -> None:
    if not dotenv_path.exists():
        return

    for raw_line in dotenv_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def clean_text(text: str) -> str:
    return (
        (text or "")
        .replace("\u2019", "'")
        .replace("\u2018", "'")
        .replace("\u2013", "-")
        .replace("\u2014", "-")
    )


def normalize_space(text: str) -> str:
    return " ".join((text or "").split()).strip()


def normalize_speaker_name(speaker: str, role: str) -> str:
    name = normalize_space(speaker)
    if not name:
        return ""

    lowered = name.lower().strip(" .:-")
    if lowered in GENERIC_SPEAKER_LABELS:
        return ""

    if role == "management" and lowered.startswith("management"):
        return ""

    # Normalize shout-case names such as "SASHIDHAR JAGDISHAN".
    if name.isupper() and any(ch.isalpha() for ch in name):
        name = name.title()

    return name


def pull_speaker_from_text(text: str) -> tuple[str, str]:
    candidate = normalize_space(text)
    match = re.match(r"^([A-Z][A-Za-z .&'\-]{2,80}):\s*(.+)$", candidate)
    if not match:
        return "", candidate
    return normalize_space(match.group(1)), normalize_space(match.group(2))


def extract_json_object(text: str) -> dict:
    source = (text or "").strip()
    if not source:
        return {}

    try:
        parsed = json.loads(source)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{[\s\S]*\}", source)
    if match:
        try:
            parsed = json.loads(match.group(0))
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            pass

    return {}


def extract_json_array(text: str) -> list:
    source = (text or "").strip()
    if not source:
        return []

    try:
        parsed = json.loads(source)
        if isinstance(parsed, list):
            return parsed
    except json.JSONDecodeError:
        pass

    match = re.search(r"\[[\s\S]*\]", source)
    if match:
        try:
            parsed = json.loads(match.group(0))
            if isinstance(parsed, list):
                return parsed
        except json.JSONDecodeError:
            pass

    return []


def build_page_prompt(page_num: int, page_text: str, carry_over: str) -> str:
    return (
        "You are extracting Q&A turns from an HDFC Bank earnings-call transcript. "
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


def extract_page_turns(
    client: OpenAI,
    model: str,
    page_num: int,
    page_text: str,
    carry_over: str,
) -> tuple[list[dict], str]:
    response = client.responses.create(
        model=model,
        input=[
            {
                "role": "system",
                "content": [
                    {
                        "type": "input_text",
                        "text": "Return only strict JSON for transcript turn extraction.",
                    }
                ],
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": build_page_prompt(page_num=page_num, page_text=page_text, carry_over=carry_over),
                    }
                ],
            },
        ],
    )

    payload = extract_json_object(getattr(response, "output_text", ""))
    turns = payload.get("turns", []) if isinstance(payload.get("turns", []), list) else []
    next_carry = normalize_space(str(payload.get("carry_over", "")))

    cleaned_turns: list[dict] = []
    for item in turns:
        if not isinstance(item, dict):
            continue
        raw_speaker = normalize_space(str(item.get("speaker", "")))
        role = normalize_space(str(item.get("role", "unknown"))).lower()
        if role not in {"analyst", "management", "moderator", "unknown"}:
            role = "unknown"
        text = normalize_space(str(item.get("text", "")))
        inferred_speaker, text = pull_speaker_from_text(text)
        speaker = normalize_speaker_name(raw_speaker, role)
        if not speaker and inferred_speaker:
            speaker = normalize_speaker_name(inferred_speaker, role)
        if not speaker:
            speaker = "Unknown"
        if not text:
            continue
        cleaned_turns.append({"speaker": speaker, "role": role, "text": text, "page": page_num})

    return cleaned_turns, next_carry


def is_probable_question(text: str) -> bool:
    t = (text or "").strip().lower()
    if not t:
        return False
    if "?" in t:
        return True

    cues = [
        "could you",
        "can you",
        "what is",
        "what are",
        "how should",
        "help us understand",
        "guidance",
        "firstly",
        "secondly",
        "question",
        "clarify",
    ]
    return len(t) > 50 and any(c in t for c in cues)


def merge_answer_segment(answer_segments: list[dict], speaker: str, text: str) -> None:
    if answer_segments and answer_segments[-1]["speaker"] == speaker:
        answer_segments[-1]["text"] = normalize_space(answer_segments[-1]["text"] + " " + text)
    else:
        answer_segments.append({"speaker": speaker, "text": text})


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
            if speaker and speaker not in people_in_order:
                people_in_order.append(speaker)

        person_name = " | ".join(people_in_order)

        # Keep attribution inline when multiple people answer a single question.
        answer_parts = []
        for seg in answer_segments:
            speaker = normalize_space(seg.get("speaker", ""))
            seg_text = normalize_space(seg.get("text", ""))
            if not seg_text:
                continue
            if speaker:
                answer_parts.append(f"[{speaker}] {seg_text}")
            else:
                answer_parts.append(seg_text)

        rows.append(
            {
                "question": q,
                "person": person_name,
                "answer": "\n\n".join(answer_parts).strip(),
            }
        )

        current_question_text = ""
        answer_segments = []

    for turn in turns:
        role = turn["role"]
        speaker = turn["speaker"]
        text = turn["text"]

        if role == "analyst":
            if not current_question_text:
                if is_probable_question(text):
                    current_question_text = text
                continue

            if answer_segments:
                flush_current()
                if is_probable_question(text):
                    current_question_text = text
                continue

            # Analyst continuation before answer starts.
            current_question_text = normalize_space(current_question_text + " " + text)
            continue

        if role == "management":
            if not current_question_text:
                continue
            resolved_speaker = speaker
            if resolved_speaker == "Unknown" and last_management_speaker:
                resolved_speaker = last_management_speaker

            merge_answer_segment(answer_segments, resolved_speaker, text)

            if speaker != "Unknown":
                last_management_speaker = speaker
            continue

        if role in {"moderator", "unknown"}:
            if current_question_text and not answer_segments and is_probable_question(text):
                current_question_text = normalize_space(current_question_text + " " + text)
            elif current_question_text and answer_segments:
                # Sometimes moderator inserts short transition while answer continues.
                if len(text.split()) <= 10:
                    continue
            continue

    flush_current()
    return rows


def build_classification_prompt(question: str) -> str:
    return (
        "You are a financial analyst reviewing an HDFC Bank earnings call question.\n"
        "Create a concise category, a specific sub-topic, and a short reason.\n\n"
        "Return only valid JSON object with exactly these keys:\n"
        "{\n"
        '  "question_category": "free-form category",\n'
        '  "question_sub_topic": "specific sub-topic",\n'
        '  "reason": "one short sentence"\n'
        "}\n\n"
        "Rules:\n"
        "- Category should be 2-5 words.\n"
        "- Sub-topic should be 2-8 words and more specific than category.\n"
        "- Reason max 25 words.\n"
        "- No markdown and no extra keys.\n\n"
        f"Question:\n{question}"
    )


def classify_question(client: OpenAI, model: str, question: str) -> tuple[str, str, str]:
    response = client.responses.create(
        model=model,
        input=[
            {
                "role": "system",
                "content": [
                    {
                        "type": "input_text",
                        "text": "Return only strict JSON for classification.",
                    }
                ],
            },
            {
                "role": "user",
                "content": [
                    {"type": "input_text", "text": build_classification_prompt(question)}
                ],
            },
        ],
    )

    payload = extract_json_object(getattr(response, "output_text", ""))

    category = normalize_space(str(payload.get("question_category", "General Business Update")))
    sub_topic = normalize_space(str(payload.get("question_sub_topic", "Management Commentary")))
    reason = normalize_space(str(payload.get("reason", "This reflects the main intent and focus of the analyst question.")))

    return category, sub_topic, reason


def read_pdf_pages(pdf_path: Path) -> list[str]:
    reader = PdfReader(str(pdf_path))
    pages = []
    for page in reader.pages:
        pages.append(clean_text(page.extract_text() or ""))
    return pages


def extract_rows_from_pdf_pagewise(
    client: OpenAI,
    pdf_path: Path,
    model_extract: str,
    model_classify: str,
    delay: float,
) -> list[dict[str, str]]:
    pages = read_pdf_pages(pdf_path)

    all_turns: list[dict] = []
    carry_over = ""

    for idx, page_text in enumerate(pages, start=1):
        turns, carry_over = extract_page_turns(
            client=client,
            model=model_extract,
            page_num=idx,
            page_text=page_text,
            carry_over=carry_over,
        )
        all_turns.extend(turns)
        print(f"{pdf_path.name} | Page {idx}/{len(pages)} | Turns: {len(turns)}")
        if delay > 0:
            time.sleep(delay)

    rows = build_rows_from_turns(all_turns)

    final_rows: list[dict[str, str]] = []
    for row in rows:
        question = row["question"]
        category, sub_topic, reason = classify_question(client, model_classify, question)
        final_rows.append(
            {
                "question": question,
                "person": row["person"],
                "answer": row["answer"],
                "question category": category,
                "question sub topic": sub_topic,
                "reason": reason,
            }
        )
        print(f"{pdf_path.name} | Classified question: {category} | {sub_topic}")
        if delay > 0:
            time.sleep(delay)

    return final_rows


def write_rows_to_excel(rows: list[dict[str, str]], out_path: Path, sheet_name: str) -> None:
    wb = Workbook()
    ws = wb.active
    ws.title = sheet_name

    headers = [
        "question",
        "person",
        "answer",
        "question category",
        "question sub topic",
        "reason",
    ]
    ws.append(headers)

    for row in rows:
        ws.append([row.get(h, "") for h in headers])

    # Wider question/answer columns for readability.
    ws.column_dimensions["A"].width = 60
    ws.column_dimensions["B"].width = 42
    ws.column_dimensions["C"].width = 80
    ws.column_dimensions["D"].width = 30
    ws.column_dimensions["E"].width = 36
    ws.column_dimensions["F"].width = 48

    out_path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(out_path)


def iter_pdf_files(input_path: Path) -> list[Path]:
    if input_path.is_file() and input_path.suffix.lower() == ".pdf":
        return [input_path]
    if input_path.is_dir():
        return sorted(input_path.glob("*.pdf"))
    return []


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Extract earnings-call Q&A page-by-page with LLM and export one-sheet Excel output."
    )
    parser.add_argument(
        "--input",
        default="pdf",
        help="Input PDF file path or folder path containing PDFs",
    )
    parser.add_argument(
        "--output-dir",
        default="qna-excel",
        help="Output folder for Excel files",
    )
    parser.add_argument(
        "--sheet",
        default="QA",
        help="Sheet name in output workbook",
    )
    parser.add_argument(
        "--extract-model",
        default="gpt-4o-mini",
        help="Model used for page-wise turn extraction",
    )
    parser.add_argument(
        "--classify-model",
        default="gpt-4o-mini",
        help="Model used for category/sub-topic classification",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=0.2,
        help="Delay between API calls in seconds",
    )
    parser.add_argument(
        "--suffix",
        default="-qa-llm",
        help="Suffix added to output file name before .xlsx",
    )
    parser.add_argument(
        "--api-key-env",
        default="OPENAI_API_KEY",
        help="Environment variable containing OpenAI API key",
    )
    args = parser.parse_args()

    root = Path.cwd()
    load_dotenv(root / ".env")

    api_key = os.getenv(args.api_key_env, "").strip()
    if not api_key:
        raise SystemExit(f"{args.api_key_env} is missing. Add it to .env or your environment.")

    input_path = Path(args.input)
    output_dir = Path(args.output_dir)

    if not input_path.is_absolute():
        input_path = root / input_path
    if not output_dir.is_absolute():
        output_dir = root / output_dir

    pdf_files = iter_pdf_files(input_path)
    if not pdf_files:
        raise SystemExit(f"No PDF files found at: {input_path}")

    client = OpenAI(api_key=api_key)

    for pdf_path in pdf_files:
        rows = extract_rows_from_pdf_pagewise(
            client=client,
            pdf_path=pdf_path,
            model_extract=args.extract_model,
            model_classify=args.classify_model,
            delay=args.delay,
        )

        out_name = f"{pdf_path.stem}{args.suffix}.xlsx"
        out_path = output_dir / out_name
        write_rows_to_excel(rows, out_path, args.sheet)
        print(f"Saved {len(rows)} rows to: {out_path}")


if __name__ == "__main__":
    main()
