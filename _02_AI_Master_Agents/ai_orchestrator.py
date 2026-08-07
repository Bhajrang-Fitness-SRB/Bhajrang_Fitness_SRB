import os
from dotenv import load_dotenv
import google.generativeai as genai
import groq
import logging

load_dotenv('master_vault.env')

logger = logging.getLogger(__name__)
if not logger.handlers:
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(name)s: %(message)s')


class AIOrchestrator:
    """Orchestrates calls between Gemini and Groq with a simple fallback strategy.

    This is a minimal, opinionated orchestrator — expand retry/backoff and error
    handling for production.
    """

    def __init__(self):
        self.gemini_key = os.getenv("GEMINI_API_KEY")
        self.groq_key = os.getenv("GROQ_API_KEY")
        self.primary = "gemini" if self.gemini_key else ("groq" if self.groq_key else None)

        if self.gemini_key:
            try:
                genai.configure(api_key=self.gemini_key)
                self.gemini_model = genai.GenerativeModel('gemini-pro')
            except Exception:
                logger.exception("Failed to initialize Gemini client")
                self.gemini_model = None

        if self.groq_key:
            try:
                self.groq_client = groq.Groq(api_key=self.groq_key)
            except Exception:
                logger.exception("Failed to initialize Groq client")
                self.groq_client = None

    def generate_with_fallback(self, prompt: str, max_retries: int = 3):
        """Attempt to generate with primary provider, fallback on failure.

        Returns raw provider output (string) or a cache dict when offline.
        """
        if not self.primary:
            logger.warning("No AI keys configured — returning cache response")
            return self._cached_response(prompt)

        for attempt in range(max_retries):
            provider = self.primary
            try:
                if provider == "gemini" and getattr(self, 'gemini_model', None):
                    return self._generate_gemini(prompt)
                if provider == "groq" and getattr(self, 'groq_client', None):
                    return self._generate_groq(prompt)

                # Switch primary if current provider isn't available
                self.primary = "groq" if provider == "gemini" else "gemini"
            except Exception:
                logger.exception("AI generation failed on provider %s (attempt %d)", provider, attempt + 1)
                # switch primary and retry
                self.primary = "groq" if provider == "gemini" else "gemini"
                continue

        return self._cached_response(prompt)

    def _generate_gemini(self, prompt: str) -> str:
        resp = self.gemini_model.generate_content(prompt)
        # This may vary depending on the client library shape
        return getattr(resp, 'text', str(resp))

    def _generate_groq(self, prompt: str) -> str:
        completion = self.groq_client.chat.completions.create(
            model="llama3-70b-8192",
            messages=[{"role": "user", "content": prompt}]
        )
        return completion.choices[0].message.content

    def _cached_response(self, prompt: str):
        return {"status": "cache_used", "message": "AI offline. Using cached plans."}
