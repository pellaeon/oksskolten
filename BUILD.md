# Build Notes

## Export Built SPA Assets To Host Directory

You can export built frontend artifacts from Docker build output directly to the host filesystem using BuildKit:

```bash
docker build --target export-spa --output type=local,dest=./build-out .
```

This writes only the exported SPA artifacts to `./build-out`:

- `build-out/dist` (original Oksskolten frontend)
- `build-out/dist-mrrss` (alternative MrRSS-style frontend)

If you want these directly at repo root:

```bash
mkdir -p dist dist-mrrss
cp -r build-out/dist/. dist/
cp -r build-out/dist-mrrss/. dist-mrrss/
```
