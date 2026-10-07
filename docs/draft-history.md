Install nestjs cli
pnpm dlx @nestjs/cli@latest new pathway --package-manager pnpm --skip-git

add api folder
pnpm dlx @nestjs/cli@latest new api --package-manager pnpm --skip-git
cd api
pnpm approve-builds
pnpm install

Add postgres
pnpm dlx prisma orm init --target postgres
Prisma collects anonymous CLI usage data, enabled by default. What's collected and why: https://www.prisma.io/docs/cli. Opt out: run "prisma telemetry disable", set DO_NOT_TRACK=1 or PRISMA_DISABLE_TELEMETRY=1.
│
◇  How do you want to write your schema?
│  Prisma Schema Language (.prisma)
│
◇  Where should the schema file go?
│  src/prisma/contract.prisma
│
◇  Also write a .env file from .env.example? (gitignored)
│  Yes

pnpm dlx prisma skills sync
