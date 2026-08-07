import redis
import json
import os

class CacheManager:
    def __init__(self):
        self.redis = redis.Redis(
            host=os.getenv('REDIS_HOST', 'localhost'),
            port=int(os.getenv('REDIS_PORT', 6379)),
            db=0,
            password=os.getenv('REDIS_PASSWORD') or None,
            decode_responses=True
        )
        self.ttl = int(os.getenv('CACHE_TTL_SECONDS', 300))

    def cache_telemetry(self, data):
        try:
            self.redis.setex('telemetry', self.ttl, json.dumps(data))
        except Exception:
            pass

    def get_cached_telemetry(self):
        try:
            raw = self.redis.get('telemetry')
            return json.loads(raw) if raw else None
        except Exception:
            return None
