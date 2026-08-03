import os
import json
import gzip
import stat
from datetime import datetime, timedelta
from supabase import create_client
from dotenv import load_dotenv
import logging

load_dotenv('master_vault.env')

logger = logging.getLogger(__name__)
if not logger.handlers:
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(name)s: %(message)s')


def _fetch_table(supabase, table_name: str, page_size: int = 1000):
    """
    Generator to page through a Supabase table.
    Yields lists of rows.
    """
    offset = 0
    while True:
        resp = supabase.table(table_name).select("*").range(offset, offset + page_size - 1).execute()
        if resp.error:
            logger.error("Error fetching table %s: %s", table_name, resp.error)
            raise RuntimeError(f"Failed to fetch {table_name}: {resp.error}")
        rows = resp.data or []
        if not rows:
            break
        yield rows
        if len(rows) < page_size:
            break
        offset += page_size


def backup_database(backup_dir: str = "backups", compress: bool = True, keep_days: int = 7):
    """
    Backs up Supabase database to local storage. Uses paging to avoid high memory usage.
    """
    try:
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_KEY")
        if not supabase_url or not supabase_key:
            logger.error("Supabase configuration missing")
            return None

        supabase = create_client(supabase_url, supabase_key)

        os.makedirs(backup_dir, exist_ok=True)

        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        filename = f"backup_{timestamp}.json"
        filepath = os.path.join(backup_dir, filename)

        # Stream-write JSON to reduce peak memory
        with open(filepath, "w", encoding="utf-8") as out_f:
            out_f.write("{\n")
            out_f.write(f'  "timestamp": "{timestamp}",\n')

            tables = ["members", "billing", "attendance_logs"]
            for i, table in enumerate(tables):
                out_f.write(f'  "{table}": ')
                first_chunk = True
                out_f.write("[\n")
                for chunk in _fetch_table(supabase, table):
                    for row in chunk:
                        if not first_chunk:
                            out_f.write(",\n")
                        out_f.write(json.dumps(row, default=str))
                        first_chunk = False
                out_f.write("\n]")
                out_f.write(",\n" if i < len(tables) - 1 else "\n")
            out_f.write("}\n")

        # Restrict file permissions
        os.chmod(filepath, stat.S_IRUSR | stat.S_IWUSR)

        final_path = filepath
        if compress:
            gz_path = filepath + ".gz"
            with open(filepath, "rb") as f_in, gzip.open(gz_path, "wb") as f_out:
                f_out.writelines(f_in)
            os.remove(filepath)
            final_path = gz_path
            os.chmod(final_path, stat.S_IRUSR | stat.S_IWUSR)

        logger.info("Database backup created: %s", final_path)

        # Rotate old backups
        cutoff = datetime.utcnow() - timedelta(days=keep_days)
        for fname in os.listdir(backup_dir):
            full = os.path.join(backup_dir, fname)
            try:
                mtime = datetime.utcfromtimestamp(os.path.getmtime(full))
                if mtime < cutoff:
                    os.remove(full)
                    logger.info("Removed old backup: %s", full)
            except Exception:
                logger.exception("Error rotating backup file: %s", full)

        return final_path

    except Exception as e:
        logger.exception("Backup failed")
        return None


if __name__ == "__main__":
    backup_database()
