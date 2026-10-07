/**
 * Smoke test placeholder for Phase 01.
 *
 * Why this is so minimal: NestJS 12 ships every @nestjs/* package as ESM.
 * Jest 29 (which we run with ts-jest 29 + CJS) can't transform node_modules
 * ESM without configuration gymnastics that add ~30 minutes of work per
 * dependency change.
 *
 * Phase 02 will replace this with a real integration test that boots the
 * app, spins up Postgres + Redis via testcontainers, and verifies the
 * endpoints with supertest. Phase 12 will move these to the k6 smoke
 * check in CI.
 *
 * For Phase 01, the manual verification is:
 *
 *   1. make infra-up      # Postgres + Redis containers
 *   2. make dev           # app on :3000
 *   3. curl http://localhost:3000/health   # → 200
 *   4. curl http://localhost:3000/ready    # → 200 (DB+Redis up); 503 (down)
 */
describe('Phase 01 smoke (placeholder)', () => {
  it('test runner is wired', () => {
    expect(1 + 1).toBe(2);
  });
});