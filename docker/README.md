# docker/

Support files for `docker-compose.yml` (local development only).

| Path                  | Purpose                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `minio/entrypoint.sh` | Starts MinIO, waits until ready, runs the bootstrap, then keeps serving. The container is healthy only after bootstrap succeeds |
| `minio/init.sh`       | Idempotent bootstrap: private bucket + bucket-scoped least-privilege application user                                           |

Production container images (`web`, `api`, `worker`) are **not** part of Phase 1; they will be added
with the deployment work so they can be built and verified against a real target environment.
