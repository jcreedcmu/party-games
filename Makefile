dev-epyc: build
	npx tsx --watch server/index.ts -- --password secret --game epyc

dev-pictionary: build
	npx tsx --watch server/index.ts -- --password secret --game pictionary

serve: build
	npx tsx server/index.ts -- --password secret --game pictionary --host 0.0.0.0

build:
	npx vite build --config vite.config.ts
