ALTER TABLE task_assignments
ADD COLUMN requested_by_member BOOLEAN NOT NULL DEFAULT FALSE;