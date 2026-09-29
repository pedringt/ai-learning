-- Persist privacy-safe metadata about failed controlled eval scenarios.
-- This intentionally excludes prompts, project content, and full model answers.
ALTER TABLE product_eval_runs ADD COLUMN failure_details_json TEXT;
