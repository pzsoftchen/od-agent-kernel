import { describe, it, expect, beforeEach } from 'vitest';
import { createProjectService, type ProjectService } from '../src/crud.js';

describe('createProjectService', () => {
  let service: ProjectService;

  beforeEach(() => {
    service = createProjectService();
  });

  it('creates a project', () => {
    const project = service.create('my-project', '/tmp/my-project');
    expect(project.id).toBeTruthy();
    expect(project.name).toBe('my-project');
    expect(project.baseDir).toBe('/tmp/my-project');
    expect(project.createdAt).toBeGreaterThan(0);
  });

  it('retrieves a project by ID', () => {
    const created = service.create('test', '/tmp/test');
    const found = service.get(created.id);
    expect(found).toBeDefined();
    expect(found!.name).toBe('test');
  });

  it('returns undefined for unknown ID', () => {
    expect(service.get('nonexistent')).toBeUndefined();
  });

  it('lists all projects', () => {
    service.create('a', '/tmp/a');
    service.create('b', '/tmp/b');
    expect(service.list()).toHaveLength(2);
  });

  it('updates a project name', () => {
    const created = service.create('old-name', '/tmp/x');
    const updated = service.update(created.id, { name: 'new-name' });
    expect(updated?.name).toBe('new-name');
    expect(updated?.updatedAt).toBeGreaterThanOrEqual(created.updatedAt);
  });

  it('returns null when updating non-existent project', () => {
    expect(service.update('nonexistent', { name: 'x' })).toBeNull();
  });

  it('deletes a project', () => {
    const created = service.create('to-delete', '/tmp/del');
    expect(service.delete(created.id)).toBe(true);
    expect(service.get(created.id)).toBeUndefined();
  });

  it('returns false when deleting non-existent project', () => {
    expect(service.delete('nonexistent')).toBe(false);
  });
});
