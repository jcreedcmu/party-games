dev: build
	npx tsx --watch server/index.ts -- --password secret

build:
	npx vite build --config vite.config.ts
