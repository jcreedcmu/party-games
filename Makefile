dev-epyc: build
	npx tsx --watch server/index.ts -- --password secret --game epyc

dev-pictionary: build
	npx tsx --watch server/index.ts -- --password secret --game pictionary

serve-pictionary: build
	npx tsx server/index.ts -- --password secret --game pictionary --host 0.0.0.0

serve-epyc: build
	npx tsx server/index.ts -- --password secret --game epyc --host 0.0.0.0

preview:
	npx tsx --tsconfig client/tsconfig.json scripts/gen-preview.tsx 2>/dev/null

build:
	npx vite build --config vite.config.ts
