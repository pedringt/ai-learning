#!/usr/bin/env python3
"""Deterministic API regression harness for Evidence -> Review.

Runs without provider keys and prints machine-readable JSON.

What this asserts is the enforcement model, not just status codes. State's
contract is that the LLM interprets and software enforces, so a model that
emits a field it was told not to emit does not fail the user's submission --
software corrects it. Three cases below exercise exactly that: backend-owned
fields on a create, a grouping reason on a single change, and a stale
concurrency version. All three are accepted and normalized, and the harness
checks what was *stored*, because that is where the enforcement shows.

Optimistic concurrency is enforced at the transition instead, which is the
point that matters: state_changed_after_interpretation moves Current State
underneath a pending Review and asserts acceptance is refused with 409.
"""
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
    if case=='create_with_backend_owned_fields':
        return {'summary':'New owner','topics':['owner'],'outcome':'review_recommended','review_recommendations':[review([
            {'operation':'create','expected_version':1,'proposed_statement':'Pilot owner is Maya.','rationale':'New fact'}], review_type='missing_understanding')]}
    if case=='grouping_reason_on_single_change':
        return {'summary':'Date changed','topics':['launch'],'outcome':'review_recommended','review_recommendations':[review([
            {'operation':'update','state_item_id':'state_launch','expected_version':1,'proposed_statement':'Launch is October 15.','rationale':'Explicit date change'}], grouping='Single affected item')]}
    if case=='grouped_multi_valid':
        return {'summary':'Date changed and old item retired','topics':['launch'],'outcome':'review_recommended','review_recommendations':[review([
            {'operation':'update','state_item_id':'state_launch','expected_version':1,'proposed_statement':'Launch is October 15.','rationale':'Explicit date change'},
            {'operation':'create','proposed_statement':'Launch communications begin October 8.','rationale':'New related fact'}], grouping='Both changes are part of the same launch-timing decision')]}
    if case=='state_at_risk':
        return {'summary':'Date uncertain','topics':['launch'],'outcome':'review_recommended','review_recommendations':[review([], review_type='state_at_risk')]}
    if case=='model_supplied_stale_version':
        p=payload('update_valid'); p['review_recommendations'][0]['proposed_changes'][0]['expected_version']=99; return p
    if case=='state_changed_after_interpretation':
        return payload('update_valid')
    if case=='retire_valid':
        return {'summary':'Launch item obsolete','topics':['launch'],'outcome':'review_recommended','review_recommendations':[review([
            {'operation':'retire','state_item_id':'state_launch','expected_version':1,'rationale':'Evidence makes item obsolete'}])]} 
    raise KeyError(case)

def errs(v,p): return [e.message for e in v.iter_errors(p)]

def stored_proposals(db):
    """What software actually persisted, which is where normalization shows."""
    conn = sqlite3.connect(db); conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT operation, state_item_id, expected_state_version, proposed_statement "
        "FROM proposed_state_changes"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


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
            out['stored_proposals']=stored_proposals(db)
            if r.status_code==201 and r.json().get('reviews'):
                rid=r.json()['reviews'][0]['id']
                if EXPECTED[case].get('move_state_first'):
                    # Someone accepts another change while this Review sits pending.
                    with sqlite3.connect(db) as conn:
                        conn.execute("UPDATE current_state_items SET statement='Launch is November 1.', version=version+1 WHERE id='state_launch'"); conn.commit()
                t=time.perf_counter(); rr=c.post(f'/api/reviews/{rid}/resolve',json={'decision':'accept'}); out['resolve_latency_ms']=round((time.perf_counter()-t)*1000,2); out['resolve_status']=rr.status_code
                try: out['resolve_response']=rr.json()
                except Exception: out['resolve_text']=rr.text
                sc=sqlite3.connect(db); sc.row_factory=sqlite3.Row
                out['state_after']=[dict(x) for x in sc.execute("SELECT statement, version FROM current_state_items WHERE id='state_launch'").fetchall()]
                sc.close()
    return out


# Software enforces; it does not fail the user for the model's mistakes.
# The three "normalized" cases below all send interpretation output that
# violates the schema or contradicts the application's own facts. Each is
# accepted, corrected, and checked against what was stored.
EXPECTED = {
    # A create carries no version and targets no existing item. The model sent
    # both; software strips them rather than rejecting the submission.
    'create_with_backend_owned_fields': {
        'status': 201, 'review_delta': 1, 'schema_valid': False,
        'resolve_status': 200,
        'stored': [{'operation': 'create', 'state_item_id': None, 'expected_state_version': None}],
    },
    # A grouping reason is meaningless for a single change. Dropped, not refused.
    'grouping_reason_on_single_change': {
        'status': 201, 'review_delta': 1, 'schema_valid': False,
        'resolve_status': 200,
        'stored': [{'operation': 'update', 'state_item_id': 'state_launch', 'expected_state_version': 1}],
    },
    # The model claimed version 99 for an item at version 1. Concurrency
    # versions are application facts, so software overwrites the claim with the
    # captured truth -- the stored value must be 1.
    'model_supplied_stale_version': {
        'status': 201, 'review_delta': 1, 'schema_valid': True,
        'resolve_status': 200,
        'stored': [{'operation': 'update', 'state_item_id': 'state_launch', 'expected_state_version': 1}],
    },
    # The guarantee that matters: Current State moves while a Review is pending,
    # so accepting it must be refused rather than silently overwriting the newer
    # value. This is the optimistic-concurrency contract, enforced at the
    # transition rather than at submission.
    'state_changed_after_interpretation': {
        'status': 201, 'review_delta': 1, 'schema_valid': True,
        'move_state_first': True, 'resolve_status': 409,
        'state_after': [{'statement': 'Launch is November 1.', 'version': 2}],
    },
    'grouped_multi_valid': {'status': 201, 'review_delta': 1, 'schema_valid': True, 'resolve_status': 200},
    'no_review': {'status': 201, 'review_delta': 0, 'schema_valid': True},
    'update_valid': {'status': 201, 'review_delta': 1, 'schema_valid': True, 'resolve_status': 200},
    'state_at_risk': {'status': 201, 'review_delta': 1, 'schema_valid': True, 'resolve_status': 200},
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
    if 'stored' in expected:
        # Normalization is only observable in what was persisted.
        actual=[{k:pr.get(k) for k in exp} for pr,exp in zip(result['stored_proposals'], expected['stored'])]
        checks['normalized_proposal']= len(result['stored_proposals'])==len(expected['stored']) and actual==expected['stored']
    if 'state_after' in expected:
        actual=[{k:row.get(k) for k in expected['state_after'][0]} for row in result.get('state_after',[])]
        checks['state_untouched']= actual==expected['state_after']
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
