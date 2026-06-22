/**
 * Project CRUD service.
 * Extracted from apps/daemon/src/projects.ts.
 */

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
}

export function createProjectService(): ProjectService {
  const projects = new Map<string, ProjectRecord>();

  function generateId(): string {
    return `proj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

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
