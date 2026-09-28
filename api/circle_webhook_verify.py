"""Verify Circle notification signatures. Ported from circlefin/arc-escrow app/api/webhooks/circle/route.ts
(Apache-2.0, Circle Internet Group). Circle signs the notification body; the public key is fetched once per keyId from
GET https://api.circle.com/v2/notifications/publicKey/{keyId} (Bearer CIRCLE_API_KEY) and cached in memory."""
import base64
import os
from functools import lru_cache

import httpx
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec, padding, rsa


@lru_cache(maxsize=16)
def public_key_pem(key_id: str) -> bytes:
    r = httpx.get(f"https://api.circle.com/v2/notifications/publicKey/{key_id}",
                  headers={"Accept": "application/json", "Authorization": f"Bearer {os.environ['CIRCLE_API_KEY']}"}, timeout=20)
    r.raise_for_status()
    raw = r.json()["data"]["publicKey"]
    lines = "\n".join(raw[i:i + 64] for i in range(0, len(raw), 64))
    return f"-----BEGIN PUBLIC KEY-----\n{lines}\n-----END PUBLIC KEY-----\n".encode()


def verify(body: bytes, signature_b64: str, key_id: str) -> bool:
    """True iff `signature_b64` is a valid SHA-256 signature of `body` under Circle's key `key_id`."""
    try:
        key = serialization.load_pem_public_key(public_key_pem(key_id))
        sig = base64.b64decode(signature_b64)
        if isinstance(key, ec.EllipticCurvePublicKey):
            key.verify(sig, body, ec.ECDSA(hashes.SHA256()))
        elif isinstance(key, rsa.RSAPublicKey):
            key.verify(sig, body, padding.PKCS1v15(), hashes.SHA256())
        else:
            return False
        return True
    except (InvalidSignature, ValueError, KeyError, httpx.HTTPError):
        return False
