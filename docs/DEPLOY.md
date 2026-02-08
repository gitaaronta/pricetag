# PriceTag AWS Deployment Guide

## Prerequisites

1. **AWS Account** with admin access
2. **AWS CLI** installed and configured
3. **Terraform** installed (v1.0+)
4. **Docker** installed

## Quick Start

### 1. Configure AWS CLI

```bash
aws configure
# Enter your AWS Access Key ID
# Enter your AWS Secret Access Key
# Region: us-west-2
# Output format: json
```

### 2. Create Terraform State Bucket

```bash
aws s3 mb s3://pricetag-terraform-state --region us-west-2
```

### 3. Deploy Infrastructure

```bash
cd infra/terraform

# Initialize Terraform
terraform init

# Preview changes
terraform plan -var="db_password=YOUR_SECURE_PASSWORD"

# Deploy (takes ~10 minutes)
terraform apply -var="db_password=YOUR_SECURE_PASSWORD"
```

### 4. Build and Push Docker Images

```bash
# Get ECR login
aws ecr get-login-password --region us-west-2 | docker login --username AWS --password-stdin $(aws sts get-caller-identity --query Account --output text).dkr.ecr.us-west-2.amazonaws.com

# Build and push backend
cd backend
docker build -t pricetag-backend -f Dockerfile.prod .
docker tag pricetag-backend:latest $(terraform output -raw ecr_backend_url):latest
docker push $(terraform output -raw ecr_backend_url):latest

# Build and push frontend
cd ../frontend
docker build -t pricetag-frontend -f Dockerfile.prod --build-arg NEXT_PUBLIC_API_URL=http://$(terraform output -raw alb_dns_name) .
docker tag pricetag-frontend:latest $(terraform output -raw ecr_frontend_url):latest
docker push $(terraform output -raw ecr_frontend_url):latest
```

### 5. Run Database Migrations

```bash
# Connect to RDS and run migrations
# Option 1: Use a bastion host
# Option 2: Temporarily make RDS public
# Option 3: Use AWS Session Manager

psql -h $(terraform output -raw rds_endpoint) -U pricetag -d pricetag -f db/migrations/001_initial_schema.sql
psql -h $(terraform output -raw rds_endpoint) -U pricetag -d pricetag -f db/seeds/001_sf_bay_warehouses.sql
```

### 6. Access Your App

```bash
echo "Your app is live at: http://$(terraform output -raw alb_dns_name)"
```

---

## GitHub Actions CI/CD

### Setup Secrets

In your GitHub repo, go to Settings → Secrets and add:

| Secret | Description |
|--------|-------------|
| `AWS_ACCESS_KEY_ID` | IAM user access key |
| `AWS_SECRET_ACCESS_KEY` | IAM user secret key |
| `API_URL` | ALB DNS name (after first deploy) |

### Deploy on Push

Once secrets are configured, every push to `main` will automatically:
1. Build Docker images
2. Push to ECR
3. Deploy to ECS
4. Wait for healthy deployment

---

## Architecture

```
                    ┌─────────────────┐
                    │   CloudFront    │ (optional, for HTTPS)
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
Internet ──────────►│       ALB       │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
     ┌────────▼────────┐  ┌──▼───────────┐  │
     │ ECS: Frontend   │  │ ECS: Backend │  │
     │ (Next.js)       │  │ (FastAPI)    │  │
     └─────────────────┘  └──────┬───────┘  │
                                 │          │
                         ┌───────▼───────┐  │
                         │  RDS Postgres │  │
                         └───────────────┘  │
                                            │
                    Private Subnets ────────┘
```

## Estimated Costs

| Service | Monthly Cost |
|---------|--------------|
| ECS Fargate (4 tasks) | ~$30 |
| RDS t3.micro | ~$15 |
| ALB | ~$20 |
| NAT Gateway | ~$35 |
| **Total** | **~$100/month** |

### Cost Optimization Tips

1. Use Fargate Spot for non-critical tasks
2. Scale down to 1 task during low traffic
3. Use Aurora Serverless v2 for variable workloads
4. Add CloudFront for caching

---

## Adding HTTPS

### Option 1: AWS Certificate Manager + ALB

```hcl
# Add to main.tf
resource "aws_acm_certificate" "main" {
  domain_name       = "pricetag.yourdomain.com"
  validation_method = "DNS"
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate.main.arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.frontend.arn
  }
}
```

### Option 2: CloudFront (recommended for production)

CloudFront provides:
- Global edge caching
- Free HTTPS
- DDoS protection
- Better mobile performance

---

## Troubleshooting

### Check ECS Task Logs

```bash
aws logs tail /ecs/pricetag-backend --follow
aws logs tail /ecs/pricetag-frontend --follow
```

### Force Redeploy

```bash
aws ecs update-service --cluster pricetag-cluster --service pricetag-backend --force-new-deployment
aws ecs update-service --cluster pricetag-cluster --service pricetag-frontend --force-new-deployment
```

### Check Task Health

```bash
aws ecs describe-services --cluster pricetag-cluster --services pricetag-backend pricetag-frontend
```

---

## Tear Down

```bash
cd infra/terraform
terraform destroy -var="db_password=YOUR_PASSWORD"
```

**Warning**: This will delete all data including the database!
