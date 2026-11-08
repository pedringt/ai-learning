-- #639 (Nov 7): which scenarios and scoring code produced a controlled eval run (eval/scoring_version.py), so pass rates
-- scored differently are not shown as directly comparable. Runs recorded earlier stay NULL and read as
-- "legacy / version unknown"; no version is assigned after the fact.
ALTER TABLE product_eval_runs ADD COLUMN scoring_version TEXT;
