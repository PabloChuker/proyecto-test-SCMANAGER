# Privacy Policy — SC Labs Hangar Importer

**Last updated:** April 9, 2026

## Overview

SC Labs Hangar Importer is a Chrome extension that helps Star Citizen players export their hangar and buyback pledge data from robertsspaceindustries.com for personal fleet management purposes.

## Data Collection

This extension does **not** collect, store, transmit, or share any personal data. Specifically:

- No personal information is collected (name, email, address, etc.)
- No authentication credentials are accessed or stored
- No browsing history or activity is tracked
- No cookies are read or set
- No analytics or telemetry data is collected
- No data is sent to any external server

## How the Extension Works

The extension reads the HTML content of your RSI hangar and buyback pages (robertsspaceindustries.com/account/pledges and robertsspaceindustries.com/account/buy-back-pledges) to extract pledge item data such as ship names, prices, insurance types, and item categories.

All extracted data is processed locally in your browser and exported as a JSON file that you download to your own computer. No data ever leaves your browser except through your explicit action of saving the exported file.

## Permissions

- **activeTab**: Used to detect when you are on an RSI pledge page and read the page content.
- **Host permission (robertsspaceindustries.com)**: Required to fetch paginated hangar pages from your RSI account for complete data export.

## Third-Party Services

This extension does not use any third-party services, APIs, or analytics platforms.

## Changes to This Policy

Any updates to this privacy policy will be reflected in this document with an updated date.

## Contact

For questions about this privacy policy, please open an issue on our GitHub repository:
https://github.com/PabloChuker/proyecto-test-SCMANAGER/issues
