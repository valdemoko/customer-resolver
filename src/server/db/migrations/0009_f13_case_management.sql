-- Fase 13: Case Management & Follow-up
-- Adds case_communications table for external communication records

CREATE TABLE IF NOT EXISTS case_communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  direction TEXT NOT NULL,
  channel TEXT NOT NULL,
  counterparty TEXT NOT NULL,
  subject TEXT,
  summary TEXT NOT NULL,
  linked_evidence_ids JSONB NOT NULL DEFAULT '[]',
  linked_document_id UUID,
  related_action_id TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for querying communications by case
CREATE INDEX idx_communications_case_idx ON case_communications(case_id, occurred_at);

-- Index for querying by direction
CREATE INDEX idx_communications_direction_idx ON case_communications(direction);
