import json
import os
from openai import AsyncOpenAI

openai_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

COMPARE_PROMPT = """You are an AI tasked with comparing a list of Predicted Questions against a list of Actual Questions asked during an earnings call.

Your goal is to determine if each Predicted Question was asked, and assign a similarity score.

Input JSON schema:
{
  "predicted": [{"id": "uuid1", "question": "predicted text"}, ...],
  "actual": [{"id": "uuidA", "question": "actual text"}, ...]
}

Output JSON schema EXACTLY:
{
  "comparisons": [
    {
      "predicted_id": "uuid1",
      "matched_actual_id": "uuidA or null if no match",
      "was_asked": true/false,
      "similarity_score": 0-100,
      "feedback": "good-prediction" | "missed-nuance" | "false-positive"
    }
  ]
}

Instructions:
1. For each predicted question, find the MOST similar actual question.
2. If the semantic match is very close (similarity > 70%), mark "was_asked": true.
3. If there is no corresponding actual question, set matched_actual_id to null and was_asked to false.
4. "feedback" categorization: 
    - "good-prediction" if it was asked accurately.
    - "missed-nuance" if they asked about the topic but differently.
    - "false-positive" if we predicted it but nobody asked it.
"""

async def run_comparison(predicted_questions: list[dict], actual_questions: list[dict]) -> list[dict]:
    """
    predicted_questions format: [{"id": "...", "question": "..."}]
    actual_questions format: [{"id": "...", "question": "..."}]
    """
    if not predicted_questions or not actual_questions:
        return []

    input_payload = {
        "predicted": predicted_questions,
        "actual": actual_questions
    }

    try:
        resp = await openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": COMPARE_PROMPT},
                {"role": "user", "content": json.dumps(input_payload)}
            ],
            temperature=0.1,
            response_format={"type": "json_object"}
        )
        data = json.loads(resp.choices[0].message.content)
        return data.get("comparisons", [])
    except Exception as e:
        print(f"Comparison error: {e}")
        return []
