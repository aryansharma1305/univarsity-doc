# Give the shared HTTPS edge its own lifecycle

Staging and university share one independently operated Caddy Compose project, while retaining separate data services, application secrets and private networks. Reusing staging's proxy lifecycle would let staging stops, failed gate probes and backups interrupt university access. The edge reuses the existing certificate volumes and reviewer gate, but neither application launcher may stop it. Moving the existing 80/443 listeners to the new container requires a brief approved handoff on this single VPS; subsequent file-based route updates can use graceful reloads. University uses a unique web service name because Compose automatically registers service names as DNS aliases and a second `web` alias could misroute staging requests.

Status: proposed; local preparation only. Live acceptance and release approval remain required.
