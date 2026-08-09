#!/usr/bin/env python3
"""Refresh the vendored AAGUID -> authenticator name list.

Every authenticator reports an AAGUID identifying its model when a credential is created.
Resolving it to a product name is what turns "Passkey 2" into "YubiKey 5 Series" in the passkey
list. The list is vendored rather than fetched at runtime: it changes a few times a year, and a
failed download must never break a registration.

Two sources, because neither covers the other's ground — the same reason authentik imports both:

* FIDO Metadata Service (MDS3) — certified hardware authenticators (YubiKey, Feitian, ...).
  A JWT signed by the FIDO Alliance, verified here against a pinned GlobalSign root.
* passkeydeveloper/passkey-authenticator-aaguids — the software credential managers people
  actually use (iCloud Keychain, Google Password Manager, Windows Hello, 1Password), none of
  which appear in MDS3.

The community names win on conflict: they are the product names users recognise, where MDS3
descriptions lean technical.

Only names are kept — the community file is ~312 KB, almost all of it base64 icons, and the
MDS3 blob is ~10 MB.

Usage: just update-aaguids
"""

import base64
import json
import urllib.error
import urllib.request
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.x509.verification import PolicyBuilder, Store

MDS3 = "https://mds3.fidoalliance.org/"
COMMUNITY = "https://raw.githubusercontent.com/passkeydeveloper/passkey-authenticator-aaguids/main/aaguid.json"

TOOLS = Path(__file__).resolve().parent
TARGET = TOOLS.parent / "services" / "mtg" / "aaguid.json"
# Pinned rather than taken from the system trust store: this verifies one specific signer, and
# the set of roots that may vouch for it should not depend on the machine running the script.
ROOT_CA = TOOLS / "globalsign-root-r3.pem"
MDS3_HOST = "mds.fidoalliance.org"


def _download(url: str) -> bytes:
    """Fetch a url, turning the failures this script actually hits into a readable message."""
    try:
        with urllib.request.urlopen(url) as response:
            return response.read()
    except urllib.error.HTTPError as error:
        if error.code == 429:
            raise SystemExit(f"{url} is rate limiting — try again in a few minutes") from error
        raise SystemExit(f"{url} returned HTTP {error.code}") from error
    except urllib.error.URLError as error:
        raise SystemExit(f"{url} unreachable: {error.reason}") from error


def _b64url(segment: str) -> bytes:
    """Decode a JWT segment, which omits the padding."""
    return base64.urlsafe_b64decode(segment + "=" * (-len(segment) % 4))


def fetch_mds3() -> dict[str, str]:
    """Download the MDS3 blob, verify its signature, and return aaguid -> description."""
    token = _download(MDS3).decode("ascii").strip()

    header_b64, payload_b64, signature_b64 = token.split(".")
    header = json.loads(_b64url(header_b64))
    if header.get("alg") != "RS256":
        raise SystemExit(f"unexpected MDS3 signature algorithm: {header.get('alg')}")

    chain = [x509.load_der_x509_certificate(base64.b64decode(c)) for c in header["x5c"]]
    root = x509.load_pem_x509_certificate(ROOT_CA.read_bytes())

    # Validates the chain up to the pinned root: signatures, validity dates and the identity of
    # the leaf. A blob signed by anyone else is rejected here rather than silently trusted.
    verifier = PolicyBuilder().store(Store([root])).build_server_verifier(x509.DNSName(MDS3_HOST))
    verifier.verify(chain[0], chain[1:])

    chain[0].public_key().verify(
        _b64url(signature_b64),
        f"{header_b64}.{payload_b64}".encode("ascii"),
        padding.PKCS1v15(),
        hashes.SHA256(),
    )

    payload = json.loads(_b64url(payload_b64))
    names: dict[str, str] = {}
    for entry in payload.get("entries", []):
        aaguid = entry.get("aaguid")
        description = entry.get("metadataStatement", {}).get("description")
        # Entries without an aaguid are U2F authenticators, which predate it.
        if not aaguid or not description:
            continue
        # A revoked authenticator is one nobody should be encouraged to keep using; naming it
        # would suggest it is fine.
        if any(report.get("status") == "REVOKED" for report in entry.get("statusReports", [])):
            continue
        names[aaguid.lower()] = description
    return names


def fetch_community() -> dict[str, str]:
    """Download the community list and return aaguid -> name."""
    upstream = json.loads(_download(COMMUNITY))
    return {aaguid.lower(): entry["name"] for aaguid, entry in upstream.items() if entry.get("name")}


def main() -> None:
    mds3 = fetch_mds3()
    community = fetch_community()
    names = mds3 | community

    if not names:
        raise SystemExit("both sources came back empty — refusing to overwrite")

    previous = json.loads(TARGET.read_text(encoding="utf-8")) if TARGET.exists() else {}

    with TARGET.open("w", encoding="utf-8") as target:
        json.dump(names, target, indent=2, ensure_ascii=False, sort_keys=True)
        target.write("\n")

    print(f"MDS3: {len(mds3)}, community: {len(community)}, merged: {len(names)}")
    for aaguid in sorted(set(names) - set(previous)):
        print(f"  + {names[aaguid]}")
    for aaguid in sorted(set(previous) - set(names)):
        print(f"  - {previous[aaguid]}")


if __name__ == "__main__":
    main()
