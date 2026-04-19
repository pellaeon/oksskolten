# Build Notes

## Export Built SPA Assets To Host Directory

You can export built frontend artifacts from Docker build output directly to the host filesystem using BuildKit:

```bash
docker build --target build --output type=local,dest=./build-out .
```

This writes the `build` stage filesystem to `./build-out`, including:

- `build-out/dist` (original Oksskolten frontend)
- `build-out/dist-mrrss` (alternative MrRSS-style frontend)

If you want these directly at repo root:

```bash
mkdir -p dist dist-mrrss
cp -r build-out/dist/. dist/
cp -r build-out/dist-mrrss/. dist-mrrss/
```

- Default docker compose -f compose.yaml -f compose.prod.yaml up -d starts backend/API services only (no frontend containers).
- Frontends will start only if you explicitly enable the profile, e.g. --profile ui.

