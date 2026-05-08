-- Enum types
CREATE TYPE project_member_role AS ENUM ('admin', 'member');
CREATE TYPE join_request_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE task_status AS ENUM ('todo', 'in_progress', 'done');
CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high');
CREATE TYPE assignment_status AS ENUM ('pending', 'accepted', 'rejected');

-- Users table
CREATE TABLE users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Projects table
CREATE TABLE projects (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    admin_id BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_projects_admin
        FOREIGN KEY (admin_id)
        REFERENCES users(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

-- Project members table
CREATE TABLE project_members (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    role project_member_role NOT NULL DEFAULT 'member',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_project_members_project
        FOREIGN KEY (project_id)
        REFERENCES projects(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_project_members_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT uq_project_members UNIQUE(project_id, user_id)
);

-- Join requests table
CREATE TABLE join_requests (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    status join_request_status NOT NULL DEFAULT 'pending',
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_join_requests_project
        FOREIGN KEY (project_id)
        REFERENCES projects(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_join_requests_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT uq_join_requests UNIQUE(project_id, user_id)
);

-- Tasks table
CREATE TABLE tasks (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id BIGINT NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    status task_status NOT NULL DEFAULT 'todo',
    priority task_priority NOT NULL DEFAULT 'medium',
    created_by BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_tasks_project
        FOREIGN KEY (project_id)
        REFERENCES projects(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_tasks_created_by
        FOREIGN KEY (created_by)
        REFERENCES users(id)
);

-- Task assignments table
CREATE TABLE task_assignments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    task_id BIGINT NOT NULL,
    assigned_to BIGINT NOT NULL,
    assigned_by BIGINT NOT NULL,
    status assignment_status NOT NULL DEFAULT 'pending',
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_task_assignments_task
        FOREIGN KEY (task_id)
        REFERENCES tasks(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_task_assignments_assigned_to
        FOREIGN KEY (assigned_to)
        REFERENCES users(id),

    CONSTRAINT fk_task_assignments_assigned_by
        FOREIGN KEY (assigned_by)
        REFERENCES users(id),

    CONSTRAINT uq_task_assignment UNIQUE(task_id, assigned_to)
);

-- Indexes
CREATE INDEX idx_projects_admin_id
ON projects(admin_id);

CREATE INDEX idx_project_members_project_id
ON project_members(project_id);

CREATE INDEX idx_project_members_user_id
ON project_members(user_id);

CREATE INDEX idx_join_requests_project_id
ON join_requests(project_id);

CREATE INDEX idx_join_requests_user_id
ON join_requests(user_id);

CREATE INDEX idx_tasks_project_id
ON tasks(project_id);

CREATE INDEX idx_tasks_created_by
ON tasks(created_by);

CREATE INDEX idx_task_assignments_task_id
ON task_assignments(task_id);

CREATE INDEX idx_task_assignments_assigned_to
ON task_assignments(assigned_to);

CREATE INDEX idx_task_assignments_assigned_by
ON task_assignments(assigned_by);