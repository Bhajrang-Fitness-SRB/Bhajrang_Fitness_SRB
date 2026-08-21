import os
import json
import logging
import redis

logger = logging.getLogger("cache_manager")

class CacheManager:
    def __init__(self):
        self.host = os.getenv('REDIS_HOST', 'localhost')
        self.port = int(os.getenv('REDIS_PORT', 6379))
        self.password = os.getenv('REDIS_PASSWORD') or None
        self.ttl = int(os.getenv('CACHE_TTL_SECONDS', 300))
        
        try:
            self.redis = redis.Redis(
                host=self.host,
                port=self.port,
                db=0,
                password=self.password,
                decode_responses=True,
                socket_connect_timeout=2
            )
            self.redis.ping()
            self.is_connected = True
            logger.info("Redis cache connection established.")
        except Exception as e:
            self.is_connected = False
            logger.warning(f"Redis not available ({e}). CacheManager operating in bypass mode.")

    def cache_telemetry(self, data: dict) -> bool:
        if not self.is_connected:
            return False
        try:
            self.redis.setex('telemetry', self.ttl, json.dumps(data))
            return True
        except Exception as e:
            logger.error(f"Failed to cache telemetry: {e}")
            return False

    def get_cached_telemetry(self) -> dict | None:
        if not self.is_connected:
            return None
        try:
            raw = self.redis.get('telemetry')
            return json.loads(raw) if raw else None
        except Exception as e:
            logger.error(f"Failed to read cached telemetry: {e}")
            return None
