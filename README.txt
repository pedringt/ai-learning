R9.3.1D Ask fixed-composer regression hardening

No product/CSS change was needed: the latest GitHub build already reserves 100px desktop and 96px mobile bottom clearance when the fixed Ask follow-up composer is present.

This patch only adds regression coverage to:
  state-project-complete/test_frontend_integration_contract.py

Validation:
  test_frontend_integration_contract.py: 34 passed
  full suite: 195 passed, 3 skipped, 7 subtests passed

Upload the file preserving its folder path.
