#!/usr/bin/env bash
# Phase 14C: build the four Render staging images for linux/amd64 and, only with `push`, publish them
# to the PRIVATE GitHub Container Registry package by immutable tag (<role>-<full commit SHA>).
#   IMAGE_REPOSITORY=ghcr.io/<owner>/docversity14c-staging GITHUB_SHA=<sha> GITHUB_REPOSITORY=<owner>/<repo> \
#     deploy/render/images.sh build|push
# Run by .github/workflows/staging-images.yml. Never changes package visibility: a GHCR package is
# private by default and a public package can never be made private again.
set -euo pipefail
mode=${1:?usage: images.sh build|push}
sha=${GITHUB_SHA:?}
repository=${IMAGE_REPOSITORY:?}
source_repo=${GITHUB_REPOSITORY:?}
[[ $sha =~ ^[0-9a-f]{40}$ ]] || { echo 'GITHUB_SHA must be a full commit SHA' >&2; exit 1; }
[[ $repository =~ ^ghcr\.io/[a-z0-9-]+/docversity14c-staging$ ]] || { echo 'Unexpected image repository' >&2; exit 1; }
root=$(cd "$(dirname "$0")/../.." && pwd)
roles=(api worker web edge)

build() {
	local role=$1
	local labels=(--label "org.opencontainers.image.source=https://github.com/$source_repo"
		--label "org.opencontainers.image.revision=$sha" --label "org.opencontainers.image.title=docversity14c-$role")
	if [[ $role == edge ]]; then
		docker build --platform linux/amd64 "${labels[@]}" -t "$repository:$role-$sha" -f "$root/deploy/render/Dockerfile.edge" "$root/deploy"
	else
		docker build --platform linux/amd64 "${labels[@]}" --target "$role" -t "$repository:$role-$sha" -f "$root/deploy/Dockerfile" "$root"
	fi
}

for role in "${roles[@]}"; do build "$role"; done
# The edge must refuse to start without its gate and settings (fail closed), exactly as on Render.
if docker run --rm --network none "$repository:edge-$sha"; then
	echo 'Edge image started without a reviewer gate' >&2
	exit 1
fi
docker image ls "$repository"
[[ $mode == push ]] || exit 0

for role in "${roles[@]}"; do
	# Immutable tags: never overwrite an image that was already published for this commit.
	if docker manifest inspect "$repository:$role-$sha" >/dev/null 2>&1; then
		echo "$repository:$role-$sha already exists; refusing to overwrite" >&2
		exit 1
	fi
done
summary=${GITHUB_STEP_SUMMARY:-/dev/stdout}
echo '| Role | Image (pin this digest in deploy/render/render.yaml) |' >>"$summary"
echo '| ---- | ---- |' >>"$summary"
for role in "${roles[@]}"; do
	docker push "$repository:$role-$sha" >/dev/null
	digest=$(docker inspect --format '{{index .RepoDigests 0}}' "$repository:$role-$sha")
	echo "| $role | \`$digest\` |" >>"$summary"
done
# Proof of privacy: without credentials, no image may be readable.
anonymous=$(mktemp -d)
for role in "${roles[@]}"; do
	if DOCKER_CONFIG=$anonymous docker manifest inspect "$repository:$role-$sha" >/dev/null 2>&1; then
		echo "::error::$repository:$role-$sha is readable anonymously (PUBLIC). Do not use it; tell the project owner." >&2
		exit 1
	fi
done
rm -rf "$anonymous"
echo 'Published privately; anonymous reads refused for all four images.' >>"$summary"
