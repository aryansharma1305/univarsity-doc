# Give the shared HTTPS edge its own lifecycle

Staging and university share one independently operated Caddy Compose project, while retaining separate data services, application secrets and private networks. Reusing staging's proxy lifecycle would let staging stops, failed gate probes and backups interrupt university access. The edge reuses the existing certificate volumes and reviewer gate, but neither application launcher may stop it. Moving the existing 80/443 listeners to the new container requires a brief approved handoff on this single VPS; subsequent file-based route updates can use graceful reloads. University uses a unique web service name because Compose automatically registers service names as DNS aliases and a second `web` alias could misroute staging requests.

Status: proposed; local preparation only. Live acceptance and release approval remain required.

The follow-up performance proposal raises the edge ceiling from 0.1 to 1.0 CPU, with 4096 shares,
and reallocates application ceilings to keep steady limits at 1.8 CPUs. Cold bcrypt work must receive
a short burst; lowering its work factor or removing the reviewer gate is not an acceptable fix.
See [benchmark conditions and remaining host acceptance](../development/shared-proxy-performance.md).
No production limits change until review and authorized host acceptance.
