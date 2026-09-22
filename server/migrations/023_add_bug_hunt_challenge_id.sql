-- Link each Bug Hunt incident to at most one curriculum challenge.
-- Existing incidents remain unassigned until we author/map them.

ALTER TABLE bug_hunt_incidents
ADD COLUMN challenge_id BIGINT NULL;

ALTER TABLE bug_hunt_incidents
ADD CONSTRAINT bug_hunt_incidents_challenge_fk
FOREIGN KEY (challenge_id)
REFERENCES challenges(id)
ON DELETE RESTRICT;

CREATE UNIQUE INDEX bug_hunt_incidents_challenge_id_idx
ON bug_hunt_incidents (challenge_id)
WHERE challenge_id IS NOT NULL;