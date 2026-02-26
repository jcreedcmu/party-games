dev-epyc: build
	npx tsx --watch server/index.ts -- --password secret --game epyc

dev-pictionary: build
	npx tsx --watch server/index.ts -- --password secret --game pictionary

build:
	npx vite build --config vite.config.ts
