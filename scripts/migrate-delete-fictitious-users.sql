-- Migration: Delete fictitious users Dra. Roberta Silva (ID=1) and Dr. Carlos Barros (ID=2)
-- These were placeholder/demo users from the initial setup, not real attorneys.
-- Executed on 2026-04-02 and verified: 0 rows remain in users WHERE id IN (1,2).
--
-- Execution order is mandatory: user_id in ai_generation_logs is NOT NULL (no SET NULL possible).
-- All other FK tables (cases, deadlines, conversations, etc.) had 0 references to these users.

DELETE FROM ai_generation_logs WHERE user_id IN (1, 2);
-- Result: 1393 rows deleted

DELETE FROM users WHERE id IN (1, 2);
-- Result: 2 rows deleted (roberta@barrosesilva.adv.br, carlos@barrosesilva.adv.br)
