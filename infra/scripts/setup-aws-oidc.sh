#!/usr/bin/env bash
#
# One-time: create the GitHub Actions OIDC provider + a LEAST-PRIVILEGE deploy role that
# GitHub Actions assumes (no stored AWS keys). Run once with your AWS admin creds:
#
#     bash infra/scripts/setup-aws-oidc.sh
#
# Idempotent — safe to re-run. Prints the role ARN at the end (goes into the
# AWS_DEPLOY_ROLE_ARN GitHub Variable; setup-github-cicd.py sets it for you).
#
# Design notes:
#   - Trust is scoped to this repo's `production` environment only (tightest sub claim
#     that still lets deploy.yml assume it).
#   - IAM actions are scoped to `spending-tracker-*` roles so a compromised Action cannot
#     create/modify arbitrary roles (privilege-escalation guard). Other services are
#     scoped to what the SAM stack actually provisions.
set -euo pipefail

ACCOUNT=029944900530
ROLE=github-actions-spending-tracker-deploy
SUB="repo:rohanramesh15/spending-tracker:environment:production"
PROVIDER="arn:aws:iam::${ACCOUNT}:oidc-provider/token.actions.githubusercontent.com"

echo "==> 1/4 GitHub OIDC identity provider"
if aws iam list-open-id-connect-providers \
     --query 'OpenIDConnectProviderList[].Arn' --output text | grep -q token.actions.githubusercontent.com; then
  echo "    already exists"
else
  aws iam create-open-id-connect-provider \
    --url https://token.actions.githubusercontent.com \
    --client-id-list sts.amazonaws.com \
    --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1 >/dev/null
  echo "    created"
fi

trust=$(mktemp); perms=$(mktemp); trap 'rm -f "$trust" "$perms"' EXIT

cat > "$trust" <<JSON
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "${PROVIDER}" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
      "StringLike":   { "token.actions.githubusercontent.com:sub": "${SUB}" }
    }
  }]
}
JSON

cat > "$perms" <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    { "Sid": "CloudFormationDeploy", "Effect": "Allow", "Action": ["cloudformation:*"], "Resource": "*" },
    { "Sid": "SamArtifactBucket", "Effect": "Allow",
      "Action": ["s3:CreateBucket","s3:PutObject","s3:GetObject","s3:DeleteObject","s3:ListBucket",
                 "s3:GetBucketLocation","s3:GetBucketPolicy","s3:PutBucketPolicy","s3:PutBucketTagging",
                 "s3:PutBucketVersioning","s3:PutEncryptionConfiguration","s3:GetEncryptionConfiguration",
                 "s3:PutBucketPublicAccessBlock","s3:GetObjectTagging"],
      "Resource": ["arn:aws:s3:::aws-sam-cli-managed-*","arn:aws:s3:::aws-sam-cli-managed-*/*"] },
    { "Sid": "LambdaStack", "Effect": "Allow", "Action": ["lambda:*"], "Resource": "*" },
    { "Sid": "QueuesAndSchedules", "Effect": "Allow", "Action": ["sqs:*","scheduler:*","events:*"], "Resource": "*" },
    { "Sid": "LogsForFunctions", "Effect": "Allow", "Action": ["logs:*"], "Resource": "*" },
    { "Sid": "SsmRead", "Effect": "Allow",
      "Action": ["ssm:GetParameter","ssm:GetParameters","ssm:GetParametersByPath","ssm:DescribeParameters"],
      "Resource": "*" },
    { "Sid": "IamOnlyStackRoles", "Effect": "Allow",
      "Action": ["iam:CreateRole","iam:DeleteRole","iam:GetRole","iam:TagRole","iam:UntagRole",
                 "iam:AttachRolePolicy","iam:DetachRolePolicy","iam:PutRolePolicy","iam:DeleteRolePolicy",
                 "iam:GetRolePolicy","iam:ListRolePolicies","iam:ListAttachedRolePolicies",
                 "iam:UpdateAssumeRolePolicy","iam:PutRolePermissionsBoundary","iam:DeleteRolePermissionsBoundary"],
      "Resource": "arn:aws:iam::${ACCOUNT}:role/spending-tracker-*" },
    { "Sid": "PassOnlyStackRoles", "Effect": "Allow", "Action": ["iam:PassRole"],
      "Resource": "arn:aws:iam::${ACCOUNT}:role/spending-tracker-*" }
  ]
}
JSON

echo "==> 2/4 deploy role trust policy"
if aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  aws iam update-assume-role-policy --role-name "$ROLE" --policy-document "file://$trust"
  echo "    updated existing role"
else
  aws iam create-role --role-name "$ROLE" \
    --assume-role-policy-document "file://$trust" \
    --description "GitHub Actions OIDC deploy role for spending-tracker (least-priv)" \
    --max-session-duration 3600 >/dev/null
  echo "    created role"
fi

echo "==> 3/4 scoped permissions policy"
aws iam put-role-policy --role-name "$ROLE" --policy-name sam-deploy --policy-document "file://$perms"
echo "    attached"

echo "==> 4/4 done"
echo
echo "Role ARN:  arn:aws:iam::${ACCOUNT}:role/${ROLE}"
