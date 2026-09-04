#!/usr/bin/env python3
"""Deterministic API regression harness for Evidence -> Review.
Runs without provider keys and prints machine-readable JSON."""
from __future__ import annotations
import json, sqlite3, tempfile, time
from pathlib import Path
from jsonschema import Draft202012Validator, FormatChecker
from fastapi.testclient import TestClient
from api import Settings, create_app

# The runtime validates against phase2_current/state_spike/schemas/. A byte-identical
# duplicate used to sit at state-project-complete/schemas/, read by nothing but the
# drift check below -- a copy kept alive by the test that watched it for drift. The
# copy is gone; this validates against the schema the runtime actually uses.
RUNTIME_SCHEMA = json.loads((Path(__file__).parent / 'phase2_current/state_spike/schemas/structured_interpretation.schema.json').read_text())
RUNTIME_VALIDATOR = Draft202012Validator(RUNTIME_SCHEMA, format_checker=FormatChecker())

class Provider:
    name='harness'; model_identifier='deterministic-v1'
    def interpret(self, *, evidence, **kwargs): return payload(evidence['content'])

def review(proposed_changes, *, grouping=None, review_type='proposed_update'):
    r={'review_action':'create','review_type':review_type,'decision_question':'Review this evidence?',
       'why_consequential':'It may change maintained State.','affected_state_item_ids':['state_launch'] if review_type!='missing_understanding' else [],
       'proposed_changes':proposed_changes}
    if grouping is not None: r['grouping_reason']=grouping
    return r

def payload(case):
    if case=='no_review':
        return {'summary':'Confirms state','topics':['launch'],'outcome':'no_review','no_review_explanation':'No change','review_recommendations':[]}
    if case=='update_valid':
        return {'summary':'Date changed','topics':['launch'],'outcome':'review_recommended','review_recommendations':[review([
            {'operation':'update','state_item_id':'state_launch','expected_version':1,'proposed_statement':'Launch is October 15.','rationale':'Explicit date change'}])]} 
    if case=='create_expected_version_invalid':
        return {'summary':'New owner','topics':['owner'],'outcome':'review_recommended','review_recommendations':[review([
            {'operation':'create','expected_version':1,'proposed_statement':'Pilot owner is Maya.','rationale':'New fact'}], review_type='missing_understanding')]}
    if case=='grouping_singleton':
        return {'summary':'Date changed','topics':['launch'],'outcome':'review_recommended','review_recommendations':[review([
            {'operation':'update','state_item_id':'state_launch','expected_version':1,'proposed_statement':'Launch is October 15.','rationale':'Explicit date change'}], grouping='Single affected item')]}
    if case=='grouped_multi_valid':
        return {'summary':'Date changed and old item retired','topics':['launch'],'outcome':'review_recommended','review_recommendations':[review([
            {'operation':'update','state_item_id':'state_launch','expected_version':1,'proposed_statement':'Launch is October 15.','rationale':'Explicit date change'},
            {'operation':'create','proposed_statement':'Launch communications begin October 8.','rationale':'New related fact'}], grouping='Both changes are part of the same launch-timing decision')]}
    if case=='state_at_risk':
        return {'summary':'Date uncertain','topics':['launch'],'outcome':'review_recommended','review_recommendations':[review([], review_type='state_at_risk')]}
    if case=='stale_version':
        p=payload('update_valid'); p['review_recommendations'][0]['proposed_changes'][0]['expected_version']=99; return p
    if case=='retire_valid':
        return {'summary':'Launch item obsolete','topics':['launch'],'outcome':'review_recommended','review_recommendations':[review([
            {'operation':'retire','state_item_id':'state_launch','expected_version':1,'rationale':'Evidence makes item obsolete'}])]} 
    raise KeyError(case)

def errs(v,p): return [e.message for e in v.iter_errors(p)]

def run(case):
    p=payload(case); out={'case':case,'runtime_schema_errors':errs(RUNTIME_VALIDATOR,p)}
    with tempfile.TemporaryDirectory() as td:
        db=str(Path(td)/'state.db'); app=create_app(Settings(database_path=db,cors_origins=[]), Provider())
        with TestClient(app, raise_server_exceptions=False) as c:
            with sqlite3.connect(db) as conn:
                conn.execute("INSERT INTO current_state_items(id,topic,statement,version) VALUES('state_launch','launch','Launch is October 1.',1)"); conn.commit()
            before=len(c.get('/api/reviews').json()['items']); t=time.perf_counter(); r=c.post('/api/evidence',json={'content':case}); out['latency_ms']=round((time.perf_counter()-t)*1000,2); out['http_status']=r.status_code
            try: out['response']=r.json()
            except Exception: out['response_text']=r.text
            after=len(c.get('/api/reviews').json()['items']); out['open_review_delta']=after-before
            if r.status_code==201 and r.json().get('reviews'):
                rid=r.json()['reviews'][0]['id']; t=time.perf_counter(); rr=c.post(f'/api/reviews/{rid}/resolve',json={'decision':'accept'}); out['resolve_latency_ms']=round((time.perf_counter()-t)*1000,2); out['resolve_status']=rr.status_code
                try: out['resolve_response']=rr.json()
                except Exception: out['resolve_text']=rr.text
    return out

EXPECTED = {
    'create_expected_version_invalid': {'status': 422, 'review_delta': 0, 'schema_valid': False},
    'grouping_singleton': {'status': 422, 'review_delta': 0, 'schema_valid': False},
    'grouped_multi_valid': {'status': 201, 'review_delta': 1, 'schema_valid': True, 'resolve_status': 200},
    'no_review': {'status': 201, 'review_delta': 0, 'schema_valid': True},
    'update_valid': {'status': 201, 'review_delta': 1, 'schema_valid': True, 'resolve_status': 200},
    'state_at_risk': {'status': 201, 'review_delta': 1, 'schema_valid': True, 'resolve_status': 200},
    'stale_version': {'status': 422, 'review_delta': 0, 'schema_valid': True},
    'retire_valid': {'status': 201, 'review_delta': 1, 'schema_valid': True, 'resolve_status': 200},
}
LOCAL_LATENCY_BUDGET_MS = 1000

def assess(result):
    expected=EXPECTED[result['case']]
    schema_valid=not result['runtime_schema_errors']
    checks={
        'http_status': result['http_status']==expected['status'],
        'review_delta': result['open_review_delta']==expected['review_delta'],
        'schema_validity': schema_valid==expected['schema_valid'],
        'latency_budget': result['latency_ms'] < LOCAL_LATENCY_BUDGET_MS,
    }
    if 'resolve_status' in expected:
        checks['resolve_status']=result.get('resolve_status')==expected['resolve_status']
    result['checks']=checks
    result['passed']=all(checks.values())
    return result

def main():
    cases=list(EXPECTED)
    results=[assess(run(c)) for c in cases]
    output={
        'latency_budget_ms': LOCAL_LATENCY_BUDGET_MS,
        'passed': all(r['passed'] for r in results),
        'results': results,
    }
    print(json.dumps(output,indent=2))
    raise SystemExit(0 if output['passed'] else 1)
if __name__=='__main__': main()
