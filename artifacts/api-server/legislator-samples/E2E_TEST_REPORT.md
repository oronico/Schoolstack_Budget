# Legislator Sample Models - E2E Test Report

**Date**: 2026-03-25
**Environment**: Replit Dev (27fdbaf7-67db-442f-83d4-bebcb570d0b5)

## Models Created

| Model | ID | School Type | State | Students (Y1-Y5) | Funding | Lender Readiness |
|-------|-----|-------------|-------|-------------------|---------|------------------|
| Bright Horizons Microschool | 59 | microschool | TX | 15-40 | hybrid_mixed | Strong |
| Riverside Christian Academy | 60 | private_school | FL | 200-400 | tuition_based | Strong |
| Liberty STEM Charter School | 61 | charter_school | AZ | 200-600 | charter_public_funded | Needs Work |

## Export Results (All 12 files generated successfully)

| File | Format | Size |
|------|--------|------|
| Bright_Horizons_Microschool_Formula_Workbook.xlsx | xlsx | 23,628 bytes |
| Bright_Horizons_Microschool_Underwriting_Package.xlsx | xlsx | 39,452 bytes |
| Bright_Horizons_Microschool_Lender_Packet.pdf | pdf | 22,474 bytes |
| Bright_Horizons_Microschool_Board_Summary.pdf | pdf | 13,326 bytes |
| Riverside_Christian_Academy_Formula_Workbook.xlsx | xlsx | 25,634 bytes |
| Riverside_Christian_Academy_Underwriting_Package.xlsx | xlsx | 42,204 bytes |
| Riverside_Christian_Academy_Lender_Packet.pdf | pdf | 23,580 bytes |
| Riverside_Christian_Academy_Board_Summary.pdf | pdf | 13,112 bytes |
| Liberty_STEM_Charter_Formula_Workbook.xlsx | xlsx | 24,541 bytes |
| Liberty_STEM_Charter_Underwriting_Package.xlsx | xlsx | 43,560 bytes |
| Liberty_STEM_Charter_Lender_Packet.pdf | pdf | 23,079 bytes |
| Liberty_STEM_Charter_Board_Summary.pdf | pdf | 13,666 bytes |

## API Export Endpoint Tests

All endpoints tested via authenticated HTTP requests (Bearer token, user 49):

| Endpoint | Model 59 | Model 60 | Model 61 |
|----------|----------|----------|----------|
| GET /api/models/:id/export (Formula) | 200 OK | 200 OK | 200 OK |
| GET /api/models/:id/export/underwriting-v2 | 200 OK | 200 OK | 200 OK |
| GET /api/models/:id/export/lender-packet-pdf | 200 OK | 200 OK | 200 OK |
| GET /api/models/:id/export/board-packet-pdf | 200 OK | 200 OK | 200 OK |
| GET /api/models/:id/consultant | 200 OK | 200 OK | 200 OK |

## Consultant Engine Verification

| Model | Lender Readiness | Cash Runway | Lending Lab Assessment |
|-------|-----------------|-------------|----------------------|
| Bright Horizons Microschool | Strong | 60+ months | Present (ready field populated) |
| Riverside Christian Academy | Strong | 60+ months | Present (ready field populated) |
| Liberty STEM Charter School | Needs Work | 60+ months | Present (ready field populated) |

## E2E Browser Tests (Playwright)

### Test 1: Export Page Navigation
- **Status**: PASS
- Login as aserafin@gmail.com -> Dashboard -> Open model 59 -> Navigate to Export step
- Verified all 4 export cards visible: Lender-Ready Packet, Board Summary, Underwriting Package, Formula Workbook

### Test 2: Export Downloads and Preview Modals
- **Status**: PASS
- Formula Workbook: Direct download triggered, card shows checkmark and "Download Again"
- Lender-Ready Packet: Preview modal opens with packet content sections
- Board Summary: Preview modal opens with board summary content
- Underwriting Package: Download card accessible and functional
