"""
utils/backup.py

Creates immediate and scheduled backups of key data and uploads to Supabase Storage if configured.
Behavior:
 - Creates a compressed ZIP snapshot of selected paths (configurable)
 - Stores a local copy under ./backups/YYYYMMDD_HHMMSS.zip
 - If SUPABASE_* configured, uploads to Supabase storage bucket 'backups'
 - Honors BACKUP_RETENTION_DAYS env var to delete older local backups
"""
import os
import io
import zipfile
import shutil
from datetime import datetime, timedelta
import logging

try:
    from supabase import create_client
except Exception:
    create_client = None

LOG = logging.getLogger(__name__)

BACKUP_DIR = os.getenv('BACKUP_DIR', 'backups')
BACKUP_RETENTION_DAYS = int(os.getenv('BACKUP_RETENTION_DAYS', '30'))
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_KEY')

DEFAULT_PATHS = [
    'data',
    'templates',
    'static',
    '_01_Core_Engines',
    '_03_Automation_Bots'
]

os.makedirs(BACKUP_DIR, exist_ok=True)


def _zip_paths(paths, out_path):
    LOG.info('Creating zip: %s', out_path)
    with zipfile.ZipFile(out_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        for p in paths:
            if not os.path.exists(p):
                continue
            if os.path.isfile(p):
                zf.write(p, arcname=os.path.basename(p))
            else:
                for root, dirs, files in os.walk(p):
                    for f in files:
                        full = os.path.join(root, f)
                        arc = os.path.relpath(full, start=os.path.dirname(p))
                        zf.write(full, arcname=arc)
    return out_path


def upload_to_supabase(local_path, remote_name=None):
    if not SUPABASE_URL or not SUPABASE_KEY or create_client is None:
        LOG.warning('Supabase not configured or client missing; skipping upload')
        return False
    try:
        client = create_client(SUPABASE_URL, SUPABASE_KEY)
        bucket = client.storage.from_('backups')
        remote_name = remote_name or os.path.basename(local_path)
        with open(local_path, 'rb') as f:
            data = f.read()
        resp = bucket.upload(remote_name, io.BytesIO(data))
        LOG.info('Uploaded backup to Supabase: %s', remote_name)
        return True
    except Exception as e:
        LOG.exception('Supabase upload failed: %s', e)
        return False


def cleanup_local_backups(retention_days=BACKUP_RETENTION_DAYS):
    cutoff = datetime.utcnow() - timedelta(days=retention_days)
    for fname in os.listdir(BACKUP_DIR):
        try:
            full = os.path.join(BACKUP_DIR, fname)
            if not os.path.isfile(full):
                continue
            ts = datetime.utcfromtimestamp(os.path.getmtime(full))
            if ts < cutoff:
                LOG.info('Removing old backup: %s', full)
                os.remove(full)
        except Exception:
            LOG.exception('Failed to cleanup %s', fname)


def create_backup(paths=None, upload_cloud=True):
    paths = paths or DEFAULT_PATHS
    ts = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
    out_name = f'backup_{ts}.zip'
    out_path = os.path.join(BACKUP_DIR, out_name)
    _zip_paths(paths, out_path)
    ok = True
    if upload_cloud:
        ok = upload_to_supabase(out_path, remote_name=out_name)
    cleanup_local_backups()
    return out_path, ok


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    path, ok = create_backup()
    print('Backup created:', path, 'uploaded=', ok)
