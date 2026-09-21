-- Fase 14: Research Resolver
-- Adds research tables for source-backed research for unsupported problems

-- Research sessions table
CREATE TABLE IF NOT EXISTS research_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'RESEARCH_PENDING',
  jurisdiction TEXT NOT NULL,
  problem_description TEXT NOT NULL,
  legal_domain TEXT NOT NULL,
  research_version TEXT NOT NULL,
  previous_research_id UUID,
  plan JSONB NOT NULL,
  ai_request_ids JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Index for querying research by case
CREATE INDEX idx_research_sessions_case_idx ON research_sessions(case_id, created_at);

-- Research findings table
CREATE TABLE IF NOT EXISTS research_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  research_id UUID NOT NULL REFERENCES research_sessions(id) ON DELETE CASCADE,
  proposition TEXT NOT NULL,
  status TEXT NOT NULL,
  jurisdiction TEXT NOT NULL,
  reasoning_summary TEXT NOT NULL,
  uncertainty TEXT,
  research_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for querying findings by research session
CREATE INDEX idx_research_findings_research_idx ON research_findings(research_id);

-- Research sources table
CREATE TABLE IF NOT EXISTS research_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  research_id UUID NOT NULL REFERENCES research_sessions(id) ON DELETE CASCADE,
  finding_id UUID REFERENCES research_findings(id) ON DELETE SET NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  publisher TEXT NOT NULL,
  jurisdiction TEXT NOT NULL,
  source_type TEXT NOT NULL,
  authority TEXT NOT NULL,
  publication_date TEXT,
  effective_date TEXT,
  retrieved_at TIMESTAMPTZ NOT NULL,
  version_identifier TEXT,
  relevant_section TEXT,
  content_hash TEXT,
  validation_status TEXT NOT NULL DEFAULT 'UNVERIFIED',
  validation_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for querying sources by research session
CREATE INDEX idx_research_sources_research_idx ON research_sources(research_id);

-- Index for querying sources by validation status
CREATE INDEX idx_research_sources_validation_idx ON research_sources(validation_status);

-- Research conflicts table
CREATE TABLE IF NOT EXISTS research_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  research_id UUID NOT NULL REFERENCES research_sessions(id) ON DELETE CASCADE,
  conflict_type TEXT NOT NULL,
  source_a_id UUID NOT NULL REFERENCES research_sources(id),
  source_b_id UUID NOT NULL REFERENCES research_sources(id),
  description TEXT NOT NULL,
  resolution_status TEXT NOT NULL DEFAULT 'UNRESOLVED',
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for querying conflicts by research session
CREATE INDEX idx_research_conflicts_research_idx ON research_conflicts(research_id);
