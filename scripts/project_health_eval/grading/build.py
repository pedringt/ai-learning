#!/usr/bin/env python3
"""Builds the investigator grading page from two downloaded eval artifacts.

Usage: python3 build.py ART_MODELS ART_LOGS OUT_HTML
  ART_MODELS  artifact dir of a run comparing models (cases.json + results.jsonl), e.g. run 38961088400
  ART_LOGS    artifact dir of a logVariants run, e.g. run 38964340745 (its Haiku@900 +log reports are added)
Download one with: gh run download <run-id> -n ph-investigator-eval -D <dir>
Publish OUT_HTML as the grading Artifact (https://claude.ai/artifact/LmwtuHrnPgqatoJsTar1kV) with
capabilities {db:{rules:[{path:"grades",read:"view",write:"owner"}]},user:{}}; grades live in its db
collection `grades`, one document per case id. No model calls.
"""
import json, sys, pathlib

art_models, art_logs, out = map(pathlib.Path, sys.argv[1:4])
here = pathlib.Path(__file__).parent

def load_results(path):
    return [json.loads(line) for line in (path / 'results.jsonl').read_text().splitlines() if line.strip()]

cases = json.loads((art_models / 'cases.json').read_text())
results = [r for r in load_results(art_models) if r.get('repeat') == 1 and r.get('ok')]
log_results = [r for r in load_results(art_logs) if r.get('repeat') == 1 and r.get('ok')]

LABELS = {
    'claude-haiku-5-5': 'Haiku · 450 cap (production before DEC-011)',
    'claude-haiku-5-5@900': 'Haiku · 900 cap',
    'claude-sonnet-5-5': 'Sonnet',
    'claude-opus-5-5': 'Opus',
}

def evidence_view(ev):
    view = {'project': ev['project'], 'branch': ev['branch'], 'commit': ev['commit'][:7], 'signal': ev['signalType'], 'items': []}
    try:
        primary = json.loads(ev['primary'])
    except Exception:
        primary = {}
    for check in primary.get('failedChecks', []):
        view['items'].append({'label': 'Failed check', 'text': ' · '.join(x for x in [check.get('name'), check.get('title'), check.get('summary')] if x) or check.get('name', ''), 'url': check.get('url')})
    if 'failedDeploymentStatus' in primary:
        st = primary['failedDeploymentStatus']
        view['items'].append({'label': 'Deploy status', 'text': f"{st.get('context','')}: {st.get('description','')}", 'url': st.get('target')})
    for line in str(ev.get('followUp', '')).split('\n'):
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except Exception:
            view['items'].append({'label': 'Note', 'text': line})
            continue
        if 'commitMessage' in obj:
            view['items'].append({'label': 'Commit message', 'text': obj['commitMessage']})
        if 'deployment' in obj:
            d = obj['deployment']
            view['items'].append({'label': 'Vercel deployment', 'text': ' · '.join(x for x in [d.get('state'), d.get('errorCode'), d.get('errorMessage')] if x), 'url': d.get('deploymentUrl')})
            if obj.get('buildOutput'):
                view['items'].append({'label': 'Build output', 'text': obj['buildOutput'], 'mono': True})
    return view

out_cases = []
for case in cases:
    reports = []
    for r in results:
        if r['caseId'] == case['id']:
            reports.append({'key': r['model'], 'label': LABELS.get(r['model'], r['model']), 'text': r['rawReport'], 'cutOff': r.get('stopReason') == 'max_tokens'})
    for r in log_results:
        if r['caseId'] == case['id'] + '+log' and r['model'] == 'claude-haiku-5-5@900':
            reports.append({'key': 'claude-haiku-5-5@900+log', 'label': 'Haiku · 900 cap · with job log', 'text': r['rawReport'], 'cutOff': r.get('stopReason') == 'max_tokens'})
    order = ['claude-haiku-5-5', 'claude-haiku-5-5@900', 'claude-haiku-5-5@900+log', 'claude-sonnet-5-5', 'claude-opus-5-5']
    reports.sort(key=lambda x: order.index(x['key']) if x['key'] in order else 99)
    ref = case.get('reference', {})
    log = (ref.get('log') or {})
    out_cases.append({
        'id': case['id'],
        'kind': case['kind'],
        'evidence': evidence_view(case['evidence']),
        'reference': {'job': log.get('job'), 'log': log.get('tail'), 'status': ref.get('status'), 'runUrl': ref.get('runUrl') or ref.get('targetUrl'), 'workflow': ref.get('workflow'), 'when': ref.get('createdAt')},
        'reports': reports,
    })

data = json.dumps({'cases': out_cases}, ensure_ascii=False).replace('</', '<\\/')
template = (here / 'template.html').read_text()
out.write_text(template.replace('/*DATA*/null', data))
print(f'{len(out_cases)} cases, {sum(len(c["reports"]) for c in out_cases)} reports, {out.stat().st_size//1024} KB')
