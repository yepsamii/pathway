1. npx @nestjs/cli@latest new pathway --package-manager npm --skip-git — generates everything, you just edit. Saves you 20 min of "where does tsconfig go."                                                      
2. Verify it boots: npm run start:dev, hit localhost:3000. Kill it.
3. Add @nestjs/event-emitter, @nestjs/terminus, @nestjs/config, pg, redis deps in ONE shot.
4. Wire app.module.ts to import all 5 modules (even if empty).
5. Health + ready with terminus — DB+Redis pings.
6. Docker compose with just Postgres + Redis.
7. Makefile + env + README last.