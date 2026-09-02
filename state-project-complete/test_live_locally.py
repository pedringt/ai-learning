#!/usr/bin/env python3
"""
Standalone script to test live Anthropic and OpenAI providers locally.

Run this script with your API keys set as environment variables:

    export ANTHROPIC_API_KEY="sk-ant-..."
    export OPENAI_API_KEY="sk-..."
    python3 test_live_locally.py

This will:
1. Test Anthropic Claude
2. Test OpenAI GPT-4o
3. Compare latency and results
4. Save results to live_test_results.txt
"""

import os
import sys
import time
import json
from datetime import datetime

# Add current directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database_migration_backed import get_test_db
from interpretation_pipeline_integrated import process_evidence
from anthropic_provider import AnthropicProvider
from openai_provider import OpenAIProvider


def setup_test_db():
    """Create test database with sample State and Evidence."""
    db_context = get_test_db()
    connection = db_context.__enter__()
    
    # Seed State items
    connection.execute(
        "INSERT INTO current_state_items(id, topic, statement, version) VALUES (?, ?, ?, ?)",
        ("state_01", "pilot", "The AI Support Pilot is limited to the billing-support team.", 1),
    )
    connection.execute(
        "INSERT INTO current_state_items(id, topic, statement, version) VALUES (?, ?, ?, ?)",
        ("state_02", "pilot", "The AI Support Pilot will launch to the billing-support team on October 1.", 1),
    )
    
    # Seed Evidence
    connection.execute(
        "INSERT INTO evidence(id, content) VALUES (?, ?)",
        ("evidence_02", "We have moved the pilot launch to October 15 because security review will not finish in time."),
    )
    
    connection.commit()
    return db_context, connection


def test_anthropic(connection):
    """Test with live Anthropic Claude API."""
    print("\n" + "="*60)
    print("Testing Anthropic Claude API")
    print("="*60)
    
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        print("❌ ANTHROPIC_API_KEY not set")
        return None
    
    try:
        print(f"✓ API key found (length: {len(api_key)})")
        print("Initializing AnthropicProvider...")
        provider = AnthropicProvider(model_identifier="claude-opus-4-6")
        
        print("Processing evidence...")
        start = time.time()
        result = process_evidence(
            connection=connection,
            evidence_id="evidence_02",
            provider=provider,
        )
        elapsed = time.time() - start
        
        print(f"✓ Interpretation succeeded in {elapsed:.2f}s")
        print(f"  Status: {result.processing_status}")
        print(f"  Reviews created: {len(result.review_ids)} ({result.review_ids})")
        print(f"  Proposals created: {len(result.proposal_ids)} ({result.proposal_ids})")
        
        return {
            "provider": "Anthropic Claude",
            "model": "claude-opus-4-6",
            "status": "succeeded",
            "latency_seconds": elapsed,
            "reviews": len(result.review_ids),
            "proposals": len(result.proposal_ids),
        }
        
    except Exception as e:
        print(f"❌ Error: {type(e).__name__}: {str(e)}")
        return {
            "provider": "Anthropic Claude",
            "model": "claude-opus-4-6",
            "status": "failed",
            "error": str(e),
        }


def test_openai(connection):
    """Test with live OpenAI API."""
    print("\n" + "="*60)
    print("Testing OpenAI API")
    print("="*60)
    
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("❌ OPENAI_API_KEY not set")
        return None
    
    try:
        print(f"✓ API key found (length: {len(api_key)})")
        print("Initializing OpenAIProvider...")
        provider = OpenAIProvider(model_identifier="gpt-4o")
        
        print("Processing evidence...")
        start = time.time()
        result = process_evidence(
            connection=connection,
            evidence_id="evidence_02",
            provider=provider,
        )
        elapsed = time.time() - start
        
        print(f"✓ Interpretation succeeded in {elapsed:.2f}s")
        print(f"  Status: {result.processing_status}")
        print(f"  Reviews created: {len(result.review_ids)} ({result.review_ids})")
        print(f"  Proposals created: {len(result.proposal_ids)} ({result.proposal_ids})")
        
        return {
            "provider": "OpenAI",
            "model": "gpt-4o",
            "status": "succeeded",
            "latency_seconds": elapsed,
            "reviews": len(result.review_ids),
            "proposals": len(result.proposal_ids),
        }
        
    except Exception as e:
        print(f"❌ Error: {type(e).__name__}: {str(e)}")
        return {
            "provider": "OpenAI",
            "model": "gpt-4o",
            "status": "failed",
            "error": str(e),
        }


def main():
    """Run all live provider tests."""
    print("\n" + "="*60)
    print("STATE PROJECT: LIVE PROVIDER TESTING")
    print("="*60)
    print(f"Started: {datetime.now().isoformat()}")
    
    # Check API keys
    anthropic_key = os.getenv("ANTHROPIC_API_KEY")
    openai_key = os.getenv("OPENAI_API_KEY")
    
    print("\nAPI Key Status:")
    print(f"  ANTHROPIC_API_KEY: {'✓ Set' if anthropic_key else '✗ Not set'}")
    print(f"  OPENAI_API_KEY: {'✓ Set' if openai_key else '✗ Not set'}")
    
    if not anthropic_key and not openai_key:
        print("\n❌ No API keys found. Set ANTHROPIC_API_KEY and/or OPENAI_API_KEY")
        print("\nExample:")
        print("  export ANTHROPIC_API_KEY='sk-ant-...'")
        print("  export OPENAI_API_KEY='sk-...'")
        print("  python3 test_live_locally.py")
        return 1
    
    # Set up test database
    print("\n" + "="*60)
    print("Setting up test database")
    print("="*60)
    db_context, connection = setup_test_db()
    results = []
    
    try:
        # Test Anthropic
        if anthropic_key:
            result = test_anthropic(connection)
            if result:
                results.append(result)
        
        # Reset connection for next provider
        connection.commit()
        
        # Test OpenAI
        if openai_key:
            result = test_openai(connection)
            if result:
                results.append(result)
        
    finally:
        connection.close()
        db_context.__exit__(None, None, None)
    
    # Summary
    print("\n" + "="*60)
    print("RESULTS SUMMARY")
    print("="*60)
    
    for result in results:
        print(f"\n{result['provider']} ({result['model']})")
        if result['status'] == 'succeeded':
            print(f"  Status: ✓ Success")
            print(f"  Latency: {result['latency_seconds']:.2f}s")
            print(f"  Reviews: {result['reviews']}")
            print(f"  Proposals: {result['proposals']}")
        else:
            print(f"  Status: ✗ Failed")
            print(f"  Error: {result.get('error', 'Unknown error')}")
    
    # Compare if both succeeded
    if len(results) == 2 and all(r['status'] == 'succeeded' for r in results):
        print("\n" + "-"*60)
        print("COMPARISON")
        latency_diff = abs(results[0]['latency_seconds'] - results[1]['latency_seconds'])
        faster = results[0]['provider'] if results[0]['latency_seconds'] < results[1]['latency_seconds'] else results[1]['provider']
        print(f"Latency difference: {latency_diff:.2f}s ({faster} faster)")
    
    # Save results
    print("\n" + "="*60)
    print("Saving results to live_test_results.json")
    print("="*60)
    
    output = {
        "timestamp": datetime.now().isoformat(),
        "results": results,
    }
    
    with open("live_test_results.json", "w") as f:
        json.dump(output, f, indent=2)
    
    print(f"✓ Saved to live_test_results.json")
    
    # Exit code: 0 if any succeeded, 1 if all failed
    return 0 if any(r['status'] == 'succeeded' for r in results) else 1


if __name__ == "__main__":
    sys.exit(main())
