"""
Career page domains: platform subdomains, custom domain setup and DNS verification, host lookup and the
on-demand TLS check (certificates only for verified careers hosts).
"""

import pytest

from app.core.config import settings
from app.core.exceptions import BadRequestError, ConflictError
from app.services.domain_service import DomainService, clean_domain
from tests.fake_mongo import FakeDatabase


class FakeDns:
    def __init__(self):
        self.records = {}

    async def __call__(self, name, rtype):
        return self.records.get((name, rtype), [])


@pytest.fixture
def env(monkeypatch):
    monkeypatch.setattr(settings, "CAREERS_DOMAIN", "careers.hirelogics.test")
    db = FakeDatabase()
    db["companies"].docs.extend([
        {"id": "acme", "name": "Acme", "slug": "acme"},
        {"id": "globex", "name": "Globex", "slug": "globex"},
    ])
    dns = FakeDns()
    return db, dns, DomainService(db, dns=dns)


def test_clean_domain(monkeypatch):
    monkeypatch.setattr(settings, "CAREERS_DOMAIN", "careers.hirelogics.test")
    assert clean_domain(" https://Careers.Acme.com/jobs ") == "careers.acme.com"
    for bad in ("acme", "acme.com", "not a domain", "acme.careers.hirelogics.test", "-x.acme.com"):
        with pytest.raises(BadRequestError):
            clean_domain(bad)


@pytest.mark.asyncio
async def test_subdomain_on_off_and_lookup(env):
    _, _, svc = env
    assert (await svc.get("acme"))["subdomain"] == "acme.careers.hirelogics.test"
    assert await svc.resolve_host("acme.careers.hirelogics.test") is None      # off by default
    await svc.set_subdomain("acme", True)
    assert await svc.resolve_host("ACME.careers.hirelogics.test:443") == "acme"
    assert await svc.tls_allowed("acme.careers.hirelogics.test")
    assert not await svc.tls_allowed("globex.careers.hirelogics.test")
    assert not await svc.tls_allowed("evil.example.com")


@pytest.mark.asyncio
async def test_subdomains_need_the_server_setting(env, monkeypatch):
    _, _, svc = env
    monkeypatch.setattr(settings, "CAREERS_DOMAIN", "")
    assert (await svc.get("acme"))["subdomain_available"] is False
    with pytest.raises(BadRequestError):
        await svc.set_subdomain("acme", True)


@pytest.mark.asyncio
async def test_custom_domain_verification(env):
    _, dns, svc = env
    view = await svc.set_custom("acme", "careers.acme.com")
    token = view["dns"]["txt"]["value"]
    assert view["custom_status"] == "pending" and token.startswith("hl-verify-")
    assert view["dns"]["cname"]["value"] == "cname.careers.hirelogics.test"

    failed = await svc.verify("acme")
    assert failed["custom_status"] == "failed" and len(failed["problems"]) == 2
    assert await svc.resolve_host("careers.acme.com") is None

    dns.records[("_hirelogics.careers.acme.com", "TXT")] = [token]
    dns.records[("careers.acme.com", "CNAME")] = ["cname.careers.hirelogics.test"]
    ok = await svc.verify("acme")
    assert ok["custom_status"] == "verified" and ok["problems"] == []
    assert await svc.resolve_host("careers.acme.com") == "acme"
    assert await svc.tls_allowed("careers.acme.com")

    # Saving the same domain again keeps it verified and keeps the token.
    again = await svc.set_custom("acme", "careers.acme.com")
    assert again["custom_status"] == "verified" and again["dns"]["txt"]["value"] == token

    # A domain can belong to only one company.
    with pytest.raises(ConflictError):
        await svc.set_custom("globex", "careers.acme.com")

    removed = await svc.remove_custom("acme")
    assert removed["custom_domain"] == "" and await svc.resolve_host("careers.acme.com") is None
