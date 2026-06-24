/**
 * Project CRUD service — supports both SQLite and in-memory backends.
 *
 * SQLite mode (production):
 *   const db = new Database('app.db');
 *   const service = createProjectService({ db });
 *
 * In-memory mode (testing / no persistence):
 *   const service = createProjectService();
 */

import type Database from 'better-sqlite3';

export interface ProjectRecord {
  id: string;
  name: string;
  baseDir: string;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectService {
  create(name: string, baseDir: string): ProjectRecord;
  get(id: string): ProjectRecord | undefined;
  list(): ProjectRecord[];
  update(id: string, patch: Partial<Pick<ProjectRecord, 'name'>>): ProjectRecord | null;
  delete(id: string): boolean;
  /** List files in a project directory (SQLite mode only reads tracked files). */
  listFiles?(id: string): string[];
}

export interface CreateProjectServiceOptions {
  /** Optional SQLite database instance. When omitted, uses in-memory storage. */
  db?: Database.Database;
}

function generateId(): string {
  return `proj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createMemoryService(): ProjectService {
  const projects = new Map<string, ProjectRecord>();

  return {
    create(name, baseDir) {
      const id = generateId();
      const now = Date.now();
      const record: ProjectRecord = { id, name, baseDir, createdAt: now, updatedAt: now };
      projects.set(id, record);
      return record;
    },
    get(id) { return projects.get(id); },
    list() { return Array.from(projects.values()); },
    update(id, patch) {
      const record = projects.get(id);
      if (!record) return null;
      Object.assign(record, patch, { updatedAt: Date.now() });
      return record;
    },
    delete(id) { return projects.delete(id); },
  };
}

function createSqliteService(db: Database.Database): ProjectService {
  // Ensure schema exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      base_dir TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS project_files (
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      PRIMARY KEY (project_id, file_path)
    );
  `);

  const insertStmt = db.prepare(
    'INSERT INTO projects (id, name, base_dir, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
  );
  const getStmt = db.prepare('SELECT * FROM projects WHERE id = ?');
  const listStmt = db.prepare('SELECT * FROM projects ORDER BY updated_at DESC');
  const updateStmt = db.prepare(
    'UPDATE projects SET name = ?, updated_at = ? WHERE id = ?',
  );
  const deleteStmt = db.prepare('DELETE FROM projects WHERE id = ?');
  const listFilesStmt = db.prepare(
    'SELECT file_path FROM project_files WHERE project_id = ?',
  );

  function rowToRecord(row: Record<string, unknown>): ProjectRecord {
    return {
      id: row.id as string,
      name: row.name as string,
      baseDir: row.base_dir as string,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }

  return {
    create(name, baseDir) {
      const id = generateId();
      const now = Date.now();
      insertStmt.run(id, name, baseDir, now, now);
      return { id, name, baseDir, createdAt: now, updatedAt: now };
    },
    get(id) {
      const row = getStmt.get(id) as Record<string, unknown> | undefined;
      return row ? rowToRecord(row) : undefined;
    },
    list() {
      return (listStmt.all() as Record<string, unknown>[]).map(rowToRecord);
    },
    update(id, patch) {
      const row = getStmt.get(id) as Record<string, unknown> | undefined;
      if (!row) return null;
      const now = Date.now();
      const name = patch.name ?? (row.name as string);
      updateStmt.run(name, now, id);
      return {
        id,
        name,
        baseDir: row.base_dir as string,
        createdAt: row.created_at as number,
        updatedAt: now,
      };
    },
    delete(id) {
      const result = deleteStmt.run(id);
      return result.changes > 0;
    },
    listFiles(id) {
      const rows = listFilesStmt.all(id) as { file_path: string }[];
      return rows.map((r) => r.file_path);
    },
  };
}

/**
 * Create a ProjectService instance.
 *
 * @param options.db — Optional SQLite database. When omitted, uses in-memory storage.
 */
export function createProjectService(
  options: CreateProjectServiceOptions = {},
): ProjectService {
  if (options.db) {
    return createSqliteService(options.db);
  }
  return createMemoryService();
}
