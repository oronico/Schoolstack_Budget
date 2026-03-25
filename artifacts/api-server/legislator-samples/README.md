# Legislator Sample Models

Pre-generated financial model exports for three school types, designed for state legislator demonstrations.

## Contents

- **Bright Horizons Microschool** (TX) - 15-40 students, tuition + philanthropy, $25K microloan
- **Riverside Christian Academy** (FL) - 200-400 students, tuition-driven nonprofit, $1.2M mortgage
- **Liberty STEM Charter School** (AZ) - 200-600 students, per-pupil public funding, $575K debt

Each model includes 4 export formats:
- Formula Workbook (.xlsx)
- Underwriting Package (.xlsx, 21 tabs)
- Lender-Ready Packet (.pdf)
- Board Summary (.pdf)

## Regeneration

Requires `DATABASE_URL` and `ADMIN_EMAILS` environment variables.

```bash
pnpm --filter @workspace/api-server run generate:legislator-samples
```
