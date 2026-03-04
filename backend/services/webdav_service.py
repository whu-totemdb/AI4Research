from __future__ import annotations
import asyncio
import logging
from datetime import datetime
from pathlib import Path
from cryptography.fernet import Fernet
from webdav3.client import Client
import requests
from requests.auth import HTTPBasicAuth

from database import DATA_DIR, UPLOAD_DIR

logger = logging.getLogger(__name__)

KEY_FILE = DATA_DIR / ".fernet.key"


def _get_fernet() -> Fernet:
    if KEY_FILE.exists():
        key = KEY_FILE.read_bytes()
    else:
        key = Fernet.generate_key()
        KEY_FILE.write_bytes(key)
    return Fernet(key)


def encrypt_password(plain: str) -> str:
    return _get_fernet().encrypt(plain.encode()).decode()


def decrypt_password(token: str) -> str:
    return _get_fernet().decrypt(token.encode()).decode()


class WebDAVSyncService:
    def __init__(self, webdav_url: str, username: str, encrypted_password: str, sync_folder: str):
        self.sync_folder = sync_folder
        self.webdav_url = webdav_url
        self.username = username
        password = decrypt_password(encrypted_password)
        self.password = password
        self.auth = HTTPBasicAuth(username, password)
        self.client = Client({
            "webdav_hostname": webdav_url,
            "webdav_login": username,
            "webdav_password": password,
        })

    @classmethod
    def from_plain_password(cls, webdav_url: str, username: str, plain_password: str, sync_folder: str):
        """Create service instance with plain password (for testing)."""
        encrypted = encrypt_password(plain_password)
        return cls(webdav_url, username, encrypted, sync_folder)

    def _check_exists(self, path: str) -> bool:
        """Check if remote path exists using raw HTTP."""
        url = self.webdav_url.rstrip('/') + '/' + path.lstrip('/')
        resp = requests.request("PROPFIND", url, auth=self.auth, timeout=10)
        return resp.status_code == 207

    def _mkdir(self, path: str):
        """Create directory using raw HTTP."""
        url = self.webdav_url.rstrip('/') + '/' + path.lstrip('/')
        resp = requests.request("MKCOL", url, auth=self.auth, timeout=10)
        if resp.status_code not in (201, 405):  # 405 means already exists
            raise Exception(f"Failed to create {path}: {resp.status_code} {resp.text}")

    async def test_connection(self):
        """Test WebDAV connection by checking if sync folder is accessible."""
        def _test():
            if not self._check_exists(self.sync_folder):
                self._mkdir(self.sync_folder)
        await asyncio.to_thread(_test)

    async def ensure_remote_dir(self, remote_path: str):
        def _check():
            if not self._check_exists(remote_path):
                self._mkdir(remote_path)
        await asyncio.to_thread(_check)

    async def sync(self) -> dict:
        uploaded = 0
        downloaded = 0

        await self.ensure_remote_dir(self.sync_folder)
        remote_pdf_dir = f"{self.sync_folder}/pdfs"
        remote_notes_dir = f"{self.sync_folder}/notes"
        await self.ensure_remote_dir(remote_pdf_dir)
        await self.ensure_remote_dir(remote_notes_dir)

        # Upload local PDFs
        for local_file in UPLOAD_DIR.glob("*.pdf"):
            remote_path = f"{remote_pdf_dir}/{local_file.name}"
            try:
                exists = await asyncio.to_thread(self.client.check, remote_path)
                if not exists:
                    await asyncio.to_thread(self.client.upload_sync, remote_path=remote_path, local_path=str(local_file))
                    uploaded += 1
                else:
                    remote_info = await asyncio.to_thread(self.client.info, remote_path)
                    remote_modified = remote_info.get("modified")
                    local_modified = datetime.fromtimestamp(local_file.stat().st_mtime)
                    if remote_modified and isinstance(remote_modified, str):
                        # Compare and upload if local is newer
                        await asyncio.to_thread(self.client.upload_sync, remote_path=remote_path, local_path=str(local_file))
                        uploaded += 1
            except Exception as e:
                logger.warning(f"Failed to upload {local_file.name}: {e}")

        # Download remote PDFs not present locally
        try:
            remote_files = await asyncio.to_thread(self.client.list, remote_pdf_dir)
            for fname in remote_files:
                if not fname or fname.endswith("/"):
                    continue
                local_path = UPLOAD_DIR / fname
                if not local_path.exists():
                    remote_path = f"{remote_pdf_dir}/{fname}"
                    await asyncio.to_thread(self.client.download_sync, remote_path=remote_path, local_path=str(local_path))
                    downloaded += 1
        except Exception as e:
            logger.warning(f"Failed to list/download remote PDFs: {e}")

        return {"uploaded": uploaded, "downloaded": downloaded}
