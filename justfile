build:
    npm run build

test:
    bun test tests/

typecheck:
    npm run typecheck

lint:
    npm run lint

lint-fix:
    npm run lint:fix

format:
    npm run format

format-check:
    npm run format:check

poc:
    npx playwright test proof/

publish-dry:
    npm pack --dry-run

publish:
    npm publish --access public

ci:
    npm run typecheck
    npm run build
    bun test tests/
    npm run lint
    npm run format:check
