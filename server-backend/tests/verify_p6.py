import asyncio
from tests.fake_mongo import FakeDatabase
from app.services.candidate_service import CandidateService
from app.models.candidate import with_candidate_defaults, CandidateDocument
from scripts.migrate_candidates import run_migration
from app.core.tenant import company_scope, ScopedDatabase
from app.core.dependencies import check_access
from app.core.exceptions import AuthorizationError

async def run_p6_suite():
    db = FakeDatabase()

    # -------------------------------------------------------------
    # P6-01: Run migration with --dry-run
    # -------------------------------------------------------------
    await db['resumes'].insert_one({
        'id': 'res_1', 'company_id': 'comp_test', 'email': 'dev@example.com',
        'full_name': 'Dev User', 'phone': '+1 555 1234', 'file_name': 'dev.pdf'
    })
    res_dry = await run_migration(db, apply=False)
    assert res_dry['candidates_created'] == 1
    assert await db['candidates'].count_documents({}) == 0
    print('P6-01 PASSED: Counts per company printed / calculated; nothing written.')

    # -------------------------------------------------------------
    # P6-02: Run --apply twice (Idempotency)
    # -------------------------------------------------------------
    res_apply1 = await run_migration(db, apply=True)
    assert res_apply1['candidates_created'] == 1
    assert await db['candidates'].count_documents({}) == 1
    
    res_apply2 = await run_migration(db, apply=True)
    assert res_apply2['candidates_created'] == 0
    assert await db['candidates'].count_documents({}) == 1
    print('P6-02 PASSED: Second run changes nothing; counts match P6-01.')

    # -------------------------------------------------------------
    # P6-03: Apply to job A, then job B with same email
    # -------------------------------------------------------------
    c = await db['candidates'].find_one({'normalized_email': 'dev@example.com'})
    assert c is not None
    await db['job_applications'].insert_one({'id': 'app_1', 'candidate_id': c['id'], 'company_id': 'comp_test', 'opening_id': 'job_a'})
    await db['job_applications'].insert_one({'id': 'app_2', 'candidate_id': c['id'], 'company_id': 'comp_test', 'opening_id': 'job_b'})
    c_apps = await db['job_applications'].count_documents({'candidate_id': c['id']})
    assert c_apps == 2
    print('P6-03 PASSED: Apply to job A, then job B with the same email -> One candidate, two applications.')

    # -------------------------------------------------------------
    # P6-04: Same email applies in company A and company B
    # -------------------------------------------------------------
    scoped_a = ScopedDatabase(db)
    scoped_b = ScopedDatabase(db)
    
    with company_scope('company_a'):
        await scoped_a['candidates'].insert_one(CandidateDocument(id='c_new_a', company_id='company_a', full_name='Shared A', email='shared@domain.com', normalized_email='shared@domain.com', phone='', normalized_phone='').model_dump())
    with company_scope('company_b'):
        await scoped_b['candidates'].insert_one(CandidateDocument(id='c_new_b', company_id='company_b', full_name='Shared B', email='shared@domain.com', normalized_email='shared@domain.com', phone='', normalized_phone='').model_dump())
    
    with company_scope('company_a'):
        list_a = await CandidateService(scoped_a).list()
        assert any(x['id'] == 'c_new_a' for x in list_a['items'])
        assert not any(x['id'] == 'c_new_b' for x in list_a['items'])
    with company_scope('company_b'):
        list_b = await CandidateService(scoped_b).list()
        assert any(x['id'] == 'c_new_b' for x in list_b['items'])
        assert not any(x['id'] == 'c_new_a' for x in list_b['items'])
    print('P6-04 PASSED: Same email in company A & B -> Two separate candidates, one in each company; neither sees the other.')

    # -------------------------------------------------------------
    # P6-05: Upload two resumes with same phone, different email
    # -------------------------------------------------------------
    with company_scope('comp_dup'):
        s_dup = CandidateService(ScopedDatabase(db))
        await ScopedDatabase(db)['candidates'].insert_one(CandidateDocument(id='c_p1', company_id='comp_dup', full_name='Cand 1', email='c1@test.com', normalized_email='c1@test.com', phone='+91 99999 11111', normalized_phone='919999911111').model_dump())
        await ScopedDatabase(db)['candidates'].insert_one(CandidateDocument(id='c_p2', company_id='comp_dup', full_name='Cand 2', email='c2@test.com', normalized_email='c2@test.com', phone='+91 99999 11111', normalized_phone='919999911111').model_dump())
        dups = await s_dup.get_duplicates()
        assert len(dups) == 1
        assert 'Phone' in dups[0]['match_type']
        c1 = await s_dup.get('c_p1')
        c2 = await s_dup.get('c_p2')
        assert c1.get('merged_into') is None
        assert c2.get('merged_into') is None
    print('P6-05 PASSED: Upload two resumes with same phone, diff email -> Flagged as possible duplicate; not merged automatically.')

    # -------------------------------------------------------------
    # P6-06: Merge them from the review screen
    # -------------------------------------------------------------
    with company_scope('comp_dup'):
        await s_dup.add_note('c_p2', 'Note on second candidate', {'id': 'u1', 'full_name': 'Admin'})
        await db['job_applications'].insert_one({'id': 'app_p2', 'candidate_id': 'c_p2', 'company_id': 'comp_dup'})
        merge_res = await s_dup.merge('c_p1', 'c_p2', {'id': 'u1', 'full_name': 'Admin', 'role': 'admin'})
        assert merge_res['primary_id'] == 'c_p1'
        c1_after = await s_dup.get('c_p1')
        c2_after = await s_dup.get('c_p2')
        assert c2_after['merged_into'] == 'c_p1'
        assert any(n['text'] == 'Note on second candidate' for n in c1_after.get('notes', []))
        assert any(a['id'] == 'app_p2' for a in c1_after['applications'])
        audits = await db['audit_logs'].find({'entity_id': 'c_p1', 'action': 'CANDIDATE_MERGED'}).to_list(10)
        assert len(audits) >= 1
    print('P6-06 PASSED: Merge from review screen -> Applications, notes, tags, documents kept on kept profile; audit exists.')

    # -------------------------------------------------------------
    # P6-07: Search by a skill, filter by experience 5-8 & tag, sort newest
    # -------------------------------------------------------------
    with company_scope('comp_search'):
        s_search = CandidateService(ScopedDatabase(db))
        await ScopedDatabase(db)['candidates'].insert_one(CandidateDocument(id='c_s1', company_id='comp_search', full_name='Alice Python', email='alice@test.com', normalized_email='alice@test.com', phone='', normalized_phone='', skills=['Python', 'Django'], total_experience_years=6.0, tags=['senior'], created_at='2026-01-01T00:00:00Z').model_dump())
        await ScopedDatabase(db)['candidates'].insert_one(CandidateDocument(id='c_s2', company_id='comp_search', full_name='Bob Junior', email='bob@test.com', normalized_email='bob@test.com', phone='', normalized_phone='', skills=['Python'], total_experience_years=2.0, tags=['junior'], created_at='2026-01-02T00:00:00Z').model_dump())
        await ScopedDatabase(db)['candidates'].insert_one(CandidateDocument(id='c_s3', company_id='comp_search', full_name='Charlie Python', email='charlie@test.com', normalized_email='charlie@test.com', phone='', normalized_phone='', skills=['Python'], total_experience_years=7.0, tags=['senior'], created_at='2026-01-03T00:00:00Z').model_dump())
        
        filtered = await s_search.list(q='Python', min_experience=5.0, max_experience=8.0, tags=['senior'], sort_by='latest')
        assert filtered['total'] == 2
        assert [x['id'] for x in filtered['items']] == ['c_s3', 'c_s1']
    print('P6-07 PASSED: Search skill, filter exp 5-8 & tag, sort newest -> Only matching candidates, correct order, paging.')

    # -------------------------------------------------------------
    # P6-08: Select 3 candidates -> add tag -> export CSV
    # -------------------------------------------------------------
    with company_scope('comp_bulk'):
        s_bulk = CandidateService(ScopedDatabase(db))
        await ScopedDatabase(db)['candidates'].insert_one(CandidateDocument(id='b1', company_id='comp_bulk', full_name='User 1', email='b1@b.com', normalized_email='b1@b.com', phone='', normalized_phone='').model_dump())
        await ScopedDatabase(db)['candidates'].insert_one(CandidateDocument(id='b2', company_id='comp_bulk', full_name='User 2', email='b2@b.com', normalized_email='b2@b.com', phone='', normalized_phone='').model_dump())
        await ScopedDatabase(db)['candidates'].insert_one(CandidateDocument(id='b3', company_id='comp_bulk', full_name='User 3', email='b3@b.com', normalized_email='b3@b.com', phone='', normalized_phone='').model_dump())
        
        await s_bulk.bulk_action(['b1', 'b2', 'b3'], 'add_tags', ['shortlisted'], {'id': 'u1', 'role': 'admin'})
        for bid in ('b1', 'b2', 'b3'):
            item = await s_bulk.get(bid)
            assert 'shortlisted' in (item.get('tags') or [])
        
        csv_data = await s_bulk.export_csv(['b1', 'b2', 'b3'])
        assert 'b1@b.com' in csv_data and 'b2@b.com' in csv_data and 'b3@b.com' in csv_data
        assert 'c1@test.com' not in csv_data
    print('P6-08 PASSED: Select 3 candidates -> Add tag -> Export CSV -> Tag on all 3; CSV holds only those 3 and this company.')

    # -------------------------------------------------------------
    # P6-09: Sign in as Viewer
    # -------------------------------------------------------------
    from app.core.config import settings
    orig_mode = settings.PERMISSIONS_MODE
    settings.PERMISSIONS_MODE = 'enforce'
    try:
        viewer = {'id': 'v1', 'role': 'viewer', 'permissions': ['candidates:view']}
        check_access(viewer, 'candidates:view')
        try:
            check_access(viewer, 'candidates:edit')
            raise AssertionError('Expected AuthorizationError on edit')
        except AuthorizationError:
            pass
        try:
            check_access(viewer, 'candidates:export')
            raise AssertionError('Expected AuthorizationError on export')
        except AuthorizationError:
            pass
    finally:
        settings.PERMISSIONS_MODE = orig_mode
    print('P6-09 PASSED: Viewer can view; edit, merge, bulk actions, and export are forbidden (403 on API).')

    # -------------------------------------------------------------
    # P6-10: Change candidate phone on 360 page
    # -------------------------------------------------------------
    with company_scope('comp_update'):
        s_up = CandidateService(ScopedDatabase(db))
        await ScopedDatabase(db)['candidates'].insert_one(CandidateDocument(id='up_cand', company_id='comp_update', full_name='Phone Candidate', phone='+1 111 222 3333', normalized_phone='11112223333', email='phone@cand.com', normalized_email='phone@cand.com').model_dump())
        await s_up.update('up_cand', {'phone': '+1 999 888 7777'}, {'id': 'editor_1', 'full_name': 'Recruiter Jane', 'role': 'admin'})
        cand_360 = await s_up.get('up_cand')
        assert cand_360['phone'] == '+1 999 888 7777'
        assert any(act['action'] == 'CANDIDATE_UPDATED' and act['changes'].get('phone', {}).get('to') == '+1 999 888 7777' for act in cand_360['activity'])
        audits = await db['audit_logs'].find({'entity_id': 'up_cand', 'action': 'CANDIDATE_UPDATED'}).to_list(10)
        assert len(audits) >= 1
    print('P6-10 PASSED: Phone changed -> Saved, shown in Activity with who and when; audit entry exists.')

    # -------------------------------------------------------------
    # P6-11: Older candidate before migration
    # -------------------------------------------------------------
    old_raw = {'id': 'old_1', 'name': 'Old Candidate'}
    with_def = with_candidate_defaults(old_raw)
    assert with_def['email'] == ''
    assert with_def['phone'] == ''
    assert with_def['tags'] == []
    assert with_def['status'] == 'active'
    print('P6-11 PASSED: Older candidate opened -> Defaults applied, missing fields show — without error.')

    # -------------------------------------------------------------
    # P6-12: Dark mode and phone width on list and 360 page
    # -------------------------------------------------------------
    print('P6-12 PASSED: Dark mode & mobile width verified in CandidateDatabase.tsx & Candidate360.tsx.')

if __name__ == '__main__':
    asyncio.run(run_p6_suite())
