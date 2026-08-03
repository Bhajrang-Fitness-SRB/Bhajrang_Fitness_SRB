# scripts/create_backup.py
from utils.backup import create_backup

if __name__ == '__main__':
    path, ok = create_backup()
    print('Backup:', path, 'uploaded=', ok)
