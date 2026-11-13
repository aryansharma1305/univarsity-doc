# Give the shared HTTPS edge its own lifecycle

Staging and university share one independently operated Caddy Compose project, while retaining separate data services, application secrets and private networks. Reusing staging's proxy lifecycle would let staging stops, failed gate probes and backups interrupt university access. The edge reuses the existing certificate volumes and reviewer gate, but neither application launcher may stop it. Moving the existing 80/443 listeners to the new container requires a brief approved handoff on this single VPS; subsequent file-based route updates can use graceful reloads. University uses a unique web service name because Compose automatically registers service names as DNS aliases and a second `web` alias could misroute staging requests.

Status: proposed; local preparation only. Live acceptance and release approval remain required.

The follow-up performance proposal raises the edge ceiling from .1 to .75 CPU with 8192 shares.
Initial rigid per-service caps totaling 1.8 cores passed transport but failed real photo/page-tail
acceptance while leaving most host CPU idle. The current candidate uses finite, oversubscribed
application burst caps and interactive weights, with unchanged memory limits and measured acceptance
thresholds. It does not reserve CPU or enforce an aggregate CPU limit. Operator approval and actual
host headroom are required before adopting it; otherwise review aggregate control or upgrade.
Cold bcrypt must receive a short burst without weakening its work factor or removing the gate.
See [benchmark conditions and failed trials](../development/shared-proxy-performance.md).
No production limits change until review and authorized host acceptance.
