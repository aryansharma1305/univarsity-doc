#!/bin/sh
# Idempotent MinIO bootstrap (run by the MinIO entrypoint for local development and staging).
#   1. create the private application bucket
#   2. ensure anonymous access is disabled
#   3. create a least-privilege application user limited to that bucket
# Only when S3_TEST_BUCKET is set (local docker-compose.yml and CI): also create that separate,
# private bucket for automated tests and include it in the application policy. Tests (API
# integration and e2e) write only there, never to the application bucket. Staging and production
# do not set it, so they keep exactly one bucket and the original single-bucket policy.
# The image is minimal (no sed/awk), so only POSIX shell built-ins and `mc` are used.
set -eu

: "${S3_BUCKET:?S3_BUCKET is required}"
: "${S3_ACCESS_KEY:?S3_ACCESS_KEY is required}"
: "${S3_SECRET_KEY:?S3_SECRET_KEY is required}"
S3_TEST_BUCKET="${S3_TEST_BUCKET:-}"
if [ -n "${S3_TEST_BUCKET}" ] && [ "${S3_TEST_BUCKET}" = "${S3_BUCKET}" ]; then
  echo "minio-init: S3_TEST_BUCKET must differ from S3_BUCKET" >&2
  exit 1
fi

echo "minio-init: ensuring bucket '${S3_BUCKET}'"
mc mb --ignore-existing "local/${S3_BUCKET}"
mc anonymous set none "local/${S3_BUCKET}"

bucket_resources="\"arn:aws:s3:::${S3_BUCKET}\""
object_resources="\"arn:aws:s3:::${S3_BUCKET}/*\""
if [ -n "${S3_TEST_BUCKET}" ]; then
  echo "minio-init: ensuring test bucket '${S3_TEST_BUCKET}'"
  mc mb --ignore-existing "local/${S3_TEST_BUCKET}"
  mc anonymous set none "local/${S3_TEST_BUCKET}"
  bucket_resources="${bucket_resources}, \"arn:aws:s3:::${S3_TEST_BUCKET}\""
  object_resources="${object_resources}, \"arn:aws:s3:::${S3_TEST_BUCKET}/*\""
fi

policy_file="$(mktemp)"
cat > "${policy_file}" <<POLICY
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetBucketLocation", "s3:ListBucket"],
      "Resource": [${bucket_resources}]
    },
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": [${object_resources}]
    }
  ]
}
POLICY

echo "minio-init: ensuring application user and bucket-scoped policy"
mc admin policy create local docversity-app "${policy_file}"
mc admin user add local "${S3_ACCESS_KEY}" "${S3_SECRET_KEY}"
if ! mc admin policy attach local docversity-app --user "${S3_ACCESS_KEY}" >/dev/null 2>&1; then
  echo "minio-init: policy already attached"
fi

rm -f "${policy_file}"
echo "minio-init: done"
