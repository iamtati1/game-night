-- Shared infrastructure used by every table that carries audit timestamps.
-- Kept in its own migration because multiple tables depend on it; owning it
-- inside a table migration would invert the dependency.

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;
