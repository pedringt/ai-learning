#!/usr/bin/env python3
from __future__ import annotations
import json, sqlite3, tempfile, time, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from fastapi.testclient import TestClient
from api import Settings, create_app


def rec(changes, *, review_type='proposed_update', affected=None, grouping=None, question='Review this change?'):
    r = {
        'review_action':'create',
        'review_type':review_type,
        'decision_question':question,
        'why_consequential':'This evidence may change maintained State.',
        'affected_state_item_ids': affected if affected is not None else [],
        'proposed_changes':changes,
    }
    if grouping is not None:
        r['grouping_reason'] = grouping
    return r

def no_review(summary, topics, explanation):
    return {'summary':summary,'topics':topics,'outcome':'no_review','no_review_explanation':explanation,'review_recommendations':[]}

def review_payload(summary, topics, recommendations):
    return {'summary':summary,'topics':topics,'outcome':'review_recommended','review_recommendations':recommendations}

CASES = {
 '01_simple_create': {
   'note':'We now support SSO for enterprise customers.',
   'payload': review_payload('Enterprise SSO is now supported',['sso'],[rec([
      {'operation':'create','proposed_statement':'Enterprise customers can use SSO.','rationale':'Evidence states a new supported capability.'}
   ], affected=[])]), 'status':201,'reviews':1},
 '02_update_no_date': {
   'note':'We can now fully automate password reset tickets.',
   'payload': review_payload('Password resets can now be fully automated',['password_reset'],[rec([
      {'operation':'update','state_item_id':'state_password','expected_version':1,'proposed_statement':'Password reset tickets can be fully automated.','rationale':'Evidence changes the known automation capability.'}
   ], affected=['state_password'])]), 'status':201,'reviews':1},
 '03_explicit_date': {
   'note':'Starting October 15, 2026, password resets will be fully automated.',
   'payload': review_payload('Password reset automation starts October 15, 2026',['password_reset'],[rec([
      {'operation':'update','state_item_id':'state_password','expected_version':1,'proposed_statement':'Password reset tickets will be fully automated starting October 15, 2026.','rationale':'Evidence gives a dated capability change.','effective_date':'2026-10-15'}
   ], affected=['state_password'])]), 'status':201,'reviews':1},
 '04_vague_timing_omit_date': {
   'note':'Once security approves it, we can automate password resets.',
   'payload': review_payload('Password reset automation depends on security approval',['password_reset','security'],[rec([], review_type='state_at_risk', affected=['state_password'], question='Does pending security approval change our current password-reset automation State?')]), 'status':201,'reviews':1},
 '05_future_aspiration': {
   'note':'We hope to automate password resets next quarter.',
   'payload': no_review('Password reset automation is an aspiration for next quarter',['password_reset'],'The note describes a hope, not established current or decided future State.'), 'status':201,'reviews':0},
 '06_state_at_risk': {
   'note':'The vendor told us the API we depend on may be deprecated.',
   'payload': review_payload('A dependency API may be deprecated',['vendor_api'],[rec([], review_type='state_at_risk', affected=['state_api'])]), 'status':201,'reviews':1},
 '07_retire': {
   'note':'We no longer require manual approval for password resets.',
   'payload': review_payload('Manual password-reset approval is no longer required',['password_reset'],[rec([
      {'operation':'retire','state_item_id':'state_manual_approval','expected_version':1,'rationale':'Evidence says the requirement no longer applies.'}
   ], affected=['state_manual_approval'])]), 'status':201,'reviews':1},
 '08_grouped_coupled': {
   'note':'Security approved automation, and password resets no longer require manual review.',
   'payload': review_payload('Security approval enables removal of manual review',['password_reset','security'],[rec([
      {'operation':'update','state_item_id':'state_password','expected_version':1,'proposed_statement':'Password reset automation is security-approved.','rationale':'Security approval changes readiness.'},
      {'operation':'retire','state_item_id':'state_manual_approval','expected_version':1,'rationale':'Manual review is no longer required.'}
   ], affected=['state_password','state_manual_approval'], grouping='Both changes are consequences of the same security approval decision.')]), 'status':201,'reviews':1},
 '09_unrelated_two_reviews': {
   'note':'Password resets are automated. Also, Acme renewed its contract.',
   'payload': review_payload('Two unrelated facts changed',['password_reset','acme'],[
      rec([{'operation':'update','state_item_id':'state_password','expected_version':1,'proposed_statement':'Password reset tickets are automated.','rationale':'Evidence changes automation status.'}], affected=['state_password'], question='Update password-reset automation status?'),
      rec([{'operation':'create','proposed_statement':'Acme renewed its contract.','rationale':'Evidence establishes a separate commercial fact.'}], affected=[], question='Add Acme contract renewal to Current State?'),
   ]), 'status':201,'reviews':2},
 '10_mixed_certain_speculative': {
   'note':'Password resets are automated, and I think MFA might be removed later.',
   'payload': review_payload('Password resets are automated; MFA removal is speculative',['password_reset','mfa'],[
      rec([{'operation':'update','state_item_id':'state_password','expected_version':1,'proposed_statement':'Password reset tickets are automated.','rationale':'This portion is stated as fact.'}], affected=['state_password']),
      rec([], review_type='state_at_risk', affected=['state_mfa'], question='Does the speculative possibility of removing MFA warrant a State change?'),
   ]), 'status':201,'reviews':2},
 '11_negation': {
   'note':'We cannot fully automate password resets yet.',
   'payload': review_payload('Password resets cannot yet be fully automated',['password_reset'],[rec([], review_type='state_at_risk', affected=['state_password'])]), 'status':201,'reviews':1},
 '12_correction': {
   'note':'Correction: the rollout is October 20, not October 15.',
   'payload': review_payload('The rollout date is corrected to October 20, 2026',['rollout'],[rec([
      {'operation':'update','state_item_id':'state_rollout','expected_version':1,'proposed_statement':'The rollout is October 20, 2026.','rationale':'Evidence explicitly corrects the prior date.','effective_date':'2026-10-20'}
   ], affected=['state_rollout'])]), 'status':201,'reviews':1},
 '13_noisy_conversation': {
   'note':'Talked to Sam — great call. BTW password resets are finally automated! Need to tell support.',
   'payload': review_payload('Password resets are now automated',['password_reset'],[rec([
      {'operation':'update','state_item_id':'state_password','expected_version':1,'proposed_statement':'Password reset tickets are automated.','rationale':'The substantive operational fact is explicit.'}
   ], affected=['state_password'])]), 'status':201,'reviews':1},
 '14_irrelevant_note': {
   'note':'Met with support for 30 minutes today.',
   'payload': no_review('A support meeting occurred',['support'],'The note does not establish a consequential maintained-State change.'), 'status':201,'reviews':0},
 '15_ambiguous_referent': {
   'note':'That workflow is now fully automated.',
   'payload': review_payload('An unspecified workflow is said to be automated',['automation'],[rec([], review_type='missing_understanding', affected=[], question='Which workflow does this evidence refer to?')]), 'status':201,'reviews':1},
 '16_invalid_sentinel_date': {
   'note':'We can now fully automate password reset tickets. [simulate model sentinel]',
   'payload': review_payload('Password resets can now be automated',['password_reset'],[rec([
      {'operation':'update','state_item_id':'state_password','expected_version':1,'proposed_statement':'Password reset tickets can be fully automated.','rationale':'Capability changed.','effective_date':'upon_decision'}
   ], affected=['state_password'])]), 'status':201,'reviews':1},
 '17_invalid_partial_date': {
   'note':'Rollout is in October 2026. [simulate partial date]',
   'payload': review_payload('Rollout is in October 2026',['rollout'],[rec([
      {'operation':'update','state_item_id':'state_rollout','expected_version':1,'proposed_statement':'The rollout is in October 2026.','rationale':'Timing changed.','effective_date':'2026-10'}
   ], affected=['state_rollout'])]), 'status':201,'reviews':1},
 '18_approval_is_not_implementation': {
   'note':'Password reset tickets were approved for automation.',
   'payload': review_payload('Password reset automation was approved',['password_reset'],[rec([
      {'operation':'create','proposed_statement':'Password reset tickets are approved for automation.','rationale':'The Evidence establishes approval, not implementation or deployment.'}
   ], review_type='missing_understanding', affected=[], question='Add the password-reset automation approval to Current State?')]), 'status':201,'reviews':1},
}

class Provider:
    name='note-matrix'; model_identifier='deterministic-note-matrix-v1'
    def interpret(self, *, evidence, **kwargs):
        for c in CASES.values():
            if evidence['content'] == c['note']:
                return c['payload']
        raise KeyError(evidence['content'])

def seed(db):
    rows = [
      ('state_password','password_reset','Password reset tickets require some manual handling.',1),
      ('state_manual_approval','password_reset','Password resets require manual approval.',1),
      ('state_api','vendor_api','Our workflow depends on the vendor API.',1),
      ('state_mfa','mfa','MFA is required.',1),
      ('state_rollout','rollout','The rollout is October 15, 2026.',1),
    ]
    with sqlite3.connect(db) as conn:
        conn.executemany('INSERT INTO current_state_items(id,topic,statement,version) VALUES(?,?,?,?)', rows)
        conn.commit()

def main():
    results=[]
    for name, case in CASES.items():
        with tempfile.TemporaryDirectory() as td:
            db=str(Path(td)/'state.db')
            app=create_app(Settings(database_path=db,cors_origins=[]), Provider())
            with TestClient(app, raise_server_exceptions=False) as c:
                seed(db)
                before = len(c.get('/api/reviews').json()['items'])
                t=time.perf_counter(); r=c.post('/api/evidence',json={'content':case['note'],'source_type':'qa_matrix'}); ms=round((time.perf_counter()-t)*1000,2)
                after = len(c.get('/api/reviews').json()['items'])
                delta=after-before
                row={'case':name,'status':r.status_code,'expected_status':case['status'],'review_delta':delta,'expected_reviews':case['reviews'],'latency_ms':ms}
                row['passed']=r.status_code==case['status'] and delta==case['reviews']
                if not row['passed']:
                    try: row['response']=r.json()
                    except: row['response_text']=r.text
                results.append(row)
    out={'passed':all(x['passed'] for x in results),'total':len(results),'passed_count':sum(x['passed'] for x in results),'results':results}
    print(json.dumps(out,indent=2))
    raise SystemExit(0 if out['passed'] else 1)

if __name__=='__main__': main()
