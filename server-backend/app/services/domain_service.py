"""
Career page domains (plan §4, decision 2): each company chooses a platform subdomain
(`<slug>.<CAREERS_DOMAIN>`) or its own domain (`careers.acme.com`).

Custom domain setup:
  1. The company enters its domain; we give it a CNAME target and a TXT verification value.
  2. It adds both DNS records at its DNS provider.
  3. "Verify" looks the records up (DNS over HTTPS) and marks the domain verified.
  4. A web server with on-demand TLS (e.g. Caddy) asks `tls_allowed` before issuing a certificate, so
     certificates are only ever issued for verified domains.

Stored on the company: careers_domains = {subdomain_enabled, custom_domain, custom_status, verify_token,
verified_at, last_check}.
"""

import re
import secrets
from typing import Any, Dict, List, Optional

import httpx
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import settings
from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.utils.constants import COMPANIES_COLLECTION
from app.utils.helpers import utc_now

DOMAIN = re.compile(r"^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$")
VERIFY_PREFIX = "_hirelogics"
DOH_URL = "https://cloudflare-dns.com/dns-query"

STATUS_PENDING = "pending"
STATUS_VERIFIED = "verified"
STATUS_FAILED = "failed"


def careers_domain() -> str:
    return (getattr(settings, "CAREERS_DOMAIN", "") or "").strip().lower().strip(".")


def clean_domain(value: str) -> str:
    d = (value or "").strip().lower()
    d = re.sub(r"^https?://", "", d).split("/")[0].split(":")[0].strip(".")
    if not DOMAIN.match(d):
        raise BadRequestError("Enter a domain like careers.yourcompany.com.")
    base = careers_domain()
    if base and (d == base or d.endswith("." + base)):
        raise BadRequestError("That is a platform address. Turn on the platform subdomain instead.")
    if d.count(".") < 2:
        raise BadRequestError("Use a subdomain such as careers.yourcompany.com, not the main domain.")
    return d


async def _dns(name: str, rtype: str) -> List[str]:
    """Record values for `name`, from a public DNS-over-HTTPS resolver."""
    async with httpx.AsyncClient(timeout=8) as client:
        r = await client.get(DOH_URL, params={"name": name, "type": rtype}, headers={"accept": "application/dns-json"})
        r.raise_for_status()
        return [str(a.get("data", "")).strip('"').rstrip(".").lower() for a in r.json().get("Answer", []) or []]


class DomainService:
    def __init__(self, db: AsyncIOMotorDatabase, dns=_dns):
        self.db = db
        self.dns = dns

    async def _company(self, company_id: str) -> Dict[str, Any]:
        company = await self.db[COMPANIES_COLLECTION].find_one({"id": company_id})
        if not company:
            raise NotFoundError("Company not found.")
        return company

    async def _save(self, company_id: str, domains: Dict[str, Any]) -> None:
        await self.db[COMPANIES_COLLECTION].update_one({"id": company_id}, {"$set": {"careers_domains": domains}})

    def view(self, company: Dict[str, Any]) -> Dict[str, Any]:
        d = company.get("careers_domains") or {}
        base = careers_domain()
        custom = d.get("custom_domain") or ""
        return {
            "careers_domain": base,
            "subdomain_available": bool(base),
            "subdomain_enabled": bool(d.get("subdomain_enabled")) and bool(base),
            "subdomain": f"{company['slug']}.{base}" if base else "",
            "custom_domain": custom,
            "custom_status": d.get("custom_status") or ("" if not custom else STATUS_PENDING),
            "verified_at": d.get("verified_at"),
            "last_check": d.get("last_check"),
            "dns": {
                "cname": {"name": custom, "value": f"cname.{base}" if base else "your platform address"},
                "txt": {"name": f"{VERIFY_PREFIX}.{custom}", "value": d.get("verify_token", "")},
            } if custom else None,
        }

    async def get(self, company_id: str) -> Dict[str, Any]:
        return self.view(await self._company(company_id))

    async def set_subdomain(self, company_id: str, enabled: bool) -> Dict[str, Any]:
        if enabled and not careers_domain():
            raise BadRequestError("Platform subdomains aren't set up on this server yet (CAREERS_DOMAIN).")
        company = await self._company(company_id)
        await self._save(company_id, {**(company.get("careers_domains") or {}), "subdomain_enabled": bool(enabled)})
        return await self.get(company_id)

    async def set_custom(self, company_id: str, domain: str) -> Dict[str, Any]:
        d = clean_domain(domain)
        taken = await self.db[COMPANIES_COLLECTION].find_one({"careers_domains.custom_domain": d, "id": {"$ne": company_id}})
        if taken:
            raise ConflictError("Another company already uses that domain.")
        company = await self._company(company_id)
        current = company.get("careers_domains") or {}
        same = current.get("custom_domain") == d
        await self._save(company_id, {
            **current,
            "custom_domain": d,
            "custom_status": current.get("custom_status") if same else STATUS_PENDING,
            "verify_token": current.get("verify_token") if same and current.get("verify_token") else f"hl-verify-{secrets.token_hex(12)}",
            "verified_at": current.get("verified_at") if same else None,
            "last_check": current.get("last_check") if same else None,
        })
        return await self.get(company_id)

    async def remove_custom(self, company_id: str) -> Dict[str, Any]:
        company = await self._company(company_id)
        current = company.get("careers_domains") or {}
        await self._save(company_id, {"subdomain_enabled": bool(current.get("subdomain_enabled"))})
        return await self.get(company_id)

    async def verify(self, company_id: str) -> Dict[str, Any]:
        company = await self._company(company_id)
        current = company.get("careers_domains") or {}
        domain = current.get("custom_domain")
        if not domain:
            raise BadRequestError("Add a custom domain first.")
        problems: List[str] = []
        try:
            txt = await self.dns(f"{VERIFY_PREFIX}.{domain}", "TXT")
            if current.get("verify_token") not in txt:
                problems.append(f"TXT record {VERIFY_PREFIX}.{domain} not found (or has another value).")
            base = careers_domain()
            if base:
                cname = await self.dns(domain, "CNAME")
                if not any(c == f"cname.{base}" or c.endswith("." + base) or c == base for c in cname):
                    problems.append(f"CNAME for {domain} doesn't point to cname.{base} yet.")
        except httpx.HTTPError:
            problems.append("We couldn't reach the DNS checker. Try again in a minute.")
        now = utc_now().isoformat()
        ok = not problems
        await self._save(company_id, {
            **current,
            "custom_status": STATUS_VERIFIED if ok else STATUS_FAILED,
            "verified_at": now if ok else current.get("verified_at"),
            "last_check": {"at": now, "problems": problems},
        })
        return {**await self.get(company_id), "problems": problems}

    # ── Public ───────────────────────────────────────────────────────────────

    async def resolve_host(self, host: str) -> Optional[str]:
        """The company slug a careers host belongs to, or None."""
        host = (host or "").strip().lower().split(":")[0].strip(".")
        if not host:
            return None
        base = careers_domain()
        if base and host.endswith("." + base):
            slug = host[: -len(base) - 1]
            company = await self.db[COMPANIES_COLLECTION].find_one({"slug": slug})
            if company and (company.get("careers_domains") or {}).get("subdomain_enabled"):
                return slug
            return None
        company = await self.db[COMPANIES_COLLECTION].find_one(
            {"careers_domains.custom_domain": host, "careers_domains.custom_status": STATUS_VERIFIED}
        )
        return company["slug"] if company else None

    async def tls_allowed(self, domain: str) -> bool:
        return (await self.resolve_host(domain)) is not None
