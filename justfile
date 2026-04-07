build:
    npm run build

test:
    bun test tests/

typecheck:
    npm run typecheck

publish-dry:
    npm pack --dry-run

publish:
    npm publish --access public
