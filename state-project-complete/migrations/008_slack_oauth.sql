-- Migration 008: Slack OAuth connection storage.
--
-- slack_connections existed since Phase 1 but nothing ever wrote to it --
-- the app was always installed manually via Slack's own developer
-- dashboard, not through State. The self-serve "Connect Slack" OAuth flow
-- needs somewhere to keep the bot token issued during that handshake.
ALTER TABLE slack_connections ADD COLUMN bot_token TEXT;
