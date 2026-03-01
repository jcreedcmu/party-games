dev-epyc: build
	npx tsx --watch server/index.ts -- --password secret --game epyc

dev-pictionary: build
	npx tsx --watch server/index.ts -- --password secret --game pictionary

serve: build
	npx tsx server/index.ts -- --password secret --game pictionary --host 0.0.0.0

preview:
	npx tsx --tsconfig client/tsconfig.json scripts/gen-preview.tsx 2>/dev/null > preview.html

build:
	npx vite build --config vite.config.ts
