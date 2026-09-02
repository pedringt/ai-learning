import sqlite3
from database_migration_backed import initialize_db
from review_service import create_project_rule, list_project_rules, delete_project_rule
from anthropic_provider import AnthropicProvider
from interpretation_pipeline_integrated import InterpretationContextSnapshot


def test_project_rules_crud_and_idempotence():
    conn=sqlite3.connect(':memory:'); conn.row_factory=sqlite3.Row; initialize_db(conn)
    first=create_project_rule(conn,'rule-1','Slack is supporting evidence, not authoritative approval.','Sources')
    second=create_project_rule(conn,'rule-2','  slack is supporting evidence, not authoritative approval.  ','Sources')
    assert first['id']==second['id']=='rule-1'
    assert len(list_project_rules(conn))==1
    delete_project_rule(conn,'rule-1')
    assert list_project_rules(conn)==[]


def test_anthropic_prompt_includes_project_rules_when_present():
    conn=sqlite3.connect(':memory:'); conn.row_factory=sqlite3.Row; initialize_db(conn)
    create_project_rule(conn,'rule-1','Slack is supporting evidence, not authoritative approval.','Sources')
    provider=AnthropicProvider(model_identifier='test',api_key='test')
    context=InterpretationContextSnapshot(state_items={},open_reviews={})
    prompt=provider._build_prompt(context,{'id':'e1','content':'Slack says approved.'},conn)
    assert '<project_rules>' in prompt
    assert '[Sources] Slack is supporting evidence, not authoritative approval.' in prompt
